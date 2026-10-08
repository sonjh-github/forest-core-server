import assert from "node:assert/strict";
import test from "node:test";
import {
  readDashboardDroneTelemetry
} from "../src/dashboard/telemetry.js";
import {
  createMemoryTelemetryStore
} from "../src/telemetry/store.js";

test(
  "dashboard telemetry returns latest drone position and GPS quality",
  () => {
    const store = createMemoryTelemetryStore();

    store.put({
      droneId: "SITL-001",
      timestamp: "2026-09-28T02:00:00Z",
      latitude: -35.3633515,
      longitude: 149.1652412,
      altitude: 587.15,

      positionSource:
        "GLOBAL_POSITION_INT(33)",

      gpsFixType: 6,
      satellitesVisible: 18,
      hdop: 0.85,
      vdop: 1.2,
      horizontalAccuracy: 0.35,
      verticalAccuracy: 0.65,
      mavlinkVersion: 2,
      mavlinkSystemId: 1,
      mavlinkComponentId: 1,
      mavlinkSequence: 42,
      mavlinkMessageId: 33,
      qualityWindowExpected: 100,
      qualityWindowReceived: 99,
      qualityWindowLost: 1,
      packetLossPct: 1,
      periodAvgMs: 64.01,
      periodP95Ms: 78,
      periodMaxMs: 82
    });

    const rows =
      readDashboardDroneTelemetry(
        "field-md1000-local",
        store
      );

    assert.equal(rows.length, 1);

    assert.equal(
      rows[0].eventId,
      "field-md1000-local"
    );

    assert.equal(
      rows[0].assetId,
      "SITL-001"
    );

    assert.equal(
      rows[0].latitude,
      -35.3633515
    );

    assert.equal(
      rows[0].longitude,
      149.1652412
    );

    assert.equal(
      rows[0].altitude,
      587.15
    );

    assert.equal(
      rows[0].sequence,
      42
    );

    assert.equal(
      rows[0].positioningMethod,
      "RTK"
    );

    assert.equal(
      rows[0].attributes.gpsFixType,
      6
    );

    assert.equal(
      rows[0].attributes.satellitesVisible,
      18
    );

    assert.equal(
      rows[0].attributes.hdop,
      0.85
    );

    assert.equal(
      rows[0].attributes.horizontalAccuracy,
      0.35
    );

    assert.equal(rows[0].packetLossPct, 1);
    assert.equal(
      rows[0].attributes.linkQuality.periodP95Ms,
      78
    );
    assert.equal(
      rows[0].attributes.linkQuality.windowLost,
      1
    );
  }
);
