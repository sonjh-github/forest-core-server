import { config } from "../config.js";
import type { ExternalVendor } from "../types.js";
import { supabase } from "./client.js";

export async function checkDatabaseConnection() {
  const { error } = await supabase.schema(config.healthSchema).from(config.healthTable).select("*", { head: true, count: "exact" });
  if (error) throw error;
}

export async function findVendorHealthState(vendor: ExternalVendor) {
  const [mappings, messages] = await Promise.all([
    supabase.schema("core").from("vendor_device_mapping").select("vendor_device_id,asset_id,device_type,status,last_seen_at").eq("vendor_code", vendor),
    supabase.schema("core").from("vendor_integration_message").select("received_at,status").eq("vendor_code", vendor).order("received_at", { ascending: false }).limit(1),
  ]);
  const error = mappings.error ?? messages.error;
  if (error) throw error;
  return { mappings: mappings.data ?? [], latestMessage: messages.data?.[0] ?? null };
}
