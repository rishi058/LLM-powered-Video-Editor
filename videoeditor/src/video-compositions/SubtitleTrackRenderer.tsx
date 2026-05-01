import React, { useEffect, useState } from "react";
import { Sequence, continueRender, delayRender, useVideoConfig } from "remotion";
import { SubtitlePage } from "./SubtitlePage";
import { createTikTokStyleCaptions, type TikTokPage, type Caption } from "@remotion/captions";

// Number of words to show per subtitle page (3–4 words at a time)
const WORDS_PER_PAGE = 4;

/**
 * Groups an array of word-level Caption tokens into pages of WORDS_PER_PAGE words.
 * Each page spans from the first token's startMs to the last token's endMs (or toMs).
 */
function groupTokensIntoPages(captions: Caption[]): TikTokPage[] {
  const pages: TikTokPage[] = [];

  // Filter out zero-duration / invalid tokens before grouping
  const validCaptions = captions.filter((t) => {
    const end = t.endMs ?? t.startMs + 500;
    return end > t.startMs;
  });

  for (let i = 0; i < validCaptions.length; i += WORDS_PER_PAGE) {
    const group = validCaptions.slice(i, i + WORDS_PER_PAGE);
    const text = group.map((t) => t.text).join("").trim();
    if (!text) continue;

    const startMs = group[0].startMs;
    const lastToken = group[group.length - 1];
    // Ensure endMs is always strictly greater than startMs
    const rawEndMs = lastToken.endMs ?? lastToken.startMs + 500;
    const endMs = rawEndMs > startMs ? rawEndMs : startMs + 500;
    const durationMs = Math.max(50, endMs - startMs);

    // Build TikTokPage-compatible tokens
    const tokens = group.map((t) => ({
      text: t.text,
      fromMs: t.startMs,
      toMs: Math.max(t.startMs + 50, t.endMs ?? t.startMs + 500),
    }));

    pages.push({ text, startMs, durationMs, tokens });
  }

  return pages;
}

export const SubtitleTrackRenderer: React.FC<{
  src: string;
}> = ({ src }) => {
  const [handle] = useState(() => delayRender("Loading subtitles"));
  const [pages, setPages] = useState<TikTokPage[] | null>(null);
  const { fps } = useVideoConfig();

  useEffect(() => {
    // Determine the correct API endpoint
    let fetchUrl = src;
    if (src.startsWith("/")) {
      const char = src.includes("?") ? "&" : "?";
      if (typeof window !== "undefined") {
         if (window.location.port === "5173" || window.location.port === "3000") {
            fetchUrl = src;
         } else {
            fetchUrl = `http://localhost:5173${src}${char}render=true`;
         }
      } else {
         fetchUrl = `http://localhost:5173${src}${char}render=true`;
      }
    }

    fetch(fetchUrl)
      .then((res) => {
         if (!res.ok) throw new Error("Network not ok");
         return res.json();
      })
      .then((json) => {
        let finalPages: TikTokPage[] = [];
        if (Array.isArray(json)) {
          // Group whisper tokens into pages of WORDS_PER_PAGE words at a time
          // (fast-paced lyrics need 3-4 words per frame, not 1 word per frame)
          finalPages = groupTokensIntoPages(json as Caption[]);
        } else if (json.pages) {
          finalPages = json.pages;
        }
        setPages(finalPages);
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Failed to load subtitles", err);
        // Fallback for rendering side if the backend URL is unreachable directly
        // Just cancel the delayRender so frame continues rendering seamlessly
        continueRender(handle);
      });
  }, [src, handle]);

  if (!pages) {
    return null;
  }

  // Filter out empty-text pages (e.g. sentinel entries) before rendering
  const validPages = pages.filter((p) => p.text.trim() !== "");

  // Build frame ranges and ensure they are strictly non-overlapping
  type PageWithFrames = { page: TikTokPage; fromFrame: number; duration: number };
  const framed: PageWithFrames[] = [];
  let lastEndFrame = -1;

  for (let index = 0; index < validPages.length; index++) {
    const page = validPages[index];
    let fromFrame = Math.round((page.startMs / 1000) * fps);

    let toFrame: number;
    if (Number.isFinite(page.durationMs) && page.durationMs > 0) {
      toFrame = Math.round(((page.startMs + page.durationMs) / 1000) * fps);
    } else if (index < validPages.length - 1) {
      toFrame = Math.round((validPages[index + 1].startMs / 1000) * fps);
    } else {
      const lastToken = page.tokens[page.tokens.length - 1];
      toFrame = lastToken
        ? Math.round((lastToken.toMs / 1000) * fps)
        : fromFrame + Math.round(fps);
    }

    // Push fromFrame forward if it collides with the previous segment
    if (fromFrame <= lastEndFrame) {
      fromFrame = lastEndFrame + 1;
    }

    const duration = Math.max(2, toFrame - fromFrame);
    lastEndFrame = fromFrame + duration;

    framed.push({ page, fromFrame, duration });
  }

  return (
    <>
      {framed.map(({ page, fromFrame, duration }, index) => (
        <Sequence
          key={index}
          from={fromFrame}
          durationInFrames={duration}
        >
          <SubtitlePage page={page} />
        </Sequence>
      ))}
    </>
  );
};
