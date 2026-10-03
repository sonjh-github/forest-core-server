import assert
  from "node:assert/strict";

import {
  mkdtempSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  tmpdir,
} from "node:os";

import test
  from "node:test";

const directory =
  mkdtempSync(
    join(
      tmpdir(),
      "forest-sqlite-",
    ),
  );

process.env.DB_MODE =
  "sqlite";

process.env.SQLITE_PATH =
  join(
    directory,
    "forest.sqlite",
  );

process.env.SQLITE_SEED_DEMO =
  "false";

delete process.env
  .SUPABASE_URL;

delete process.env
  .SUPABASE_SECRET_KEY;

const {
  app,
} = await import(
  "../src/app.js"
);

const {
  createTelemetryRoutes,
} = await import(
  "../src/telemetry/routes.js"
);

const {
  createMemoryTelemetryStore,
} = await import(
  "../src/telemetry/store.js"
);

const {
  createTelemetryHub,
} = await import(
  "../src/telemetry/hub.js"
);

const {
  runtimeTelemetryPersistence,
} = await import(
  "../src/telemetry/persistence.js"
);

test(
  "production SQLite mode has no demo seed",
  async () => {
    const health =
      await app.request(
        "http://localhost/health",
      );

    assert.equal(
      health.status,
      200,
    );

    const healthBody =
      await health.json() as {
        data: {
          database:
            string;

          dbMode:
            string;

          demoMode:
            boolean;
        };
      };

    assert.equal(
      healthBody.data.database,
      "SQLITE",
    );

    assert.equal(
      healthBody.data.dbMode,
      "sqlite",
    );

    assert.equal(
      healthBody.data.demoMode,
      false,
    );

    const assets =
      await app.request(
        "http://localhost/api/v1/dashboard/assets?limit=10",
      );

    const assetsBody =
      await assets.json() as {
        data:
          unknown[];
      };

    assert.deepEqual(
      assetsBody.data,
      [],
    );
  },
);

test(
  "drone telemetry is restored from SQLite with fresh memory store",
  async () => {
    const ingest =
      await app.request(
        "http://localhost/internal/v1/telemetry/drone",
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body:
            JSON.stringify({
              droneId:
                "SQLITE-DRONE-001",

              timestamp:
                "2026-10-03T09:10:00Z",

              latitude:
                36.3504,

              longitude:
                127.3845,

              altitude:
                120.5,

              positionSource:
                "GLOBAL_POSITION_INT(33)",
            }),
        },
      );

    assert.equal(
      ingest.status,
      202,
    );

    const restartedRoutes =
      createTelemetryRoutes(
        createMemoryTelemetryStore(),
        createTelemetryHub(),
        runtimeTelemetryPersistence,
      );

    const latest =
      await restartedRoutes.request(
        "/drone/SQLITE-DRONE-001/latest",
      );

    assert.equal(
      latest.status,
      200,
    );

    const body =
      await latest.json() as {
        data: {
          droneId:
            string;

          position: {
            latitude:
              number;

            longitude:
              number;

            altitude:
              number;
          };
        };
      };

    assert.equal(
      body.data.droneId,
      "SQLITE-DRONE-001",
    );

    assert.equal(
      body.data.position.latitude,
      36.3504,
    );

    assert.equal(
      body.data.position.longitude,
      127.3845,
    );

    assert.equal(
      body.data.position.altitude,
      120.5,
    );
  },
);
