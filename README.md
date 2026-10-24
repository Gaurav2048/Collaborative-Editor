# Folio — collaborative React editor

A modular React + TypeScript editor with a Node.js WebSocket server, built on Tiptap/ProseMirror and Yjs. It is a working local workspace and an integration reference for adding the editor to an existing application.

## Run it

Requires Node.js **24 or newer** and npm. From this directory:

```sh
npm ci
npm run build
npm start
```

Open **http://localhost:3000**. No API keys or paid editor extensions are required. For live collaboration, open the same URL in two tabs or browsers; use **Teammates** to add/select identities. The server must stay running for clients to synchronize. `npm start` serves the compiled build; rebuild after source changes.

Alternatively, with Docker installed:

```sh
docker compose up --build -d
```

The container restarts automatically and stores documents, users and uploads in the `folio-data` volume. Docker configuration is included; Docker execution was not available in the build environment.

For frontend development, run the Node server on port 3000 and `npx vite --config client/vite.config.ts` in another terminal. Vite proxies APIs and WebSockets to Node.

## Features

- Rich text: headings, bold, italic, strike, inline code, bullet lists, task lists, quotes, tables, undo/redo, and Markdown input shortcuts supplied by Tiptap.
- Incremental **Yjs binary updates** transmitted over WebSocket. Concurrent changes merge; state vectors exchange only missing changes on reconnect. These are CRDT deltas, not Quill Delta JSON.
- Browser IndexedDB caches the document. Once a document has loaded, editing can continue during a connection interruption and synchronize on reconnect. Opening a fresh editor still requires an initial server handshake.
- Comments on a text selection, a node selection, or an empty caret position. Use **＋ Comment** or **Ctrl/⌘ + Alt + M**. Yellow highlights and pins connect the conversation to the document.
- Threaded replies, resolve/reopen, and a sidebar whose quote buttons scroll to each anchor. Anchors use Yjs relative positions, not stale numeric offsets. Deleted ranges become orphaned threads; messages are retained.
- Teammate names, colors and optional uploaded profile pictures; live remote cursors and labels.
- Image uploads with captions. Images are decoded and normalized to WebP, limited to 8 MB/25 megapixels input and 4096 pixels output. Animated images become a still image.
- Mermaid blocks with editable source and SVG export; Excalidraw/diagrams.net export imports, with optional downloadable original source files.
- JSON export of document content, title and conversation records. This is a readable export, **not a complete restore format**: relative comment anchors need the original Yjs state, and uploaded files remain in server storage. Back up the data directory for restoration.

## Diagram tools selected

These are three strong choices for complementary diagramming workflows, rather than a claim of an objective popularity ranking.

