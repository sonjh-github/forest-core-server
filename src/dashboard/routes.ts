import { Hono, type Context } from "hono";
import { readAssetLogs } from "./asset-logs.js";
import { readDashboardDroneTelemetry } from "./telemetry.js";
import { readSlenoDashboardTelemetry } from "./sleno-telemetry.js";
import { readSlenoNetworkQuality } from "./sleno-quality.js";
import { parseDisasterId, readDisasterAssets } from "./assets.js";
import { parseAssetId, readAsset, readAssets, readAssetTypes, registerAsset, registerVendorMapping, RegistryError } from "./registry.js";

export const dashboardRoutes = new Hono();

async function readRegistryBody(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { throw new RegistryError("INVALID_REQUEST", "올바른 JSON 객체를 보내 주세요."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RegistryError("INVALID_REQUEST", "요청 본문은 JSON 객체여야 합니다.");
  }
  return body as Record<string, unknown>;
}

function registryErrorResponse(c: Context, error: unknown) {
  if (error instanceof RegistryError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
  throw error;
}

dashboardRoutes.get("/asset-types", async (c) => c.json({ data: await readAssetTypes() }));

dashboardRoutes.get("/assets", async (c) => {
  try {
    return c.json({ data: await readAssets(c.req.query("limit")) });
  } catch (error) {
    return registryErrorResponse(c, error);
  }
});

dashboardRoutes.post("/assets", async (c) => {
  try {
    const body = await readRegistryBody(c);
    const asset = await registerAsset(body);
    return c.json({ data: asset }, 201);
  } catch (error) {
    return registryErrorResponse(c, error);
  }
});

dashboardRoutes.get("/assets/:assetId", async (c) => {
  try {
    const asset = await readAsset(parseAssetId(c.req.param("assetId")));
    if (!asset) return c.json({ error: { code: "ASSET_NOT_FOUND", message: "물리 장비를 찾을 수 없습니다." } }, 404);
    return c.json({ data: asset });
  } catch (error) {
    return registryErrorResponse(c, error);
  }
});

dashboardRoutes.get("/assets/:assetId/logs", async (c) => {
  try {
    const data = await readAssetLogs(c.req.param("assetId"), c.req.query("limit"), c.req.query("cursor"));
    return c.json({ data });
  } catch (error) {
    return registryErrorResponse(c, error);
  }
});

dashboardRoutes.put("/assets/:assetId/vendor-mappings", async (c) => {
  try {
    const body = await readRegistryBody(c);
    return c.json({ data: await registerVendorMapping(c.req.param("assetId"), body) });
  } catch (error) {
    return registryErrorResponse(c, error);
  }
});

dashboardRoutes.get(
  "/network-quality/sleno",
  async (c) => {
    const rawLimit =
      c.req.query("limit");

    const limit =
      rawLimit == null
        ? 1000
        : Number(rawLimit);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 2000
    ) {
      return c.json(
        {
          error: {
            code:
              "INVALID_REQUEST",
            message:
              "limit은 1~2000 사이의 정수여야 합니다."
          }
        },
        400
      );
    }

    return c.json({
      data:
        await readSlenoNetworkQuality(
          limit
        )
    });
  }
);

dashboardRoutes.get("/telemetry/drones", async (c) => {
  const eventId =
    c.req.query("eventId")?.trim();

  if (!eventId) {
    return c.json({
      error: {
        code: "INVALID_REQUEST",
        message: "eventId is required."
      }
    }, 400);
  }

  const droneRows =
    readDashboardDroneTelemetry(
      eventId
    );

  const slenoRows =
    await readSlenoDashboardTelemetry(
      eventId
    );

  return c.json({
    data: [
      ...droneRows,
      ...slenoRows
    ]
  });
});

dashboardRoutes.get("/disasters/:disasterId/assets", async (c) => {
  try {
    const disasterId = parseDisasterId(c.req.param("disasterId"));
    const data = await readDisasterAssets(disasterId);
    if (!data) return c.json({ error: { code: "DISASTER_NOT_FOUND", message: "재난 상황을 찾을 수 없습니다." } }, 404);
    return c.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("disasterId는")) {
      return c.json({ error: { code: "INVALID_REQUEST", message: error.message } }, 400);
    }
    throw error;
  }
});
