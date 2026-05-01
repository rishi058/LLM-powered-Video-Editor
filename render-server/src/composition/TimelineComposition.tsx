import { Sequence, AbsoluteFill, Img, OffthreadVideo, Audio } from "remotion";
import {
  linearTiming,
  springTiming,
  TransitionSeries,
  type TransitionPresentation,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { iris } from "@remotion/transitions/iris";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import {
  FPS,
  type ScrubberState,
  type TimelineDataItem,
  type TimelineState,
  type Transition,
} from "./types";
import { SortedOutlines, layerContainer, outer } from "./DragDrop";
import { SubtitleTrackRenderer } from "./SubtitleTrackRenderer";

// The render-server is the source of truth for media files.
// All relative /media/* URLs are resolved against the render-server's own origin.
const RENDER_SERVER_ORIGIN = process.env.RENDER_SERVER_ORIGIN ?? "http://localhost:8000";

const resolveMediaUrl = (url: string | null | undefined, isRendering: boolean): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith("/")) {
    if (isRendering) {
      // Remotion renders inside headless Chromium — needs an absolute URL.
      // The render-server serves its own media via /media/:filename
      return `${RENDER_SERVER_ORIGIN}${url}`;
    }
    return url;
  }
  return url;
};

type RenderTimelineScrubber = TimelineDataItem["scrubbers"][0] | ScrubberState;

const getVisibleDurationFrames = (scrubber: RenderTimelineScrubber, pixelsPerSecond: number) => {
  if ("duration" in scrubber && typeof scrubber.duration === "number") {
    return Math.max(1, Math.round(scrubber.duration * FPS));
  }

  return Math.max(1, Math.round((scrubber.width / pixelsPerSecond) * FPS));
};

const getRemotionTrimProps = (scrubber: RenderTimelineScrubber, pixelsPerSecond: number) => {
  const trimBefore = scrubber.trimBefore ?? 0;
  const tailTrim = scrubber.trimAfter ?? 0;
  const sourceDurationFrames =
    scrubber.durationInSeconds > 0
      ? Math.max(1, Math.round(scrubber.durationInSeconds * FPS))
      : trimBefore + getVisibleDurationFrames(scrubber, pixelsPerSecond) + tailTrim;

  return {
    trimBefore: trimBefore > 0 ? trimBefore : undefined,
    trimAfter: tailTrim > 0 ? Math.max(trimBefore + 1, sourceDurationFrames - tailTrim) : undefined,
  };
};

type TimelineCompositionProps = {
  timelineData: TimelineDataItem[];
  isRendering: boolean;
  selectedItem: string | null;
  setSelectedItem: React.Dispatch<React.SetStateAction<string | null>>;
  timeline: TimelineState;
  handleUpdateScrubber: (updateScrubber: ScrubberState) => void;
  getPixelsPerSecond: number | (() => number);
};

const getTransitionPresentation = (transition: Transition): TransitionPresentation<any> => {
  switch (transition.presentation) {
    case "fade": return fade();
    case "wipe": return wipe();
    case "slide": return slide();
    case "flip": return flip();
    case "iris": return iris({ width: 1000, height: 1000 });
    default: return fade();
  }
};

const getTransitionTiming = (transition: Transition) => {
  switch (transition.timing) {
    case "spring": return springTiming({ durationInFrames: transition.durationInFrames });
    case "linear":
    default: return linearTiming({ durationInFrames: transition.durationInFrames });
  }
};

