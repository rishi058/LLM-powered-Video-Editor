import { create } from "zustand";
import { type MediaBinItem } from "~/components/timeline/types";

interface MediaBinStore {
  mediaBinItems: MediaBinItem[];
  setMediaBinItems: (updater: MediaBinItem[] | ((prev: MediaBinItem[]) => MediaBinItem[])) => void;
  addMediaItems: (items: MediaBinItem[]) => void;
  upsertMediaItems: (items: MediaBinItem[]) => void;
  updateMediaItem: (id: string, updater: Partial<MediaBinItem> | ((item: MediaBinItem) => MediaBinItem)) => void;
  removeMediaItem: (id: string) => void;
  isMediaLoading: boolean;
  setIsMediaLoading: (val: boolean) => void;
  contextMenu: { x: number; y: number; item: MediaBinItem } | null;
  setContextMenu: (val: { x: number; y: number; item: MediaBinItem } | null) => void;
}

export const useMediaBinStore = create<MediaBinStore>((set) => ({
  mediaBinItems: [],
  setMediaBinItems: (updater) =>
    set((state) => ({ mediaBinItems: typeof updater === "function" ? updater(state.mediaBinItems) : updater })),
  addMediaItems: (items) => set((state) => ({ mediaBinItems: [...state.mediaBinItems, ...items] })),
  upsertMediaItems: (items) =>
    set((state) => {
      const mediaBinItems = [...state.mediaBinItems];

      for (const item of items) {
        const existingIndex = mediaBinItems.findIndex(
          (candidate) =>
            candidate.id === item.id ||
            Boolean(candidate.mediaUrlRemote && item.mediaUrlRemote && candidate.mediaUrlRemote === item.mediaUrlRemote),
        );

        if (existingIndex === -1) {
          mediaBinItems.push(item);
        } else {
          mediaBinItems[existingIndex] = {
            ...mediaBinItems[existingIndex],
            ...item,
            mediaUrlLocal: item.mediaUrlLocal ?? mediaBinItems[existingIndex].mediaUrlLocal,
          };
        }
      }

      return { mediaBinItems };
    }),
  updateMediaItem: (id, updater) =>
    set((state) => ({
      mediaBinItems: state.mediaBinItems.map((item) => {
        if (item.id !== id) return item;
        return typeof updater === "function" ? updater(item) : { ...item, ...updater };
      }),
    })),
  removeMediaItem: (id) =>
    set((state) => ({ mediaBinItems: state.mediaBinItems.filter((item) => item.id !== id) })),
  isMediaLoading: true,
  setIsMediaLoading: (val) => set({ isMediaLoading: val }),
  contextMenu: null,
  setContextMenu: (val) => set({ contextMenu: val }),
}));
