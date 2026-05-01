import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDirectoryExists } from "./utils/path-security.js";
import { mediaRouter } from "./routes/media.js";
import { renderRouter } from "./routes/render.js";
import { assetsRouter } from "./routes/assets.js";
import { projectsRouter } from "./routes/projects.js";
import { subtitlesRouter } from "./routes/subtitles.js";

const port = Number(process.env.PORT ?? 8000);

// Resolve working paths: default to sibling videoeditor/ directories so that
// media files and project state are co-located with the frontend's expectations.
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? path.resolve(import.meta.dirname, "../../videoeditor");
const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(WORKSPACE_ROOT, "out");
const TIMELINE_DIR = process.env.TIMELINE_DIR ? path.resolve(process.env.TIMELINE_DIR) : path.join(WORKSPACE_ROOT, "project_data");

// Make these available as env vars so route modules can pick them up
process.env.OUT_DIR = OUT_DIR;
process.env.TIMELINE_DIR = TIMELINE_DIR;

// Ensure output and project data directories exist on startup
ensureDirectoryExists(OUT_DIR);
ensureDirectoryExists(TIMELINE_DIR);

const app = express();

// CORS — allow the Vite dev server (port 5173) and any same-origin requests
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:4173", // vite preview
    /^http:\/\/localhost:\d+$/,
  ],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// ---------- routes ----------

// Internal media serving for Remotion composition (headless Chromium needs absolute URLs)
app.use("/media", mediaRouter);

// Public API routes (proxied from Vite dev server via /api/*)
app.use("/api/render", renderRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/subtitles", subtitlesRouter);

// Convenience aliases that the old codebase may still use directly
app.use("/api/out-files", (_req, res) => {
  // Delegate to assets router's internal out-files handler
  res.redirect("/api/assets/out-files");
});
app.use("/api/storage", (_req, res) => {
  res.redirect("/api/assets/storage");
});

// Health check
app.get("/api/health", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
    },
    uptime: `${Math.round(process.uptime())} seconds`,
  });
});

app.listen(port, () => {
  console.log(`🚀 render-server running on http://localhost:${port}`);
  console.log(`📊 Health:       GET  http://localhost:${port}/api/health`);
  console.log(`🎬 Render:       POST http://localhost:${port}/api/render`);
  console.log(`📁 Assets:       GET  http://localhost:${port}/api/assets`);
  console.log(`📤 Upload:       POST http://localhost:${port}/api/assets/upload`);
  console.log(`🗂️  Projects:     GET  http://localhost:${port}/api/projects`);
  console.log(`📝 Subtitles:    GET  http://localhost:${port}/api/subtitles`);
  console.log(`📂 Media served from: ${OUT_DIR}`);
});
