import { Hono } from "hono";
import { parseDroneTelemetry } from "./schema.js";
import { telemetryHub, type TelemetryHub } from "./hub.js";
import {
  telemetryStore,
  type StoredDroneTelemetry,
  type TelemetryStore
} from "./store.js";

import {
  memoryTelemetryPersistence,
  runtimeTelemetryPersistence,
  type TelemetryPersistence
} from "./persistence.js";
import {
  requirementKpiEngine
} from "../kpi/engine.js";
import {
  firelineAlertCoordinator
} from "../alerts/fireline-coordinator.js";

export function createTelemetryRoutes(
  store: TelemetryStore = telemetryStore,
  hub: TelemetryHub = telemetryHub,
  persistence:
    TelemetryPersistence =
      memoryTelemetryPersistence
) {
  const routes = new Hono();

  routes.post("/drone", async (c) => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({
        error: {
          code: "INVALID_REQUEST",
          message: "JSON 요청 본문이 필요합니다."
        }
      }, 400);
    }

    try {
      const telemetry =
        parseDroneTelemetry(body);

      let previous =
        store.get(
          telemetry.droneId,
        );

      if (!previous) {
        previous =
          await persistence
            .readLatest(
              telemetry.droneId,
            );
      }

      const acceptedAsLatest =
        previous == null ||
        Date.parse(
          telemetry.timestamp,
        ) >=
          Date.parse(
            previous.timestamp,
          );

      const stored =
        acceptedAsLatest
          ? store.put(
              telemetry,
            )
          : previous as
              StoredDroneTelemetry;

      if (acceptedAsLatest) {
        await persistence
          .writeLatest(
            stored,
          );

        hub.publish(stored);

        requirementKpiEngine
          .recordLocationUpdateForActiveSessions({
            assetId:
              stored.droneId,

            observedAt:
              stored.timestamp,

            receivedAt:
              stored.receivedAt
          });

        await firelineAlertCoordinator
          .handlePosition({
            assetId:
              stored.droneId,

            resourceType:
              "DRONE",

            longitude:
              stored.longitude,

            latitude:
              stored.latitude,

            observedAt:
              stored.timestamp
          });
      }

      return c.json({
        data: {
          accepted: true,
          droneId: stored.droneId,
          observedAt: stored.timestamp,
          receivedAt: stored.receivedAt,

          position: {
            latitude: stored.latitude,
            longitude: stored.longitude,
            altitude: stored.altitude,
            source: stored.positionSource
          },

          gpsQuality: {
            fixType: stored.gpsFixType,
            satellitesVisible: stored.satellitesVisible,
            hdop: stored.hdop,
            vdop: stored.vdop,
            horizontalAccuracy: stored.horizontalAccuracy,
            verticalAccuracy: stored.verticalAccuracy
          }
        }
      }, 202);
    } catch (error) {
      return c.json({
        error: {
          code: "INVALID_TELEMETRY",
          message:
            error instanceof Error
              ? error.message
              : "telemetry payload is invalid"
        }
      }, 400);
    }
  });

  routes.get("/drone/:droneId/latest", async (c) => {
    const droneId = c.req.param("droneId").trim();

    if (!droneId) {
      return c.json({
        error: {
          code: "INVALID_REQUEST",
          message: "droneId가 필요합니다."
        }
      }, 400);
    }

    let telemetry =
      store.get(droneId);

    if (!telemetry) {
      telemetry =
        await persistence
          .readLatest(
            droneId,
          );
    }

    if (!telemetry) {
      return c.json({
        error: {
          code: "TELEMETRY_NOT_FOUND",
          message: "수신된 텔레메트리가 없습니다."
        }
      }, 404);
    }

    return c.json({
      data: {
        droneId: telemetry.droneId,
        observedAt: telemetry.timestamp,
        receivedAt: telemetry.receivedAt,

        position: {
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          altitude: telemetry.altitude,
          source: telemetry.positionSource
        },

        gpsQuality: {
          fixType: telemetry.gpsFixType,
          satellitesVisible: telemetry.satellitesVisible,
          hdop: telemetry.hdop,
          vdop: telemetry.vdop,
          horizontalAccuracy: telemetry.horizontalAccuracy,
          verticalAccuracy: telemetry.verticalAccuracy
        }
      }
    });
  });

  return routes;
}

export const telemetryRoutes =
  createTelemetryRoutes(
    telemetryStore,
    telemetryHub,
    runtimeTelemetryPersistence
  );
