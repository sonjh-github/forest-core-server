import { supabase } from "./client.js";
import type { ExternalVendor, MappingResult } from "../types.js";

type MappingRow = { vendor_device_id: string; asset_id: string; status: "ACTIVE" | "PENDING" | "SUSPENDED" };
type AssetRow = { asset_id: string; asset_code: string };

export async function resolveAssetMappings(vendor: ExternalVendor, deviceIds: string[], deviceTypes: Record<string, string> = {}): Promise<MappingResult[]> {
  const uniqueIds = [...new Set(deviceIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const { data: existing, error: mappingError } = await supabase.schema("core").from("vendor_device_mapping")
    .select("vendor_device_id,asset_id,status").eq("vendor_code", vendor).in("vendor_device_id", uniqueIds);
  if (mappingError) throw mappingError;
  const byId = new Map((existing as MappingRow[] | null ?? []).map((row) => [row.vendor_device_id, row]));
  const missing = uniqueIds.filter((id) => !byId.has(id));
  if (missing.length) {
    const codes = await supabase.schema("core").from("asset").select("asset_id,asset_code").in("asset_code", missing);
    if (codes.error) throw codes.error;
    const assets = codes.data as AssetRow[] | null ?? [];
    const candidates = new Map<string, AssetRow>();
    for (const asset of assets) {
      if (missing.includes(asset.asset_code)) candidates.set(asset.asset_code, asset);
    }
    const rows = missing.flatMap((id) => {
      const asset = candidates.get(id);
      return asset ? [{ vendor_code: vendor, vendor_device_id: id, asset_id: asset.asset_id, device_type: deviceTypes[id] ?? "OTHER", status: "ACTIVE", last_seen_at: new Date().toISOString(), metadata: { mappingSource: "ASSET_CODE" } }] : [];
    });
    if (rows.length) {
      const { data, error } = await supabase.schema("core").from("vendor_device_mapping").upsert(rows, { onConflict: "vendor_code,vendor_device_id" }).select("vendor_device_id,asset_id,status");
      if (error) throw error;
      for (const row of data as MappingRow[] | null ?? []) byId.set(row.vendor_device_id, row);
    }
  }
  return uniqueIds.map((vendorDeviceId): MappingResult => {
    const row = byId.get(vendorDeviceId);
    return row ? { vendorDeviceId, assetId: row.asset_id, mapped: true, assetExists: true, mappingStatus: row.status } : { vendorDeviceId, assetId: null, mapped: false, assetExists: false, mappingStatus: "UNMAPPED" };
  });
}

export function mappingDictionary(mappings: MappingResult[]): Map<string, string> {
  return new Map(mappings.filter((item) => item.assetId).map((item) => [item.vendorDeviceId, item.assetId!]));
}