export function TimelineComposition({
  timelineData,
  isRendering,
  selectedItem,
  setSelectedItem,
  timeline,
  handleUpdateScrubber,
  getPixelsPerSecond,
}: TimelineCompositionProps) {
  const resolvedPixelsPerSecond = isRendering
    ? (getPixelsPerSecond as number)
    : (getPixelsPerSecond as () => number)();

  const allTransitions = timelineData[0].transitions;

  const trackGroups: {
    [trackIndex: number]: { content: TimelineDataItem["scrubbers"][0]; type: string }[];
  } = {};

  for (const timelineItem of timelineData) {
    for (const scrubber of timelineItem.scrubbers) {
      if (!trackGroups[scrubber.trackIndex]) {
        trackGroups[scrubber.trackIndex] = [];
      }
      trackGroups[scrubber.trackIndex].push({ content: scrubber, type: "scrubber" });
    }
  }

  for (const trackIndex in trackGroups) {
    trackGroups[parseInt(trackIndex)].sort((a, b) => a.content.startTime - b.content.startTime);
  }

  const createMediaContent = (scrubber: TimelineDataItem["scrubbers"][0] | ScrubberState): React.ReactNode => {
    let content: React.ReactNode = null;

    switch (scrubber.mediaType) {
      case "text":
        content = (
          <AbsoluteFill style={{ left: scrubber.left_player, top: scrubber.top_player, width: scrubber.width_player, height: scrubber.height_player, justifyContent: "center", alignItems: "center" }}>
            <div style={{ textAlign: scrubber.text?.textAlign || "center", width: "100%" }}>
              <p style={{
                color: scrubber.text?.color || "white",
                fontSize: scrubber.text?.fontSize ? `${scrubber.text.fontSize}px` : "48px",
                fontFamily: scrubber.text?.fontFamily || "Arial, sans-serif",
                fontWeight: scrubber.text?.fontWeight || "normal",
                margin: 0,
                padding: "20px",
              }}>
                {scrubber.text?.textContent || ""}
              </p>
            </div>
          </AbsoluteFill>
        );
        break;
      case "image": {
        const rawImageUrl = isRendering ? scrubber.mediaUrlRemote || scrubber.mediaUrlLocal : scrubber.mediaUrlLocal || scrubber.mediaUrlRemote;
        const imageUrl = resolveMediaUrl(rawImageUrl, isRendering);
        content = (
          <AbsoluteFill style={{ left: scrubber.left_player, top: scrubber.top_player, width: scrubber.width_player, height: scrubber.height_player }}>
            <Img src={imageUrl!} />
          </AbsoluteFill>
        );
        break;
      }
      case "video": {
        const rawVideoUrl = isRendering ? scrubber.mediaUrlRemote || scrubber.mediaUrlLocal : scrubber.mediaUrlLocal || scrubber.mediaUrlRemote;
        const videoUrl = resolveMediaUrl(rawVideoUrl, isRendering);
        const trimProps = getRemotionTrimProps(scrubber, resolvedPixelsPerSecond);
        content = (
          <AbsoluteFill style={{ left: scrubber.left_player, top: scrubber.top_player, width: scrubber.width_player, height: scrubber.height_player }}>
            <OffthreadVideo src={videoUrl!} trimBefore={trimProps.trimBefore} trimAfter={trimProps.trimAfter} />
          </AbsoluteFill>
        );
        break;
      }
      case "audio": {
        const rawAudioUrl = isRendering ? scrubber.mediaUrlRemote || scrubber.mediaUrlLocal : scrubber.mediaUrlLocal || scrubber.mediaUrlRemote;
        const audioUrl = resolveMediaUrl(rawAudioUrl, isRendering);
        const trimProps = getRemotionTrimProps(scrubber, resolvedPixelsPerSecond);
        content = (
          <Audio src={audioUrl!} trimBefore={trimProps.trimBefore} trimAfter={trimProps.trimAfter} />
        );
        break;
      }
      case "subtitle": {
        const rawSubtitleUrl = isRendering ? scrubber.mediaUrlRemote || scrubber.mediaUrlLocal : scrubber.mediaUrlLocal || scrubber.mediaUrlRemote;
        const subtitleUrl = resolveMediaUrl(rawSubtitleUrl, isRendering);
        content = (
          <AbsoluteFill style={{ left: scrubber.left_player, top: scrubber.top_player, width: scrubber.width_player, height: scrubber.height_player }}>
            {subtitleUrl && <SubtitleTrackRenderer src={subtitleUrl} />}
          </AbsoluteFill>
        );
        break;
      }
      default:
        console.warn(`Unknown media type: ${scrubber.mediaType}`);
        break;
    }

    return content;
  };

  const trackElements: React.ReactNode[] = [];

  for (const trackIndex in trackGroups) {
    const trackIndexNum = parseInt(trackIndex);
    const scrubbers = trackGroups[trackIndexNum];
    if (scrubbers.length === 0) continue;

    const transitionSeriesElements: React.ReactNode[] = [];
    const lastScrubber = scrubbers[scrubbers.length - 1].content;
    const totalDurationInFrames = Math.round(lastScrubber.endTime * FPS);

    for (let i = 0; i < scrubbers.length; i++) {
      const scrubber = scrubbers[i].content;
      const isFirstScrubber = i === 0;
      const isLastScrubber = i === scrubbers.length - 1;

      // Gap before first scrubber
      if (isFirstScrubber && scrubber.startTime > 0) {
        transitionSeriesElements.push(
          <TransitionSeries.Sequence key={`gap-start-${trackIndex}`} durationInFrames={Math.max(Math.round(scrubber.startTime * FPS), 1)}>
            <AbsoluteFill style={{ backgroundColor: "transparent" }} />
          </TransitionSeries.Sequence>
        );
      }

      // Left transition (first scrubber only)
      if (isFirstScrubber && scrubber.left_transition_id && allTransitions[scrubber.left_transition_id]) {
        const transition = allTransitions[scrubber.left_transition_id];
        transitionSeriesElements.push(
          <TransitionSeries.Transition
            key={`left-transition-${scrubber.id}`}
            presentation={getTransitionPresentation(transition)}
            timing={getTransitionTiming(transition)}
          />
        );
      }

      // Process scrubber content using stack (handles grouped scrubbers)
      if (scrubber.mediaType === "groupped_scrubber") {
        const groupedScrubbers = scrubber.groupped_scrubbers || [];
        for (let j = 0; j < groupedScrubbers.length; j++) {
          const grouppedScrubber = groupedScrubbers[j];

          if (j === 0 && grouppedScrubber.left_transition_id && allTransitions[grouppedScrubber.left_transition_id]) {
            const transition = allTransitions[grouppedScrubber.left_transition_id];
            transitionSeriesElements.push(
              <TransitionSeries.Transition
                key={`grouped-${grouppedScrubber.id}-left-transition`}
                presentation={getTransitionPresentation(transition)}
                timing={getTransitionTiming(transition)}
              />
            );
          }

          const scrubberStack: Array<{ scrubber: TimelineDataItem["scrubbers"][0] | ScrubberState; keyPrefix: string; durationCalculation: () => number }> = [];
          scrubberStack.push({
            scrubber: grouppedScrubber,
            keyPrefix: `grouped-${grouppedScrubber.id}`,
            durationCalculation: () => Math.max(Math.round((grouppedScrubber.width / resolvedPixelsPerSecond) * FPS), 1),
          });

          while (scrubberStack.length > 0) {
            const stackItem = scrubberStack.pop()!;
            const { scrubber: currentScrubber, keyPrefix, durationCalculation } = stackItem;
            if (currentScrubber.mediaType === "groupped_scrubber") {
              for (let k = (currentScrubber.groupped_scrubbers || []).length - 1; k >= 0; k--) {
                const nestedScrubber = (currentScrubber.groupped_scrubbers || [])[k];
                scrubberStack.push({ scrubber: nestedScrubber, keyPrefix: `${keyPrefix}-nested-${nestedScrubber.id}`, durationCalculation: () => Math.max(Math.round((nestedScrubber.width / resolvedPixelsPerSecond) * FPS), 1) });
              }
            } else {
              const mediaContent = createMediaContent(currentScrubber);
              if (mediaContent) {
                transitionSeriesElements.push(
                  <TransitionSeries.Sequence key={keyPrefix} durationInFrames={durationCalculation()}>{mediaContent}</TransitionSeries.Sequence>
                );
              }
            }
          }

          if (grouppedScrubber.right_transition_id && allTransitions[grouppedScrubber.right_transition_id]) {
            const transition = allTransitions[grouppedScrubber.right_transition_id];
            transitionSeriesElements.push(
              <TransitionSeries.Transition
                key={`grouped-${grouppedScrubber.id}-right-transition`}
                presentation={getTransitionPresentation(transition)}
                timing={getTransitionTiming(transition)}
              />
            );
          }
        }
      } else {
        const scrubberStack: Array<{ scrubber: TimelineDataItem["scrubbers"][0] | ScrubberState; keyPrefix: string; durationCalculation: () => number }> = [];
        scrubberStack.push({ scrubber, keyPrefix: `scrubber-${scrubber.id}`, durationCalculation: () => Math.max(Math.round(scrubber.duration * FPS), 1) });

        while (scrubberStack.length > 0) {
          const stackItem = scrubberStack.pop()!;
          const { scrubber: currentScrubber, keyPrefix, durationCalculation } = stackItem;
          if (currentScrubber.mediaType === "groupped_scrubber") {
            for (let k = (currentScrubber.groupped_scrubbers || []).length - 1; k >= 0; k--) {
              const nestedScrubber = (currentScrubber.groupped_scrubbers || [])[k];
              scrubberStack.push({ scrubber: nestedScrubber, keyPrefix: `${keyPrefix}-nested-${nestedScrubber.id}`, durationCalculation: () => Math.max(Math.round((nestedScrubber.width / resolvedPixelsPerSecond) * FPS), 1) });
            }
          } else {
            const mediaContent = createMediaContent(currentScrubber);
            if (mediaContent) {
              transitionSeriesElements.push(
                <TransitionSeries.Sequence key={keyPrefix} durationInFrames={durationCalculation()}>{mediaContent}</TransitionSeries.Sequence>
              );
            }
          }
        }
      }

      // Right transition
      if (scrubber.right_transition_id && allTransitions[scrubber.right_transition_id]) {
        const transition = allTransitions[scrubber.right_transition_id];
        transitionSeriesElements.push(
          <TransitionSeries.Transition
            key={`right-transition-${scrubber.id}`}
            presentation={getTransitionPresentation(transition)}
            timing={getTransitionTiming(transition)}
          />
        );
      }

      // Gap between scrubbers
      if (!isLastScrubber) {
        const nextScrubber = scrubbers[i + 1].content;
        const gapDuration = nextScrubber.startTime - scrubber.endTime;
        if (gapDuration > 0) {
          transitionSeriesElements.push(
            <TransitionSeries.Sequence key={`gap-${trackIndex}-${i}`} durationInFrames={Math.max(Math.round(gapDuration * FPS), 1)}>
              <AbsoluteFill style={{ backgroundColor: "transparent" }} />
            </TransitionSeries.Sequence>
          );
        }
      }
    }

    if (transitionSeriesElements.length > 0) {
      trackElements.push(
        <Sequence key={`track-${trackIndex}`} durationInFrames={totalDurationInFrames}>
          <TransitionSeries>{transitionSeriesElements}</TransitionSeries>
        </Sequence>
      );
    }
  }

  if (isRendering) {
    return (
      <AbsoluteFill style={outer}>
        <AbsoluteFill style={layerContainer}>{trackElements}</AbsoluteFill>
      </AbsoluteFill>
    );
  } else {
    return (
      <AbsoluteFill style={outer}>
        <AbsoluteFill style={layerContainer}>{trackElements}</AbsoluteFill>
        <SortedOutlines
          handleUpdateScrubber={handleUpdateScrubber}
          selectedItem={selectedItem}
          timeline={timeline}
          setSelectedItem={setSelectedItem}
        />
      </AbsoluteFill>
    );
  }
}
