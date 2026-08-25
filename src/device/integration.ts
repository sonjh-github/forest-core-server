import { randomUUID } from "node:crypto";
import { mappingDictionary } from "../db/asset-mapping.js";
import { findVendorMessage, insertVendorMessage } from "../db/vendor-messages.js";
import type { ExternalVendor, InvokeRequest, MappingResult } from "../types.js";

function normalizeIds(value: unknown, ids: Map<string, string>, key?: string): unknown {
  const scalarKeys = new Set(["reportedByDeviceId", "sourceDeviceId", "fromDeviceId", "toDeviceId", "gatewayDeviceId", "baseDeviceId", "cpeDeviceId", "terminalDeviceId", "baseStationDeviceId"]);
  if (typeof value === "string" && key && scalarKeys.has(key)) return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => key === "receivedTerminalDeviceIds" && typeof item === "string" ? ids.get(item) ?? item : normalizeIds(item, ids));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, normalizeIds(item, ids, childKey)]));
  return value;
}

export async function invokeVendor(vendor: ExternalVendor, request: InvokeRequest, mappings: MappingResult[], deliveryMode: "VALIDATE_ONLY" | "DELIVER", requestIdHeader?: string, defaultPayloadType: string | null = null, alreadyNormalized = false) {
  const unmappedDeviceIds = mappings.filter((item) => !item.mapped).map((item) => item.vendorDeviceId);
  const idMap = mappingDictionary(mappings);
  const requestId = requestIdHeader && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestIdHeader) ? requestIdHeader : randomUUID();
  const normalized = alreadyNormalized ? request : normalizeIds(request, idMap) as InvokeRequest;
  if (unmappedDeviceIds.length) return { requestId, accepted: false, mode: deliveryMode, mapping: { allMapped: false, mappedDevices: mappings, unmappedDeviceIds }, normalizedPath: [], persisted: false, recordId: null, processedAt: new Date().toISOString() };
  const normalizedPath = normalized.activePath.map((hop) => ({ sequence: hop.sequence, fromAssetId: hop.fromDeviceId, toAssetId: hop.toDeviceId, medium: hop.medium, evidenceType: hop.evidenceType }));
  if (deliveryMode === "DELIVER") {
    const existing = await findVendorMessage(requestId);
    if (existing) {
      if (existing.vendor_code !== vendor) throw Object.assign(new Error("동일 Idempotency-Key가 다른 업체 요청에 사용되었습니다."), { code: "23505" });
      return { requestId, accepted: true, duplicate: true, mode: deliveryMode, mapping: { allMapped: true, mappedDevices: mappings, unmappedDeviceIds: [] }, normalizedPath, persisted: true, recordId: requestId, processedAt: new Date().toISOString() };
    }
    await insertVendorMessage({ request_id: requestId, vendor_code: vendor, event_external_id: normalized.context.eventExternalId, payload_type: normalized.payloadType ?? defaultPayloadType, delivery_mode: deliveryMode, source_device_id: normalized.context.sourceDeviceId, reported_by_device_id: normalized.context.reportedByDeviceId, occurred_at: normalized.context.occurredAt, status: "PERSISTED", payload: normalized, normalized_payload: normalized });
  }
  return { requestId, accepted: true, duplicate: false, mode: deliveryMode, mapping: { allMapped: true, mappedDevices: mappings, unmappedDeviceIds: [] }, normalizedPath, persisted: deliveryMode === "DELIVER", recordId: deliveryMode === "DELIVER" ? requestId : null, processedAt: new Date().toISOString() };
}
