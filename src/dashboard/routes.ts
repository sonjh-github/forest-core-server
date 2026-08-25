import { Hono } from "hono";
import { parseDisasterId, readDisasterAssets } from "./assets.js";

export const dashboardRoutes = new Hono();

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
