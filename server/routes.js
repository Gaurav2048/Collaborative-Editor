import express from "express";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import multer from "multer";
import sharp from "sharp";
export function registerRoutes(app, db, dataDir) {
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  app.get("/api/users", (_, res) =>
    res.json(db.prepare("SELECT * FROM users").all()),
  );
  app.post("/api/users", (req, res) => {
    const name = String(req.body.name || "")
        .trim()
        .slice(0, 80),
      avatar = String(req.body.avatar || "");
    if (!name || (avatar && !/^\/uploads\/[\w-]+\.webp$/.test(avatar)))
      return res
        .status(400)
        .json({ error: "A name and a local uploaded avatar are required." });
    const colors = ["#7357d9", "#1d8871", "#c25c32", "#3264bb"];
    const user = {
      id: randomUUID(),
      name,
      avatar,
      color: colors[db.prepare("SELECT count(*) n FROM users").get().n % 4],
    };
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
      user.id,
      user.name,
      user.avatar,
      user.color,
    );
    res.status(201).json(user);
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/uploads/:kind",
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Choose a file." });
        const id = randomUUID();
        if (req.params.kind === "image") {
          const info = await sharp(req.file.buffer, {
            limitInputPixels: 25000000,
          })
            .rotate()
            .resize({
              width: 4096,
              height: 4096,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 90 })
            .toFile(join(dataDir, "uploads", `${id}.webp`));
          res.json({
            url: `/uploads/${id}.webp`,
            name: req.file.originalname,
            width: info.width,
            height: info.height,
          });
        } else if (req.params.kind === "source") {
          const ext = req.file.originalname.endsWith(".excalidraw")
            ? "excalidraw"
            : req.file.originalname.endsWith(".drawio")
              ? "drawio"
              : null;
          if (!ext)
            throw new Error("Upload a .drawio or .excalidraw source file.");
          const { writeFile } = await import("node:fs/promises");
          await writeFile(
            join(dataDir, "uploads", `${id}.${ext}`),
            req.file.buffer,
          );
          res.json({
            url: `/uploads/${id}.${ext}`,
            name: req.file.originalname,
          });
        } else res.status(400).json({ error: "Unknown upload type." });
      } catch (e) {
        next(e);
      }
    },
  );
  app.use(
    "/uploads",
    express.static(join(dataDir, "uploads"), {
      setHeaders(res, path) {
        if (!path.endsWith(".webp"))
          res.setHeader("Content-Disposition", "attachment");
      },
    }),
  );
}
