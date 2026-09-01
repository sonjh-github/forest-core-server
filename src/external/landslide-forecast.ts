export interface LandslideForecastRecord {
  predictedAt: string;
  district: string;
  forecast: string;
}

interface SafetyDataResponse {
  header?: {
    resultMsg?: string | null;
    resultCode?: string | null;
    errorMsg?: string | null;
  };
  numOfRows?: number;
  pageNo?: number;
  totalCount?: number;
  body?: Array<{
    PREDC_ANLS_DT?: string;
    SGG_NM?: string;
    LNLD_FRCST_NM?: string;
  }>;
}

export async function fetchLandslideForecast(params: {
  serviceKey: string;
  baseUrl: string;
  endpoint: string;
  pageNo?: number;
  numOfRows?: number;
  inquiryDate?: string;
}) {
  if (!params.serviceKey) {
    throw new Error("LANDSLIDE_FORECAST_SERVICE_KEY is not configured");
  }

  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    pageNo: String(params.pageNo ?? 1),
    numOfRows: String(params.numOfRows ?? 100),
    returnType: "json",
  });

  if (params.inquiryDate) {
    query.set("inqDt", params.inquiryDate);
  }

  const baseUrl = params.baseUrl.replace(/\/+$/, "");
  const endpoint = params.endpoint.startsWith("/")
    ? params.endpoint
    : `/${params.endpoint}`;

  const url = `${baseUrl}${endpoint}?${query.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "forest-back-demo/1.0",
    },
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString("utf8");

  if (!response.ok) {
    throw new Error(
      `Landslide forecast request failed: HTTP ${response.status}`
    );
  }

  let payload: SafetyDataResponse;

  try {
    payload = JSON.parse(text) as SafetyDataResponse;
  } catch {
    throw new Error("Landslide forecast API returned invalid JSON");
  }

  const resultCode = payload.header?.resultCode ?? "";
  const resultMsg = payload.header?.resultMsg ?? "";
  const errorMsg = payload.header?.errorMsg ?? "";

  if (resultCode !== "00") {
    throw new Error(
      `Landslide forecast API error: ${resultCode} ${resultMsg} ${errorMsg}`.trim()
    );
  }

  const data: LandslideForecastRecord[] = (payload.body ?? []).map((item) => ({
    predictedAt: item.PREDC_ANLS_DT ?? "",
    district: item.SGG_NM ?? "",
    forecast: item.LNLD_FRCST_NM ?? "",
  }));

  return {
    data,
    meta: {
      pageNo: payload.pageNo ?? params.pageNo ?? 1,
      numOfRows: payload.numOfRows ?? params.numOfRows ?? 100,
      totalCount: payload.totalCount ?? data.length,
      count: data.length,
      provider: "Safety Data Landslide Forecast",
    },
  };
}
