import { supabase } from "./client.js";

export type AssetLogRow = {
  request_id: string;
  vendor_code: string;
  event_external_id: string;
  payload_type: string | null;
  delivery_mode: string;
  source_device_id: string;
  reported_by_device_id: string;
  occurred_at: string;
  received_at: string;
  status: string;
  payload: Record<string, unknown>;
};

function containmentFilter(value: Record<string, unknown>): string {
  return `payload.cs.${JSON.stringify(value)}`;
}

export function assetLogFilter(assetId: string): string {
  return [
    `source_device_id.eq.${assetId}`,
    `reported_by_device_id.eq.${assetId}`,
    containmentFilter({ context: { sourceDeviceId: assetId } }),
    containmentFilter({ context: { reportedByDeviceId: assetId } }),
    containmentFilter({ data: { gatewayDeviceId: assetId } }),
    containmentFilter({ data: { baseDeviceId: assetId } }),
    containmentFilter({ data: { cpeDeviceId: assetId } }),
    containmentFilter({ data: { terminalDeviceId: assetId } }),
    containmentFilter({ data: { baseStationDeviceId: assetId } }),
    containmentFilter({ data: { receivedTerminalDeviceIds: [assetId] } }),
    containmentFilter({ activePath: [{ fromDeviceId: assetId }] }),
    containmentFilter({ activePath: [{ toDeviceId: assetId }] }),
  ].join(",");
}

export async function findAssetLogs(assetId: string, limit: number, before: string | null) {
  let query = supabase.schema("core").from("vendor_integration_message")
    .select("request_id,vendor_code,event_external_id,payload_type,delivery_mode,source_device_id,reported_by_device_id,occurred_at,received_at,status,payload")
    .or(assetLogFilter(assetId))
    .order("received_at", { ascending: false })
    .limit(limit + 1);

  if (before) query = query.lt("received_at", before);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AssetLogRow[];
}
