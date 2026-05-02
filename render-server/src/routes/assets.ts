import { type Request, type Response, Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { ensureDirectoryExists } from "../utils/path-security.js";

const execFileAsync = promisify(execFile);

export const assetsRouter = Router();

const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.resolve("out");
const PYTHON_API = process.env.PYTHON_API_URL ?? "http://localhost:3000";

// ---------- helpers ----------

function inferMediaType(name: string): string {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case ".mp4": return "video/mp4";
    case ".mov": return "video/quicktime";
    case ".webm": return "video/webm";
    case ".mkv": return "video/x-matroska";
    case ".avi": return "video/x-msvideo";
    case ".mp3": return "audio/mpeg";
    case ".wav": return "audio/wav";
    case ".aac": return "audio/aac";
    case ".ogg": return "audio/ogg";
    case ".flac": return "audio/flac";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".gif": return "image/gif";
    case ".bmp": return "image/bmp";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

async function dbInsertAsset(params: {
  userId: string;
  projectId?: string | null;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}) {
  const res = await fetch(`${PYTHON_API}/db/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Failed to insert asset into DB");
  return res.json();
}

async function dbListAssets(userId: string, projectId: string | null) {
  let url = `${PYTHON_API}/db/assets?userId=${encodeURIComponent(userId)}`;
  if (projectId) url += `&projectId=${encodeURIComponent(projectId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to list assets");
  return res.json() as Promise<Record<string, unknown>[]>;
}

async function dbGetAsset(id: string) {
  const res = await fetch(`${PYTHON_API}/db/assets/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to get asset");
  return res.json() as Promise<Record<string, unknown>>;
}

async function dbDeleteAsset(id: string, userId: string) {
  const res = await fetch(`${PYTHON_API}/db/assets/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete asset");
}

// ---------- multer setup ----------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDirectoryExists(OUT_DIR);
    cb(null, OUT_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v|mp3|wav|aac|ogg|flac|jpg|jpeg|png|gif|bmp|webp)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// ---------- routes ----------

/** GET /api/assets[?projectId=...] */
assetsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = "local-user";
    const projectId = (req.query.projectId as string) || null;
    const rows = await dbListAssets(userId, projectId);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.original_name,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      width: r.width,
      height: r.height,
      duration_seconds: r.duration_seconds,
      durationInSeconds: r.duration_seconds,
      created_at: r.created_at,
      mediaUrlRemote: `/api/assets/${r.id}/raw`,
    }));
    res.json({ assets: items });
  } catch (error) {
    console.error("List assets error:", error);
    res.status(500).json({ error: "Failed to list assets" });
  }
});

/** GET /api/assets/:id/raw */
assetsRouter.get("/:id/raw", async (req: Request, res: Response): Promise<void> => {
  try {
    const asset = await dbGetAsset(req.params.id as string) as Record<string, string> | null;
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const sanitizedKey = path.basename(asset.storage_key);
    const filePath = path.resolve(OUT_DIR, sanitizedKey);
    if (!filePath.startsWith(OUT_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    let contentType = asset.mime_type || inferMediaType(asset.original_name);
    if (contentType.endsWith("/*")) {
      contentType = inferMediaType(asset.original_name);
    }

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
    console.error("Serve asset error:", error);
    res.status(500).json({ error: "Failed to serve asset" });
  }
});

/** POST /api/assets/upload */
assetsRouter.post("/upload", upload.single("media"), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const width = Number(req.headers["x-media-width"] || "") || null;
    const height = Number(req.headers["x-media-height"] || "") || null;
    const duration = Number(req.headers["x-media-duration"] || "") || null;
    const originalName = (req.headers["x-original-name"] as string) || req.file.originalname;
    const projectId = (req.headers["x-project-id"] as string) || null;

    const mime = inferMediaType(originalName);
    const record = await dbInsertAsset({
      userId: "local-user",
      projectId: projectId || null,
      originalName,
      storageKey: req.file.filename,
      mimeType: mime,
      sizeBytes: req.file.size,
      width,
      height,
      durationSeconds: duration,
    });

    console.log(`📁 File uploaded: ${originalName} → ${req.file.filename}`);
    res.json({
      success: true,
      asset: {
        id: record.id,
        name: record.original_name,
        mediaUrlRemote: `/api/assets/${record.id}/raw`,
        width: record.width,
        height: record.height,
        durationInSeconds: record.duration_seconds,
        size: record.size_bytes,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "File upload failed" });
  }
});

/** POST /api/assets/register — register an already-present file in out/ */
assetsRouter.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, originalName, size, width, height, duration } = req.body as Record<string, unknown>;
    if (!filename || !originalName) {
      res.status(400).json({ error: "filename and originalName are required" });
      return;
    }
    const filePath = path.resolve(OUT_DIR, decodeURIComponent(filename as string));
    if (!filePath.startsWith(OUT_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found in out/" });
      return;
    }
    const stat = fs.statSync(filePath);
    const mime = inferMediaType(originalName as string);
    const record = await dbInsertAsset({
      userId: "local-user",
      originalName: originalName as string,
      storageKey: path.basename(filePath),
      mimeType: mime,
      sizeBytes: typeof size === "number" ? size : stat.size,
      width: (width as number) ?? null,
      height: (height as number) ?? null,
      durationSeconds: (duration as number) ?? null,
    });
    res.json({
      success: true,
      asset: {
        id: record.id,
        name: record.original_name,
        mediaUrlRemote: `/api/assets/${record.id}/raw`,
        width: record.width,
        height: record.height,
        durationInSeconds: record.duration_seconds,
        size: record.size_bytes,
      },
    });
  } catch (error) {
    console.error("Register asset error:", error);
    res.status(500).json({ error: "Failed to register asset" });
  }
});

