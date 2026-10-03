import {
  randomUUID,
} from "node:crypto";

import {
  Hono,
  type Context,
} from "hono";

import {
  config,
} from "../config.js";

import {
  calculateSlenoQuality,
} from "../dashboard/sleno-quality.js";

import {
  readSlenoDashboardTelemetry,
} from "../dashboard/sleno-telemetry.js";

import {
  DEMO_UAV_ID,
  LocalDbError,
  assetLogs,
  createAsset,
  disasterAssets,
  findAsset,
  listAssetTypes,
  listAssets,
  localDbHealth,
  slenoIdentities,
  slenoMessages,
  updateMapping,
} from "./db.js";

export const localDashboardRoutes =
  new Hono();

function errorResponse(
  c: Context,
  error: unknown,
) {
  if (
    error instanceof
    LocalDbError
  ) {
    return c.json(
      {
        error: {
          code: error.code,
          message:
            error.message,
        },
      },
      error.status,
    );
  }

  throw error;
}

function limitValue(
  raw: string | undefined,
  fallback: number,
  max: number,
) {
  if (!raw) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  ) {
    throw new LocalDbError(
      "INVALID_REQUEST",
      `limit은 1~${max} 사이의 정수여야 합니다.`,
    );
  }

  return value;
}

localDashboardRoutes.get(
  "/asset-types",
  (c) =>
    c.json({
      data:
        listAssetTypes(),
    }),
);

localDashboardRoutes.get(
  "/assets",
  (c) => {
    try {
      return c.json({
        data:
          listAssets(
            limitValue(
              c.req.query(
                "limit",
              ),
              100,
              200,
            ),
          ),
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

localDashboardRoutes.post(
  "/assets",
  async (c) => {
    try {
      const body =
        await c.req.json<
          Record<
            string,
            unknown
          >
        >();

      return c.json(
        {
          data:
            createAsset(body),
        },
        201,
      );
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

localDashboardRoutes.get(
  "/assets/:assetId",
  (c) => {
    const asset =
      findAsset(
        c.req.param(
          "assetId",
        ),
      );

    if (!asset) {
      return c.json(
        {
          error: {
            code:
              "ASSET_NOT_FOUND",

            message:
              "물리 장비를 찾을 수 없습니다.",
          },
        },
        404,
      );
    }

    return c.json({
      data: asset,
    });
  },
);

localDashboardRoutes.get(
  "/assets/:assetId/logs",
  (c) => {
    try {
      return c.json({
        data:
          assetLogs(
            c.req.param(
              "assetId",
            ),

            limitValue(
              c.req.query(
                "limit",
              ),
              20,
              100,
            ),
          ),
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

localDashboardRoutes.put(
  "/assets/:assetId/vendor-mappings",
  async (c) => {
    try {
      const body =
        await c.req.json<
          Record<
            string,
            unknown
          >
        >();

      return c.json({
        data:
          updateMapping(
            c.req.param(
              "assetId",
            ),
            body,
          ),
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

localDashboardRoutes.get(
  "/disasters/:disasterId/assets",
  (c) => {
    const data =
      disasterAssets(
        c.req.param(
          "disasterId",
        ),
      );

    if (!data) {
      return c.json(
        {
          error: {
            code:
              "DISASTER_NOT_FOUND",

            message:
              "재난 상황을 찾을 수 없습니다.",
          },
        },
        404,
      );
    }

    return c.json({
      data,
    });
  },
);

localDashboardRoutes.get(
  "/network-quality/sleno",
  (c) => {
    try {
      const quality =
        calculateSlenoQuality(
          slenoMessages(
            limitValue(
              c.req.query(
                "limit",
              ),
              1000,
              2000,
            ),
          ),

          slenoIdentities(),
        );

      return c.json({
        data: {
          ...quality,

          synthetic:
            quality
              .physicalDeviceCount ===
            0,

          storageMode:
            "SQLITE",

          demoMode:
            quality
              .physicalDeviceCount ===
            0
              ? "LOCAL_SQLITE"
              : null,
        },
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

localDashboardRoutes.get(
  "/telemetry/drones",
  async (c) => {
    const eventId =
      c.req.query(
        "eventId",
      )?.trim();

    if (!eventId) {
      return c.json(
        {
          error: {
            code:
              "INVALID_REQUEST",

            message:
              "eventId is required.",
          },
        },
        400,
      );
    }

    const persistedSleno =
      await readSlenoDashboardTelemetry(
        eventId,
      );

    if (
      persistedSleno.length > 0
    ) {
      return c.json({
        data: persistedSleno,
      });
    }

    if (
      !config.sqliteSeedDemo
    ) {
      return c.json({
        data: [],
      });
    }

    const receivedAt =
      new Date()
        .toISOString();

    const observedAt =
      new Date(
        Date.now() - 500,
      ).toISOString();

    return c.json({
      data: [
        {
          eventId,

          assetId:
            DEMO_UAV_ID,

          sourceAssetId:
            DEMO_UAV_ID,

          assetType:
            "UAV",

          observedAt,
          receivedAt,

          latitude:
            36.3504,

          longitude:
            127.3845,

          altitude:
            142.7,

          operationalStatus:
            "ACTIVE",

          packetLossPct:
            1,

          positioningMethod:
            "RTK",

          synthetic:
            true,

          evidenceScope:
            "LOCAL_SQLITE_DEMO",

          attributes: {
            telemetryPositionSource:
              "GLOBAL_POSITION_INT(33)",

            gpsFixType: 6,

            satellitesVisible:
              18,

            hdop:
              0.82,

            vdop:
              1.15,

            horizontalAccuracy:
              0.32,

            verticalAccuracy:
              0.61,

            pathEvidence: {
              uplinkReceivedAt:
                observedAt,

              uplinkForwardStartedAt:
                observedAt,

              uplinkSource:
                "LOCAL_SQLITE_DEMO",

              uplinkBytes:
                64,

              transport:
                "LOCAL_DEMO",

              coreReceivedAt:
                receivedAt,
            },

            linkQuality: {
              mavlinkVersion: 2,
              mavlinkSystemId: 1,
              mavlinkComponentId:
                1,
              mavlinkSequence:
                42,
              mavlinkMessageId:
                33,
              windowExpected:
                100,
              windowReceived:
                99,
              windowLost:
                1,
              packetLossPct:
                1,
              periodAvgMs:
                1000,
              periodP95Ms:
                1050,
              periodMaxMs:
                1120,
            },
          },
        },
      ],
    });
  },
);

export function localHealth() {
  localDbHealth();

  return {
    service:
      "forest-core-server",

    status:
      "UP",

    databaseStatus:
      "REACHABLE",

    database:
      "SQLITE",

    dbMode:
      "sqlite",

    demoMode:
      config.sqliteSeedDemo,

    cloudFallback:
      false,

    cloudFailover:
      false,

    diagnosticRunId:
      randomUUID(),

    checkedAt:
      new Date()
        .toISOString(),
  };
}
