import type { PhysicalSplitPart } from "~/lib/timeline/trim";

export interface SplitAssetResponse {
  success: boolean;
  part1: PhysicalSplitPart;
  part2: PhysicalSplitPart;
}

export interface AssetsApi {
  splitAsset: (assetId: string, splitTimeSeconds: number) => Promise<SplitAssetResponse>;
}

export const getAssetIdFromRawUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;

  const match = url.match(/\/api\/assets\/([^/?#]+)\/raw(?:[?#].*)?$/);
  return match ? decodeURIComponent(match[1]) : null;
};

export const createAssetsApi = (fetcher: typeof fetch = fetch): AssetsApi => ({
  splitAsset: async (assetId, splitTimeSeconds) => {
    const response = await fetcher(`/api/assets/${encodeURIComponent(assetId)}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splitTimeSeconds }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : "Failed to split asset";
      throw new Error(message);
    }

    return payload as SplitAssetResponse;
  },
});

export const assetsApi = createAssetsApi();
