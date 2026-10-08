import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "supabase";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";

test("Supabase health exposes the database identity required by migration checks", async () => {
  const { supabase } = await import("../src/db/client.js");
  const originalSchema = supabase.schema.bind(supabase);

  Object.assign(supabase, {
    schema: () => ({
      from: () => ({
        select: async () => ({ data: null, error: null }),
      }),
    }),
  });

  try {
    const { app } = await import("../src/app.js");
    const response = await app.request("http://localhost/health");
    const body = await response.json() as {
      data: {
        database: string;
        dbMode: string;
        demoMode: boolean;
        cloudFallback: boolean;
        cloudFailover: boolean;
        databaseStatus: string;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.data.database, "SUPABASE");
    assert.equal(body.data.dbMode, "supabase");
    assert.equal(body.data.demoMode, false);
    assert.equal(body.data.cloudFallback, false);
    assert.equal(body.data.cloudFailover, false);
    assert.equal(body.data.databaseStatus, "REACHABLE");
  } finally {
    Object.assign(supabase, { schema: originalSchema });
  }
});
