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

async function readRegistryBody(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { throw new LocalDbError("INVALID_REQUEST", "올바른 JSON 객체를 보내 주세요."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new LocalDbError("INVALID_REQUEST", "요청 본문은 JSON 객체여야 합니다.");
  }
  return body as Record<string, unknown>;
}

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
        await readRegistryBody(c);

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
        await readRegistryBody(c);

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

          synthetic: false,

          storageMode:
            "SQLITE",

          demoMode: null,
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

    return c.json({ data: [] });
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
      false,

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
