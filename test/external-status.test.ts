import assert from "node:assert/strict";
import test from "node:test";

import { externalRoutes } from "../src/external/routes.js";

test("external integration status는 개별 연계 실패에도 전체 상태를 반환한다", async () => {
  const envKeys = [
    "NASA_FIRMS_MAP_KEY",
    "KFS_WILDFIRE_SERVICE_KEY",
    "LANDSLIDE_FORECAST_SERVICE_KEY",
    "LANDSLIDE_HISTORY_SERVICE_KEY",
    "LANDSLIDE_REGIONAL_HISTORY_SERVICE_KEY",
  ];

  const backup = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );

  try {
    for (const key of envKeys) {
      delete process.env[key];
    }

    const response = await externalRoutes.request(
      "http://localhost/status",
    );

    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      data: Array<{
        id: string;
        status: "ok" | "failed";
        checkedAt: string;
        message?: string;
      }>;
      meta: {
        total: number;
        healthy: number;
        failed: number;
        checkedAt: string;
      };
    };

    assert.equal(body.data.length, 5);
    assert.equal(body.meta.total, 5);
    assert.equal(body.meta.healthy, 0);
    assert.equal(body.meta.failed, 5);

    assert.deepEqual(
      body.data.map((item) => item.id),
      [
        "nasa-firms",
        "kfs-wildfire-risk",
        "landslide-forecast",
        "landslide-history",
        "landslide-regional-risk",
      ],
    );

    assert.ok(body.data.every((item) => item.status === "failed"));
    assert.ok(body.data.every((item) => item.checkedAt));
    assert.ok(body.data.every((item) => item.message));
    assert.ok(body.meta.checkedAt);
  } finally {
    for (const key of envKeys) {
      const value = backup[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
