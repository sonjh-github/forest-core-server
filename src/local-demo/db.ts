import {
  randomUUID,
} from "node:crypto";

import {
  mkdirSync,
} from "node:fs";

import {
  dirname,
  resolve,
} from "node:path";

import {
  DatabaseSync,
} from "node:sqlite";

import {
  config,
} from "../config.js";

import type {
  VendorIntegrationMessageRow,
} from "../db/vendor-messages.js";

import type {
  ExternalVendor,
  MappingResult,
} from "../types.js";

import type {
  StoredDroneTelemetry,
} from "../telemetry/store.js";


export const DEMO_UAV_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const DEMO_SLENO_ID =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const DEMO_EVENT_ID =
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

export const DEMO_UAV_TYPE_ID =
  "11111111-1111-4111-8111-111111111111";

export const DEMO_TERMINAL_TYPE_ID =
  "22222222-2222-4222-8222-222222222222";

type Row =
  Record<string, unknown>;

let database:
  DatabaseSync | null =
  null;

export class LocalDbError
  extends Error {
  constructor(
    public code: string,
    message: string,
    public status:
      | 400
      | 404
      | 409 = 400,
  ) {
    super(message);
  }
}

function jsonObject(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value !== "string"
  ) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(value);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }

  return {};
}

function optionalText(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return String(value)
    .trim() || null;
}

function requiredText(
  value: unknown,
  name: string,
): string {
  const result =
    optionalText(value);

  if (!result) {
    throw new LocalDbError(
      "INVALID_REQUEST",
      `${name}는 필수입니다.`,
    );
  }

  return result;
}

function sqliteFile():
  string {
  if (
    config.sqlitePath ===
    ":memory:"
  ) {
    return ":memory:";
  }

  const path =
    resolve(
      config.sqlitePath,
    );

  mkdirSync(
    dirname(path),
    {
      recursive: true,
    },
  );

  return path;
}

