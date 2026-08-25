import { Hono, type Context } from "hono";
import { parseDisasterId, readDisasterAssets } from "./assets.js";
import { parseAssetId, readAsset, readAssetTypes, registerAsset, registerVendorMapping, RegistryError } from "./registry.js";

export const dashboardRoutes = new Hono();

function registryErrorResponse(c: Context, error: unknown) {
  if (error instanceof RegistryError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
  throw error;
}

dashboardRoutes.get("/asset-types", async (c) => c.json({ data: await readAssetTypes() }));

dashboardRoutes.post("/assets", async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
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

dashboardRoutes.put("/assets/:assetId/vendor-mappings", async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    return c.json({ data: await registerVendorMapping(c.req.param("assetId"), body) });
  } catch (error) {
    return registryErrorResponse(c, error);
  }
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
