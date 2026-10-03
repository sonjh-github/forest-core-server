import type {
  StoredDroneTelemetry,
} from "./store.js";

export interface TelemetryPersistence {
  readLatest(
    droneId: string,
  ): Promise<
    StoredDroneTelemetry | null
  >;

  writeLatest(
    value: StoredDroneTelemetry,
  ): Promise<
    StoredDroneTelemetry
  >;
}

export const memoryTelemetryPersistence:
  TelemetryPersistence = {
    async readLatest() {
      return null;
    },

    async writeLatest(
      value,
    ) {
      return value;
    },
  };

export const runtimeTelemetryPersistence:
  TelemetryPersistence = {
    async readLatest(
      droneId,
    ) {
      const {
        config,
      } = await import(
        "../config.js"
      );

      if (
        config.dbMode !==
        "sqlite"
      ) {
        return null;
      }

      const {
        readLatestDroneTelemetry,
      } = await import(
        "../local-demo/db.js"
      );

      return readLatestDroneTelemetry(
        droneId,
      );
    },

    async writeLatest(
      value,
    ) {
      const {
        config,
      } = await import(
        "../config.js"
      );

      if (
        config.dbMode !==
        "sqlite"
      ) {
        return value;
      }

      const {
        insertDroneTelemetry,
      } = await import(
        "../local-demo/db.js"
      );

      return insertDroneTelemetry(
        value,
      );
    },
  };
