import { create } from "zustand";
import { type TimelineState, DEFAULT_ZOOM, PIXELS_PER_SECOND } from "~/components/timeline/types";
import { replaceScrubberWithSplit, splitScrubberAtRuler, type PhysicalSplitData } from "~/lib/timeline/trim";
import { generateUUID } from "~/utils/uuid";

const HISTORY_LIMIT = 100;

const cloneTimeline = (timeline: TimelineState): TimelineState => JSON.parse(JSON.stringify(timeline));

const pushHistory = (stack: TimelineState[], timeline: TimelineState) => {
  const next = [...stack, cloneTimeline(timeline)];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
};

const createDefaultTimeline = (): TimelineState => ({
  tracks: [
    { id: "track-1", scrubbers: [], transitions: [] },
    { id: "track-2", scrubbers: [], transitions: [] },
    { id: "track-3", scrubbers: [], transitions: [] },
    { id: "track-4", scrubbers: [], transitions: [] },
  ],
});

interface TimelineStore {
  timeline: TimelineState;
  setTimeline: (updater: TimelineState | ((prev: TimelineState) => TimelineState)) => void;
  timelineWidth: number;
  setTimelineWidth: (val: number | ((prev: number) => number)) => void;
  zoomLevel: number;
  setZoomLevel: (val: number | ((prev: number) => number)) => void;
  undoStack: TimelineState[];
  setUndoStack: (updater: TimelineState[] | ((prev: TimelineState[]) => TimelineState[])) => void;
  redoStack: TimelineState[];
  setRedoStack: (updater: TimelineState[] | ((prev: TimelineState[]) => TimelineState[])) => void;
  snapshotTimeline: () => void;
  undo: () => void;
  redo: () => void;
  splitScrubberAtRuler: (
    rulerPositionPx: number,
    selectedScrubberId: string | null,
    physicalSplitData?: PhysicalSplitData,
  ) => number;
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  timeline: createDefaultTimeline(),
  setTimeline: (updater) =>
    set((state) => ({ timeline: typeof updater === "function" ? updater(state.timeline) : updater })),
  timelineWidth: 2000,
  setTimelineWidth: (updater) =>
    set((state) => ({ timelineWidth: typeof updater === "function" ? updater(state.timelineWidth) : updater })),
  zoomLevel: DEFAULT_ZOOM,
  setZoomLevel: (updater) =>
    set((state) => ({ zoomLevel: typeof updater === "function" ? updater(state.zoomLevel) : updater })),
  undoStack: [],
  setUndoStack: (updater) =>
    set((state) => ({ undoStack: typeof updater === "function" ? updater(state.undoStack) : updater })),
  redoStack: [],
  setRedoStack: (updater) =>
    set((state) => ({ redoStack: typeof updater === "function" ? updater(state.redoStack) : updater })),
  snapshotTimeline: () =>
    set((state) => ({
      undoStack: pushHistory(state.undoStack, state.timeline),
      redoStack: [],
    })),
  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const previous = state.undoStack[state.undoStack.length - 1];
      return {
        timeline: cloneTimeline(previous),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, cloneTimeline(state.timeline)],
      };
    }),
  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state;
      const nextTimeline = state.redoStack[state.redoStack.length - 1];
      return {
        timeline: cloneTimeline(nextTimeline),
        undoStack: pushHistory(state.undoStack, state.timeline),
        redoStack: state.redoStack.slice(0, -1),
      };
    }),
  splitScrubberAtRuler: (rulerPositionPx, selectedScrubberId, physicalSplitData) => {
    if (!selectedScrubberId) return 0;

    let splitCount = 0;
    set((state) => {
      const selectedScrubber = state.timeline.tracks
        .flatMap((track) => track.scrubbers)
        .find((scrubber) => scrubber.id === selectedScrubberId);

      if (!selectedScrubber) {
        return state;
      }

      const splitResult = splitScrubberAtRuler({
        scrubber: selectedScrubber,
        rulerPositionPx,
        pixelsPerSecond: PIXELS_PER_SECOND * state.zoomLevel,
        idFactory: generateUUID,
        physicalSplitData,
      });

      if (!splitResult) {
        return state;
      }

      splitCount = 1;

      return {
        timeline: replaceScrubberWithSplit(state.timeline, selectedScrubberId, splitResult),
        undoStack: pushHistory(state.undoStack, state.timeline),
        redoStack: [],
      };
    });

    return splitCount;
  },
}));
