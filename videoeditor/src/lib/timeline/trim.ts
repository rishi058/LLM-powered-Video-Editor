import {
  FPS,
  type ScrubberState,
  type TimelineDataItem,
  type TimelineState,
} from "~/components/timeline/types";

type MediaType = ScrubberState["mediaType"];
type TimelineScrubber = TimelineDataItem["scrubbers"][0] | ScrubberState;

export type ResizeEdge = "left" | "right";

export interface PhysicalSplitPart {
  id: string;
  name?: string;
  mediaUrlRemote: string;
  durationInSeconds?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface PhysicalSplitData {
  part1: PhysicalSplitPart;
  part2: PhysicalSplitPart;
}

export interface SplitScrubberResult {
  firstScrubber: ScrubberState;
  secondScrubber: ScrubberState;
}

const trimmableMediaTypes = new Set<MediaType>(["video", "audio"]);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeTrim = (frames: number): number | null => {
  const rounded = Math.max(0, Math.round(frames));
  return rounded > 0 ? rounded : null;
};

const framesToPixels = (frames: number, pixelsPerSecond: number) => (frames / FPS) * pixelsPerSecond;

const pixelsToFrames = (pixels: number, pixelsPerSecond: number) => Math.round((pixels / pixelsPerSecond) * FPS);

export const isTrimmableMediaType = (mediaType: MediaType) => trimmableMediaTypes.has(mediaType);

export const getTailTrimFrames = (scrubber: Pick<ScrubberState, "trimAfter">) => scrubber.trimAfter ?? 0;

export const getTrimBeforeFrames = (scrubber: Pick<ScrubberState, "trimBefore">) => scrubber.trimBefore ?? 0;

export const getVisibleDurationFrames = (scrubber: TimelineScrubber, pixelsPerSecond: number) => {
  if ("duration" in scrubber && typeof scrubber.duration === "number") {
    return Math.max(1, Math.round(scrubber.duration * FPS));
  }

  return Math.max(1, pixelsToFrames(scrubber.width, pixelsPerSecond));
};

export const getSourceDurationFrames = (scrubber: TimelineScrubber, pixelsPerSecond: number) => {
  if (scrubber.durationInSeconds > 0) {
    return Math.max(1, Math.round(scrubber.durationInSeconds * FPS));
  }

  return (
    getTrimBeforeFrames(scrubber) +
    getVisibleDurationFrames(scrubber, pixelsPerSecond) +
    getTailTrimFrames(scrubber)
  );
};

export const getRemotionTrimProps = (scrubber: TimelineScrubber, pixelsPerSecond: number) => {
  const trimBefore = getTrimBeforeFrames(scrubber);
  const tailTrim = getTailTrimFrames(scrubber);
  const sourceDurationFrames = getSourceDurationFrames(scrubber, pixelsPerSecond);

  const trimAfter = tailTrim > 0 ? Math.max(trimBefore + 1, sourceDurationFrames - tailTrim) : undefined;

  return {
    trimBefore: trimBefore > 0 ? trimBefore : undefined,
    trimAfter,
  };
};

export const buildScrubberResizeUpdate = ({
  scrubber,
  edge,
  nextLeft,
  nextWidth,
  pixelsPerSecond,
  minimumWidthPx,
}: {
  scrubber: ScrubberState;
  edge: ResizeEdge;
  nextLeft: number;
  nextWidth: number;
  pixelsPerSecond: number;
  minimumWidthPx: number;
}): ScrubberState => {
  if (!isTrimmableMediaType(scrubber.mediaType)) {
    return {
      ...scrubber,
      left: nextLeft,
      width: Math.max(minimumWidthPx, nextWidth),
    };
  }

  const sourceDurationFrames = getSourceDurationFrames(scrubber, pixelsPerSecond);
  const trimBefore = getTrimBeforeFrames(scrubber);
  const tailTrim = getTailTrimFrames(scrubber);
  const minimumVisibleFrames = Math.max(1, pixelsToFrames(minimumWidthPx, pixelsPerSecond));
  const currentRight = scrubber.left + scrubber.width;

  if (edge === "left") {
    const deltaFrames = pixelsToFrames(nextLeft - scrubber.left, pixelsPerSecond);
    const maxTrimBefore = Math.max(0, sourceDurationFrames - tailTrim - minimumVisibleFrames);
    const nextTrimBefore = clamp(trimBefore + deltaFrames, 0, maxTrimBefore);
    const visibleFrames = Math.max(minimumVisibleFrames, sourceDurationFrames - nextTrimBefore - tailTrim);
    const width = framesToPixels(visibleFrames, pixelsPerSecond);

    return {
      ...scrubber,
      left: currentRight - width,
      width,
      trimBefore: normalizeTrim(nextTrimBefore),
      trimAfter: normalizeTrim(tailTrim),
    };
  }

  const nextRight = nextLeft + nextWidth;
  const currentEndFrame = sourceDurationFrames - tailTrim;
  const deltaFrames = pixelsToFrames(nextRight - currentRight, pixelsPerSecond);
  const minEndFrame = trimBefore + minimumVisibleFrames;
  const nextEndFrame = clamp(currentEndFrame + deltaFrames, minEndFrame, sourceDurationFrames);
  const nextTailTrim = sourceDurationFrames - nextEndFrame;
  const visibleFrames = Math.max(minimumVisibleFrames, nextEndFrame - trimBefore);

  return {
    ...scrubber,
    width: framesToPixels(visibleFrames, pixelsPerSecond),
    trimBefore: normalizeTrim(trimBefore),
    trimAfter: normalizeTrim(nextTailTrim),
  };
};

export const splitScrubberAtRuler = ({
  scrubber,
  rulerPositionPx,
  pixelsPerSecond,
  idFactory,
  physicalSplitData,
}: {
  scrubber: ScrubberState;
  rulerPositionPx: number;
  pixelsPerSecond: number;
  idFactory: () => string;
  physicalSplitData?: PhysicalSplitData;
}): SplitScrubberResult | null => {
  const scrubberStartPx = scrubber.left;
  const scrubberEndPx = scrubber.left + scrubber.width;

  if (rulerPositionPx <= scrubberStartPx || rulerPositionPx >= scrubberEndPx) {
    return null;
  }

  const splitOffsetFrames = pixelsToFrames(rulerPositionPx - scrubberStartPx, pixelsPerSecond);
  const visibleFrames = getVisibleDurationFrames(scrubber, pixelsPerSecond);

  if (splitOffsetFrames <= 0 || splitOffsetFrames >= visibleFrames) {
    return null;
  }

  const trimBefore = getTrimBeforeFrames(scrubber);
  const tailTrim = getTailTrimFrames(scrubber);
  const sourceDurationFrames = getSourceDurationFrames(scrubber, pixelsPerSecond);
  const splitFrameInSource = trimBefore + splitOffsetFrames;
  const firstWidth = framesToPixels(splitOffsetFrames, pixelsPerSecond);
  const secondWidth = framesToPixels(visibleFrames - splitOffsetFrames, pixelsPerSecond);

  const firstBase: ScrubberState = {
    ...scrubber,
    id: idFactory(),
    width: firstWidth,
    right_transition_id: null,
  };

  const secondBase: ScrubberState = {
    ...scrubber,
    id: idFactory(),
    left: scrubber.left + firstWidth,
    width: secondWidth,
    left_transition_id: null,
  };

  if (physicalSplitData) {
    const part1Duration = physicalSplitData.part1.durationInSeconds ?? splitFrameInSource / FPS;
    const part2Duration =
      physicalSplitData.part2.durationInSeconds ?? Math.max(0, (sourceDurationFrames - splitFrameInSource) / FPS);

    return {
      firstScrubber: {
        ...firstBase,
        name: physicalSplitData.part1.name ?? firstBase.name,
        sourceMediaBinId: physicalSplitData.part1.id,
        mediaUrlLocal: null,
        mediaUrlRemote: physicalSplitData.part1.mediaUrlRemote,
        durationInSeconds: part1Duration,
        media_width: physicalSplitData.part1.width ?? firstBase.media_width,
        media_height: physicalSplitData.part1.height ?? firstBase.media_height,
        trimBefore: normalizeTrim(trimBefore),
        trimAfter: null,
      },
      secondScrubber: {
        ...secondBase,
        name: physicalSplitData.part2.name ?? secondBase.name,
        sourceMediaBinId: physicalSplitData.part2.id,
        mediaUrlLocal: null,
        mediaUrlRemote: physicalSplitData.part2.mediaUrlRemote,
        durationInSeconds: part2Duration,
        media_width: physicalSplitData.part2.width ?? secondBase.media_width,
        media_height: physicalSplitData.part2.height ?? secondBase.media_height,
        trimBefore: null,
        trimAfter: normalizeTrim(tailTrim),
      },
    };
  }

  return {
    firstScrubber: {
      ...firstBase,
      trimBefore: normalizeTrim(trimBefore),
      trimAfter: normalizeTrim(sourceDurationFrames - splitFrameInSource),
    },
    secondScrubber: {
      ...secondBase,
      trimBefore: normalizeTrim(splitFrameInSource),
      trimAfter: normalizeTrim(tailTrim),
    },
  };
};

export const replaceScrubberWithSplit = (
  timeline: TimelineState,
  selectedScrubberId: string,
  splitResult: SplitScrubberResult,
): TimelineState => ({
  ...timeline,
  tracks: timeline.tracks.map((track) => ({
    ...track,
    transitions: track.transitions.map((transition) => ({
      ...transition,
      leftScrubberId:
        transition.leftScrubberId === selectedScrubberId
          ? splitResult.secondScrubber.id
          : transition.leftScrubberId,
      rightScrubberId:
        transition.rightScrubberId === selectedScrubberId
          ? splitResult.firstScrubber.id
          : transition.rightScrubberId,
    })),
    scrubbers: track.scrubbers.flatMap((scrubber) =>
      scrubber.id === selectedScrubberId
        ? [splitResult.firstScrubber, splitResult.secondScrubber]
        : [scrubber],
    ),
  })),
});
