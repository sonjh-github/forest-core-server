import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`forest-core-server listening on http://${config.host}:${info.port}`);
});
