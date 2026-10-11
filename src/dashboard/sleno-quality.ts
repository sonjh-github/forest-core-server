import type {
  VendorIntegrationMessageRow
} from "../db/vendor-messages.js";

type JsonRecord =
  Record<string, unknown>;

type AssetIdentity = {
  assetId: string;
  assetCode: string | null;
  assetName: string | null;
  vendorDeviceId: string | null;
  deviceType: string | null;
};

type SlenoSample = {
  requestId: string;
  assetId: string;
  observedAt: string;

  frameCounter: number | null;

  rssiDbm: number | null;
  snrDb: number | null;

  networkType: string | null;
  fixType: string | null;
  medium: string | null;
};

export type SlenoDeviceQuality = {
  assetId: string;

  assetCode: string | null;
  assetName: string | null;

  vendorDeviceId: string | null;
  deviceType: string | null;

  isSimulatedDevice: boolean;
  isRegisteredDevice: boolean;

  sampleCount: number;
  counterSampleCount: number;

  latestFrameCounter: number | null;

  receivedFrames: number;
  expectedFrames: number;
  lostFrames: number;

  duplicateFrames: number;
  counterResets: number;

  frameLossPct: number | null;
  frameDeliveryPct: number | null;

  updateIntervalAvgMs: number | null;
  updateIntervalP95Ms: number | null;
  updateIntervalMaxMs: number | null;

  latestRssiDbm: number | null;
  averageRssiDbm: number | null;
  minimumRssiDbm: number | null;
  maximumRssiDbm: number | null;

  latestSnrDb: number | null;
  averageSnrDb: number | null;
  minimumSnrDb: number | null;
  maximumSnrDb: number | null;

  networkType: string | null;
  fixType: string | null;
  medium: string | null;

  lastReceivedAt: string | null;
  freshnessSec: number | null;

  state:
    | "LIVE"
    | "STALE"
    | "OFFLINE"
    | "WAITING";
};

export type SlenoNetworkQuality = {
  source: "JININFRA_VENDOR_MESSAGE";
  sourceSystem: "sleno-server";
  synthetic: false;

  calculatedAt: string;

  deviceCount: number;
  physicalDeviceCount: number;
  simulatedDeviceCount: number;
  unregisteredDeviceCount: number;

  liveCount: number;
  staleCount: number;
  offlineCount: number;

  totalReceivedFrames: number;
  totalExpectedFrames: number;
  totalLostFrames: number;

  frameLossPct: number | null;
  frameDeliveryPct: number | null;

  devices: SlenoDeviceQuality[];
};

