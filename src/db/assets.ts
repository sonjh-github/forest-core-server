import { supabase } from "./client.js";

export type Asset = Record<string, unknown> & { asset_id: string };
export type Disaster = {
  event_id: string;
  event_code: string;
  event_name: string;
  disaster_type: string;
  status: string;
};

export async function findDisasterById(disasterId: string): Promise<Disaster | null> {
  const { data, error } = await supabase.schema("core").from("disaster_event")
    .select("event_id,event_code,event_name,disaster_type,status")
    .eq("event_id", disasterId)
    .maybeSingle();
  if (error) throw error;
  return data as Disaster | null;
}

export async function findAssetsByDisasterId(disasterId: string) {
  const { data, error } = await supabase.schema("core").from("event_resource")
    .select("event_resource_id,event_id,asset_id,assigned_org_code,mission,assigned_at,released_at,asset:asset!event_resource_asset_id_fkey(asset_id,asset_code,asset_name,status,product_name,model_name,specifications,created_at,updated_at,asset_type:asset_type!asset_asset_type_id_fkey(asset_type_id,name,description,enabled))")
    .eq("event_id", disasterId)
    .order("assigned_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
