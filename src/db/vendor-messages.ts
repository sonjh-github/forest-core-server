import { supabase } from "./client.js";

export async function findVendorMessage(requestId: string) {
  const { data, error } = await supabase.schema("core").from("vendor_integration_message").select("request_id,vendor_code").eq("request_id", requestId).maybeSingle();
  if (error) throw error;
  return data as { request_id: string; vendor_code: string } | null;
}

export async function insertVendorMessage(row: Record<string, unknown>) {
  const { error } = await supabase.schema("core").from("vendor_integration_message").insert(row);
  if (error) throw error;
}
