import { Hono } from "hono";
import { dashboardRoutes } from "./dashboard/routes.js";
import { deviceRoutes } from "./device/routes.js";
import { readCoreHealth } from "./device/health.js";

export const app = new Hono();

app.get("/", (c) => c.json({ service: "forest-core-server", status: "ok" }));
app.get("/health", async (c) => c.json({ data: await readCoreHealth() }));
app.route("/internal/v1", deviceRoutes);
app.route("/api/v1/dashboard", dashboardRoutes);

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "지원하지 않는 경로입니다." } }, 404));
app.onError((error, c) => c.json({ error: { code: "PROCESSING_FAILURE", message: error.message } }, 502));
