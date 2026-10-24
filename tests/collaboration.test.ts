import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { ThreadStore } from "../client/src/comments/threadStore";
import { WebSocket } from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
// @ts-ignore Node server is intentionally plain JavaScript.
import { createApp } from "../server/index.js";
const user = { id: "one", name: "Alex", avatar: "", color: "#345" };
test("concurrent offline edits and comment replies converge", () => {
  const a = new Y.Doc(),
    b = new Y.Doc();
  a.getText("body").insert(0, "Hello world");
  const sa = new ThreadStore(a);
  const id = sa.create(
    { start: "", end: "", kind: "point", quote: "Hello" },
    "Initial",
    user,
  );
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const sb = new ThreadStore(b);
  a.getText("body").insert(0, "A ");
  b.getText("body").insert(0, "B ");
  sa.reply(id, "Reply A", user);
  sb.reply(id, "Reply B", user);
  const ua = Y.encodeStateAsUpdate(a),
    ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
  assert.equal(a.getText("body").toString(), b.getText("body").toString());
  assert.equal(sa.list()[0].messages.length, 3);
  assert.deepEqual(sa.list(), sb.list());
  a.destroy();
  b.destroy();
});
test("relative positions follow inserted content", () => {
  const d = new Y.Doc(),
    t = d.getText("body");
  t.insert(0, "Hello world");
  const p = Y.createRelativePositionFromTypeIndex(t, 6);
  t.insert(0, "New ");
  assert.equal(Y.createAbsolutePositionFromRelativePosition(p, d)?.index, 10);
  d.destroy();
});
test("websocket delta delivery, image normalization and restart persistence", async () => {
  const dir = await mkdtemp(`${tmpdir()}/folio-`);
  let app = createApp({ dataDir: dir });
  const listen = async () => {
    await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
    return app.server.address().port;
  };
  let port = await listen();
  const connect = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collaboration/test`);
    await new Promise((r) => ws.once("open", r));
    return ws;
  };
  const receive = (ws: WebSocket, type: string) =>
    new Promise<any>((r, j) => {
      const timeout = setTimeout(() => j(new Error(`Timeout: ${type}`)), 5000);
      const f = (raw: any) => {
        const m = JSON.parse(raw.toString());
        if (m.type === type) {
          clearTimeout(timeout);
          ws.off("message", f);
          r(m);
        }
      };
      ws.on("message", f);
    });
  const a = await connect(),
    b = await connect(),
    doc = new Y.Doc();
  let sync = receive(a, "sync");
  a.send(
    JSON.stringify({
      type: "sync",
      vector: Buffer.from(Y.encodeStateVector(doc)).toString("base64"),
    }),
  );
  Y.applyUpdate(doc, Buffer.from((await sync).data, "base64"));
  let update!: Uint8Array;
  doc.on("update", (u) => (update = u));
  doc.getMap("meta").set("title", "Persisted collaboration");
  const delivered = receive(b, "update"),
    ack = receive(a, "ack");
  a.send(
    JSON.stringify({
      type: "update",
      data: Buffer.from(update).toString("base64"),
      seq: 7,
    }),
  );
  assert.equal((await ack).seq, 7);
  const remote = new Y.Doc();
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
  Y.applyUpdate(remote, Buffer.from((await delivered).data, "base64"));
  assert.equal(remote.getMap("meta").get("title"), "Persisted collaboration");
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
      ],
      { type: "image/svg+xml" },
    ),
    "diagram.svg",
  );
  const response = await fetch(`http://127.0.0.1:${port}/api/uploads/image`, {
    method: "POST",
    body: form,
  });
  assert.equal(response.status, 200);
  const asset = await response.json();
  assert.match(asset.url, /\.webp$/);
  assert.equal(asset.width, 20);
  a.close();
  b.close();
  await app.close();
  app = createApp({ dataDir: dir });
  port = await listen();
  const c = await connect();
  sync = receive(c, "sync");
  c.send(
    JSON.stringify({
      type: "sync",
      vector: Buffer.from(Y.encodeStateVector(new Y.Doc())).toString("base64"),
    }),
  );
  const persisted = new Y.Doc();
  Y.applyUpdate(persisted, Buffer.from((await sync).data, "base64"));
  assert.equal(
    persisted.getMap("meta").get("title"),
    "Persisted collaboration",
  );
  c.close();
  await app.close();
  doc.destroy();
  remote.destroy();
  persisted.destroy();
  await rm(dir, { recursive: true, force: true });
});
