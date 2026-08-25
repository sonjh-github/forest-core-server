import { supabase } from "./client.js";

const ASSET_SELECT = "asset_id,asset_code,asset_name,status,product_name,model_name,specifications,created_at,updated_at,asset_type:asset_type!asset_asset_type_id_fkey(asset_type_id,name,description,enabled)";

export type CreateAssetRow = {
  asset_type_id: string;
  asset_code: string;
  asset_name: string | null;
  status: string;
  product_name: string | null;
  model_name: string | null;
  specifications: Record<string, unknown>;
};

export async function listEnabledAssetTypes() {
  const { data, error } = await supabase.schema("core").from("asset_type")
    .select("asset_type_id,name,description,enabled")
    .eq("enabled", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function findAssetTypeId(assetTypeId: string): Promise<string | null> {
  const { data, error } = await supabase.schema("core").from("asset_type")
    .select("asset_type_id")
    .eq("enabled", true)
    .eq("asset_type_id", assetTypeId)
    .maybeSingle();
  if (error) throw error;
  return data?.asset_type_id ?? null;
}

export async function insertAsset(row: CreateAssetRow) {
  const { data, error } = await supabase.schema("core").from("asset")
    .insert(row)
    .select(ASSET_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function findRegisteredAsset(assetId: string) {
  const { data, error } = await supabase.schema("core").from("asset")
    .select(ASSET_SELECT)
    .eq("asset_id", assetId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertVendorDeviceMapping(row: {
  vendor_code: string;
  vendor_device_id: string;
  asset_id: string;
  device_type: string;
  status: "ACTIVE" | "PENDING" | "SUSPENDED";
  last_seen_at: string;
  metadata: Record<string, unknown>;
}) {
  const { data, error } = await supabase.schema("core").from("vendor_device_mapping")
    .upsert(row, { onConflict: "vendor_code,vendor_device_id" })
    .select("vendor_code,vendor_device_id,asset_id,device_type,status,first_seen_at,last_seen_at,metadata")
    .single();
  if (error) throw error;
  return data;
}
