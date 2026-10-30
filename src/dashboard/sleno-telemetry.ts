import { config } from "../config.js";
import { latestLocalSlenoPositions } from "../local-demo/db.js";
import {
  listVendorMessages,
  type VendorIntegrationMessageRow
} from "../db/vendor-messages.js";

import {
  readLiveSlenoRows
} from "../device/live-sleno.js";

type JsonRecord = Record<string, unknown>;
type PositioningMethod = "GNSS" | "DGPS" | "RTK" | "NO_FIX";

type VendorMessageReader = (
  vendorCode: string,
  limit?: number,
  payloadType?: string
) => Promise<VendorIntegrationMessageRow[]>;

function objectValue(value: unknown): JsonRecord {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function textValue(value: unknown): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) return null;

  return String(value);
}

function numberValue(value: unknown): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function latestSelectedObservation(
  payload: JsonRecord
): JsonRecord {
  const activePath =
    Array.isArray(payload.activePath)
      ? payload.activePath
      : [];

  const observations: JsonRecord[] = [];

  for (const rawHop of activePath) {
    const hop = objectValue(rawHop);

    const rows =
      Array.isArray(hop.observations)
        ? hop.observations
        : [];

    for (const row of rows) {
      observations.push(
        objectValue(row)
      );
    }
  }

  return (
    observations.find(
      (row) => row.selected === true
    ) ??
    observations[0] ??
    {}
  );
}

function positioningMethod(
  fixType: string | null
): PositioningMethod {
  const normalized =
    fixType?.trim().toUpperCase() ?? "";

  if (normalized === "FIX_NOT_AVAILABLE") return "NO_FIX";

  if (normalized.includes("RTK")) {
    return "RTK";
  }

  if (normalized.includes("DGPS")) {
    return "DGPS";
  }

  return "GNSS";
}

