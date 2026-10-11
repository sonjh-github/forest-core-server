import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const ASSET_ID = "28d851ae-cc22-41c9-ab3e-55bc6fe2597b";
const ASSET_TYPE_ID = "38d851ae-cc22-41c9-ab3e-55bc6fe2597b";
const ASSET_CODE = "SLENO_Lab_SingleCH";

const sourceAsset = {
  asset_id: ASSET_ID,
  asset_code: ASSET_CODE,
  asset_name: "Sleno physical RTK gateway",
  status: "ACTIVE",
  product_name: "Sleno",
  model_name: "SingleCH",
  specifications: { synthetic: false },
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  asset_type: {
    asset_type_id: ASSET_TYPE_ID,
    name: "RTK_BASE_LPWA_GATEWAY",
    description: "Physical Sleno gateway",
    enabled: true,
  },
  vendor_mappings: [{
    vendor_code: "JININFRA",
    vendor_device_id: ASSET_CODE,
    asset_id: ASSET_ID,
    device_type: "RTK_BASE_LPWA_GATEWAY",
    status: "ACTIVE",
    first_seen_at: "2026-09-01T00:00:00.000Z",
    last_seen_at: "2026-10-01T00:00:00.000Z",
  }],
};

function runNode(args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test("Sleno migration dry-run is write-free, apply is idempotent, and data survives restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sleno-migration-"));
  const target = join(directory, "forest.sqlite");
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/v1/dashboard/assets?limit=200") {
      response.end(JSON.stringify({ data: [sourceAsset] }));
      return;
    }
    if (request.url === `/api/v1/dashboard/assets/${ASSET_ID}`) {
      response.end(JSON.stringify({ data: sourceAsset }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const sourceBase = `http://127.0.0.1:${address.port}`;
  const commonArgs = [
    "--import", "tsx",
    "scripts/migrate-sleno-asset-to-sqlite.ts",
    "--source-base-url", sourceBase,
    "--asset-code", ASSET_CODE,
    "--target", target,
  ];

  const dryRun = await runNode(commonArgs);
  assert.equal(dryRun.code, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /DRY RUN ONLY/);
  assert.equal(await exists(target), false);

  const firstApply = await runNode([...commonArgs, "--apply"]);
  assert.equal(firstApply.code, 0, firstApply.stderr);

  const secondApply = await runNode([...commonArgs, "--apply"]);
  assert.equal(secondApply.code, 0, secondApply.stderr);

  const db = new DatabaseSync(target);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS count,
      MIN(asset_id) AS asset_id,
      MIN(vendor_code) AS vendor_code,
      MIN(vendor_device_id) AS vendor_device_id
    FROM asset
    WHERE asset_code = ?
  `).get(ASSET_CODE) as Record<string, unknown>;
  db.close();

  assert.equal(row.count, 1);
  assert.equal(row.asset_id, ASSET_ID);
  assert.equal(row.vendor_code, "JININFRA");
  assert.equal(row.vendor_device_id, ASSET_CODE);

  const restarted = await runNode([
    "--input-type=module",
    "--import", "tsx",
    "-e",
    `const { app } = await import('./src/app.ts'); const r = await app.request('http://localhost/api/v1/dashboard/assets/${ASSET_ID}'); console.log(r.status); console.log(await r.text());`,
  ], {
    DB_MODE: "sqlite",
    SQLITE_PATH: target,
    SQLITE_SEED_DEMO: "false",
    SUPABASE_URL: "",
    SUPABASE_SECRET_KEY: "",
  });

  assert.equal(restarted.code, 0, restarted.stderr);
  assert.match(restarted.stdout.replace(/\x1b\[[0-9;]*m/g, ''), /^200$/m);
  assert.match(restarted.stdout, new RegExp(ASSET_ID));
  assert.match(restarted.stdout, /JININFRA/);
});
