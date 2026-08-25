import { Hono } from "hono";
import { resolveAssetMappings } from "../db/asset-mapping.js";
import { collectDeviceIds, type ExternalVendor, type InvokeRequest, type MappingResult } from "../types.js";
import { readVendorHealth } from "./health.js";
import { invokeVendor } from "./integration.js";

export const deviceRoutes = new Hono();

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
  const body = await c.req.json<{ vendor?: unknown; request?: InvokeRequest; mappings?: MappingResult[]; normalized?: boolean; mode?: unknown; idempotencyKey?: string; defaultPayloadType?: string | null }>();
  if (!validVendor(body.vendor) || !body.request || !Array.isArray(body.mappings) || (body.mode !== "VALIDATE_ONLY" && body.mode !== "DELIVER")) return c.json({ error: { code: "INVALID_REQUEST", message: "메시지 요청이 올바르지 않습니다." } }, 400);
  let mappings = body.mappings;
  if (!body.normalized) {
    const knownIds = new Set(mappings.map((item) => item.vendorDeviceId));
    const missingIds = [...collectDeviceIds(body.request)].filter((id) => !knownIds.has(id));
    if (missingIds.length) mappings = [...mappings, ...await resolveAssetMappings(body.vendor, missingIds)];
  }
  return c.json({ data: await invokeVendor(body.vendor, body.request, mappings, body.mode, body.idempotencyKey, body.defaultPayloadType, body.normalized === true) });
});

deviceRoutes.get("/vendors/:vendor/health", async (c) => {
  const vendor = c.req.param("vendor").toUpperCase();
  if (!validVendor(vendor)) return c.json({ error: { code: "INVALID_VENDOR", message: "지원하지 않는 업체입니다." } }, 400);
  return c.json({ data: await readVendorHealth(vendor) });
});
