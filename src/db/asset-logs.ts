import { supabase } from "./client.js";

export async function persistVendorDelivery(message: Record<string, unknown>, assetId: string, eventExternalId: string, observedAt: string, operationalStatus: string, data: Record<string, unknown>) {
  const { data: result, error } = await supabase.schema("core").rpc("persist_vendor_delivery", {
    p_message: message,
    p_asset_id: assetId,
    p_event_external_id: eventExternalId,
    p_observed_at: observedAt,
    p_operational_status: operationalStatus,
    p_data: data,
  });
  if (error) throw error;
  return result as { assetLogInserted: boolean; snapshotUpdated: boolean } | null;
}
