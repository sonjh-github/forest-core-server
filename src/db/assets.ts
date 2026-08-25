import { supabase } from "./client.js";

export type Asset = Record<string, unknown> & { asset_id: string };

export async function findAssetsByIds(assetIds: string[]): Promise<Asset[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await supabase.schema("core").from("asset").select("*").in("asset_id", assetIds);
  if (error) throw error;
  return (data ?? []) as Asset[];
}
