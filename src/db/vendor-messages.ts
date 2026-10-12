import { supabase } from "./client.js";
import { config } from "../config.js";
import {
  findLocalVendorMessage,
  insertLocalVendorMessage,
  listLocalVendorMessages,
} from "../local-demo/db.js";

export async function findVendorMessage(requestId: string) {
  if (config.dbMode === "sqlite") {
    return findLocalVendorMessage(
      requestId,
    );
  }

  const { data, error } = await supabase.schema("core").from("vendor_integration_message").select("request_id,vendor_code").eq("request_id", requestId).maybeSingle();
  if (error) throw error;
  return data as { request_id: string; vendor_code: string } | null;
}

export async function insertVendorMessage(row: Record<string, unknown>) {
  if (config.dbMode === "sqlite") {
    insertLocalVendorMessage(row);
    return;
  }

  const { error } = await supabase.schema("core").from("vendor_integration_message").insert(row);
  if (error) throw error;
}


export type VendorIntegrationMessageRow = {
  request_id: string;
  event_external_id: string | null;
  payload_type: string | null;
  source_device_id: string | null;
  occurred_at: string;
  received_at?: string;
  status: string;
  payload: Record<string, unknown> | null;
};

export async function listVendorMessages(
  vendorCode: string,
  limit = 1000,
  payloadType?: string
): Promise<VendorIntegrationMessageRow[]> {
  if (config.dbMode === "sqlite") {
    return listLocalVendorMessages(
      vendorCode,
      limit,
      payloadType,
    );
  }

  const safeLimit =
    Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), 2000)
      : 1000;

  let query = supabase
    .schema("core")
    .from("vendor_integration_message")
    .select(
      "request_id,event_external_id,payload_type,source_device_id,occurred_at,status,payload"
    )
    .eq("vendor_code", vendorCode)
    .eq("status", "PERSISTED");

  if (payloadType) {
    query = query.eq(
      "payload_type",
      payloadType
    );
  }

  const { data, error } = await query
    .order("occurred_at", {
      ascending: false
    })
    .limit(safeLimit);

  if (error) {
    throw error;
  }

  return (
    data ?? []
  ) as unknown as VendorIntegrationMessageRow[];
}
