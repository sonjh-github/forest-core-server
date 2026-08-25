import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";

test("dashboard bulk asset API는 중복 ID를 제거하고 누락 ID를 반환한다", async () => {
  const { supabase } = await import("../src/db/client.js");
  const originalSchema = supabase.schema.bind(supabase);
  Object.assign(supabase, {
    schema: () => ({
      from: () => ({
        select: () => ({
          in: async (_column: string, ids: string[]) => ({ data: [{ asset_id: ids[0], asset_code: "ASSET-1" }], error: null }),
        }),
      }),
    }),
  });

  try {
    const { app } = await import("../src/app.js");
    const response = await app.request("/api/v1/dashboard/assets/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111"] }),
    });
    const body = await response.json() as { data: { requestedCount: number; foundCount: number; missingAssetIds: string[] } };
    assert.equal(response.status, 200);
    assert.equal(body.data.requestedCount, 2);
    assert.equal(body.data.foundCount, 1);
    assert.deepEqual(body.data.missingAssetIds, ["22222222-2222-4222-8222-222222222222"]);
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});

test("dashboard bulk asset API는 빈 배열을 거부한다", async () => {
  const { app } = await import("../src/app.js");
  const response = await app.request("/api/v1/dashboard/assets/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetIds: [] }),
  });
  assert.equal(response.status, 400);
});
