import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyExternalError,
} from "../src/external/error-classifier.js";

test("미등록 IP 오류를 접근 허용 문제로 분류한다", () => {
  assert.deepEqual(
    classifyExternalError(
      new Error("UNREGISTERED IP ERROR"),
    ),
    {
      code: "IP_NOT_ALLOWED",
      operatorMessage:
        "외부기관 서버 접근 허용(IP 등록) 확인 필요",
      retryable: false,
    },
  );
});

test("HTTP 403을 인증·권한 문제로 분류한다", () => {
  const result = classifyExternalError(
    new Error(
      "KFS wildfire risk request failed: HTTP 403",
    ),
  );

  assert.equal(
    result.code,
    "AUTHORIZATION_REQUIRED",
  );
  assert.equal(result.retryable, false);
});

test("HTTP 429를 호출 한도 문제로 분류한다", () => {
  const result = classifyExternalError(
    new Error("provider HTTP 429"),
  );

  assert.equal(result.code, "RATE_LIMITED");
  assert.equal(result.retryable, true);
});

test("외부기관 timeout을 재시도 가능 오류로 분류한다", () => {
  const result = classifyExternalError(
    new Error(
      "External provider request timed out after 8000ms",
    ),
  );

  assert.equal(result.code, "TIMEOUT");
  assert.equal(result.retryable, true);
});

test("네트워크 연결 실패를 구분한다", () => {
  const result = classifyExternalError(
    new Error("fetch failed: ECONNRESET"),
  );

  assert.equal(result.code, "NETWORK_FAILURE");
  assert.equal(result.retryable, true);
});

test("환경설정 누락을 서버 설정 문제로 분류한다", () => {
  const result = classifyExternalError(
    new Error(
      "NASA_FIRMS_MAP_KEY is not configured",
    ),
  );

  assert.equal(
    result.code,
    "CONFIGURATION_ERROR",
  );
  assert.equal(result.retryable, false);
});

test("외부기관 5xx를 공급기관 오류로 분류한다", () => {
  const result = classifyExternalError(
    new Error("provider request failed: HTTP 502"),
  );

  assert.equal(result.code, "PROVIDER_ERROR");
  assert.equal(result.retryable, true);
});

test("알 수 없는 오류는 UNKNOWN으로 처리한다", () => {
  assert.deepEqual(
    classifyExternalError(
      new Error("unexpected failure"),
    ),
    {
      code: "UNKNOWN",
      operatorMessage:
        "외부기관 연계 상태 확인 필요",
      retryable: false,
    },
  );
});
