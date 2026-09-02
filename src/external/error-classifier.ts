export type ExternalErrorCode =
  | "IP_NOT_ALLOWED"
  | "AUTHORIZATION_REQUIRED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_FAILURE"
  | "CONFIGURATION_ERROR"
  | "PROVIDER_ERROR"
  | "UNKNOWN";

export interface ExternalErrorClassification {
  code: ExternalErrorCode;
  operatorMessage: string;
  retryable: boolean;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function classifyExternalError(
  error: unknown,
): ExternalErrorClassification {
  const message = errorMessage(error);
  const normalized = message.toUpperCase();

  if (
    normalized.includes("UNREGISTERED IP") ||
    normalized.includes("등록되지 않은 IP") ||
    normalized.includes("IP NOT ALLOWED")
  ) {
    return {
      code: "IP_NOT_ALLOWED",
      operatorMessage:
        "외부기관 서버 접근 허용(IP 등록) 확인 필요",
      retryable: false,
    };
  }

  if (
    normalized.includes("HTTP 401") ||
    normalized.includes("HTTP 403") ||
    normalized.includes("UNAUTHORIZED") ||
    normalized.includes("FORBIDDEN") ||
    normalized.includes("SERVICE KEY")
  ) {
    return {
      code: "AUTHORIZATION_REQUIRED",
      operatorMessage:
        "외부기관 API 인증·권한 확인 필요",
      retryable: false,
    };
  }

  if (
    normalized.includes("HTTP 429") ||
    normalized.includes("RATE LIMIT") ||
    normalized.includes("TOO MANY REQUESTS")
  ) {
    return {
      code: "RATE_LIMITED",
      operatorMessage:
        "외부기관 호출 한도 초과 · 잠시 후 재시도 필요",
      retryable: true,
    };
  }

  if (
    normalized.includes("TIMED OUT") ||
    normalized.includes("TIMEOUT") ||
    normalized.includes("ABORTERROR")
  ) {
    return {
      code: "TIMEOUT",
      operatorMessage:
        "외부기관 응답 지연 · 잠시 후 재시도 필요",
      retryable: true,
    };
  }

  if (
    normalized.includes("FAILED TO FETCH") ||
    normalized.includes("FETCH FAILED") ||
    normalized.includes("ECONNRESET") ||
    normalized.includes("ECONNREFUSED") ||
    normalized.includes("ENOTFOUND") ||
    normalized.includes("NETWORK")
  ) {
    return {
      code: "NETWORK_FAILURE",
      operatorMessage:
        "외부기관 네트워크 연결 상태 확인 필요",
      retryable: true,
    };
  }

  if (
    normalized.includes("IS NOT CONFIGURED") ||
    normalized.includes("환경변수가 필요") ||
    normalized.includes("MISSING CONFIG")
  ) {
    return {
      code: "CONFIGURATION_ERROR",
      operatorMessage:
        "외부기관 연계 서버 설정 확인 필요",
      retryable: false,
    };
  }

  if (
    /HTTP 5\d\d/.test(normalized) ||
    normalized.includes("API ERROR") ||
    normalized.includes("INVALID JSON")
  ) {
    return {
      code: "PROVIDER_ERROR",
      operatorMessage:
        "외부기관 응답 오류 · 공급기관 상태 확인 필요",
      retryable: true,
    };
  }

  return {
    code: "UNKNOWN",
    operatorMessage:
      "외부기관 연계 상태 확인 필요",
    retryable: false,
  };
}
