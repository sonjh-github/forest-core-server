import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { dashboardRoutes } from "./dashboard/routes.js";
import { deviceRoutes } from "./device/routes.js";
import { readCoreHealth } from "./device/health.js";
import { externalRoutes } from "./external/routes.js";
import { videoRoutes } from "./video/routes.js";
import { telemetryRoutes } from "./telemetry/routes.js";
import { telemetryWebSocketRoutes } from "./telemetry/websocket.js";
import { localDashboardRoutes, localHealth } from "./local-demo/routes.js";
import {
  internalFirelineRoutes
} from "./alerts/routes.js";
import {
  internalKpiRoutes,
  dashboardKpiRoutes
} from "./kpi/routes.js";

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

app.use(
  "/api/v1/assets/*",
  cors({
    origin: [
      "http://127.0.0.1:15173",
      "http://localhost:15173",
      "https://wildfire.forest.tobeunicorn.kr",
    ],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Origin"],
  }),
);

app.get("/", (c) => c.json({ service: "forest-core-server", status: "ok" }));
app.get("/health", async (c) =>
  c.json({
    data:
      config.dbMode === "sqlite"
        ? localHealth()
        : await readCoreHealth(),
  }),
);

app.route("/internal/v1", deviceRoutes);
app.route("/internal/v1/telemetry", telemetryRoutes);
app.route("/internal/v1/telemetry", telemetryWebSocketRoutes);
app.route("/internal/v1/kpi", internalKpiRoutes);
app.route("/internal/v1/alerts", internalFirelineRoutes);

app.route(
  "/api/v1/dashboard",
  config.dbMode === "sqlite"
    ? localDashboardRoutes
    : dashboardRoutes,
);
app.route("/api/v1/external", externalRoutes);
app.route("/api/v1/assets", videoRoutes);
app.route("/api/v1/dashboard/kpi", dashboardKpiRoutes);

app.notFound((c) =>
  c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "지원하지 않는 경로입니다.",
      },
    },
    404,
  ),
);

app.onError((error, c) => {
  const origin = c.req.header("Origin");

  if (
    c.req.path.startsWith("/api/v1/external/") &&
    origin &&
    [
      "http://127.0.0.1:15173",
      "http://localhost:15173",
      "https://wildfire.forest.tobeunicorn.kr",
    ].includes(origin)
  ) {
    c.header(
      "Access-Control-Allow-Origin",
      origin,
    );
    c.header("Vary", "Origin");
  }

  return c.json(
    {
      error: {
        code: "PROCESSING_FAILURE",
        message: "요청 처리 중 오류가 발생했습니다.",
      },
    },
    502,
  );
});
