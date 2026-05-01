import { type Request, type Response, Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { ensureDirectoryExists } from "../utils/path-security.js";

export const subtitlesRouter = Router();

const OUT_DIR = process.env.OUT_DIR ?? path.resolve("out");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith(".json")) {
      cb(null, true);
    } else {
      cb(new Error("Only .json subtitle files are allowed"));
    }
  },
});

function parseSubtitleDuration(content: string): number {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] as { startMs?: number };
      const last = parsed[parsed.length - 1] as { endMs?: number };
      if (last.endMs && first.startMs !== undefined) return (last.endMs - first.startMs) / 1000;
    } else if (parsed.pages && parsed.pages.length > 0) {
      const pages = parsed.pages as Array<{ tokens: Array<{ fromMs: number; toMs: number }> }>;
      const lastPage = pages[pages.length - 1];
      const lastToken = lastPage.tokens[lastPage.tokens.length - 1];
      const firstToken = pages[0].tokens[0];
      if (lastToken && lastToken.toMs) return (lastToken.toMs - firstToken.fromMs) / 1000;
    }
  } catch { /* parse error */ }
  return 0;
}

/** GET /api/subtitles — list all .json subtitle files */
subtitlesRouter.get("/", (_req: Request, res: Response): void => {
  try {
    if (!fs.existsSync(OUT_DIR)) {
      res.json({ subtitles: [] });
      return;
    }
    const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"));
    const subtitles = files.map((file) => {
      const filePath = path.join(OUT_DIR, file);
      const stat = fs.statSync(filePath);
      let durationInSeconds = 0;
      try {
        durationInSeconds = parseSubtitleDuration(fs.readFileSync(filePath, "utf-8"));
      } catch { /* skip */ }
      return {
        id: file,
        name: file,
        size: stat.size,
        path: `/api/subtitles/${encodeURIComponent(file)}`,
        created_at: stat.birthtime,
        durationInSeconds,
      };
    });
    res.json({ subtitles });
  } catch (error) {
    console.error("List subtitles error:", error);
    res.status(500).json({ error: "Failed to list subtitles" });
  }
});

/** GET /api/subtitles/:filename — serve subtitle JSON */
subtitlesRouter.get("/:filename", (req: Request, res: Response): void => {
  try {
    const filename = decodeURIComponent(req.params.filename as string);
    const filePath = path.join(OUT_DIR, filename);
    if (!filePath.startsWith(OUT_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.setHeader("Content-Type", "application/json");
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Serve subtitle error:", error);
    res.status(500).json({ error: "Failed to serve subtitle" });
  }
});

/** POST /api/subtitles — upload subtitle JSON file */
subtitlesRouter.post("/", upload.single("media"), (req: Request, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const filename = req.file.originalname || `subtitle-${Date.now()}.json`;
    if (!filename.endsWith(".json")) {
      res.status(400).json({ error: "Only .json files are allowed" });
      return;
    }
    ensureDirectoryExists(OUT_DIR);
    const filePath = path.join(OUT_DIR, filename);
    const content = req.file.buffer.toString("utf-8");
    fs.writeFileSync(filePath, content);
    const durationInSeconds = parseSubtitleDuration(content);
    res.json({
      success: true,
      subtitle: {
        id: filename,
        name: filename,
        path: `/api/subtitles/${encodeURIComponent(filename)}`,
        durationInSeconds,
      },
    });
  } catch (error) {
    console.error("Upload subtitle error:", error);
    res.status(500).json({ error: "Failed to upload subtitle" });
  }
});

/** PUT /api/subtitles/:filename — update subtitle content */
subtitlesRouter.put("/:filename", (req: Request, res: Response): void => {
  try {
    const filename = decodeURIComponent(req.params.filename as string);
    const filePath = path.join(OUT_DIR, filename);
    if (!filePath.startsWith(OUT_DIR)) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    const body = JSON.stringify(req.body);
    fs.writeFileSync(filePath, body, "utf-8");
    res.json({ success: true });
  } catch (error) {
    console.error("Update subtitle error:", error);
    res.status(500).json({ error: "Failed to update subtitle" });
  }
});

/** DELETE /api/subtitles/:filename */
subtitlesRouter.delete("/:filename", (req: Request, res: Response): void => {
  try {
    const filename = decodeURIComponent(req.params.filename as string);
    const filePath = path.join(OUT_DIR, filename);
    if (!filePath.startsWith(OUT_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete subtitle error:", error);
    res.status(500).json({ error: "Failed to delete subtitle" });
  }
});
