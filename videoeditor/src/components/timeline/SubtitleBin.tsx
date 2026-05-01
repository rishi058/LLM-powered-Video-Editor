import React, { useState, useEffect, useCallback, useRef } from "react";
import { Upload, MessageSquare, FileJson, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import SyncCaption from "./SyncCaption";

export interface SubtitleItem {
  id: string;
  name: string;
  size: number;
  path: string;
  created_at: string;
  durationInSeconds: number;
}

// Display-only: strips trailing _<digits> before the extension, e.g. foo_1773949404810.mp4 -> foo.mp4
const stripTimestampSuffix = (filename: string) =>
  filename.replace(/_\d+(\.[^.]+)$/, "$1");


export default function SubtitleBin() {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: SubtitleItem;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<SubtitleItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit JSON dialog state
  const [editTarget, setEditTarget] = useState<SubtitleItem | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editJsonError, setEditJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch subtitles on mount
  useEffect(() => {
    fetchSubtitles();
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handle = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handle);
    return () => window.removeEventListener("mousedown", handle);
  }, [contextMenu]);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [contextMenu]);

  const fetchSubtitles = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/subtitles");
      if (res.ok) {
        const data = await res.json();
        setSubtitles(data.subtitles || []);
      }
    } catch (e) {
      console.error("Failed to fetch subtitles", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, item: SubtitleItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────

  const openDeleteDialog = useCallback((item: SubtitleItem) => {
    setContextMenu(null);
    setDeleteTarget(item);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/subtitles/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Deleted "${stripTimestampSuffix(deleteTarget.name)}"`);
        setDeleteTarget(null);
        fetchSubtitles();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete subtitle");
      }
    } catch (err) {
      console.error("Delete error", err);
      toast.error("Error deleting subtitle");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  // ── Edit ─────────────────────────────────────────────────────────────────

  const openEditDialog = useCallback(async (item: SubtitleItem) => {
    setContextMenu(null);
    setEditJsonError(null);
    try {
      const res = await fetch(item.path);
      if (!res.ok) throw new Error("Failed to load subtitle file");
      const json = await res.json();
      setEditJson(JSON.stringify(json, null, 2));
      setEditTarget(item);
    } catch (err) {
      console.error("Edit load error", err);
      toast.error("Could not load subtitle file for editing");
    }
  }, []);

  const handleEditJsonChange = useCallback((value: string) => {
    setEditJson(value);
    try {
      JSON.parse(value);
      setEditJsonError(null);
    } catch (e: any) {
      setEditJsonError(e.message);
    }
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editTarget || editJsonError) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/subtitles/${encodeURIComponent(editTarget.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: editJson,
      });
      if (res.ok) {
        toast.success(`Saved "${stripTimestampSuffix(editTarget.name)}"`);
        setEditTarget(null);
        fetchSubtitles();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save subtitle");
      }
    } catch (err) {
      console.error("Save error", err);
      toast.error("Error saving subtitle");
    } finally {
      setIsSaving(false);
    }
  }, [editTarget, editJson, editJsonError]);

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragOverRoot = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeaveRoot = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDropRoot = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    const jsonFiles = droppedFiles.filter(file => file.name.toLowerCase().endsWith(".json"));

    if (jsonFiles.length === 0) {
      toast.error("Only .json subtitle files are supported.");
      return;
    }

    for (const file of jsonFiles) {
      try {
        const formData = new FormData();
        formData.append("media", file);

        const res = await fetch("/api/subtitles", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          toast.success(`Imported ${file.name}`);
        } else {
          toast.error(`Failed to import ${file.name}`);
        }
      } catch (err) {
        console.error("Failed to import drop", err);
        toast.error(`Error importing ${file.name}`);
      }
    }

    fetchSubtitles();
  }, []);

  return (
    <div
      className="h-full flex flex-col bg-background relative"
      onDragOver={handleDragOverRoot}
      onDragEnter={handleDragOverRoot}
      onDragLeave={handleDragLeaveRoot}
      onClick={() => setContextMenu(null)}
    >
      <SyncCaption />
      <div className="p-2 border-b border-border/50 flex items-center justify-between">
        <h3 className="text-xs font-medium text-foreground">Subtitle Library</h3>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-xs h-4 px-1.5 font-mono">
            {subtitles.length}
          </Badge>
          <button
            onClick={fetchSubtitles}
            disabled={isLoading}
            title="Refresh subtitle files"
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 panel-scrollbar">
        {isLoading && (
          <div className="px-0.5">
            <div className="indeterminate-line text-primary" />
          </div>
        )}

        {subtitles.map((item) => (
          <div
            key={item.id}
            className="group p-2 border border-border/50 rounded-md transition-colors bg-card cursor-grab hover:bg-accent/50"
            draggable
            onContextMenu={(e) => handleContextMenu(e, item)}
            onDragStart={(e) => {
              const payload = {
                id: `subtitle-${item.id}-${Date.now()}`,
                mediaType: "subtitle",
                name: item.name,
                mediaUrlLocal: null,
                mediaUrlRemote: item.path,
                media_width: 1920,
                media_height: 1080,
                durationInSeconds: item.durationInSeconds || 5,
                isUploading: false,
                uploadProgress: null,
                text: null,
                subtitleData: null,
                groupped_scrubbers: null,
                left_transition_id: null,
                right_transition_id: null,
              };
              e.dataTransfer.setData("application/json", JSON.stringify(payload));
            }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 w-12 h-8 rounded border border-border/50 bg-card flex items-center justify-center">
                <FileJson className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-foreground group-hover:text-accent-foreground">
                  {stripTimestampSuffix(item.name)}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-auto">
                    subtitle
                  </Badge>
                  {item.durationInSeconds > 0 && (
                     <div className="text-[10px] text-muted-foreground">
                        {item.durationInSeconds.toFixed(1)}s
                     </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && subtitles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-xs text-muted-foreground">No subtitle files</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Drag &amp; drop .json files here
            </p>
          </div>
        )}
      </div>

      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-background/80">
          <div className="absolute inset-2 border-2 border-dashed border-primary/80 rounded-md flex items-center justify-center">
            <div className="pointer-events-none text-center">
              <Upload className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-sm text-primary font-medium">Drop subtitle files to import</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Context Menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-popover border border-border rounded-md shadow-lg z-50 py-1 min-w-36"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => openEditDialog(contextMenu.item)}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-destructive/10 hover:text-destructive flex items-center gap-2 text-destructive"
            onClick={() => openDeleteDialog(contextMenu.item)}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div
            className="bg-popover border border-border rounded-lg shadow-xl p-5 w-80 max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Delete Subtitle</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-foreground">
                    {stripTimestampSuffix(deleteTarget.name)}
                  </span>
                  ? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit JSON Dialog ─────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditTarget(null)}>
          <div
            className="bg-popover border border-border rounded-lg shadow-xl flex flex-col w-[600px] max-w-[95vw] max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">
                  Edit — {stripTimestampSuffix(editTarget.name)}
                </h4>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => setEditTarget(null)}
              >
                ✕
              </button>
            </div>

            {/* Text editor */}
            <div className="flex-1 overflow-auto p-3">
              <textarea
                className={`w-full h-full min-h-[300px] font-mono text-xs bg-background border rounded-md p-3 resize-none outline-none focus:ring-1 transition-colors ${
                  editJsonError
                    ? "border-destructive focus:ring-destructive"
                    : "border-border focus:ring-primary"
                }`}
                value={editJson}
                onChange={(e) => handleEditJsonChange(e.target.value)}
                spellCheck={false}
              />
              {editJsonError && (
                <p className="mt-1.5 text-[11px] text-destructive font-mono">{editJsonError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditTarget(null)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={saveEdit}
                disabled={isSaving || !!editJsonError}
              >
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
