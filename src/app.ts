import { Hono } from "hono";
import { cors } from "hono/cors";
import { dashboardRoutes } from "./dashboard/routes.js";
import { deviceRoutes } from "./device/routes.js";
import { readCoreHealth } from "./device/health.js";
import { externalRoutes } from "./external/routes.js";

export const app = new Hono();

app.use(
  "/api/v1/dashboard/*",
  cors({
    origin: [
      "http://127.0.0.1:15173",
      "http://localhost:15173",
      "https://wildfire.forest.tobeunicorn.kr",
    ],
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Origin"],
  }),
);

app.use(
  "/api/v1/external/*",
  cors({
    origin: [
      "http://127.0.0.1:15173",
      "http://localhost:15173",
      "https://wildfire.forest.tobeunicorn.kr",
    ],
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/", (c) => c.json({ service: "forest-core-server", status: "ok" }));
app.get("/health", async (c) => c.json({ data: await readCoreHealth() }));
app.route("/internal/v1", deviceRoutes);
app.route("/api/v1/dashboard", dashboardRoutes);
app.route("/api/v1/external", externalRoutes);

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "지원하지 않는 경로입니다." } }, 404));
app.onError((error, c) => c.json({ error: { code: "PROCESSING_FAILURE", message: error.message } }, 502));
