import { fetchWithTimeout } from "./fetch-with-timeout.js";

export interface LandslideHistoryRecord {
  occurredDate: string;
  x: number;
  y: number;
  serialNumber: number;
  disasterName: string;
  geometry: string;
  address: string;
  provinceCode: string;
  sigunguCode: string;
  eupMyeonDongCode: string;
}

interface SafetyDataHistoryResponse {
  header?: {
    resultMsg?: string | null;
    resultCode?: string | null;
    errorMsg?: string | null;
  };
  numOfRows?: number;
  pageNo?: number;
  totalCount?: number;
  body?: Array<{
    OCRN_YMD?: string;
    YMAP_CRTS?: number;
    STDG_SGG_CD?: string;
    STDG_EMD_CD?: string;
    STDG_CTPV_CD?: string;
    XMAP_CRTS?: number;
    SN?: number;
    DST_NM?: string;
    GEOM?: string;
    ADDR?: string;
  }>;
}

export async function fetchLandslideHistory(params: {
  serviceKey: string;
  baseUrl: string;
  endpoint: string;
  pageNo?: number;
  numOfRows?: number;
}) {
  if (!params.serviceKey) {
    throw new Error("LANDSLIDE_HISTORY_SERVICE_KEY is not configured");
  }

  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    pageNo: String(params.pageNo ?? 1),
    numOfRows: String(params.numOfRows ?? 100),
    returnType: "json",
  });

  const baseUrl = params.baseUrl.replace(/\/+$/, "");
  const endpoint = params.endpoint.startsWith("/")
    ? params.endpoint
    : `/${params.endpoint}`;

  const url = `${baseUrl}${endpoint}?${query.toString()}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "forest-back-demo/1.0",
    },
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString("utf8");

  if (!response.ok) {
    throw new Error(
      `Landslide history request failed: HTTP ${response.status}`
    );
  }

  let payload: SafetyDataHistoryResponse;

  try {
    payload = JSON.parse(text) as SafetyDataHistoryResponse;
  } catch {
    throw new Error("Landslide history API returned invalid JSON");
  }

  const resultCode = payload.header?.resultCode ?? "";
  const resultMsg = payload.header?.resultMsg ?? "";
  const errorMsg = payload.header?.errorMsg ?? "";

  if (resultCode !== "00") {
    throw new Error(
      `Landslide history API error: ${resultCode} ${resultMsg} ${errorMsg}`.trim()
    );
  }

  const data: LandslideHistoryRecord[] = (payload.body ?? []).map((item) => ({
    occurredDate: item.OCRN_YMD ?? "",
    x: item.XMAP_CRTS ?? 0,
    y: item.YMAP_CRTS ?? 0,
    serialNumber: item.SN ?? 0,
    disasterName: item.DST_NM ?? "",
    geometry: item.GEOM ?? "",
    address: item.ADDR ?? "",
    provinceCode: item.STDG_CTPV_CD ?? "",
    sigunguCode: item.STDG_SGG_CD ?? "",
    eupMyeonDongCode: item.STDG_EMD_CD ?? "",
  }));

  return {
    data,
    meta: {
      pageNo: payload.pageNo ?? params.pageNo ?? 1,
      numOfRows: payload.numOfRows ?? params.numOfRows ?? 100,
      totalCount: payload.totalCount ?? data.length,
      count: data.length,
      provider: "Safety Data Landslide History",
    },
  };
}
