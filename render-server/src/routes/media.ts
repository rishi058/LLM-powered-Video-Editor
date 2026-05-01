import { type Request, type Response, Router } from "express";
import fs from "fs";
import path from "path";
import { safeResolveOutPath } from "../utils/path-security.js";

export const mediaRouter = Router();

const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.resolve("out");

/**
 * GET /media/:filename
 * Serves media files from out/ for use by the Remotion composition during rendering.
 */
mediaRouter.get("/:filename", (req: Request, res: Response): void => {
  try {
    const decodedFilename = decodeURIComponent(req.params.filename as string);
    const filePath = safeResolveOutPath(decodedFilename);

    if (!filePath) {
      res.status(403).json({ error: "Invalid filename" });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    const ext = path.extname(decodedFilename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
      ".mp3": "audio/mpeg", ".wav": "audio/wav", ".aac": "audio/aac",
      ".ogg": "audio/ogg", ".flac": "audio/flac",
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp",
    };
    const contentType = contentTypeMap[ext] ?? "application/octet-stream";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= stat.size) {
        res.status(416).send();
        return;
      }
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error("Error serving media file:", error);
    res.status(500).json({ error: "Failed to serve file" });
  }
});
