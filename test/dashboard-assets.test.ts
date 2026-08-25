import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";

test("dashboard disaster asset API는 재난에 매핑된 모든 장비를 반환한다", async () => {
  const { supabase } = await import("../src/db/client.js");
  const originalSchema = supabase.schema.bind(supabase);
  let assetSelection = "";
  Object.assign(supabase, {
    schema: () => ({ from: (table: string) => {
      if (table === "disaster_event") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { event_id: "10000000-0000-4000-8000-000000000001", event_code: "SIM-WF-001", event_name: "산불 현장", disaster_type: "WILDFIRE", status: "RESPONDING" }, error: null }) };
        return query;
      }
      const query = { select: (selection: string) => { assetSelection = selection; return query; }, eq: () => query, order: async () => ({ data: [
        { event_resource_id: "30000000-0000-4000-8000-000000000001", event_id: "10000000-0000-4000-8000-000000000001", asset_id: "20000000-0000-4000-8000-000000000001", mission: "정찰", asset: { asset_id: "20000000-0000-4000-8000-000000000001", asset_code: "SIM-UAV-WF-01", product_name: "Matrice-350", model_name: "Matrice-350", specifications: {}, asset_type: { asset_type_id: "40000000-0000-4000-8000-000000000001", name: "무인 항공기", description: null, enabled: true } } },
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
    assert.match(assetSelection, /product_name,model_name,specifications/);
    assert.match(assetSelection, /asset_type:asset_type/);
    assert.doesNotMatch(assetSelection, /product:product/);
    assert.doesNotMatch(assetSelection, /owner_org_code/);
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});

test("dashboard disaster asset API는 잘못된 disasterId를 거부한다", async () => {
  const { app } = await import("../src/app.js");
  const response = await app.request("/api/v1/dashboard/disasters/not-a-uuid/assets");
  assert.equal(response.status, 400);
});

test("dashboard 장비 등록 API는 DB가 발급한 UUID를 반환한다", async () => {
  const { supabase } = await import("../src/db/client.js");
  const originalSchema = supabase.schema.bind(supabase);
  let inserted: Record<string, unknown> | null = null;
  Object.assign(supabase, {
    schema: () => ({ from: (table: string) => {
      if (table === "asset_type") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { asset_type_id: "40000000-0000-4000-8000-000000000001" }, error: null }) };
        return query;
      }
      const query = {
        insert: (row: Record<string, unknown>) => { inserted = row; return query; },
        select: () => query,
        single: async () => ({ data: { asset_id: "20000000-0000-4000-8000-000000000099", ...inserted }, error: null }),
      };
      return query;
    } }),
  });

  try {
    const { app } = await import("../src/app.js");
    const response = await app.request("/api/v1/dashboard/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetCode: "DASH-UAV-01", assetTypeId: "40000000-0000-4000-8000-000000000001", assetName: "대시보드 등록 드론", modelName: "M350" }),
    });
    const body = await response.json() as { data: { asset_id: string; asset_code: string } };
    assert.equal(response.status, 201);
    assert.equal(body.data.asset_id, "20000000-0000-4000-8000-000000000099");
    assert.equal(body.data.asset_code, "DASH-UAV-01");
    assert.equal(inserted?.asset_type_id, "40000000-0000-4000-8000-000000000001");
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});

test("dashboard 장비 등록 API는 필수값 누락을 거부한다", async () => {
  const { app } = await import("../src/app.js");
  const response = await app.request("/api/v1/dashboard/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetName: "코드 없는 장비" }),
  });
  assert.equal(response.status, 400);
});

test("dashboard 업체 장비 매핑 API는 asset UUID에 업체 번호를 연결한다", async () => {
  const { supabase } = await import("../src/db/client.js");
  const originalSchema = supabase.schema.bind(supabase);
  let mappingRow: Record<string, unknown> | null = null;
  Object.assign(supabase, {
    schema: () => ({ from: (table: string) => {
      if (table === "asset") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { asset_id: "20000000-0000-4000-8000-000000000099" }, error: null }) };
        return query;
      }
      const query = {
        upsert: (row: Record<string, unknown>) => { mappingRow = row; return query; },
        select: () => query,
        single: async () => ({ data: mappingRow, error: null }),
      };
      return query;
    } }),
  });

  try {
    const { app } = await import("../src/app.js");
    const response = await app.request("/api/v1/dashboard/assets/20000000-0000-4000-8000-000000000099/vendor-mappings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vendor: "NDPS", vendorDeviceId: "NDPS-UAV-001", deviceType: "UAV" }),
    });
    assert.equal(response.status, 200);
    assert.equal(mappingRow?.asset_id, "20000000-0000-4000-8000-000000000099");
    assert.equal(mappingRow?.vendor_device_id, "NDPS-UAV-001");
    assert.deepEqual(mappingRow?.metadata, { mappingSource: "DASHBOARD" });
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});
