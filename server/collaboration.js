import { WebSocketServer } from "ws";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as decoding from "lib0/decoding";
export function attachCollaboration(server, db, rooms) {
  const b64 = (data) => Buffer.from(data).toString("base64"),
    decode = (s) => new Uint8Array(Buffer.from(s, "base64"));
  function roomFor(id) {
    if (rooms.has(id)) return rooms.get(id);
    const doc = new Y.Doc(),
      saved = db.prepare("SELECT state FROM documents WHERE id=?").get(id);
    if (saved) Y.applyUpdate(doc, saved.state);
    else {
      doc.getMap("meta").set("title", "A little space for big ideas");
      const f = doc.getXmlFragment("content");
      const block = (type, text, attrs = {}) => {
        const el = new Y.XmlElement(type);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        const t = new Y.XmlText();
        t.insert(0, text);
        el.insert(0, [t]);
        return el;
      };
      f.insert(0, [
        block(
          "paragraph",
          "A shared canvas for thoughtful work. Write, sketch, and bring your team into the conversation.",
        ),
        block("heading", "Make something together", { level: 2 }),
        block(
          "paragraph",
          "Select a few words and add a comment, or place your cursor anywhere to leave a note. Your feedback stays connected as the document changes.",
        ),
        block("heading", "From a thought to a plan", { level: 2 }),
        block(
          "paragraph",
          "Use the toolbar to add structure. Upload an image, create a Mermaid diagram, or bring in a diagram from Excalidraw or diagrams.net.",
        ),
        block(
          "paragraph",
          "Open this document in another tab and choose a different teammate to try live collaboration.",
        ),
      ]);
    }
    const awareness = new Awareness(doc);
    awareness.setLocalState(null);
    const room = { doc, awareness, clients: new Set() };
    const persist = () =>
      db
        .prepare(
          "INSERT INTO documents VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
        )
        .run(id, Y.encodeStateAsUpdate(doc));
    persist();
    doc.on("update", (update, origin) => {
      persist();
      for (const c of room.clients)
        if (c !== origin && c.readyState === 1)
          c.send(JSON.stringify({ type: "update", data: b64(update) }));
    });
    awareness.on("update", ({ added, updated, removed }, origin) => {
      const data = b64(
        encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]),
      );
      for (const c of room.clients)
        if (c !== origin && c.readyState === 1)
          c.send(JSON.stringify({ type: "awareness", data }));
    });
    rooms.set(id, room);
    return room;
  }
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
  });
  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url, "http://local").pathname;
    const match = path.match(/^\/collaboration\/([a-zA-Z0-9_-]{1,80})$/);
    const allowed = process.env.ALLOWED_ORIGIN;
    const origin = req.headers.origin;
    if (
      !match ||
      (origin &&
        origin !== (allowed || `http://${req.headers.host}`) &&
        origin !== `https://${req.headers.host}`)
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, match[1]),
    );
  });
  wss.on("connection", (ws, id) => {
    const room = roomFor(id);
    room.clients.add(ws);
    const owned = new Set();
    let count = 0,
      window = Date.now();
    ws.on("message", (raw) => {
      try {
        if (Date.now() - window > 1000) {
          window = Date.now();
          count = 0;
        }
        if (++count > 150) throw new Error("Too many updates");
        const m = JSON.parse(raw.toString());
        if (m.type === "sync") {
          ws.send(
            JSON.stringify({
              type: "sync",
              data: b64(Y.encodeStateAsUpdate(room.doc, decode(m.vector))),
              vector: b64(Y.encodeStateVector(room.doc)),
            }),
          );
          ws.send(
            JSON.stringify({
              type: "awareness",
              data: b64(
                encodeAwarenessUpdate(room.awareness, [
                  ...room.awareness.getStates().keys(),
                ]),
              ),
            }),
          );
        } else if (m.type === "update") {
          Y.applyUpdate(room.doc, decode(m.data), ws);
          ws.send(JSON.stringify({ type: "ack", seq: m.seq }));
        } else if (m.type === "awareness") {
          const update = decode(m.data),
            d = decoding.createDecoder(update),
            n = decoding.readVarUint(d);
          for (let i = 0; i < n; i++) {
            owned.add(decoding.readVarUint(d));
            decoding.readVarUint(d);
            decoding.readVarString(d);
          }
          applyAwarenessUpdate(room.awareness, update, ws);
        }
      } catch {
        ws.close(1008, "Invalid update");
      }
    });
    ws.on("close", () => {
      room.clients.delete(ws);
      removeAwarenessStates(room.awareness, [...owned], ws);
    });
    ws.on("error", () => {});
  });

  return wss;
}
