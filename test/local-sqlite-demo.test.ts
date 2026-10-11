import assert
  from "node:assert/strict";

import test
  from "node:test";

process.env.DB_MODE =
  "sqlite";

process.env.SQLITE_PATH =
  ":memory:";

delete process.env
  .SUPABASE_URL;

delete process.env
  .SUPABASE_SECRET_KEY;

const {
  app,
} = await import(
  "../src/app.js"
);

const EVENT_ID =
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

test(
  "SQLite mode works without Supabase environment variables",
  async () => {
    const response =
      await app.request(
        "http://localhost/health",
      );

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json() as {
        data: {
          database: string;
          dbMode: string;
          demoMode: boolean;
          cloudFallback: boolean;
          cloudFailover: boolean;
        };
      };

    assert.equal(
      body.data.database,
      "SQLITE",
    );

    assert.equal(
      body.data.dbMode,
      "sqlite",
    );

    assert.equal(
      body.data.demoMode,
      true,
    );

    assert.equal(
      body.data.cloudFallback,
      false,
    );

    assert.equal(
      body.data.cloudFailover,
      false,
    );
  },
);

test(
  "SQLite dashboard exposes demo assets",
  async () => {
    const response =
      await app.request(
        "http://localhost/api/v1/dashboard/assets?limit=10",
      );

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json() as {
        data: unknown[];
      };

    assert.ok(
      body.data.length >= 2,
    );
  },
);

test(
  "SQLite dashboard exposes disaster assets",
  async () => {
    const response =
      await app.request(
        `http://localhost/api/v1/dashboard/disasters/${EVENT_ID}/assets`,
      );

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json() as {
        data: {
          assetCount: number;
        };
      };

    assert.ok(
      body.data.assetCount >= 2,
    );
  },
);

test(
  "SQLite dashboard exposes Sleno frame RSSI and SNR demo",
  async () => {
    const response =
      await app.request(
        "http://localhost/api/v1/dashboard/network-quality/sleno?limit=100",
      );

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json() as {
        data: {
          synthetic: boolean;
          deviceCount: number;
          totalLostFrames: number;
          devices: Array<{
            latestRssiDbm:
              number | null;

            latestSnrDb:
              number | null;
          }>;
        };
      };

    assert.equal(
      body.data.synthetic,
      true,
    );

    assert.ok(
      body.data.deviceCount >= 1,
    );

    assert.ok(
      body.data.totalLostFrames >= 1,
    );

    assert.notEqual(
      body.data.devices[0]
        ?.latestRssiDbm,
      null,
    );

    assert.notEqual(
      body.data.devices[0]
        ?.latestSnrDb,
      null,
    );
  },
);

test(
  "SQLite dashboard exposes local RTK telemetry demo",
  async () => {
    const response =
      await app.request(
        `http://localhost/api/v1/dashboard/telemetry/drones?eventId=${EVENT_ID}`,
      );

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json() as {
        data: Array<{
          positioningMethod:
            string;

          synthetic:
            boolean;

          attributes: {
            gpsFixType:
              number;
          };
        }>;
      };

    assert.equal(
      body.data[0]
        ?.positioningMethod,
      "RTK",
    );

    assert.equal(
      body.data[0]
        ?.synthetic,
      true,
    );

    assert.equal(
      body.data[0]
        ?.attributes
        .gpsFixType,
      6,
    );
  },
);

test("SQLite registration rejects malformed input and duplicate vendor identities", async () => {
  for (const body of ["null", "[]", "{"]) {
    const response = await app.request("/api/v1/dashboard/assets", { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(response.status, 400);
  }
  const types = await (await app.request("/api/v1/dashboard/asset-types")).json();
  const payload = { assetTypeId: types.data[0].asset_type_id, assetCode: "REG-ONE", vendor: "NDPS", vendorDeviceId: "REG-DEVICE", deviceType: "UAV" };
  const post = (value: unknown) => app.request("/api/v1/dashboard/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  const first = await post(payload);
  assert.equal(first.status, 201);
  const asset = (await first.json()).data;
  assert.equal(asset.vendor_mappings[0].vendor_device_id, "REG-DEVICE");
  assert.equal((await post({ ...payload, assetCode: "REG-DUPLICATE" })).status, 409);
  const second = await post({ ...payload, assetCode: "REG-TWO", vendorDeviceId: "REG-OTHER" });
  assert.equal(second.status, 201);
  const other = (await second.json()).data;
  const conflict = await app.request(`/api/v1/dashboard/assets/${other.asset_id}/vendor-mappings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(conflict.status, 409);
  const detail = (await (await app.request(`/api/v1/dashboard/assets/${other.asset_id}`)).json()).data;
  assert.equal(detail.vendor_mappings[0].vendor_device_id, "REG-OTHER");
});
