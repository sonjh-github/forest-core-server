import { findAssetsByDisasterId, findDisasterById } from "../db/assets.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDisasterId(value: string): string {
  const disasterId = value.trim();
  if (!UUID_PATTERN.test(disasterId)) throw new Error("disasterId는 UUID 형식이어야 합니다.");
  return disasterId;
}

export async function readDisasterAssets(disasterId: string) {
  const disaster = await findDisasterById(disasterId);
  if (!disaster) return null;
  const resources = await findAssetsByDisasterId(disasterId);
  return {
    disaster: {
      disasterId: disaster.event_id,
      disasterCode: disaster.event_code,
      disasterName: disaster.event_name,
      disasterType: disaster.disaster_type,
      status: disaster.status,
    },
    assets: resources.map(({ asset, ...assignment }) => ({ assignment, asset })),
    assetCount: resources.length,
  };
}
