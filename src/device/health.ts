import { randomUUID } from "node:crypto";
import { checkDatabaseConnection, findVendorHealthState } from "../db/health.js";
import type { ExternalVendor } from "../types.js";

export async function readCoreHealth() {
  const checkedAt = new Date().toISOString();
  await checkDatabaseConnection();
  return { service: "forest-core-server", status: "UP", databaseStatus: "REACHABLE", diagnosticRunId: randomUUID(), checkedAt };
}

export async function readVendorHealth(vendor: ExternalVendor) {
  const { mappings, latestMessage } = await findVendorHealthState(vendor);
  return {
    vendor,
    healthMode: "PASSIVE",
    diagnosticStatus: latestMessage ? "HEALTHY" : "INCOMPLETE",
    databaseStatus: "REACHABLE",
    registeredDevices: mappings.length,
    lastReceivedAt: latestMessage?.received_at ?? null,
    lastPersistedAt: latestMessage?.status === "PERSISTED" ? latestMessage.received_at : null,
    devices: mappings,
    checkedAt: new Date().toISOString(),
  };
}
