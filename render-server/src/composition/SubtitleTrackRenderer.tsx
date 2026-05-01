import React, { useEffect, useState } from "react";
import { Sequence, continueRender, delayRender, useVideoConfig } from "remotion";
import { SubtitlePage } from "./SubtitlePage";
import { createTikTokStyleCaptions, type TikTokPage, type Caption } from "@remotion/captions";

const WORDS_PER_PAGE = 4;

// The render-server serves media from its own /media/ endpoint (port 8000).
// During rendering, Remotion runs inside Chromium — absolute URLs work, relative ones don't.
const RENDER_SERVER_ORIGIN = process.env.RENDER_SERVER_ORIGIN ?? "http://localhost:8000";

function resolveSubtitleUrl(src: string): string {
  if (!src.startsWith("/")) return src;
  return `${RENDER_SERVER_ORIGIN}${src}`;
}

function groupTokensIntoPages(captions: Caption[]): TikTokPage[] {
  const pages: TikTokPage[] = [];
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
    const rawEndMs = lastToken.endMs ?? lastToken.startMs + 500;
    const endMs = rawEndMs > startMs ? rawEndMs : startMs + 500;
    const durationMs = Math.max(50, endMs - startMs);

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
    const fetchUrl = resolveSubtitleUrl(src);

    fetch(fetchUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Network not ok");
        return res.json();
      })
      .then((json) => {
        let finalPages: TikTokPage[] = [];
        if (Array.isArray(json)) {
          finalPages = groupTokensIntoPages(json as Caption[]);
        } else if (json.pages) {
          finalPages = json.pages;
        }
        setPages(finalPages);
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Failed to load subtitles", err);
        continueRender(handle);
      });
  }, [src, handle]);

  if (!pages) return null;

  const validPages = pages.filter((p) => p.text.trim() !== "");

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
        <Sequence key={index} from={fromFrame} durationInFrames={duration}>
          <SubtitlePage page={page} />
        </Sequence>
      ))}
    </>
  );
};
