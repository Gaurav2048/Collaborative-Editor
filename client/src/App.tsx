import { ThemePicker, useEditorTheme } from "./theme/ThemePicker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { User } from "../../shared/protocol";
import { DocumentSession } from "./collaboration/DocumentSession";
import { ThreadStore, type Anchor } from "./comments/threadStore";
import { captureAnchor, resolveAnchor } from "./comments/anchors";
import { CommentsSidebar, Avatar } from "./comments/CommentsSidebar";
import { CollaborativeEditor } from "./editor/CollaborativeEditor";
import { uploadAsset } from "./uploads/uploadService";
import { listUsers, addUser } from "./users/userService";
import { download, example } from "./diagrams/DiagramBlock";
export default function App() {
  const theme = useEditorTheme();
  const id =
    new URLSearchParams(location.search).get("doc") || "workspace-notes";
  const [session] = useState(
    () =>
      new DocumentSession(
        /^[\w-]{1,80}$/.test(id) ? id : "workspace-notes",
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`,
      ),
  );
  const store = useMemo(() => new ThreadStore(session.doc), [session]);
  const [, refresh] = useState(0),
    [users, setUsers] = useState<User[]>([]),
    [user, setUser] = useState<User | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [title, setTitle] = useState(""),
    [anchor, setAnchor] = useState<Anchor | null>(null),
    [active, setActive] = useState(""),
    [modal, setModal] = useState<"users" | "diagram" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [avatar, setAvatar] = useState<File | null>(null),
    [provider, setProvider] = useState("Mermaid"),
    [code, setCode] = useState(example),
    [diagramFile, setDiagramFile] = useState<File | null>(null),
    [sourceFile, setSourceFile] = useState<File | null>(null),
    [delta, setDelta] = useState({ count: 0, bytes: 0 });
  const imageInput = useRef<HTMLInputElement>(null),
    insertion = useRef<Anchor | null>(null),
    editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    const off = session.subscribe(() => refresh((n) => n + 1));
    const meta = session.doc.getMap("meta"),
      f = () => setTitle(String(meta.get("title") || ""));
    meta.observe(f);
    const d = (e: { update: Uint8Array }) =>
      setDelta((v) => ({
        count: v.count + 1,
        bytes: v.bytes + e.update.byteLength,
      }));
    session.deltaListeners.add(d);
    listUsers()
      .then((us) => {
        setUsers(us);
        setUser(
          us.find((u) => u.id === sessionStorage.getItem("folio-user")) ||
            us[0],
        );
      })
      .catch((e) => setError(e.message));
    return () => {
      off();
      meta.unobserve(f);
      session.deltaListeners.delete(d);
      session.destroy();
    };
  }, [session]);
  const ready = useCallback((e: Editor) => {
    setEditor(e);
    editorRef.current = e;
  }, []);
  const comment = useCallback(() => {
    try {
      if (editorRef.current) setAnchor(captureAnchor(editorRef.current));
    } catch (e) {
      setError(String(e));
    }
  }, []);
  const select = useCallback((id: string) => {
    setActive(id);
    setTimeout(
      () =>
        document
          .getElementById(`thread-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      30,
    );
  }, []);
  function saveInsertion() {
    if (editor) insertion.current = captureAnchor(editor);
  }
  function insert(content: object) {
    if (!editor) return;
    const pos = insertion.current
      ? resolveAnchor(editor, insertion.current)?.to
      : undefined;
    editor
      .chain()
      .focus()
      .insertContentAt(pos ?? editor.state.selection.to, content)
      .run();
    insertion.current = null;
  }
  async function image(file: File) {
    setBusy(true);
    try {
      const asset = await uploadAsset(file);
      insert({ type: "media", attrs: { src: asset.url, alt: file.name } });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function addDiagram() {
    setBusy(true);
    try {
      if (provider === "Mermaid") insert({ type: "diagram", attrs: { code } });
      else {
        if (!diagramFile)
          throw new Error("Choose an exported SVG or PNG diagram.");
        const asset = await uploadAsset(diagramFile);
        const source = sourceFile
          ? await uploadAsset(sourceFile, "source")
          : null;
        insert({
          type: "media",
          attrs: {
            src: asset.url,
            alt: `${provider} diagram`,
            provider,
            sourceUrl: source?.url || "",
          },
        });
      }
      setModal(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="folio-editor app" data-theme={theme.resolved}>
      <nav className="rail">
        <a className="brand" href="/">
          j<span>•</span>
        </a>
        <div className="rail-divider" />
        <button className="rail-active" title="Documents">
          ▤
        </button>
        <button title="Teammates" onClick={() => setModal("users")}>
          ♧
        </button>
        <div className="grow" />
        <span className="rail-label">JAILBREAK</span>
        {user && <Avatar user={user} />}
      </nav>
      <div className="workspace">
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Team notebook</strong>
            <span className="private-label">Shared document</span>
          </div>
          <div className="header-actions">
            <ThemePicker value={theme.preference} onChange={theme.change} />
            <span className={`connection ${session.status}`}>
              <b />{" "}
              {session.status === "online"
                ? session.pending
                  ? "Saving…"
                  : "All changes saved"
                : session.status === "offline"
                  ? "Offline · retrying"
                  : "Connecting…"}
            </span>
            <div className="avatar-stack">
              {users.slice(0, 3).map((u) => (
                <Avatar user={u} key={u.id} />
              ))}
            </div>
            <button className="invite" onClick={() => setModal("users")}>
              ＋ Teammates
            </button>
            <button
              className="primary"
              onClick={() => {
                (navigator.clipboard
                  ? navigator.clipboard.writeText(location.href)
                  : Promise.reject(new Error("Clipboard unavailable"))
                )
                  .then(() => setError("Document link copied."))
                  .catch(() => setError(location.href));
              }}
            >
              Share ↗
            </button>
          </div>
        </header>
        <div className="subheader">
          <span>● LIVE WORKSPACE</span>
          <span>Write. Connect. Create.</span>
        </div>
        {error && (
          <div role="alert" className="notice">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        <div className="body">
          <main>
            <div className="document-heading">
              <div className="eyebrow">
                TEAM NOTEBOOK <span> / </span> IDEAS & EXPLORATION
              </div>
              <div className="page-icon">✳</div>
              <input
                className="document-title"
                aria-label="Document title"
                value={title}
                placeholder="Untitled"
                onChange={(e) => {
                  setTitle(e.target.value);
                  session.doc.getMap("meta").set("title", e.target.value);
                }}
              />
              <div className="document-meta">
                {user && (
                  <>
                    <Avatar user={user} />
                    <span>
                      Editing as{" "}
                      <button onClick={() => setModal("users")}>
                        {user.name}
                      </button>
                    </span>
                  </>
                )}
                <span>·</span>
                <span>Made for working together</span>
              </div>
            </div>
            {session.synced && user ? (
              <CollaborativeEditor
                session={session}
                user={user}
                store={store}
                onReady={ready}
                onComment={comment}
                onSelect={select}
                onImage={() => {
                  saveInsertion();
                  imageInput.current?.click();
                }}
                onDiagram={() => {
                  saveInsertion();
                  setModal("diagram");
                }}
              />
            ) : (
              <div className="loading">Connecting to your shared document…</div>
            )}
            <input
              hidden
              ref={imageInput}
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) image(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </main>
          {user && (
            <CommentsSidebar
              store={store}
              editor={editor}
              user={user}
              anchor={anchor}
              onCancel={() => setAnchor(null)}
              active={active}
              onActive={select}
            />
          )}
        </div>
        <footer>
          <span>
            ✦ Jailbreak{" "}
            <span className="footer-muted">A space to think together</span>
          </span>
          <span>
            {busy
              ? "Uploading…"
              : `${delta.count} deltas · ${(delta.bytes / 1024).toFixed(1)} KB received / sent`}
            <button
              onClick={() =>
                editor &&
                download(
                  "document.json",
                  JSON.stringify(
                    {
                      title,
                      content: editor.getJSON(),
                      comments: store.list(),
                    },
                    null,
                    2,
                  ),
                  "application/json",
                )
              }
            >
              Export JSON ↗
            </button>
          </span>
        </footer>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={modal === "users" ? "Teammates" : "Add a diagram"}
            className="modal"
          >
            <button className="close" onClick={() => setModal(null)}>
              ×
            </button>
            {modal === "users" ? (
              <>
                <div className="eyebrow">BETTER TOGETHER</div>
                <h2>Your teammates</h2>
                <p className="muted">
                  Choose your demo identity. Open the shared link in another
                  browser to collaborate.
                </p>
                <div className="user-list">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setUser(u);
                        sessionStorage.setItem("folio-user", u.id);
                        setModal(null);
                      }}
                    >
                      <Avatar user={u} />
                      <span>{u.name}</span>
                      {u.id === user?.id && <small>Current user ✓</small>}
                    </button>
                  ))}
                </div>
                <h3>Add a teammate</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      const asset = avatar ? await uploadAsset(avatar) : null;
                      const u = await addUser(name, asset?.url || "");
                      setUsers([...users, u]);
                      setName("");
                      setAvatar(null);
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Name
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Jamie Chen"
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Profile image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAvatar(e.target.files?.[0] || null)}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Add teammate
                  </button>
                </form>
                <p className="small muted">
                  Demo workspace: names are identities, not authenticated
                  accounts.
                </p>
              </>
            ) : (
              <>
                <div className="eyebrow">A PICTURE OF YOUR THINKING</div>
                <h2>Add a diagram</h2>
                <div className="tool-options">
                  {["Mermaid", "Excalidraw", "diagrams.net"].map((p) => (
                    <button
                      className={p === provider ? "selected" : ""}
                      key={p}
                      onClick={() => {
                        setProvider(p);
                        setDiagramFile(null);
                        setSourceFile(null);
                      }}
                    >
                      <strong>{p}</strong>
                      <small>
                        {p === "Mermaid"
                          ? "Text → diagram"
                          : p === "Excalidraw"
                            ? "Hand-drawn ideas"
                            : "Flows & architecture"}
                      </small>
                    </button>
                  ))}
                </div>
                {provider === "Mermaid" ? (
                  <>
                    <p className="muted">
                      Editable in your document. Export the result as SVG.
                    </p>
                    <textarea
                      className="code-input"
                      aria-label="Diagram source"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      spellCheck={false}
                    />
                    <a
                      href="https://mermaid.js.org/intro/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mermaid syntax guide ↗
                    </a>
                  </>
                ) : (
                  <>
                    <p className="muted">
                      Create your diagram in{" "}
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={
                          provider === "Excalidraw"
                            ? "https://excalidraw.com"
                            : "https://app.diagrams.net"
                        }
                      >
                        {provider} ↗
                      </a>
                      , export SVG or PNG, then upload it here.
                    </p>
                    <label>
                      Exported diagram
                      <input
                        key={provider}
                        type="file"
                        accept="image/svg+xml,image/png,image/jpeg"
                        onChange={(e) =>
                          setDiagramFile(e.target.files?.[0] || null)
                        }
                      />
                    </label>
                    <label>
                      Editable source (optional)
                      <input
                        type="file"
                        accept={
                          provider === "Excalidraw" ? ".excalidraw" : ".drawio"
                        }
                        onChange={(e) =>
                          setSourceFile(e.target.files?.[0] || null)
                        }
                      />
                    </label>
                    <p className="small muted">
                      Attach the source to keep the original editable diagram.
                    </p>
                  </>
                )}
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>Cancel</button>
                  <button
                    className="primary"
                    disabled={busy || (provider !== "Mermaid" && !diagramFile)}
                    onClick={addDiagram}
                  >
                    {busy ? "Uploading…" : "Insert diagram"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
