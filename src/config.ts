export type DatabaseMode =
  | "supabase"
  | "sqlite";

function required(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} 환경변수가 필요합니다.`,
    );
  }

  return value;
}

function numberValue(
  name: string,
  fallback: number,
): number {
  const value =
    Number.parseInt(
      process.env[name] ?? "",
      10,
    );

  return Number.isFinite(value)
    ? value
    : fallback;
}

function booleanValue(
  name: string,
  fallback: boolean,
): boolean {
  const raw =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (!raw) {
    return fallback;
  }

  if (
    ["1", "true", "yes", "on"]
      .includes(raw)
  ) {
    return true;
  }

  if (
    ["0", "false", "no", "off"]
      .includes(raw)
  ) {
    return false;
  }

  throw new Error(
    `${name}는 true 또는 false여야 합니다.`,
  );
}

function databaseMode():
  DatabaseMode {
  const value =
    process.env.DB_MODE
      ?.trim()
      .toLowerCase();

  if (!value) {
    return "supabase";
  }

  if (
    value !== "supabase" &&
    value !== "sqlite"
  ) {
    throw new Error(
      "DB_MODE는 supabase 또는 sqlite여야 합니다.",
    );
  }

  return value;
}

const dbMode =
  databaseMode();

export const config = {
  host:
    process.env.HOST?.trim() ||
    "0.0.0.0",

  port:
    numberValue(
      "PORT",
      18020,
    ),

  dbMode,

  sqlitePath:
    process.env.SQLITE_PATH
      ?.trim() ||
    "./data/forest-local-demo.sqlite",

  sqliteSeedDemo:
    booleanValue(
      "SQLITE_SEED_DEMO",
      true,
    ),

  /*
   * Supabase와 SQLite는 명시적으로 선택한다.
   * 자동 failback / failover는 하지 않는다.
   */
  supabaseUrl:
    dbMode === "supabase"
      ? required(
          "SUPABASE_URL",
        ).replace(/\/$/, "")
      : "",

  supabaseSecretKey:
    dbMode === "supabase"
      ? required(
          "SUPABASE_SECRET_KEY",
        )
      : "",

  healthSchema:
    process.env
      .SUPABASE_HEALTH_SCHEMA
      ?.trim() ||
    "core",

  healthTable:
    process.env
      .SUPABASE_HEALTH_TABLE
      ?.trim() ||
    "disaster_event",
};
