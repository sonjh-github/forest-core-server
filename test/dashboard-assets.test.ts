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
  let rpcParams: Record<string, unknown> | null = null;
  Object.assign(supabase, {
    schema: () => ({
      from: () => {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { asset_type_id: "40000000-0000-4000-8000-000000000001" }, error: null }) };
        return query;
      },
      rpc: async (_name: string, params: Record<string, unknown>) => {
        rpcParams = params;
        return { data: { asset_id: "20000000-0000-4000-8000-000000000099", asset_code: params.p_asset_code, vendor_mapping: { vendor_code: params.p_vendor_code, vendor_device_id: params.p_vendor_device_id, status: params.p_mapping_status } }, error: null };
      },
    }),
  });

  try {
    const { app } = await import("../src/app.js");
    const response = await app.request("/api/v1/dashboard/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetCode: "DASH-UAV-01", assetTypeId: "40000000-0000-4000-8000-000000000001", assetName: "대시보드 등록 드론", modelName: "M350", vendor: "NDPS", vendorDeviceId: "NDPS-UAV-001", deviceType: "UAV" }),
    });
    const body = await response.json() as { data: { asset_id: string; asset_code: string } };
    assert.equal(response.status, 201);
    assert.equal(body.data.asset_id, "20000000-0000-4000-8000-000000000099");
    assert.equal(body.data.asset_code, "DASH-UAV-01");
    assert.equal(rpcParams?.p_asset_type_id, "40000000-0000-4000-8000-000000000001");
    assert.equal(rpcParams?.p_vendor_device_id, "NDPS-UAV-001");
    assert.equal(body.data.vendor_mapping.vendor_device_id, "NDPS-UAV-001");
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

test("dashboard 장비 로그 API는 assetId 관련 로그를 lazy pagination으로 반환한다", async () => {
  const { supabase } = await import("../src/db/client.js");
  const originalSchema = supabase.schema.bind(supabase);
  let logFilter = "";
  let logSelection = "";
  let requestedLimit = 0;
  Object.assign(supabase, {
    schema: () => ({ from: (table: string) => {
      if (table === "asset") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { asset_id: "20000000-0000-4000-8000-000000000002" }, error: null }) };
        return query;
      }
      const rows = [
        {
          request_id: "50000000-0000-4000-8000-000000000001",
          received_at: "2026-08-27T03:00:03.000Z",
          source_device_id: "20000000-0000-4000-8000-000000000002",
          payload: {
            context: { sourceDeviceId: "20000000-0000-4000-8000-000000000002" },
            activePath: [{ fromDeviceId: "20000000-0000-4000-8000-000000000002", toDeviceId: "20000000-0000-4000-8000-000000000003", medium: "TVWS" }],
            data: { operationalStatus: "ONLINE" },
          },
        },
        { request_id: "50000000-0000-4000-8000-000000000002", received_at: "2026-08-27T03:00:02.000Z", source_device_id: "20000000-0000-4000-8000-000000000002" },
        { request_id: "50000000-0000-4000-8000-000000000003", received_at: "2026-08-27T03:00:01.000Z", source_device_id: "20000000-0000-4000-8000-000000000002" },
      ];
      const query = {
        select: (value: string) => { logSelection = value; return query; },
        or: (value: string) => { logFilter = value; return query; },
        order: () => query,
        limit: (value: number) => { requestedLimit = value; return Promise.resolve({ data: rows, error: null }); },
      };
      return query;
    } }),
  });

  try {
    const { app } = await import("../src/app.js");
    const response = await app.request("/api/v1/dashboard/assets/20000000-0000-4000-8000-000000000002/logs?limit=2");
    const body = await response.json() as { data: { assetId: string; logs: Array<{ payload?: { activePath?: Array<{ medium: string }> } }>; page: { limit: number; hasMore: boolean; nextCursor: string } } };
    assert.equal(response.status, 200);
    assert.equal(body.data.assetId, "20000000-0000-4000-8000-000000000002");
    assert.equal(body.data.logs.length, 2);
    assert.equal(body.data.logs[0]?.payload?.activePath?.[0]?.medium, "TVWS");
    assert.equal(body.data.page.limit, 2);
    assert.equal(body.data.page.hasMore, true);
    assert.equal(body.data.page.nextCursor, "2026-08-27T03:00:02.000Z");
    assert.equal(requestedLimit, 3);
    assert.match(logFilter, /source_device_id\.eq\.20000000-0000-4000-8000-000000000002/);
    assert.match(logFilter, /baseDeviceId/);
    assert.match(logFilter, /activePath/);
    assert.match(logFilter, /payload\.cs/);
    assert.doesNotMatch(logFilter, /normalized_payload/);
    assert.doesNotMatch(logSelection, /normalized_payload/);
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});

test("dashboard 장비 로그 API는 잘못된 limit과 cursor를 거부한다", async () => {
  const { app } = await import("../src/app.js");
  const path = "/api/v1/dashboard/assets/20000000-0000-4000-8000-000000000002/logs";
  assert.equal((await app.request(`${path}?limit=101`)).status, 400);
  assert.equal((await app.request(`${path}?cursor=not-a-date`)).status, 400);
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
