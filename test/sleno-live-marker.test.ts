import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";

test(
  "Sleno live RTK packet is exposed without waiting for DB persistence",
  async () => {
    const {
      clearLiveSlenoRows,
      rememberLiveSleno,
    } = await import(
      "../src/device/live-sleno.js"
    );

    const {
      readSlenoDashboardTelemetry,
    } = await import(
      "../src/dashboard/sleno-telemetry.js"
    );

    clearLiveSlenoRows();

    rememberLiveSleno(
      "JININFRA",
      {
        payloadType: "RTK_POSITION",

        context: {
          eventExternalId:
            "RTK-router-live-test",

          sourceSystem:
            "sleno-server",

          occurredAt:
            "2026-10-02T15:35:24.221+09:00",

          sourceDeviceId:
            "SIM-RTK-01",
        },

        relatedDeviceIds: [],

        activePath: [
          {
            sequence: 1,

            fromDeviceId:
              "SIM-RTK-01",

            toDeviceId:
              "SIM-RTK-BASE-01",

            medium: "LPWA",

            evidenceType:
              "OBSERVED",

            observations: [
              {
                receivedAt:
                  "2026-10-02T15:35:24.221+09:00",

                rssiDbm: -68,
                snrDb: 13,
                selected: true,
              },
            ],
          },
        ],

        data: {
          networkType: "LORAWAN",
          devEui: "4652535256303031",
          frameCounter: 43400,

          latitude:
            37.42381865,

          longitude:
            126.88741393,

          altitude: 89.4,
          fixType: "DGPS",
        },
      },

      [
        {
          vendorDeviceId:
            "SIM-RTK-01",

          assetId:
            "20000000-0000-4000-8000-000000000004",

          mapped: true,
          assetExists: true,
          mappingStatus: "ACTIVE",
        },

        {
          vendorDeviceId:
            "SIM-RTK-BASE-01",

          assetId:
            "20000000-0000-4000-8000-000000000009",

          mapped: true,
          assetExists: true,
          mappingStatus: "ACTIVE",
        },
      ],
    );

    let databaseReaderCalled = false;

    const result =
      await readSlenoDashboardTelemetry(
        "demo-wildfire-deoksungsan",

        async () => {
          databaseReaderCalled = true;
          return [];
        },

        Date.parse(
          "2026-10-02T15:35:25.221+09:00",
        ),
      );

    assert.equal(databaseReaderCalled, true);

    assert.equal(
      result.length,
      1,
    );

    const marker = result[0];

    assert.ok(marker);

    assert.equal(
      marker.assetId,
      "20000000-0000-4000-8000-000000000004",
    );

    assert.equal(
      marker.assetType,
      "RTK_TERMINAL",
    );

    assert.equal(
      marker.latitude,
      37.42381865,
    );

    assert.equal(
      marker.longitude,
      126.88741393,
    );

    assert.equal(
      marker.operationalStatus,
      "ACTIVE",
    );

    assert.equal(
      (
        marker.attributes as
          Record<string, unknown>
      ).persistenceStatus,
      "LIVE_UNPERSISTED",
    );

    clearLiveSlenoRows();
  },
);

test("지도 API는 live 수신 캐시보다 DB 저장 위치를 우선한다", async () => {
  const { clearLiveSlenoRows, rememberLiveSleno } = await import("../src/device/live-sleno.js");
  const { readSlenoDashboardTelemetry } = await import("../src/dashboard/sleno-telemetry.js");
  clearLiveSlenoRows();
  const occurredAt = "2026-10-30T04:20:46.000Z";
  const request = {
    payloadType: "RTK_POSITION",
    context: { eventExternalId: "persisted-test", sourceSystem: "sleno-server", occurredAt,
      sourceDeviceId: "SIM-RTK-01" },
    relatedDeviceIds: [], activePath: [],
    data: { latitude: 36.37345501, longitude: 127.33425901, fixType: "RTK_FLOAT" },
  };
  rememberLiveSleno("JININFRA", request, [{ vendorDeviceId: "SIM-RTK-01", assetId: "asset-1",
    mapped: true, assetExists: true, mappingStatus: "ACTIVE" }]);
  const rows = await readSlenoDashboardTelemetry("event", async () => [{
    request_id: "stored-1", event_external_id: "persisted-test", payload_type: "RTK_POSITION",
    source_device_id: "asset-1", occurred_at: occurredAt, received_at: occurredAt,
    status: "PERSISTED", payload: { ...request, context: { ...request.context, sourceDeviceId: "asset-1" } },
  }], Date.parse(occurredAt) + 1000);
  assert.equal(rows.length, 1);
  assert.equal((rows[0].attributes as Record<string, unknown>).persistenceStatus, "PERSISTED");
  assert.equal((rows[0].attributes as Record<string, unknown>).requestId, "stored-1");
  clearLiveSlenoRows();
});
