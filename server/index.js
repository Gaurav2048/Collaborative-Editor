import { registerRoutes } from "./routes.js";
import { attachCollaboration } from "./collaboration.js";
import express from "express";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export function createApp({ dataDir = resolve(root, "data") } = {}) {
  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  const db = new DatabaseSync(join(dataDir, "folio.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,state BLOB); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,avatar TEXT,color TEXT)",
  );
  if (!db.prepare("SELECT id FROM users LIMIT 1").get())
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
      randomUUID(),
      "Alex Morgan",
      "",
      "#7357d9",
    );
  const app = express(),
    server = createServer(app),
    rooms = new Map();
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  registerRoutes(app, db, dataDir);
  const wss = attachCollaboration(server, db, rooms);
  const dist = join(root, "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (_, res) => res.sendFile(join(dist, "index.html")));
  } else
    app.get("/", (_, res) => res.status(503).send("Run npm run build first."));
  app.use((err, req, res, next) =>
    res
      .status(400)
      .json({
        error:
          err.code === "LIMIT_FILE_SIZE"
            ? "Maximum upload size is 8 MB."
            : err.message || "Request failed.",
      }),
  );
  return {
    app,
    server,
    close: async () => {
      for (const ws of wss.clients) ws.terminate();
      await new Promise((r) => server.close(r));
      for (const r of rooms.values()) {
        r.awareness.destroy();
        r.doc.destroy();
      }
      db.close();
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () => console.log(`Folio running on port ${process.env.PORT || 3000}`),
  );
}