/** DELETE /api/assets/:id */
assetsRouter.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = "local-user";
    const asset = await dbGetAsset(req.params.id as string) as Record<string, string> | null;
    if (!asset || asset.user_id !== userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const sanitizedKey = path.basename(asset.storage_key);
    const filePath = path.resolve(OUT_DIR, sanitizedKey);
    if (filePath.startsWith(OUT_DIR) && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
    await dbDeleteAsset(req.params.id as string, userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete asset error:", error);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

/** POST /api/assets/:id/clone */
assetsRouter.post("/:id/clone", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = "local-user";
    const { suffix } = req.body as { suffix?: string };
    const asset = await dbGetAsset(req.params.id as string) as Record<string, unknown> | null;
    if (!asset || asset.user_id !== userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const sanitizedKey = path.basename(asset.storage_key as string);
    const srcPath = path.resolve(OUT_DIR, sanitizedKey);
    if (!srcPath.startsWith(OUT_DIR) || !fs.existsSync(srcPath)) {
      res.status(404).json({ error: "Source missing" });
      return;
    }
    const timestamp = Date.now();
    const ext = path.extname(sanitizedKey);
    const base = path.basename(sanitizedKey, ext);
    const sanitizedSuffix = (suffix || "copy").replace(/[^a-zA-Z0-9_-]/g, "");
    const newFilename = `${base}_${sanitizedSuffix}_${timestamp}${ext}`;
    const destPath = path.resolve(OUT_DIR, newFilename);
    fs.copyFileSync(srcPath, destPath);
    const stat = fs.statSync(destPath);
    const record = await dbInsertAsset({
      userId,
      projectId: (asset.project_id as string) || null,
      originalName: `${asset.original_name} ${suffix || "copy"}`.trim(),
      storageKey: newFilename,
      mimeType: asset.mime_type as string,
      sizeBytes: stat.size,
      width: asset.width as number | null,
      height: asset.height as number | null,
      durationSeconds: asset.duration_seconds as number | null,
    });
    res.json({
      success: true,
      asset: {
        id: record.id,
        name: record.original_name,
        mediaUrlRemote: `/api/assets/${record.id}/raw`,
        width: record.width,
        height: record.height,
        durationInSeconds: record.duration_seconds,
        size: record.size_bytes,
      },
    });
  } catch (error) {
    console.error("Clone asset error:", error);
    res.status(500).json({ error: "Failed to clone asset" });
  }
});

/** POST /api/assets/:id/split */
assetsRouter.post("/:id/split", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = "local-user";
    const { splitTimeSeconds } = req.body as { splitTimeSeconds: number };
    if (typeof splitTimeSeconds !== "number" || splitTimeSeconds <= 0) {
      res.status(400).json({ error: "Invalid splitTimeSeconds" });
      return;
    }

    const asset = await dbGetAsset(req.params.id as string) as Record<string, unknown> | null;
    if (!asset || asset.user_id !== userId) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (!asset.mime_type || !(asset.mime_type as string).startsWith("video/") && !(asset.mime_type as string).startsWith("audio/")) {
      res.status(400).json({ error: "Only video and audio can be split" });
      return;
    }

    const assetDurationSeconds =
      typeof asset.duration_seconds === "number" && Number.isFinite(asset.duration_seconds)
        ? asset.duration_seconds
        : null;
    if (assetDurationSeconds !== null && splitTimeSeconds >= assetDurationSeconds) {
      res.status(400).json({ error: "Split time must be inside the asset duration" });
      return;
    }

    const sanitizedKey = path.basename(asset.storage_key as string);
    const srcPath = path.resolve(OUT_DIR, sanitizedKey);
    if (!srcPath.startsWith(OUT_DIR) || !fs.existsSync(srcPath)) {
      res.status(404).json({ error: "Source file missing" });
      return;
    }

    const timestamp = Date.now();
    const ext = path.extname(sanitizedKey);
    const base = path.basename(sanitizedKey, ext);
    
    const part1Filename = `${base}_part1_${timestamp}${ext}`;
    const part2Filename = `${base}_part2_${timestamp}${ext}`;
    
    const part1Path = path.resolve(OUT_DIR, part1Filename);
    const part2Path = path.resolve(OUT_DIR, part2Filename);

    // -c copy is fast and avoids re-encoding, but might snap to nearest keyframe.
    await execFileAsync("ffmpeg", ["-y", "-i", srcPath, "-t", String(splitTimeSeconds), "-c", "copy", part1Path]);
    await execFileAsync("ffmpeg", ["-y", "-ss", String(splitTimeSeconds), "-i", srcPath, "-c", "copy", part2Path]);

    const stat1 = fs.statSync(part1Path);
    const stat2 = fs.statSync(part2Path);

    const originalNameBase = path.basename((asset.original_name as string) || "media", path.extname((asset.original_name as string) || ""));

    const record1 = await dbInsertAsset({
      userId,
      projectId: (asset.project_id as string) || null,
      originalName: `${originalNameBase} (Part 1)${ext}`,
      storageKey: part1Filename,
      mimeType: asset.mime_type as string,
      sizeBytes: stat1.size,
      width: asset.width as number | null,
      height: asset.height as number | null,
      durationSeconds: splitTimeSeconds,
    });

    const record2 = await dbInsertAsset({
      userId,
      projectId: (asset.project_id as string) || null,
      originalName: `${originalNameBase} (Part 2)${ext}`,
      storageKey: part2Filename,
      mimeType: asset.mime_type as string,
      sizeBytes: stat2.size,
      width: asset.width as number | null,
      height: asset.height as number | null,
      durationSeconds: assetDurationSeconds !== null ? assetDurationSeconds - splitTimeSeconds : null,
    });

    res.json({
      success: true,
      part1: {
        id: record1.id,
        name: record1.original_name,
        mediaUrlRemote: `/api/assets/${record1.id}/raw`,
        width: record1.width,
        height: record1.height,
        durationInSeconds: record1.duration_seconds,
        size: record1.size_bytes,
      },
      part2: {
        id: record2.id,
        name: record2.original_name,
        mediaUrlRemote: `/api/assets/${record2.id}/raw`,
        width: record2.width,
        height: record2.height,
        durationInSeconds: record2.duration_seconds,
        size: record2.size_bytes,
      }
    });
  } catch (error) {
    console.error("Split asset error:", error);
    res.status(500).json({ error: "Failed to split asset physically" });
  }
});

/** GET /api/out-files — list rendered MP4/MP3 files */
assetsRouter.get("/out-files", (_req: Request, res: Response): void => {
  try {
    if (!fs.existsSync(OUT_DIR)) {
      res.json({ files: [], outDir: OUT_DIR });
      return;
    }
    const files = fs.readdirSync(OUT_DIR)
      .filter((f) => /\.(mp4|mp3)$/i.test(f))
      .map((f) => ({
        name: f,
        absolutePath: path.join(OUT_DIR, f).split(path.sep).join("/"),
      }));
    res.json({ files, outDir: OUT_DIR.split(path.sep).join("/") });
  } catch (error) {
    console.error("Out-files error:", error);
    res.status(500).json({ files: [], outDir: OUT_DIR });
  }
});

/** GET /api/storage */
assetsRouter.get("/storage", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pyRes = await fetch(`${PYTHON_API}/db/storage?userId=local-user`);
    const usedBytes = pyRes.ok ? ((await pyRes.json()) as { usedBytes: number }).usedBytes : 0;
    res.json({ usedBytes, limitBytes: 2 * 1024 * 1024 * 1024 });
  } catch {
    res.json({ usedBytes: 0, limitBytes: 2 * 1024 * 1024 * 1024 });
  }
});
