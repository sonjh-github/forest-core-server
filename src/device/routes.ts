import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Hono } from "hono";
import { resolveAssetMappings } from "../db/asset-mapping.js";
import { collectDeviceIds, type ExternalVendor, type InvokeRequest, type MappingResult } from "../types.js";
import { readVendorHealth } from "./health.js";
import { invokeVendor } from "./integration.js";
import { rememberLiveSleno } from "./live-sleno.js";

export const deviceRoutes = new Hono();

type DeviceLogStatus = "ACCEPTED" | "DUPLICATE" | "REJECTED" | "STORAGE_FAILED" | "PROCESSING_FAILED";

type DeviceRequestLog = {
  timestamp: string;
  requestId: string;
  vendor: string;
  mode: string;
  durationMs: number;
  status: DeviceLogStatus;
  errorType: string | null;
};

// Log only a fixed allowlist of metadata. Never include the request body or credentials.
export function logDeviceRequest(entry: DeviceRequestLog): void {
  console.info(JSON.stringify({ event: "device.vendor_message", ...entry }));
}

export function classifyDeviceError(error: unknown, phase: "PARSE" | "MAPPING" | "INVOKE"): { status: "REJECTED" | "STORAGE_FAILED" | "PROCESSING_FAILED"; errorType: string } {
  if (phase === "PARSE" && error instanceof SyntaxError) return { status: "REJECTED", errorType: "INVALID_JSON" };
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
  // A 23505 error can also represent a cross-vendor idempotency-key conflict.
  if (code === "23505") return { status: "PROCESSING_FAILED", errorType: "IDEMPOTENCY_OR_STORAGE_CONFLICT" };
  const storageCodes = new Set(["SQLITE_ERROR", "ERR_SQLITE_ERROR", "SQLITE_BUSY", "SQLITE_LOCKED", "ERR_SQLITE_CONSTRAINT_PRIMARYKEY", "ERR_SQLITE_CONSTRAINT_UNIQUE", "PGRST116"]);
  const status = code && storageCodes.has(code) ? "STORAGE_FAILED" : "PROCESSING_FAILED";
  return { status, errorType: code && /^[A-Z0-9_]{1,64}$/.test(code) ? code : "UNCLASSIFIED_ERROR" };
}

function validVendor(value: unknown): value is ExternalVendor {
  return value === "NDPS" || value === "JININFRA";
}

deviceRoutes.post("/device-mappings/resolve", async (c) => {
  const body = await c.req.json<{ vendor?: unknown; deviceIds?: unknown; deviceTypes?: unknown }>();
  if (!validVendor(body.vendor) || !Array.isArray(body.deviceIds) || !body.deviceIds.every((id) => typeof id === "string")) return c.json({ error: { code: "INVALID_REQUEST", message: "vendor와 deviceIds가 올바르지 않습니다." } }, 400);
  const data = await resolveAssetMappings(body.vendor, body.deviceIds, body.deviceTypes && typeof body.deviceTypes === "object" ? body.deviceTypes as Record<string, string> : {});
  return c.json({ data });
});

deviceRoutes.post("/vendor-messages", async (c) => {
  const started = performance.now();
  // A fresh correlation ID is safe even when the incoming idempotency key is malformed.
  const correlationId = randomUUID();
  let vendor = "UNKNOWN";
  let mode = "UNKNOWN";
  let phase: "PARSE" | "MAPPING" | "INVOKE" = "PARSE";
  const emit = (status: DeviceLogStatus, errorType: string | null = null, requestId: string = correlationId) => {
    logDeviceRequest({ timestamp: new Date().toISOString(), requestId, vendor, mode, durationMs: Math.round((performance.now() - started) * 100) / 100, status, errorType });
  };

  try {
    const body = await c.req.json<{ vendor?: unknown; request?: InvokeRequest; mappings?: MappingResult[]; normalized?: boolean; mode?: unknown; idempotencyKey?: string; defaultPayloadType?: string | null }>();
    vendor = validVendor(body.vendor) ? body.vendor : "UNKNOWN";
    mode = body.mode === "VALIDATE_ONLY" || body.mode === "DELIVER" ? body.mode : "UNKNOWN";
    if (!validVendor(body.vendor) || !body.request || !Array.isArray(body.mappings) || (body.mode !== "VALIDATE_ONLY" && body.mode !== "DELIVER")) {
      emit("REJECTED", "INVALID_REQUEST");
      return c.json({ error: { code: "INVALID_REQUEST", message: "메시지 요청이 올바르지 않습니다." } }, 400);
    }
    phase = "MAPPING";
    let mappings = body.mappings;
    if (!body.normalized) {
      const knownIds = new Set(mappings.map((item) => item.vendorDeviceId));
      const missingIds = [...collectDeviceIds(body.request)].filter((id) => !knownIds.has(id));
      if (missingIds.length) mappings = [...mappings, ...await resolveAssetMappings(body.vendor, missingIds)];
    }

    // Preserve existing live-cache behavior; logging must not change the delivery contract.
    if (body.mode === "DELIVER") rememberLiveSleno(body.vendor, body.request, mappings);

    phase = "INVOKE";
    const result = await invokeVendor(body.vendor, body.request, mappings, body.mode, body.idempotencyKey, body.defaultPayloadType, body.normalized === true);
    emit(!result.accepted ? "REJECTED" : result.duplicate ? "DUPLICATE" : "ACCEPTED", !result.accepted ? "UNMAPPED_DEVICE" : null, result.requestId);
    return c.json({ data: result });
  } catch (error) {
    const classified = classifyDeviceError(error, phase);
    emit(classified.status, classified.errorType);
    throw error;
  }
});

deviceRoutes.get("/vendors/:vendor/health", async (c) => {
  const vendor = c.req.param("vendor").toUpperCase();
  if (!validVendor(vendor)) return c.json({ error: { code: "INVALID_VENDOR", message: "지원하지 않는 업체입니다." } }, 400);
  return c.json({ data: await readVendorHealth(vendor) });
});