function initSchema(
  db: DatabaseSync,
) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS asset_type (
      asset_type_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS asset (
      asset_id TEXT PRIMARY KEY,
      asset_type_id TEXT NOT NULL,
      asset_code TEXT NOT NULL UNIQUE,
      asset_name TEXT,
      status TEXT NOT NULL,
      product_name TEXT,
      model_name TEXT,
      specifications_json TEXT NOT NULL DEFAULT '{}',
      vendor_code TEXT,
      vendor_device_id TEXT,
      device_type TEXT,
      mapping_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(asset_type_id)
        REFERENCES asset_type(asset_type_id)
    );

    CREATE TABLE IF NOT EXISTS disaster_event (
      event_id TEXT PRIMARY KEY,
      event_code TEXT NOT NULL,
      event_name TEXT NOT NULL,
      disaster_type TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_resource (
      event_resource_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      assigned_org_code TEXT,
      mission TEXT,
      assigned_at TEXT,
      released_at TEXT,
      UNIQUE(event_id, asset_id),
      FOREIGN KEY(event_id)
        REFERENCES disaster_event(event_id),
      FOREIGN KEY(asset_id)
        REFERENCES asset(asset_id)
    );

    CREATE TABLE IF NOT EXISTS vendor_message (
      request_id TEXT PRIMARY KEY,
      vendor_code TEXT NOT NULL,
      event_external_id TEXT,
      payload_type TEXT,
      source_device_id TEXT,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS
      idx_vendor_message_device_received
    ON vendor_message(
      source_device_id,
      received_at DESC
    );

    CREATE TABLE IF NOT EXISTS drone_telemetry (
      telemetry_id INTEGER PRIMARY KEY AUTOINCREMENT,
      drone_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS
      idx_drone_telemetry_latest
    ON drone_telemetry(
      drone_id,
      observed_at DESC,
      received_at DESC
    );
  `);
}

function seed(
  db: DatabaseSync,
) {
  const now =
    new Date();

  const nowIso =
    now.toISOString();

  const typeInsert =
    db.prepare(`
      INSERT OR IGNORE INTO asset_type (
        asset_type_id,
        name,
        description,
        enabled
      )
      VALUES (?, ?, ?, 1)
    `);

  typeInsert.run(
    DEMO_UAV_TYPE_ID,
    "UAV",
    "Local SQLite demo UAV",
  );

  typeInsert.run(
    DEMO_TERMINAL_TYPE_ID,
    "RTK_TERMINAL",
    "Local SQLite demo communication terminal",
  );

  const assetInsert =
    db.prepare(`
      INSERT OR IGNORE INTO asset (
        asset_id,
        asset_type_id,
        asset_code,
        asset_name,
        status,
        product_name,
        model_name,
        specifications_json,
        vendor_code,
        vendor_device_id,
        device_type,
        mapping_status,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

  assetInsert.run(
    DEMO_UAV_ID,
    DEMO_UAV_TYPE_ID,
    "LOCAL-UAV-001",
    "로컬 데모 드론",
    "ACTIVE",
    "Mission Planner UAV",
    "DEMO-UAV",
    JSON.stringify({
      synthetic: true,
      evidenceScope:
        "LOCAL_SQLITE_DEMO",
    }),
    "NDPS",
    "SIM-LOCAL-UAV-001",
    "UAV",
    "ACTIVE",
    nowIso,
    nowIso,
  );

  assetInsert.run(
    DEMO_SLENO_ID,
    DEMO_TERMINAL_TYPE_ID,
    "LOCAL-SLENO-001",
    "로컬 데모 Sleno 단말",
    "ACTIVE",
    "Sleno",
    "LOCAL-DEMO",
    JSON.stringify({
      synthetic: true,
      evidenceScope:
        "LOCAL_SQLITE_DEMO",
    }),
    "JININFRA",
    "SIM-LOCAL-SLENO-001",
    "RTK_TERMINAL",
    "ACTIVE",
    nowIso,
    nowIso,
  );

  db.prepare(`
    INSERT OR IGNORE INTO disaster_event (
      event_id,
      event_code,
      event_name,
      disaster_type,
      status
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    DEMO_EVENT_ID,
    "LOCAL-WF-001",
    "로컬 SQLite 산불 데모",
    "WILDFIRE",
    "ACTIVE",
  );

  const resourceInsert =
    db.prepare(`
      INSERT OR IGNORE INTO event_resource (
        event_resource_id,
        event_id,
        asset_id,
        assigned_org_code,
        mission,
        assigned_at,
        released_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `);

  resourceInsert.run(
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    DEMO_EVENT_ID,
    DEMO_UAV_ID,
    "LOCAL",
    "산불 현장 정찰",
    nowIso,
  );

  resourceInsert.run(
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
    DEMO_EVENT_ID,
    DEMO_SLENO_ID,
    "LOCAL",
    "현장 통신 품질 측정",
    nowIso,
  );

  /*
   * 재실행 시 freshness가 과거 값으로 굳지 않도록
   * 데모 통신 표본은 새 시각으로 다시 생성한다.
   */
  db.prepare(`
    DELETE FROM vendor_message
    WHERE request_id
      LIKE 'local-sleno-%'
  `).run();

  const messageInsert =
    db.prepare(`
      INSERT INTO vendor_message (
        request_id,
        vendor_code,
        event_external_id,
        payload_type,
        source_device_id,
        occurred_at,
        received_at,
        status,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

  const counters =
    [10, 11, 14, 14, 3, 4];

  counters.forEach(
    (
      frameCounter,
      index,
    ) => {
      const timestamp =
        new Date(
          now.getTime() -
          (
            counters.length -
            index -
            1
          ) * 1000,
        ).toISOString();

      const payload = {
        context: {
          sourceSystem:
            "sleno-server",

          sourceDeviceId:
            DEMO_SLENO_ID,

          occurredAt:
            timestamp,

          synthetic: true,

          evidenceScope:
            "LOCAL_SQLITE_DEMO",
        },

        data: {
          frameCounter,

          networkType:
            "5G",

          fixType:
            "RTK_FIXED",
        },

        activePath: [
          {
            medium:
              "5G",

            observations: [
              {
                selected:
                  true,

                receivedAt:
                  timestamp,

                rssiDbm:
                  -70 + index,

                snrDb:
                  10 + index,
              },
            ],
          },
        ],
      };

      messageInsert.run(
        `local-sleno-${index + 1}`,
        "JININFRA",
        "LOCAL-DEMO",
        "NETWORK_QUALITY",
        DEMO_SLENO_ID,
        timestamp,
        timestamp,
        "PERSISTED",
        JSON.stringify(payload),
      );
    },
  );
}

export function localDb():
  DatabaseSync {
  if (database) {
    return database;
  }

  database =
    new DatabaseSync(
      sqliteFile(),
    );

  initSchema(database);

  if (
    config.sqliteSeedDemo
  ) {
    seed(database);
  }

  return database;
}

export function insertDroneTelemetry(
  value: StoredDroneTelemetry,
): StoredDroneTelemetry {
  localDb()
    .prepare(`
      INSERT INTO drone_telemetry (
        drone_id,
        observed_at,
        received_at,
        payload_json
      )
      VALUES (?, ?, ?, ?)
    `)
    .run(
      value.droneId,
      value.timestamp,
      value.receivedAt,
      JSON.stringify(value),
    );

  return value;
}

export function readLatestDroneTelemetry(
  droneId: string,
): StoredDroneTelemetry | null {
  const row =
    localDb()
      .prepare(`
        SELECT
          drone_id,
          observed_at,
          received_at,
          payload_json
        FROM drone_telemetry
        WHERE drone_id = ?
        ORDER BY
          julianday(observed_at) DESC,
          julianday(received_at) DESC,
          telemetry_id DESC
        LIMIT 1
      `)
      .get(droneId) as
      | Row
      | undefined;

  if (!row) {
    return null;
  }

  let payload:
    Record<string, unknown> = {};

  if (
    typeof row.payload_json ===
    "string"
  ) {
    try {
      const parsed =
        JSON.parse(
          row.payload_json,
        );

      if (
        parsed &&
        typeof parsed ===
          "object" &&
        !Array.isArray(parsed)
      ) {
        payload =
          parsed as
            Record<
              string,
              unknown
            >;
      }
    } catch {
      payload = {};
    }
  }

  return {
    ...payload,

    droneId:
      String(
        row.drone_id,
      ),

    timestamp:
      String(
        row.observed_at,
      ),

    receivedAt:
      String(
        row.received_at,
      ),
  } as StoredDroneTelemetry;
}

export function localDbHealth():
  boolean {
  localDb()
    .prepare(
      "SELECT 1 AS ok",
    )
    .get();

  return true;
}

export function listAssetTypes() {
  return (
    localDb()
      .prepare(`
        SELECT
          asset_type_id,
          name,
          description,
          enabled
        FROM asset_type
        WHERE enabled = 1
        ORDER BY name
      `)
      .all() as unknown as Row[]
  ).map(
    (row) => ({
      asset_type_id:
        String(
          row.asset_type_id,
        ),

      name:
        String(row.name),

      description:
        optionalText(
          row.description,
        ),

      enabled:
        Number(row.enabled) === 1,
    }),
  );
}

function rowToAsset(
  row: Row,
) {
  const vendorCode =
    optionalText(
      row.vendor_code,
    );

  const vendorDeviceId =
    optionalText(
      row.vendor_device_id,
    );

  const mappings =
    vendorCode &&
    vendorDeviceId
      ? [
          {
            vendor_code:
              vendorCode,

            vendor_device_id:
              vendorDeviceId,

            asset_id:
              String(
                row.asset_id,
              ),

            device_type:
              optionalText(
                row.device_type,
              ),

            status:
              optionalText(
                row.mapping_status,
              ) ?? "ACTIVE",

            first_seen_at:
              String(
                row.created_at,
              ),

            last_seen_at:
              String(
                row.updated_at,
              ),
          },
        ]
      : [];

  return {
    asset_id:
      String(row.asset_id),

    asset_code:
      String(row.asset_code),

    asset_name:
      optionalText(
        row.asset_name,
      ),

    status:
      String(row.status),

    product_name:
      optionalText(
        row.product_name,
      ),

    model_name:
      optionalText(
        row.model_name,
      ),

    specifications:
      jsonObject(
        row.specifications_json,
      ),

    created_at:
      String(row.created_at),

    updated_at:
      String(row.updated_at),

    asset_type: {
      asset_type_id:
        String(
          row.asset_type_id,
        ),

      name:
        String(
          row.asset_type_name,
        ),

      description:
        optionalText(
          row.asset_type_description,
        ),

      enabled:
        Number(
          row.asset_type_enabled,
        ) === 1,
    },

    vendor_mappings:
      mappings,
  };
}

const ASSET_SQL = `
  SELECT
    a.*,
    t.name
      AS asset_type_name,
    t.description
      AS asset_type_description,
    t.enabled
      AS asset_type_enabled
  FROM asset a
  JOIN asset_type t
    ON t.asset_type_id =
       a.asset_type_id
`;

export function listAssets(
  limit = 100,
) {
  return (
    localDb()
      .prepare(
        `${ASSET_SQL}
         ORDER BY a.created_at DESC
         LIMIT ?`,
      )
      .all(limit) as
      unknown as Row[]
  ).map(rowToAsset);
}

export function findAsset(
  assetId: string,
) {
  const row =
    localDb()
      .prepare(
        `${ASSET_SQL}
         WHERE a.asset_id = ?
         LIMIT 1`,
      )
      .get(assetId) as
      unknown as
      | Row
      | undefined;

  return row
    ? rowToAsset(row)
    : null;
}

export function createAsset(
  body:
    Record<string, unknown>,
) {
  const assetCode =
    requiredText(
      body.assetCode,
      "assetCode",
    );

  const assetTypeId =
    requiredText(
      body.assetTypeId,
      "assetTypeId",
    );

  const vendor =
    requiredText(
      body.vendor,
      "vendor",
    ).toUpperCase();

  if (
    vendor !== "NDPS" &&
    vendor !== "JININFRA"
  ) {
    throw new LocalDbError(
      "INVALID_VENDOR",
      "vendor는 NDPS 또는 JININFRA여야 합니다.",
    );
  }

  const vendorDeviceId =
    requiredText(
      body.vendorDeviceId,
      "vendorDeviceId",
    );

  const deviceType =
    requiredText(
      body.deviceType,
      "deviceType",
    );

  const type =
    localDb()
      .prepare(`
        SELECT asset_type_id
        FROM asset_type
        WHERE asset_type_id = ?
          AND enabled = 1
      `)
      .get(assetTypeId);

  if (!type) {
    throw new LocalDbError(
      "ASSET_TYPE_NOT_FOUND",
      "활성화된 장비 유형을 찾을 수 없습니다.",
      404,
    );
  }

  const assetId =
    randomUUID();

  const now =
    new Date()
      .toISOString();

  try {
    localDb()
      .prepare(`
        INSERT INTO asset (
          asset_id,
          asset_type_id,
          asset_code,
          asset_name,
          status,
          product_name,
          model_name,
          specifications_json,
          vendor_code,
          vendor_device_id,
          device_type,
          mapping_status,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `)
      .run(
        assetId,
        assetTypeId,
        assetCode,
        optionalText(
          body.assetName,
        ),
        optionalText(
          body.status,
        ) ?? "READY",
        optionalText(
          body.productName,
        ),
        optionalText(
          body.modelName,
        ),
        JSON.stringify(
          body.specifications &&
          typeof body.specifications ===
            "object" &&
          !Array.isArray(
            body.specifications,
          )
            ? body.specifications
            : {},
        ),
        vendor,
        vendorDeviceId,
        deviceType,
        optionalText(
          body.mappingStatus,
        ) ?? "ACTIVE",
        now,
        now,
      );
  } catch (error) {
    throw new LocalDbError(
      "LOCAL_DB_CONFLICT",
      error instanceof Error
        ? error.message
        : String(error),
      409,
    );
  }

  return findAsset(assetId);
}

export function updateMapping(
  assetId: string,
  body:
    Record<string, unknown>,
) {
  if (!findAsset(assetId)) {
    throw new LocalDbError(
      "ASSET_NOT_FOUND",
      "물리 장비를 찾을 수 없습니다.",
      404,
    );
  }

  const vendor =
    requiredText(
      body.vendor,
      "vendor",
    ).toUpperCase();

  const vendorDeviceId =
    requiredText(
      body.vendorDeviceId,
      "vendorDeviceId",
    );

  const deviceType =
    requiredText(
      body.deviceType,
      "deviceType",
    );

  const status =
    optionalText(
      body.status,
    ) ?? "ACTIVE";

  const now =
    new Date()
      .toISOString();

  localDb()
    .prepare(`
      UPDATE asset
      SET
        vendor_code = ?,
        vendor_device_id = ?,
        device_type = ?,
        mapping_status = ?,
        updated_at = ?
      WHERE asset_id = ?
    `)
    .run(
      vendor,
      vendorDeviceId,
      deviceType,
      status,
      now,
      assetId,
    );

  return (
    findAsset(assetId)
      ?.vendor_mappings[0] ??
    null
  );
}

export function assetLogs(
  assetId: string,
  limit: number,
) {
  if (!findAsset(assetId)) {
    throw new LocalDbError(
      "ASSET_NOT_FOUND",
      "물리 장비를 찾을 수 없습니다.",
      404,
    );
  }

  const rows =
    localDb()
      .prepare(`
        SELECT *
        FROM vendor_message
        WHERE source_device_id = ?
        ORDER BY received_at DESC
        LIMIT ?
      `)
      .all(
        assetId,
        limit + 1,
      ) as unknown as Row[];

  const hasMore =
    rows.length > limit;

  const selected =
    hasMore
      ? rows.slice(0, limit)
      : rows;

  const logs =
    selected.map(
      (row) => ({
        request_id:
          String(
            row.request_id,
          ),

        vendor_code:
          String(
            row.vendor_code,
          ),

        event_external_id:
          optionalText(
            row.event_external_id,
          ),

        payload_type:
          optionalText(
            row.payload_type,
          ),

        delivery_mode:
          "LOCAL_SQLITE",

        source_device_id:
          optionalText(
            row.source_device_id,
          ),

        reported_by_device_id:
          optionalText(
            row.source_device_id,
          ),

        occurred_at:
          String(
            row.occurred_at,
          ),

        received_at:
          String(
            row.received_at,
          ),

        status:
          String(row.status),

        payload:
          jsonObject(
            row.payload_json,
          ),
      }),
    );

  return {
    assetId,
    logs,

    page: {
      limit,
      hasMore,

      nextCursor:
        hasMore
          ? logs.at(-1)
              ?.received_at ??
            null
          : null,
    },
  };
}

export function disasterAssets(
  eventId: string,
) {
  const disaster =
    localDb()
      .prepare(`
        SELECT *
        FROM disaster_event
        WHERE event_id = ?
      `)
      .get(eventId) as
      unknown as
      | Row
      | undefined;

  if (!disaster) {
    return null;
  }

  const assignments =
    localDb()
      .prepare(`
        SELECT *
        FROM event_resource
        WHERE event_id = ?
        ORDER BY assigned_at
      `)
      .all(eventId) as
      unknown as Row[];

  const assets =
    assignments
      .map(
        (row) => {
          const asset =
            findAsset(
              String(
                row.asset_id,
              ),
            );

          if (!asset) {
            return null;
          }

          return {
            assignment: {
              event_resource_id:
                String(
                  row.event_resource_id,
                ),

              event_id:
                String(
                  row.event_id,
                ),

              asset_id:
                String(
                  row.asset_id,
                ),

              assigned_org_code:
                optionalText(
                  row.assigned_org_code,
                ),

              mission:
                optionalText(
                  row.mission,
                ),

              assigned_at:
                optionalText(
                  row.assigned_at,
                ),

              released_at:
                optionalText(
                  row.released_at,
                ),
            },

            asset,
          };
        },
      )
      .filter(
        (
          value,
        ): value is
          NonNullable<
            typeof value
          > =>
          value !== null,
      );

  return {
    disaster: {
      disasterId:
        String(
          disaster.event_id,
        ),

      disasterCode:
        String(
          disaster.event_code,
        ),

      disasterName:
        String(
          disaster.event_name,
        ),

      disasterType:
        String(
          disaster.disaster_type,
        ),

      status:
        String(
          disaster.status,
        ),
    },

    assets,

    assetCount:
      assets.length,
  };
}

export function slenoMessages(
  limit: number,
): VendorIntegrationMessageRow[] {
  const rows =
    localDb()
      .prepare(`
        SELECT *
        FROM vendor_message
        WHERE vendor_code = 'JININFRA'
          AND status = 'PERSISTED'
        ORDER BY occurred_at DESC
        LIMIT ?
      `)
      .all(limit) as
      unknown as Row[];

  return rows.map(
    (row) => ({
      request_id:
        String(
          row.request_id,
        ),

      event_external_id:
        optionalText(
          row.event_external_id,
        ),

      payload_type:
        optionalText(
          row.payload_type,
        ),

      source_device_id:
        optionalText(
          row.source_device_id,
        ),

      occurred_at:
        String(
          row.occurred_at,
        ),

      status:
        String(row.status),

      payload:
        jsonObject(
          row.payload_json,
        ),
    }),
  );
}

export function slenoIdentities() {
  const rows =
    localDb()
      .prepare(`
        SELECT
          asset_id,
          asset_code,
          asset_name,
          vendor_device_id,
          device_type
        FROM asset
        WHERE vendor_code =
          'JININFRA'
      `)
      .all() as
      unknown as Row[];

  return rows.map(
    (row) => ({
      assetId:
        String(
          row.asset_id,
        ),

      assetCode:
        optionalText(
          row.asset_code,
        ),

      assetName:
        optionalText(
          row.asset_name,
        ),

      vendorDeviceId:
        optionalText(
          row.vendor_device_id,
        ),

      deviceType:
        optionalText(
          row.device_type,
        ),
    }),
  );
}


export function resolveLocalAssetMappings(
  vendor: ExternalVendor,
  deviceIds: string[],
  deviceTypes: Record<string, string> = {},
): MappingResult[] {
  const uniqueIds =
    [...new Set(
      deviceIds.filter(Boolean),
    )];

  return uniqueIds.map(
    (vendorDeviceId): MappingResult => {
      const row =
        localDb()
          .prepare(`
            SELECT
              asset_id,
              mapping_status
            FROM asset
            WHERE vendor_code = ?
              AND vendor_device_id = ?
            LIMIT 1
          `)
          .get(
            vendor,
            vendorDeviceId,
          ) as unknown as
          | Row
          | undefined;

      if (row) {
        const rawStatus =
          optionalText(
            row.mapping_status,
          );

        const mappingStatus:
          MappingResult["mappingStatus"] =
            rawStatus === "PENDING" ||
            rawStatus === "SUSPENDED"
              ? rawStatus
              : "ACTIVE";

        return {
          vendorDeviceId,
          assetId:
            String(row.asset_id),
          mapped: true,
          assetExists: true,
          mappingStatus,
        };
      }

      /*
       * 기존 Supabase 구현과 동일하게
       * vendorDeviceId와 asset_code가 같은 경우
       * 자동으로 mapping을 연결한다.
       */
      const asset =
        localDb()
          .prepare(`
            SELECT asset_id
            FROM asset
            WHERE asset_code = ?
            LIMIT 1
          `)
          .get(
            vendorDeviceId,
          ) as unknown as
          | Row
          | undefined;

      if (asset) {
        const assetId =
          String(asset.asset_id);

        localDb()
          .prepare(`
            UPDATE asset
            SET
              vendor_code = ?,
              vendor_device_id = ?,
              device_type = ?,
              mapping_status = 'ACTIVE',
              updated_at = ?
            WHERE asset_id = ?
          `)
          .run(
            vendor,
            vendorDeviceId,
            deviceTypes[
              vendorDeviceId
            ] ?? "OTHER",
            new Date()
              .toISOString(),
            assetId,
          );

        return {
          vendorDeviceId,
          assetId,
          mapped: true,
          assetExists: true,
          mappingStatus:
            "ACTIVE",
        };
      }

      return {
        vendorDeviceId,
        assetId: null,
        mapped: false,
        assetExists: false,
        mappingStatus:
          "UNMAPPED",
      };
    },
  );
}

export function findLocalVendorMessage(
  requestId: string,
) {
  const row =
    localDb()
      .prepare(`
        SELECT
          request_id,
          vendor_code
        FROM vendor_message
        WHERE request_id = ?
        LIMIT 1
      `)
      .get(
        requestId,
      ) as unknown as
      | Row
      | undefined;

  if (!row) {
    return null;
  }

  return {
    request_id:
      String(row.request_id),

    vendor_code:
      String(row.vendor_code),
  };
}

export function insertLocalVendorMessage(
  row: Record<string, unknown>,
) {
  const requestId =
    requiredText(
      row.request_id,
      "request_id",
    );

  const vendorCode =
    requiredText(
      row.vendor_code,
      "vendor_code",
    );

  const occurredAt =
    requiredText(
      row.occurred_at,
      "occurred_at",
    );

  const payload =
    row.payload &&
    typeof row.payload === "object" &&
    !Array.isArray(row.payload)
      ? row.payload
      : {};

  localDb()
    .prepare(`
      INSERT INTO vendor_message (
        request_id,
        vendor_code,
        event_external_id,
        payload_type,
        source_device_id,
        occurred_at,
        received_at,
        status,
        payload_json
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    .run(
      requestId,
      vendorCode,
      optionalText(
        row.event_external_id,
      ),
      optionalText(
        row.payload_type,
      ),
      optionalText(
        row.source_device_id,
      ),
      occurredAt,
      new Date()
        .toISOString(),
      optionalText(
        row.status,
      ) ?? "PERSISTED",
      JSON.stringify(payload),
    );
}

export function listLocalVendorMessages(
  vendorCode: string,
  limit = 1000,
  payloadType?: string,
): VendorIntegrationMessageRow[] {
  const safeLimit =
    Number.isInteger(limit)
      ? Math.min(
          Math.max(limit, 1),
          2000,
        )
      : 1000;

  const rows =
    payloadType
      ? localDb()
          .prepare(`
            SELECT *
            FROM vendor_message
            WHERE vendor_code = ?
              AND status = 'PERSISTED'
              AND payload_type = ?
            ORDER BY occurred_at DESC
            LIMIT ?
          `)
          .all(
            vendorCode,
            payloadType,
            safeLimit,
          )
      : localDb()
          .prepare(`
            SELECT *
            FROM vendor_message
            WHERE vendor_code = ?
              AND status = 'PERSISTED'
            ORDER BY occurred_at DESC
            LIMIT ?
          `)
          .all(
            vendorCode,
            safeLimit,
          );

  return (
    rows as unknown as Row[]
  ).map(
    (item) => ({
      request_id:
        String(
          item.request_id,
        ),

      event_external_id:
        optionalText(
          item.event_external_id,
        ),

      payload_type:
        optionalText(
          item.payload_type,
        ),

      source_device_id:
        optionalText(
          item.source_device_id,
        ),

      occurred_at:
        String(
          item.occurred_at,
        ),

      status:
        String(item.status),

      payload:
        jsonObject(
          item.payload_json,
        ),
    }),
  );
}
