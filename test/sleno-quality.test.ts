import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSlenoQuality
} from "../src/dashboard/sleno-quality.js";

function row(
  requestId: string,
  counter: number,
  receivedAt: string,
  rssiDbm: number,
  snrDb: number
) {
  return {
    request_id: requestId,
    event_external_id: requestId,
    payload_type: "RTK_POSITION",
    source_device_id:
      "20000000-0000-4000-8000-000000000004",
    occurred_at: receivedAt,
    status: "PERSISTED",

    payload: {
      context: {
        sourceSystem:
          "sleno-server",

        sourceDeviceId:
          "20000000-0000-4000-8000-000000000004",

        occurredAt:
          receivedAt
      },

      activePath: [
        {
          sequence: 1,
          medium: "LPWA",

          observations: [
            {
              receivedAt,
              rssiDbm,
              snrDb,
              selected: true
            }
          ]
        }
      ],

      data: {
        networkType:
          "LORAWAN",

        frameCounter:
          counter,

        fixType:
          "DGPS"
      }
    }
  };
}

test(
  "Sleno frame counter calculates loss duplicate and reset",
  () => {
    const rows = [
      row(
        "a",
        10,
        "2026-09-30T00:00:00.000Z",
        -60,
        10
      ),

      row(
        "b",
        11,
        "2026-09-30T00:00:01.000Z",
        -61,
        11
      ),

      row(
        "c",
        14,
        "2026-09-30T00:00:02.000Z",
        -62,
        12
      ),

      row(
        "d",
        14,
        "2026-09-30T00:00:03.000Z",
        -63,
        13
      ),

      row(
        "e",
        3,
        "2026-09-30T00:00:04.000Z",
        -64,
        14
      ),

      row(
        "f",
        4,
        "2026-09-30T00:00:05.000Z",
        -65,
        15
      )
    ];

    const result =
      calculateSlenoQuality(
        rows,
        [
          {
            assetId:
              "20000000-0000-4000-8000-000000000004",

            assetCode:
              "RTK-01",

            assetName:
              "RTK 단말",

            vendorDeviceId:
              "SIM-RTK-01",

            deviceType:
              "RTK_TERMINAL"
          }
        ],
        Date.parse(
          "2026-09-30T00:00:06.000Z"
        )
      );

    assert.equal(
      result.deviceCount,
      1
    );

    assert.equal(
      result.physicalDeviceCount,
      0
    );

    assert.equal(
      result.simulatedDeviceCount,
      1
    );

    assert.equal(
      result.unregisteredDeviceCount,
      0
    );

    const device =
      result.devices[0];

    assert.ok(device);

    assert.equal(
      device.receivedFrames,
      5
    );

    assert.equal(
      device.expectedFrames,
      7
    );

    assert.equal(
      device.lostFrames,
      2
    );

    assert.equal(
      device.duplicateFrames,
      1
    );

    assert.equal(
      device.counterResets,
      1
    );

    assert.equal(
      device.frameLossPct,
      28.571
    );

    assert.equal(
      device.frameDeliveryPct,
      71.429
    );

    /*
     * duplicate frameCounter는
     * 새로운 위치 갱신이 아니므로
     * TC-02 갱신주기 계산에서 제외한다.
     *
     * 유효 frame 시각:
     * 0s, 1s, 2s, 4s, 5s
     * => intervals 1s, 1s, 2s, 1s
     * => AVG 1.25s
     */
    assert.equal(
      device.updateIntervalAvgMs,
      1250
    );

    assert.equal(
      device.latestRssiDbm,
      -65
    );

    assert.equal(
      device.latestSnrDb,
      15
    );

    assert.equal(
      device.state,
      "LIVE"
    );
  }
);

test(
  "Sleno messages without an asset identity are not counted as physical devices",
  () => {
    const result = calculateSlenoQuality(
      [
        row(
          "unregistered-a",
          10,
          "2026-09-30T00:00:00.000Z",
          -60,
          10,
        ),
      ],
      [],
      Date.parse("2026-09-30T00:00:01.000Z"),
    );

    assert.equal(result.deviceCount, 1);
    assert.equal(result.physicalDeviceCount, 0);
    assert.equal(result.simulatedDeviceCount, 0);
    assert.equal(result.unregisteredDeviceCount, 1);
    assert.equal(result.devices[0]?.isRegisteredDevice, false);
  },
);
