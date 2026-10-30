import {startLpwaRecoveryMonitoring} from "./dashboard/network-availability.js";
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { app } from "./app.js";
import { config } from "./config.js";

// 운영 SQLite가 큰 경우 자동 복구 감시의 동기 조회가 HTTP 처리를 막을 수 있다.
// 현장 성능 검증 환경에서만 명시적으로 활성화한다.
if(config.dbMode==="sqlite" && process.env.LPWA_RECOVERY_MONITORING_ENABLED==="true") {
  startLpwaRecoveryMonitoring();
}

const wss = new WebSocketServer({
  noServer: true
});

serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
    websocket: {
      server: wss
    }
  },
  (info) => {
    console.log(
      `forest-core-server listening on http://${config.host}:${info.port}`
    );
  }
);
