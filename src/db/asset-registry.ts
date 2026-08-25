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

export type CreateVendorMappingRow = {
  vendor_code: string;
  vendor_device_id: string;
  device_type: string;
  status: "ACTIVE" | "PENDING" | "SUSPENDED";
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

export async function insertAssetWithVendorMapping(asset: CreateAssetRow, mapping: CreateVendorMappingRow) {
  const { data, error } = await supabase.schema("core").rpc("register_asset_with_vendor_mapping", {
    p_asset_type_id: asset.asset_type_id,
    p_asset_code: asset.asset_code,
    p_asset_name: asset.asset_name,
    p_asset_status: asset.status,
    p_product_name: asset.product_name,
    p_model_name: asset.model_name,
    p_specifications: asset.specifications,
    p_vendor_code: mapping.vendor_code,
    p_vendor_device_id: mapping.vendor_device_id,
    p_device_type: mapping.device_type,
    p_mapping_status: mapping.status,
  });
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
