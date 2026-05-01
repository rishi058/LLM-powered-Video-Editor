import { useCallback, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import { toast } from "sonner";
import { FPS, type MediaBinItem, type ScrubberState, type TimelineDataItem } from "~/components/timeline/types";
import { isTrimmableMediaType, type PhysicalSplitData, type PhysicalSplitPart } from "~/lib/timeline/trim";
import { assetsApi as defaultAssetsApi, getAssetIdFromRawUrl, type AssetsApi } from "~/services/assetsApi";
import { useUIStore } from "~/store/useUIStore";

const toMediaBinItem = (
  part: PhysicalSplitPart,
  mediaType: "video" | "audio",
  fallback: ScrubberState,
): MediaBinItem => ({
  id: part.id,
  name: part.name ?? fallback.name,
  mediaType,
  mediaUrlLocal: null,
  mediaUrlRemote: part.mediaUrlRemote,
  durationInSeconds: part.durationInSeconds ?? 0,
  media_width: part.width ?? fallback.media_width,
  media_height: part.height ?? fallback.media_height,
  text: null,
  subtitleData: null,
  isUploading: false,
  uploadProgress: null,
  left_transition_id: null,
  right_transition_id: null,
  groupped_scrubbers: null,
});

export interface UseTimelineSplitOptions {
  playerRef: RefObject<PlayerRef | null>;
  timelineData: TimelineDataItem[];
  getPixelsPerSecond: () => number;
  getAllScrubbers: () => ScrubberState[];
  splitScrubberAtRuler: (
    rulerPositionPx: number,
    selectedScrubberId: string | null,
    physicalSplitData?: PhysicalSplitData,
  ) => number;
  addMediaItems: (items: MediaBinItem[]) => void;
  assetsApi?: AssetsApi;
}

export const useTimelineSplit = ({
  playerRef,
  timelineData,
  getPixelsPerSecond,
  getAllScrubbers,
  splitScrubberAtRuler,
  addMediaItems,
  assetsApi = defaultAssetsApi,
}: UseTimelineSplitOptions) => {
  const clearSelectedScrubberIds = useUIStore((state) => state.clearSelectedScrubberIds);

  return useCallback(async () => {
    const currentSelection = useUIStore.getState().selectedScrubberIds;

    if (currentSelection.length === 0) {
      toast.error("Please select a scrubber to split first!");
      return;
    }

    if (currentSelection.length > 1) {
      toast.error("Please select only one scrubber to split!");
      return;
    }

    if (timelineData.length === 0 || timelineData.every((item) => item.scrubbers.length === 0)) {
      toast.error("No scrubbers to split. Add some media first!");
      return;
    }

    const selectedId = currentSelection[0];
    const pixelsPerSecond = getPixelsPerSecond();
    const rulerPositionPx = playerRef.current ? (playerRef.current.getCurrentFrame() / FPS) * pixelsPerSecond : 0;
    const selectedScrubber = getAllScrubbers().find((scrubber) => scrubber.id === selectedId);

    if (!selectedScrubber) {
      return;
    }

    const splitTimeInSeconds = rulerPositionPx / pixelsPerSecond;
    const startTime = selectedScrubber.left / pixelsPerSecond;
    const endTime = (selectedScrubber.left + selectedScrubber.width) / pixelsPerSecond;

    if (splitTimeInSeconds <= startTime || splitTimeInSeconds >= endTime) {
      toast.info("Cannot split: ruler is not positioned within the selected scrubber");
      return;
    }

    const splitTimelineOnly = () => {
      const splitCount = splitScrubberAtRuler(rulerPositionPx, selectedId);
      if (splitCount === 0) {
        toast.info("Cannot split: ruler is not positioned within the selected scrubber");
        return;
      }

      clearSelectedScrubberIds();
      toast.success("Split the selected scrubber at ruler position");
    };

    if (!isTrimmableMediaType(selectedScrubber.mediaType)) {
      splitTimelineOnly();
      return;
    }

    const sourceAssetId = getAssetIdFromRawUrl(selectedScrubber.mediaUrlRemote) ?? selectedScrubber.sourceMediaBinId;
    if (!sourceAssetId) {
      splitTimelineOnly();
      return;
    }

    const splitOffsetTime = splitTimeInSeconds - startTime;
    const trimBefore = selectedScrubber.trimBefore ?? 0;
    const splitFrameOffset = Math.round(splitOffsetTime * FPS);
    const splitFrameInSource = trimBefore + splitFrameOffset;
    const splitTimeSecondsInSource = splitFrameInSource / FPS;

    const toastId = toast.loading("Splitting media...");
    try {
      const data = await assetsApi.splitAsset(sourceAssetId, splitTimeSecondsInSource);
      const mediaType = selectedScrubber.mediaType as "video" | "audio";

      const splitCount = splitScrubberAtRuler(rulerPositionPx, selectedId, {
        part1: data.part1,
        part2: data.part2,
      });

      if (splitCount === 0) {
        toast.info("Cannot split: ruler is not positioned within the selected scrubber", { id: toastId });
        return;
      }

      addMediaItems([
        toMediaBinItem(data.part1, mediaType, selectedScrubber),
        toMediaBinItem(data.part2, mediaType, selectedScrubber),
      ]);

      clearSelectedScrubberIds();
      toast.success("Split the selected scrubber into two media clips", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to physically split the media", { id: toastId });
    }
  }, [
    addMediaItems,
    assetsApi,
    clearSelectedScrubberIds,
    getAllScrubbers,
    getPixelsPerSecond,
    playerRef,
    splitScrubberAtRuler,
    timelineData,
  ]);
};
