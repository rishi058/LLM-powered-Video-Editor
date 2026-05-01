import { create } from "zustand";

interface UIStore {
  selectedScrubberIds: string[];
  setSelectedScrubberIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  selectOnlyScrubber: (id: string | null) => void;
  toggleSelectedScrubber: (id: string) => void;
  clearSelectedScrubberIds: () => void;
  isChatMinimized: boolean;
  setIsChatMinimized: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedScrubberIds: [],
  setSelectedScrubberIds: (updater) =>
    set((state) => ({
      selectedScrubberIds:
        typeof updater === "function" ? updater(state.selectedScrubberIds) : updater,
    })),
  selectOnlyScrubber: (id) => set({ selectedScrubberIds: id ? [id] : [] }),
  toggleSelectedScrubber: (id) =>
    set((state) => ({
      selectedScrubberIds: state.selectedScrubberIds.includes(id)
        ? state.selectedScrubberIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedScrubberIds, id],
    })),
  clearSelectedScrubberIds: () => set({ selectedScrubberIds: [] }),
  isChatMinimized: false,
  setIsChatMinimized: (updater) =>
    set((state) => ({
      isChatMinimized:
        typeof updater === "function" ? updater(state.isChatMinimized) : updater,
    })),
}));
