import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";

const { classifyDeviceError } = await import("../src/device/routes.js");

test("SQLite storage error is classified as STORAGE_FAILED", () => {
  const result = classifyDeviceError(
    Object.assign(new Error("database locked"), { code: "SQLITE_BUSY" }),
    "INVOKE"
  );
  assert.deepEqual(result, {
    status: "STORAGE_FAILED",
    errorType: "SQLITE_BUSY",
  });
});

test("unexpected processing error is classified as PROCESSING_FAILED", () => {
  const result = classifyDeviceError(new Error("unexpected processing failure"), "INVOKE");
  assert.deepEqual(result, {
    status: "PROCESSING_FAILED",
    errorType: "UNCLASSIFIED_ERROR",
  });
});

test("malformed JSON is classified as REJECTED", () => {
  const result = classifyDeviceError(new SyntaxError("invalid JSON"), "PARSE");
  assert.deepEqual(result, {
    status: "REJECTED",
    errorType: "INVALID_JSON",
  });
});