export function mapSlenoPositionRows(
  eventId: string,
  rows: VendorIntegrationMessageRow[],
  nowMs = Date.now()
) {
  const latestByAsset =
    new Map<
      string,
      Record<string, unknown>
    >();

  for (const row of rows) {
    const payload =
      objectValue(row.payload);

    const context =
      objectValue(payload.context);

    const payloadType =
      textValue(
        row.payload_type ??
        payload.payloadType
      );

    if (
      payloadType !== "RTK_POSITION" ||
      context.sourceSystem !== "sleno-server"
    ) {
      continue;
    }

    const data =
      objectValue(payload.data);

    /*
     * invokeVendor()에서 이미 실제
     * asset UUID로 normalize 된 값.
     */
    const assetId =
      textValue(
        row.source_device_id ??
        context.sourceDeviceId
      );

    const latitude =
      numberValue(data.latitude);

    const longitude =
      numberValue(data.longitude);

    const altitude =
      numberValue(data.altitude);

    const fixType =
      textValue(data.fixType);

    /*
     * Missing/invalid coordinates cannot be plotted. Nonzero No-Fix
     * coordinates remain visible as unconfirmed last-received positions.
     */
    if (
      !assetId ||
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      (
        latitude === 0 &&
        longitude === 0
      )
    ) {
      continue;
    }

    const observation =
      latestSelectedObservation(
        payload
      );

    const observedAt =
      textValue(
        observation.receivedAt ??
        context.occurredAt ??
        row.occurred_at
      );

    if (!observedAt) {
      continue;
    }

    const observedMs =
      Date.parse(observedAt);

    if (!Number.isFinite(observedMs)) {
      continue;
    }

    const firstPath =
      Array.isArray(payload.activePath)
        ? objectValue(
            payload.activePath[0]
          )
        : {};

    const freshnessSec =
      Math.max(
        0,
        Math.floor(
          (
            nowMs -
            observedMs
          ) / 1000
        )
      );

    const telemetry = {
      eventId,

      assetId,
      sourceAssetId: assetId,

      assetType:
        "RTK_TERMINAL",

      observedAt,

      receivedAt:
        row.received_at || row.occurred_at || observedAt,

      latitude,
      longitude,
      altitude,

      /*
       * 과거 좌표를 ACTIVE라고
       * 거짓 표시하지 않는다.
       */
      operationalStatus:
        freshnessSec <= 60
          ? "ACTIVE"
          : freshnessSec <= 300
            ? "STALE"
            : "OFFLINE",

      packetLossPct: null,

      positioningMethod:
        positioningMethod(
          fixType
        ),

      positionFetchStatus: fixType?.trim().toUpperCase() === "FIX_NOT_AVAILABLE"
        ? "측위 미확정 · 마지막 수신 위치"
        : freshnessSec > 60 ? "과거 관측 위치" : "최근 관측 위치",

      attributes: {
        telemetryPositionSource:
          "JININFRA_RTK_POSITION",

        sourceSystem:
          "sleno-server",

        vendor:
          "JININFRA",

        vendorEventExternalId:
          row.event_external_id,

        payloadType,

        requestId:
          row.request_id,

        /*
         * LIVE_UNPERSISTED이면 실제 수신은 됐지만
         * DB 저장 성공을 의미하지 않는다.
         */
        persistenceStatus:
          row.status,

        networkType:
          textValue(
            data.networkType
          ),

        devEui:
          textValue(
            data.devEui
          ),

        frameCounter:
          numberValue(
            data.frameCounter
          ),

        fixType,

        freshnessSec,

        pathEvidence: {
          medium:
            textValue(
              firstPath.medium
            ),

          fromAssetId:
            textValue(
              firstPath.fromDeviceId
            ),

          toAssetId:
            textValue(
              firstPath.toDeviceId
            ),

          receivedAt:
            textValue(
              observation.receivedAt
            )
        },

        linkQuality: {
          rssiDbm:
            numberValue(
              observation.rssiDbm
            ),

          snrDb:
            numberValue(
              observation.snrDb
            )
        }
      }
    };

    const current =
      latestByAsset.get(
        assetId
      );

    const currentObservedAt =
      current
        ? textValue(
            current.observedAt
          )
        : null;

    if (
      !currentObservedAt ||
      Date.parse(
        currentObservedAt
      ) < observedMs
    ) {
      latestByAsset.set(
        assetId,
        telemetry
      );
    }
  }

  return [
    ...latestByAsset.values()
  ].sort(
    (a, b) =>
      Date.parse(
        textValue(
          b.observedAt
        ) ?? "0"
      ) -
      Date.parse(
        textValue(
          a.observedAt
        ) ?? "0"
      )
  );
}

export async function readSlenoDashboardTelemetry(
  eventId: string,
  reader:
    VendorMessageReader = async (vendor, limit, payloadType) =>
      config.dbMode === "sqlite"
        ? latestLocalSlenoPositions()
        : listVendorMessages(vendor, limit, payloadType),
  nowMs = Date.now()
) {
  // The map polls persisted positions; live rows are only a fallback while
  // the first write is in flight or the database cannot be read.
  const liveRows =
    readLiveSlenoRows();

  const liveTelemetry =
    mapSlenoPositionRows(
      eventId,
      liveRows,
      nowMs
    );

  // Bound the database read so a storage fault cannot hold up the map API.
  let timer:
    ReturnType<typeof setTimeout>
    | null = null;

  try {
    const rows =
      await Promise.race([
        reader(
          "JININFRA",
          200,
          "RTK_POSITION"
        ),

        new Promise<
          VendorIntegrationMessageRow[]
        >((_, reject) => {
          timer =
            setTimeout(
              () =>
                reject(
                  new Error(
                    "SLENO_DB_READ_TIMEOUT"
                  )
                ),
              1200
            );
        })
      ]);

    if (timer) {
      clearTimeout(timer);
    }

    const persistedTelemetry = mapSlenoPositionRows(
      eventId,
      rows,
      nowMs
    );
    return persistedTelemetry.length > 0 ? persistedTelemetry : liveTelemetry;
  } catch (error) {
    if (timer) {
      clearTimeout(timer);
    }

    console.error(
      "[dashboard] Sleno telemetry read failed",
      error
    );

    return liveTelemetry;
  }
}