| Tool | Best fit | Export support | Folio integration |
|---|---|---|---|
| [Mermaid](https://mermaid.js.org/intro/getting-started.html) | Versionable diagrams written as text | SVG, PNG | Type source inside Folio, edit later, export SVG |
| [Excalidraw](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/api/utils/export) | Sketches, brainstorms, informal architecture | SVG, PNG, editable scene JSON | Upload exported SVG/PNG and optionally `.excalidraw` source |
| [diagrams.net](https://www.drawio.com/docs/manual/export/export-diagram/) | Detailed flows, UML, architecture | SVG, PNG and other formats; editable diagram data | Upload exported SVG/PNG and optionally `.drawio` source |

Excalidraw and diagrams.net open in their own applications; their full native editors are not embedded. Imported SVGs are rasterized for display. Retain the source attachment to make future edits externally. Mermaid renders with strict security and sanitized SVG, displayed as an inert image.

## Separation of concerns

| Module | Responsibility |
|---|---|
| `client/src/editor/CollaborativeEditor.tsx` | Tiptap configuration, editing commands and toolbar |
| `client/src/editor/MediaBlock.tsx` | Uploaded image/diagram presentation and captions |
| `client/src/collaboration/DocumentSession.ts` | Y.Doc lifetime, deltas, transport, awareness, reconnect, local cache |
| `client/src/comments/threadStore.ts` | Shared thread/reply data and mutations |
| `client/src/comments/anchors.ts` | Capture, resolve and scroll relative anchors |
| `client/src/comments/CommentAnchors.ts` | ProseMirror highlight/pin decorations |
| `client/src/comments/CommentsSidebar.tsx` | Conversation UI |
| `client/src/diagrams/DiagramBlock.tsx` | Mermaid rendering, editing and SVG export |
| `client/src/uploads/uploadService.ts` | Upload API adapter |
| `client/src/users/userService.ts` | User API adapter |
| `client/src/App.tsx` | Demo application composition and modal workflows |
| `shared/protocol.ts` | User/update types, binary encoding and UUID helper |
| `server/index.js` | HTTP server composition and SQLite initialization |
| `server/collaboration.js` | Document rooms, sync protocol, persistence acknowledgements and presence |
| `server/routes.js` | User management, asset uploads and asset serving |

## Integrate into your React application

Use `CollaborativeEditor` with a `DocumentSession`, `ThreadStore`, current user and callbacks. `App.tsx` is a runnable example of the complete wiring. Create the session once per document; destroy it when the document closes. Mount the editor after `session.synced`. Use the same node schema on every client; schema changes require a coordinated migration.

### Listen to deltas

```ts
const session = new DocumentSession(documentId, 'wss://your-app.example.com');
const listener = ({ update, origin, at }: DeltaEvent) => {
  if (origin === 'local') {
    // Uint8Array: log byte count, enqueue in your transport, or audit metadata.
    console.log(at, update.byteLength);
  }
};
session.deltaListeners.add(listener);
// Cleanup:
session.deltaListeners.delete(listener);
```

The included session already sends local changes. Do not forward them through a second transport unless replacing the built-in WebSocket connection. The transport class is deliberately separate from React; adapt its `connect`/`send` methods to your provider. Incoming data goes through `session.applyRemoteUpdate(update)` so it is tagged as remote and does not echo back.

```ts
const vector = session.getStateVector();
const missingChanges = session.getDeltaSince(remoteStateVector);
session.applyRemoteUpdate(receivedBytes);
```

JSON WebSocket envelopes use base64 binary data:

- `sync { vector }` → server `sync { data, vector }`; client sends its missing update.
- `update { data, seq }` → server persists and broadcasts; sender receives `ack { seq }`.
- `awareness { data }` → ephemeral presence and cursor positions, never stored in SQLite.

There is no periodic full-document polling. Edits emit updates immediately; awareness uses its own heartbeat. Each document is selected by `?doc=your-document-id` (letters, digits, `_`, `-`; max 80 characters).

### Integrate comments

```ts
const store = new ThreadStore(session.doc);
const anchor = captureAnchor(editor); // before focus leaves the editor
const threadId = store.create(anchor, 'Please review this', currentUser);
store.reply(threadId, 'Looks good', currentUser);
store.resolve(threadId, true);
jumpToThread(editor, threadId, anchor);
```

Concurrent replies are stored in a Y.Array so independently added replies are preserved. Thread metadata is a Y.Map. Text boundaries use right association for the start and left association for the end. Replacing/deleting a whole block may orphan its original anchors; moving content via delete-and-paste creates new content identities.

## Persistence and hosting boundary

`data/folio.sqlite` stores Yjs snapshots and users. `data/uploads/` stores image and source assets. Back up the whole directory while the server is stopped (or use SQLite's backup API). Do not delete server data while clients retain cached documents: those clients can synchronize the old content back in. Use a new document ID for a genuinely new document.

This is a **trusted workspace demo**, not an authenticated multi-tenant service. Selecting a name is not login; anyone with server access can read/write its documents, create user records, and fetch uploaded assets. Before making it internet-facing, connect your existing authentication, authorize each document/API/asset request, bind authors and awareness identities to the authenticated session, and add quotas and abuse protection. The server defaults to localhost; Docker also binds the published port to localhost. This boundary is intentional so the editor can fit your application's user model.

For deployment behind your authenticated proxy, use HTTPS/WSS, forward WebSocket upgrades, set `ALLOWED_ORIGIN` to the exact public origin, and persist `data/`. This server is designed for a small single Node process. Horizontal scaling requires shared pub/sub, coordinated document persistence and shared asset storage; opening the same SQLite file from independent room processes is not sufficient. The existing update size/rate limits are safeguards, not a full hostile-client validation layer.

## Verification

```sh
npm test
npm run build
```

Automated checks cover concurrent text/reply convergence, relative-position shifting, WebSocket update delivery/acknowledgements, SVG-to-WebP uploads, and persistence through a real server restart. Browser verification covers selected-text comments, teammate addition, cross-tab title/reply synchronization, and Mermaid insertion/rendering. The generated frontend bundle is included in the download for convenience; rebuild it after making changes.

## Jailbreak theme

The editor now uses Jailbreak's red primary accent, neutral surfaces, compact workspace spacing and scoped CSS. The header provides Auto, Light and Dark options; the standalone preference is remembered locally. Auto follows the host HTML `.dark` / `.light` class or `data-theme` attribute, then the OS preference. Theme changes update immediately.

When embedding, wrap the editor in `.folio-editor` and import `styles.css`. It inherits Jailbreak's `--primary`, `--primary-foreground`, `--background`, `--card`, `--foreground`, `--muted-foreground`, `--border`, `--accent`, `--sidebar`, and `--ring` variables, with standalone light/dark fallbacks. The CSS is scoped so it does not restyle unrelated host buttons or headers. Mermaid's on-screen preview adapts for dark mode; its SVG export retains the neutral palette. Uploaded images keep their original colors.
