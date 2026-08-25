import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";

test("dashboard disaster asset API는 재난에 매핑된 모든 장비를 반환한다", async () => {
  const { supabase } = await import("../src/db/client.js");
  const originalSchema = supabase.schema.bind(supabase);
  Object.assign(supabase, {
    schema: () => ({ from: (table: string) => {
      if (table === "disaster_event") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { event_id: "10000000-0000-4000-8000-000000000001", event_code: "SIM-WF-001", event_name: "산불 현장", disaster_type: "WILDFIRE", status: "RESPONDING" }, error: null }) };
        return query;
      }
      const query = { select: () => query, eq: () => query, order: async () => ({ data: [
        { event_resource_id: "30000000-0000-4000-8000-000000000001", event_id: "10000000-0000-4000-8000-000000000001", asset_id: "20000000-0000-4000-8000-000000000001", mission: "정찰", asset: { asset_id: "20000000-0000-4000-8000-000000000001", asset_code: "SIM-UAV-WF-01" } },
        { event_resource_id: "30000000-0000-4000-8000-000000000002", event_id: "10000000-0000-4000-8000-000000000001", asset_id: "20000000-0000-4000-8000-000000000002", mission: "통신망 구축", asset: { asset_id: "20000000-0000-4000-8000-000000000002", asset_code: "SIM-TVWS-BS-01" } },
      ], error: null }) };
      return query;
    } }),
  });

  try {
    const { app } = await import("../src/app.js");
    const response = await app.request("/api/v1/dashboard/disasters/10000000-0000-4000-8000-000000000001/assets");
    const body = await response.json() as { data: { disaster: { disasterId: string }; assetCount: number; assets: unknown[] } };
    assert.equal(response.status, 200);
    assert.equal(body.data.disaster.disasterId, "10000000-0000-4000-8000-000000000001");
    assert.equal(body.data.assetCount, 2);
    assert.equal(body.data.assets.length, 2);
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});

test("dashboard disaster asset API는 잘못된 disasterId를 거부한다", async () => {
  const { app } = await import("../src/app.js");
  const response = await app.request("/api/v1/dashboard/disasters/not-a-uuid/assets");
  assert.equal(response.status, 400);
});
