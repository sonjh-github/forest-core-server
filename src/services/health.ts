import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { supabase } from "../db/client.js";
import type { ExternalVendor } from "../types.js";

export async function readCoreHealth() {
  const checkedAt = new Date().toISOString();
  const { error } = await supabase.schema(config.healthSchema).from(config.healthTable).select("*", { head: true, count: "exact" });
  if (error) throw error;
  return { service: "forest-core-server", status: "UP", databaseStatus: "REACHABLE", diagnosticRunId: randomUUID(), checkedAt };
}

export async function readVendorHealth(vendor: ExternalVendor) {
  const [mappings, messages] = await Promise.all([
    supabase.schema("core").from("vendor_device_mapping").select("vendor_device_id,asset_id,device_type,status,last_seen_at").eq("vendor_code", vendor),
    supabase.schema("core").from("vendor_integration_message").select("received_at,status").eq("vendor_code", vendor).order("received_at", { ascending: false }).limit(1),
  ]);
  const error = mappings.error ?? messages.error;
  if (error) throw error;
  const latest = messages.data?.[0];
  return {
    vendor,
    healthMode: "PASSIVE",
    diagnosticStatus: latest ? "HEALTHY" : "INCOMPLETE",
    databaseStatus: "REACHABLE",
    registeredDevices: mappings.data?.length ?? 0,
    lastReceivedAt: latest?.received_at ?? null,
    lastPersistedAt: latest?.status === "PERSISTED" ? latest.received_at : null,
    devices: mappings.data ?? [],
    checkedAt: new Date().toISOString(),
  };
}