function objectValue(
  value: unknown
): JsonRecord {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function textValue(
  value: unknown
): string | null {
  if (
    value == null ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

function numberValue(
  value: unknown
): number | null {
  if (
    value == null ||
    value === "" ||
    value === "TBD"
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function average(
  values: number[]
): number | null {
  if (!values.length) {
    return null;
  }

  return Number(
    (
      values.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / values.length
    ).toFixed(3)
  );
}

function percentile95(
  values: number[]
): number | null {
  if (!values.length) {
    return null;
  }

  const sorted =
    [...values].sort(
      (a, b) => a - b
    );

  const index =
    Math.min(
      sorted.length - 1,
      Math.max(
        0,
        Math.ceil(
          sorted.length * 0.95
        ) - 1
      )
    );

  return sorted[index] ?? null;
}

function roundPct(
  numerator: number,
  denominator: number
): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Number(
    (
      numerator /
      denominator *
      100
    ).toFixed(3)
  );
}

function latestSelectedObservation(
  payload: JsonRecord
): JsonRecord {
  const path =
    Array.isArray(payload.activePath)
      ? payload.activePath
      : [];

  const observations:
    JsonRecord[] = [];

  for (const rawHop of path) {
    const hop =
      objectValue(rawHop);

    const rows =
      Array.isArray(
        hop.observations
      )
        ? hop.observations
        : [];

    for (const row of rows) {
      const observation =
        objectValue(row);

      observations.push(
        observation
      );
    }
  }

  return (
    observations.find(
      (row) =>
        row.selected === true
    ) ??
    observations[0] ??
    {}
  );
}

function rowToSample(
  row:
    VendorIntegrationMessageRow
): SlenoSample | null {
  const payload =
    objectValue(row.payload);

  const context =
    objectValue(
      payload.context
    );

  if (
    context.sourceSystem !==
    "sleno-server"
  ) {
    return null;
  }

  const data =
    objectValue(payload.data);

  const observation =
    latestSelectedObservation(
      payload
    );

  const assetId =
    textValue(
      row.source_device_id ??
      context.sourceDeviceId
    );

  if (!assetId) {
    return null;
  }

  const observedAt =
    textValue(
      observation.receivedAt ??
      context.occurredAt ??
      row.occurred_at
    );

  if (!observedAt) {
    return null;
  }

  const firstPath =
    Array.isArray(
      payload.activePath
    )
      ? objectValue(
          payload.activePath[0]
        )
      : {};

  return {
    requestId:
      row.request_id,

    assetId,
    observedAt,

    frameCounter:
      numberValue(
        data.frameCounter
      ),

    rssiDbm:
      numberValue(
        observation.rssiDbm
      ),

    snrDb:
      numberValue(
        observation.snrDb
      ),

    networkType:
      textValue(
        data.networkType
      ),

    fixType:
      textValue(
        data.fixType
      ),

    medium:
      textValue(
        firstPath.medium
      )
  };
}

function deviceQuality(
  assetId: string,
  rows: SlenoSample[],
  identity:
    AssetIdentity | undefined,
  nowMs: number
): SlenoDeviceQuality {
  const ordered =
    [...rows].sort(
      (a, b) =>
        Date.parse(a.observedAt) -
        Date.parse(b.observedAt)
    );

  const counters =
    ordered.filter(
      (row) =>
        row.frameCounter != null
    );

  let receivedFrames = 0;
  let expectedFrames = 0;
  let lostFrames = 0;

  let duplicateFrames = 0;
  let counterResets = 0;

  let previous:
    number | null = null;

  for (const row of counters) {
    const current =
      row.frameCounter;

    if (current == null) {
      continue;
    }

    if (previous == null) {
      receivedFrames += 1;
      expectedFrames += 1;
      previous = current;
      continue;
    }

    const delta =
      current - previous;

    if (delta > 0) {
      receivedFrames += 1;
      expectedFrames += delta;

      if (delta > 1) {
        lostFrames +=
          delta - 1;
      }

      previous = current;
      continue;
    }

    if (delta === 0) {
      duplicateFrames += 1;
      continue;
    }

    /*
     * frameCounter 감소는
     * 유실로 계산하지 않고
     * 장비 재시작/세션 재진입으로
     * 별도 집계한다.
     */
    counterResets += 1;
    receivedFrames += 1;
    expectedFrames += 1;
    previous = current;
  }

  /*
   * TC-02 위치정보 갱신주기는
   * 동일 frameCounter 재전송을
   * 새로운 위치 갱신으로 계산하지 않는다.
   *
   * frameCounter가 제공되는 Sleno RTK는
   * counter 변화 시점만 실제 신규 frame으로
   * 간주한다.
   */
  const intervalRows:
    SlenoSample[] = [];

  let previousIntervalCounter:
    number | null | undefined =
      undefined;

  for (const row of ordered) {
    if (row.frameCounter == null) {
      /*
       * counter 자체가 없는 데이터셋은
       * 기존 observedAt 기반 계산을 유지한다.
       */
      if (counters.length === 0) {
        intervalRows.push(row);
      }

      continue;
    }

    if (
      previousIntervalCounter ===
        undefined ||
      row.frameCounter !==
        previousIntervalCounter
    ) {
      intervalRows.push(row);

      previousIntervalCounter =
        row.frameCounter;
    }
  }

  const intervals: number[] =
    [];

  for (
    let index = 1;
    index < intervalRows.length;
    index += 1
  ) {
    const previousAt =
      Date.parse(
        intervalRows[index - 1]
          ?.observedAt ?? ""
      );

    const currentAt =
      Date.parse(
        intervalRows[index]
          ?.observedAt ?? ""
      );

    const interval =
      currentAt - previousAt;

    if (
      Number.isFinite(interval) &&
      interval > 0
    ) {
      intervals.push(interval);
    }
  }

  const rssiValues =
    ordered
      .map(
        (row) =>
          row.rssiDbm
      )
      .filter(
        (
          value
        ): value is number =>
          value != null
      );

  const snrValues =
    ordered
      .map(
        (row) =>
          row.snrDb
      )
      .filter(
        (
          value
        ): value is number =>
          value != null
      );

  const latest =
    ordered[
      ordered.length - 1
    ];

  const lastReceivedAt =
    latest?.observedAt ??
    null;

  const freshnessSec =
    lastReceivedAt
      ? Math.max(
          0,
          Math.floor(
            (
              nowMs -
              Date.parse(
                lastReceivedAt
              )
            ) / 1000
          )
        )
      : null;

  const state:
    SlenoDeviceQuality["state"] =
      freshnessSec == null
        ? "WAITING"
        : freshnessSec <= 10
          ? "LIVE"
          : freshnessSec <= 60
            ? "STALE"
            : "OFFLINE";

  const vendorDeviceId =
    identity?.vendorDeviceId ??
    null;

  return {
    assetId,

    assetCode:
      identity?.assetCode ??
      null,

    assetName:
      identity?.assetName ??
      null,

    vendorDeviceId,

    deviceType:
      identity?.deviceType ??
      null,

    isSimulatedDevice:
      Boolean(
        vendorDeviceId
          ?.toUpperCase()
          .startsWith("SIM-")
      ),

    isRegisteredDevice:
      identity != null,

    sampleCount:
      ordered.length,

    counterSampleCount:
      counters.length,

    latestFrameCounter:
      latest?.frameCounter ??
      null,

    receivedFrames,
    expectedFrames,
    lostFrames,

    duplicateFrames,
    counterResets,

    frameLossPct:
      roundPct(
        lostFrames,
        expectedFrames
      ),

    frameDeliveryPct:
      roundPct(
        receivedFrames,
        expectedFrames
      ),

    updateIntervalAvgMs:
      average(intervals),

    updateIntervalP95Ms:
      percentile95(
        intervals
      ),

    updateIntervalMaxMs:
      intervals.length
        ? Math.max(
            ...intervals
          )
        : null,

    latestRssiDbm:
      latest?.rssiDbm ??
      null,

    averageRssiDbm:
      average(
        rssiValues
      ),

    minimumRssiDbm:
      rssiValues.length
        ? Math.min(
            ...rssiValues
          )
        : null,

    maximumRssiDbm:
      rssiValues.length
        ? Math.max(
            ...rssiValues
          )
        : null,

    latestSnrDb:
      latest?.snrDb ??
      null,

    averageSnrDb:
      average(
        snrValues
      ),

    minimumSnrDb:
      snrValues.length
        ? Math.min(
            ...snrValues
          )
        : null,

    maximumSnrDb:
      snrValues.length
        ? Math.max(
            ...snrValues
          )
        : null,

    networkType:
      latest?.networkType ??
      null,

    fixType:
      latest?.fixType ??
      null,

    medium:
      latest?.medium ??
      null,

    lastReceivedAt,
    freshnessSec,
    state
  };
}

export function calculateSlenoQuality(
  messageRows:
    VendorIntegrationMessageRow[],
  identities:
    AssetIdentity[] = [],
  nowMs = Date.now()
): SlenoNetworkQuality {
  const identityByAsset =
    new Map(
      identities.map(
        (row) => [
          row.assetId,
          row
        ]
      )
    );

  const grouped =
    new Map<
      string,
      SlenoSample[]
    >();

  for (const row of messageRows) {
    const sample =
      rowToSample(row);

    if (!sample) {
      continue;
    }

    const current =
      grouped.get(
        sample.assetId
      ) ?? [];

    current.push(sample);

    grouped.set(
      sample.assetId,
      current
    );
  }

  const devices =
    [...grouped.entries()]
      .map(
        ([assetId, rows]) =>
          deviceQuality(
            assetId,
            rows,
            identityByAsset.get(
              assetId
            ),
            nowMs
          )
      )
      .sort((a, b) => {
        if (
          a.isSimulatedDevice !==
          b.isSimulatedDevice
        ) {
          return a.isSimulatedDevice
            ? 1
            : -1;
        }

        return (
          Date.parse(
            b.lastReceivedAt ??
            "0"
          ) -
          Date.parse(
            a.lastReceivedAt ??
            "0"
          )
        );
      });

  const totalReceivedFrames =
    devices.reduce(
      (sum, row) =>
        sum +
        row.receivedFrames,
      0
    );

  const totalExpectedFrames =
    devices.reduce(
      (sum, row) =>
        sum +
        row.expectedFrames,
      0
    );

  const totalLostFrames =
    devices.reduce(
      (sum, row) =>
        sum +
        row.lostFrames,
      0
    );

  return {
    source:
      "JININFRA_VENDOR_MESSAGE",

    sourceSystem:
      "sleno-server",

    synthetic: false,

    calculatedAt:
      new Date(
        nowMs
      ).toISOString(),

    deviceCount:
      devices.length,

    physicalDeviceCount:
      devices.filter(
        (row) =>
          row.isRegisteredDevice &&
          !row.isSimulatedDevice
      ).length,

    simulatedDeviceCount:
      devices.filter(
        (row) =>
          row.isRegisteredDevice &&
          row.isSimulatedDevice
      ).length,

    unregisteredDeviceCount:
      devices.filter(
        (row) =>
          !row.isRegisteredDevice
      ).length,

    liveCount:
      devices.filter(
        (row) =>
          row.state === "LIVE"
      ).length,

    staleCount:
      devices.filter(
        (row) =>
          row.state === "STALE"
      ).length,

    offlineCount:
      devices.filter(
        (row) =>
          row.state === "OFFLINE"
      ).length,

    totalReceivedFrames,
    totalExpectedFrames,
    totalLostFrames,

    frameLossPct:
      roundPct(
        totalLostFrames,
        totalExpectedFrames
      ),

    frameDeliveryPct:
      roundPct(
        totalReceivedFrames,
        totalExpectedFrames
      ),

    devices
  };
}

export async function readSlenoNetworkQuality(
  limit = 1000
): Promise<SlenoNetworkQuality> {
  /*
   * DB modules are loaded only when the actual API is called.
   * calculateSlenoQuality() remains a pure function and can be
   * unit-tested without SUPABASE_URL / SUPABASE_SECRET_KEY.
   */
  const [
    vendorModule,
    registryModule
  ] = await Promise.all([
    import("../db/vendor-messages.js"),
    import("../db/asset-registry.js")
  ]);

  const {
    listVendorMessages
  } = vendorModule;

  const {
    listRegisteredAssets
  } = registryModule;

  const [
    rows,
    rawAssets
  ] = await Promise.all([
    listVendorMessages(
      "JININFRA",
      limit,
      "RTK_POSITION"
    ),

    listRegisteredAssets(200)
  ]);

  const assets =
    rawAssets as Array<{
      asset_id: string;
      asset_code?: string | null;
      asset_name?: string | null;

      vendor_mappings?: Array<{
        vendor_code: string;
        vendor_device_id: string;
        device_type: string;
        status: string;
      }>;
    }>;

  const identities:
    AssetIdentity[] = [];

  for (const asset of assets) {
    const mapping =
      asset.vendor_mappings
        ?.find(
          (row) =>
            row.vendor_code ===
              "JININFRA" &&
            row.status ===
              "ACTIVE"
        );

    identities.push({
      assetId:
        asset.asset_id,

      assetCode:
        asset.asset_code ??
        null,

      assetName:
        asset.asset_name ??
        null,

      vendorDeviceId:
        mapping
          ?.vendor_device_id ??
        null,

      deviceType:
        mapping
          ?.device_type ??
        null
    });
  }

  return calculateSlenoQuality(
    rows,
    identities
  );
}
