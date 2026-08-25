import { Hono } from "hono";
import { parseBulkAssetIds, readAssetsBulk } from "./assets.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.post("/assets/bulk", async (c) => {
  const body = await c.req.json<{ assetIds?: unknown }>();
  try {
    const assetIds = parseBulkAssetIds(body.assetIds);
    return c.json({ data: await readAssetsBulk(assetIds) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("assetIds는")) {
      return c.json({ error: { code: "INVALID_REQUEST", message: error.message } }, 400);
    }
    throw error;
  }
});
