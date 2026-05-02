import { type Request, type Response, Router } from "express";
import fs from "fs";
import path from "path";
import { safeResolvePath, ensureDirectoryExists } from "../utils/path-security.js";

export const projectsRouter = Router();

const TIMELINE_DIR = process.env.TIMELINE_DIR || path.resolve("project_data");
const PYTHON_API = process.env.PYTHON_API_URL ?? "http://localhost:3000";
const USER_ID = "local-user";

// ---------- timeline store helpers ----------

function getTimelineFilePath(projectId: string): string {
  if (!projectId || typeof projectId !== "string") throw new Error("Invalid project ID");
  ensureDirectoryExists(TIMELINE_DIR);
  const filePath = safeResolvePath(TIMELINE_DIR, `${projectId}.json`);
  if (!filePath) throw new Error("Invalid project ID format");
  return filePath;
}

function defaultTimeline() {
  return {
    tracks: [
      { id: "track-1", scrubbers: [], transitions: [] },
      { id: "track-2", scrubbers: [], transitions: [] },
      { id: "track-3", scrubbers: [], transitions: [] },
      { id: "track-4", scrubbers: [], transitions: [] },
    ],
  };
}

async function loadProjectState(projectId: string) {
  const file = getTimelineFilePath(projectId);
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && ("timeline" in parsed || "mediaBinItems" in parsed || "textBinItems" in parsed)) {
      return {
        timeline: parsed.timeline ?? defaultTimeline(),
        mediaBinItems: Array.isArray(parsed.mediaBinItems) ? parsed.mediaBinItems : (Array.isArray(parsed.textBinItems) ? parsed.textBinItems : []),
        zoomLevel: typeof parsed.zoomLevel === "number" ? parsed.zoomLevel : 1.0,
      };
    }
    return { timeline: parsed ?? defaultTimeline(), mediaBinItems: [], zoomLevel: 1.0 };
  } catch {
    return { timeline: defaultTimeline(), mediaBinItems: [], zoomLevel: 1.0 };
  }
}

async function saveProjectState(projectId: string, state: { timeline: unknown; mediaBinItems: unknown[]; zoomLevel: number }) {
  const file = getTimelineFilePath(projectId);
  await fs.promises.writeFile(file, JSON.stringify(state), "utf8");
}

// ---------- Python DB helpers ----------

async function dbFetch(endpoint: string, options?: RequestInit) {
  return fetch(`${PYTHON_API}${endpoint}`, options);
}

// ---------- routes ----------

/** GET /api/projects */
projectsRouter.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await dbFetch(`/db/projects?userId=${encodeURIComponent(USER_ID)}`);
    if (!r.ok) throw new Error("Failed to list projects");
    res.json({ projects: await r.json() });
  } catch (error) {
    console.error("List projects error:", error);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

/** GET /api/projects/:id */
projectsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await dbFetch(`/db/projects/${encodeURIComponent(req.params.id as string)}`);
    if (r.status === 404) { res.status(404).json({ error: "Not found" }); return; }
    if (!r.ok) throw new Error("DB error");
    const project = await r.json() as Record<string, unknown>;
    if (project.user_id !== USER_ID) { res.status(404).json({ error: "Not found" }); return; }
    const state = await loadProjectState(req.params.id as string);
    res.json({ project, timeline: state.timeline, mediaBinItems: state.mediaBinItems, zoomLevel: state.zoomLevel });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Failed to get project" });
  }
});

/** POST /api/projects */
projectsRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const name: string = (req.body as Record<string, string>).name || "Untitled Project";
    const r = await dbFetch("/db/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_ID, name: name.trim().slice(0, 120) }),
    });
    if (!r.ok) throw new Error("Failed to create project");
    const project = await r.json();
    res.status(201).json({ project });
  } catch (error) {
    console.error("Create project error:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

/** PATCH /api/projects/:id — rename and/or save timeline */
projectsRouter.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const r = await dbFetch(`/db/projects/${encodeURIComponent(id)}`);
    if (r.status === 404 || !(await r.json().then((p: Record<string, unknown>) => p.user_id === USER_ID).catch(() => false))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const body = req.body as { name?: string; timeline?: unknown; mediaBinItems?: unknown[], textBinItems?: unknown[], zoomLevel?: number };

    if (body.name) {
      await dbFetch(`/db/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, name: body.name }),
      });
    }

    if (body.timeline || body.mediaBinItems || body.textBinItems || body.zoomLevel !== undefined) {
      const prev = await loadProjectState(id);
      await saveProjectState(id, {
        timeline: body.timeline ?? prev.timeline,
        mediaBinItems: body.mediaBinItems ?? body.textBinItems ?? prev.mediaBinItems,
        zoomLevel: body.zoomLevel ?? prev.zoomLevel,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

/** DELETE /api/projects/:id */
projectsRouter.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const r = await dbFetch(`/db/projects/${encodeURIComponent(id)}?userId=${encodeURIComponent(USER_ID)}`, { method: "DELETE" });
    if (r.status === 404) { res.status(404).json({ error: "Not found" }); return; }
    if (!r.ok) throw new Error("Failed to delete");

    // Remove timeline state file
    try {
      await fs.promises.unlink(path.resolve(TIMELINE_DIR, `${id}.json`));
    } catch { /* no timeline file is fine */ }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});
