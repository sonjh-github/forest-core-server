import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";

const ndpsRequest = {
  context: { eventExternalId: "E-NDPS", sourceSystem: "ndps", occurredAt: "2026-08-21T00:00:00.000Z", sourceDeviceId: "CPE-1", reportedByDeviceId: "NMS-1" },
  relatedDeviceIds: ["CONTROLLER-1"],
  activePath: [{ sequence: 1, fromDeviceId: "CPE-1", toDeviceId: "BASE-1", medium: "TVWS", evidenceType: "OBSERVED", observations: [{ receivedAt: "2026-08-21T00:00:00.000Z", rssiDbm: -71 }] }],
  data: { baseDeviceId: "BASE-1", cpeDeviceId: "CPE-1", observedAt: "2026-08-21T00:00:00.000Z", operationalStatus: "ONLINE" },
};

const jininfraRequest = {
  payloadType: "RTK_LPWA_GATEWAY",
  context: { eventExternalId: "E-JIN", sourceSystem: "jininfra", occurredAt: "2026-08-21T00:00:00.000Z", sourceDeviceId: "GW-1", reportedByDeviceId: "GW-1" },
  activePath: [],
  data: { gatewayDeviceId: "GW-1", receivedTerminalDeviceIds: ["TERM-1", "TERM-2"], observedAt: "2026-08-21T00:00:00.000Z", operationalStatus: "ONLINE" },
};

const ndpsMappings = [
  { vendorDeviceId: "CPE-1", assetId: "10000000-0000-4000-8000-000000000001", mapped: true, assetExists: true, mappingStatus: "ACTIVE" as const },
  { vendorDeviceId: "NMS-1", assetId: "10000000-0000-4000-8000-000000000002", mapped: true, assetExists: true, mappingStatus: "ACTIVE" as const },
  { vendorDeviceId: "BASE-1", assetId: "10000000-0000-4000-8000-000000000003", mapped: true, assetExists: true, mappingStatus: "ACTIVE" as const },
  { vendorDeviceId: "CONTROLLER-1", assetId: "10000000-0000-4000-8000-000000000004", mapped: true, assetExists: true, mappingStatus: "ACTIVE" as const },
];

test("vendor 시나리오에서 추론한 core 메시지 처리", async () => {
  const { supabase } = await import("../src/db/client.js");
  const { invokeVendor } = await import("../src/device/integration.js");
  const { collectDeviceIds } = await import("../src/types.js");

  let existing: { request_id: string; vendor_code: string } | null = null;
  const inserted: Array<Record<string, unknown>> = [];
  const originalSchema = supabase.schema.bind(supabase);
  Object.assign(supabase, {
    schema: () => ({
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: existing, error: null }),
          insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; },
        };
        return query;
      },
    }),
  });

  try {
    // NDPS와 진인프라 payload의 모든 장비 식별자를 수집한다.
    assert.deepEqual([...collectDeviceIds(ndpsRequest)].sort(), ["BASE-1", "CONTROLLER-1", "CPE-1", "NMS-1"]);
    assert.deepEqual([...collectDeviceIds(jininfraRequest)].sort(), ["GW-1", "TERM-1", "TERM-2"]);

    // VALIDATE_ONLY는 UUID를 정규화하지만 DB에 저장하지 않는다.
    const validated = await invokeVendor("NDPS", ndpsRequest, ndpsMappings, "VALIDATE_ONLY", undefined, "TVWS");
    assert.equal(validated.accepted, true);
    assert.equal(validated.persisted, false);
    assert.equal(inserted.length, 0);
    assert.equal(validated.normalizedPath[0]?.fromAssetId, ndpsMappings[0]?.assetId);
    assert.equal(validated.normalizedPath[0]?.toAssetId, ndpsMappings[2]?.assetId);

    // 미매핑 장비가 하나라도 있으면 저장하지 않는다.
    const unmapped = await invokeVendor("NDPS", ndpsRequest, [...ndpsMappings.slice(0, 2), { vendorDeviceId: "BASE-1", assetId: null, mapped: false, assetExists: false, mappingStatus: "UNMAPPED" }], "DELIVER");
    assert.equal(unmapped.accepted, false);
    assert.deepEqual(unmapped.mapping.unmappedDeviceIds, ["BASE-1"]);
    assert.equal(inserted.length, 0);

    // DELIVER는 UUID로 정규화된 payload만 저장한다.
    const requestId = "11111111-1111-4111-8111-111111111111";
    const delivered = await invokeVendor("NDPS", ndpsRequest, ndpsMappings, "DELIVER", requestId, "TVWS");
    assert.equal(delivered.persisted, true);
    assert.equal(inserted.length, 1);
    assert.equal("normalized_payload" in (inserted[0] ?? {}), false);
    const storedPayload = inserted[0]?.payload as typeof ndpsRequest;
    assert.equal(storedPayload.context.sourceDeviceId, ndpsMappings[0]?.assetId);
    assert.equal(storedPayload.context.reportedByDeviceId, ndpsMappings[1]?.assetId);
    assert.equal(storedPayload.relatedDeviceIds[0], ndpsMappings[3]?.assetId);
    assert.equal(storedPayload.activePath[0]?.fromDeviceId, ndpsMappings[0]?.assetId);
    assert.equal(storedPayload.activePath[0]?.toDeviceId, ndpsMappings[2]?.assetId);
    assert.equal(storedPayload.activePath[0]?.medium, "TVWS");
    assert.equal(storedPayload.activePath[0]?.observations[0]?.rssiDbm, -71);
    assert.equal(storedPayload.data.baseDeviceId, ndpsMappings[2]?.assetId);

    // vendor가 캐시 HIT로 이미 정규화한 요청은 재매핑하지 않고 그대로 저장한다.
    const normalizedRequest = structuredClone(storedPayload);
    const normalized = await invokeVendor("NDPS", normalizedRequest, ndpsMappings, "VALIDATE_ONLY", undefined, "TVWS", true);
    assert.equal(normalized.normalizedPath[0]?.fromAssetId, ndpsMappings[0]?.assetId);

    // 같은 업체의 동일 멱등성 키는 중복 저장하지 않는다.
    existing = { request_id: requestId, vendor_code: "NDPS" };
    const duplicate = await invokeVendor("NDPS", ndpsRequest, ndpsMappings, "DELIVER", requestId, "TVWS");
    assert.equal(duplicate.duplicate, true);
    assert.equal(inserted.length, 1);

    // 다른 업체가 동일 멱등성 키를 사용하면 충돌한다.
    await assert.rejects(
      () => invokeVendor("JININFRA", jininfraRequest, [], "DELIVER", requestId),
      (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23505"),
    );
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});
