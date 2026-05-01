import { useState, useCallback } from "react";
import axios from "axios";
import {
  type TimelineDataItem,
  type TimelineState,
  FPS,
} from "~/components/timeline/types";

export const useRenderer = () => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string>("");

  const handleRenderVideo = useCallback(
    async (
      getTimelineData: () => TimelineDataItem[],
      timeline: TimelineState,
      compositionWidth: number | null,
      compositionHeight: number | null,
      getPixelsPerSecond: () => number
    ) => {
      setIsRendering(true);
      setRenderStatus("Starting render...");

      try {
        // Health check
        setRenderStatus("Connecting to render server...");
        try {
          await axios.get("/api/health", { timeout: 5000 });
        } catch {
          throw new Error(
            "Cannot connect to render server. Make sure render-server is running on http://localhost:8000"
          );
        }

        const timelineData = getTimelineData();

        // Resolve composition dimensions
        if (compositionWidth === null) {
          let max = 0;
          for (const item of timelineData) {
            for (const s of item.scrubbers) {
              if (s.media_width !== null && s.media_width > max) max = s.media_width;
            }
          }
          compositionWidth = max || 1920;
        }
        if (compositionHeight === null) {
          let max = 0;
          for (const item of timelineData) {
            for (const s of item.scrubbers) {
              if (s.media_height !== null && s.media_height > max) max = s.media_height;
            }
          }
          compositionHeight = max || 1080;
        }

        if (timeline.tracks.length === 0 || timeline.tracks.every((t) => t.scrubbers.length === 0)) {
          setRenderStatus("Error: No timeline data to render");
          setIsRendering(false);
          return;
        }

        setRenderStatus("Rendering video...");

        const durationInFrames = (() => {
          let maxEndTime = 0;
          getTimelineData().forEach((item) => {
            item.scrubbers.forEach((s) => {
              if (s.endTime > maxEndTime) maxEndTime = s.endTime;
            });
          });
          return Math.ceil(maxEndTime * FPS);
        })();

        const response = await axios.post(
          "/api/render",
          {
            timelineData,
            compositionWidth,
            compositionHeight,
            durationInFrames,
            getPixelsPerSecond: getPixelsPerSecond(),
          },
          {
            responseType: "blob",
            timeout: 900000,
            onDownloadProgress: (evt) => {
              if (evt.lengthComputable && evt.total) {
                setRenderStatus(`Downloading: ${Math.round((evt.loaded * 100) / evt.total)}%`);
              }
            },
          }
        );

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const a = document.createElement("a");
        a.href = url;
        a.setAttribute("download", "rendered-video.mp4");
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setRenderStatus("Video rendered and downloaded successfully!");
      } catch (error) {
        console.error("Render error:", error);
        if (axios.isAxiosError(error)) {
          if (error.code === "ECONNABORTED") {
            setRenderStatus("Error: Render timeout — try a shorter video");
          } else if (error.response?.status === 500) {
            setRenderStatus(`Error: ${error.response.data?.message || "Server error during rendering"}`);
          } else if (error.request) {
            setRenderStatus("Error: Cannot connect to render server. Make sure render-server is running.");
          } else {
            setRenderStatus(`Error: ${error.message}`);
          }
        } else {
          setRenderStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      } finally {
        setIsRendering(false);
        setTimeout(() => setRenderStatus(""), 8000);
      }
    },
    []
  );

  return { isRendering, renderStatus, handleRenderVideo };
};
