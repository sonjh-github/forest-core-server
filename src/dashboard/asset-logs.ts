import { findAssetLogs } from "../db/asset-logs.js";
import { findRegisteredAsset } from "../db/asset-registry.js";
import { parseAssetId, RegistryError } from "./registry.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw new RegistryError("INVALID_REQUEST", "limit은 양의 정수여야 합니다.");
  const limit = Number(value);
  if (limit < 1 || limit > MAX_LIMIT) throw new RegistryError("INVALID_REQUEST", `limit은 1~${MAX_LIMIT} 사이여야 합니다.`);
  return limit;
}

function parseCursor(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new RegistryError("INVALID_REQUEST", "cursor는 ISO 8601 시각이어야 합니다.");
  return timestamp.toISOString();
}

export async function readAssetLogs(assetIdValue: string, limitValue?: string, cursorValue?: string) {
  const assetId = parseAssetId(assetIdValue);
  const limit = parseLimit(limitValue);
  const cursor = parseCursor(cursorValue);
  if (!await findRegisteredAsset(assetId)) throw new RegistryError("ASSET_NOT_FOUND", "물리 장비를 찾을 수 없습니다.", 404);

  const rows = await findAssetLogs(assetId, limit, cursor);
  const hasMore = rows.length > limit;
  const logs = hasMore ? rows.slice(0, limit) : rows;
  return {
    assetId,
    logs,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore ? logs.at(-1)?.received_at ?? null : null,
    },
  };
}
