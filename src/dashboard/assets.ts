import { findAssetsByIds } from "../db/assets.js";

const MAX_BULK_ASSETS = 500;

export function parseBulkAssetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_ASSETS || !value.every((id) => typeof id === "string" && id.trim().length > 0)) {
    throw new Error(`assetIds는 1개 이상 ${MAX_BULK_ASSETS}개 이하의 문자열 배열이어야 합니다.`);
  }
  return [...new Set(value.map((id) => id.trim()))];
}

export async function readAssetsBulk(assetIds: string[]) {
  const assets = await findAssetsByIds(assetIds);
  const foundIds = new Set(assets.map((asset) => asset.asset_id));
  return {
    assets,
    requestedCount: assetIds.length,
    foundCount: assets.length,
    missingAssetIds: assetIds.filter((id) => !foundIds.has(id)),
  };
}
