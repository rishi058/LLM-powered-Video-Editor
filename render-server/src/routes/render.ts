import { type Request, type Response, Router } from "express";
// @ts-ignore – @remotion/bundler types may not be present during type-check but the package is installed
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import os from "os";

export const renderRouter = Router();

const compositionId = "TimelineComposition";
const OUT_DIR = process.env.OUT_DIR ?? path.resolve("out");

// Use almost all logical CPU cores (leaving 2 for OS) to maximize rendering speed
const RENDER_CONCURRENCY = Math.max(1, os.cpus().length - 2);
console.log(`🖥️  Render concurrency: ${RENDER_CONCURRENCY} / ${os.cpus().length} cores`);

// Defaulting to libx264 without custom ffmpeg overrides.
const nvencAvailable = false;

// Bundle once at startup and reuse for all renders
let bundleLocationPromise: Promise<string> | undefined;

function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    console.log("📦 Bundling Remotion composition (first request)...");
    bundleLocationPromise = bundle(
      path.resolve(import.meta.dirname, "../composition/index.ts")
    ).then((loc: string) => {
      console.log("✅ Bundle ready:", loc);
      return loc;
    });
  }
  return bundleLocationPromise;
}

/**
 * POST /api/render
 * Accepts timeline data, renders a video with Remotion, returns MP4 blob.
 */
renderRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const inputProps = {
      timelineData: req.body.timelineData,
      durationInFrames: req.body.durationInFrames,
      compositionWidth: req.body.compositionWidth,
      compositionHeight: req.body.compositionHeight,
      getPixelsPerSecond: req.body.getPixelsPerSecond,
      isRendering: true,
    };

    const totalFrames = req.body.durationInFrames as number;
    console.log(
      `🎬 Render request: ${totalFrames} frames ` +
      `(${(totalFrames / 30).toFixed(1)}s) @ ${req.body.compositionWidth}x${req.body.compositionHeight}`,
    );

    const bundleLocation = await getBundleLocation();

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
      inputProps,
    });

    // Override composition duration and dimensions from the request body.
    // This is necessary because getInputProps() in Composition.tsx is evaluated
    // at bundle time (stale cached bundle), so it returns the compiled-in defaults
    // (300 frames = 10s) instead of the actual values from the POST body.
    composition.durationInFrames = req.body.durationInFrames;
    composition.width = req.body.compositionWidth;
    composition.height = req.body.compositionHeight;

    const outputPath = path.join(OUT_DIR, `${compositionId}.mp4`);

    const renderStartTime = Date.now();
    let lastLogTime = renderStartTime;

    const renderOptions: Parameters<typeof renderMedia>[0] = {
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      concurrency: RENDER_CONCURRENCY,
      chromiumOptions: {
        gl: "angle", // Hardware-accelerated WebGL
      },
      logLevel: "warn",
      timeoutInMilliseconds: 900000,
      onProgress: ({ renderedFrames, renderedDoneIn, encodedDoneIn, stitchStage }) => {
        const now = Date.now();
        // Log progress every 5 seconds to avoid flooding
        if (now - lastLogTime >= 5000 || renderedDoneIn !== null) {
          const pct = ((renderedFrames / totalFrames) * 100).toFixed(1);
          const elapsed = ((now - renderStartTime) / 1000).toFixed(0);
          const status = stitchStage === "encoding" ? "encoding" : "rendering";
          console.log(
            `📊 Progress: ${renderedFrames}/${totalFrames} frames (${pct}%) ` +
            `| ${status} | ${elapsed}s elapsed`,
          );
          lastLogTime = now;
        }
        if (renderedDoneIn !== null) {
          console.log(`✅ Rendering done in ${(renderedDoneIn / 1000).toFixed(1)}s`);
        }
        if (encodedDoneIn !== null) {
          console.log(`✅ Encoding done in ${(encodedDoneIn / 1000).toFixed(1)}s`);
        }
      },
    };

    // Use default Remotion bundled ffmpeg and libx264 encoder.

    console.log(`🚀 Starting render (encoder: ${nvencAvailable ? "h264_nvenc" : "libx264"})...`);
    await renderMedia(renderOptions);

    const totalTime = ((Date.now() - renderStartTime) / 1000).toFixed(1);
    console.log(`✅ Render completed in ${totalTime}s`);
    res.sendFile(path.resolve(outputPath));
  } catch (err) {
    console.error("❌ Render failed:", err);

    // Clean up partial output
    try {
      const outputPath = path.join(OUT_DIR, `${compositionId}.mp4`);
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log("🧹 Cleaned up partial file");
      }
    } catch (cleanupErr) {
      console.warn("⚠️ Could not clean up:", cleanupErr);
    }

    res.status(500).json({
      error: "Video rendering failed",
      message: String(err instanceof Error ? err.message : err),
    });
  }
});
