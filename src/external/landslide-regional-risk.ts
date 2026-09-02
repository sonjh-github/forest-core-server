import { fetchWithTimeout } from "./fetch-with-timeout.js";

export interface LandslideRegionalRiskRecord {
  managementNumber: string;
  districtName: string;
  detailAddress: string;
  standardDistrictCode: string;

  forestClassificationCode: string;
  slopePropertyCode: string;

  riskGradeCode: string;
  riskGradeTypeCode: string;

  recentLandslideDate: string;
  lastModifiedAt: string;

  dailyExpectedRainfall: number;
  hourlyExpectedRainfall: number;

  expectedPeople: number;
  expectedHouseholds: number;
  expectedBuildings: number;
  expectedFarmlandArea: number;
  expectedLandslideArea: number;

  drainageWidth: number;
  drainageHeight: number;
  drainageLength: number;

  shelterName1: string;
  shelterPhone1: string;
  shelterName2: string;
  shelterPhone2: string;

  responsibleDepartment: string;
  responsiblePosition: string;

  citizenOrganization: string;
  citizenPosition: string;

  popularPlaceName: string;
}

interface SafetyDataRegionalRiskResponse {
  header?: {
    resultMsg?: string | null;
    resultCode?: string | null;
    errorMsg?: string | null;
  };
  numOfRows?: number;
  pageNo?: number;
  totalCount?: number;
  body?: Array<Record<string, unknown>>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value === "null") return "";
  return String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchLandslideRegionalRisk(params: {
  serviceKey: string;
  baseUrl: string;
  endpoint: string;
  pageNo?: number;
  numOfRows?: number;
}) {
  if (!params.serviceKey) {
    throw new Error(
      "LANDSLIDE_REGIONAL_HISTORY_SERVICE_KEY is not configured"
    );
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
      `Landslide regional risk request failed: HTTP ${response.status}`
    );
  }

  let payload: SafetyDataRegionalRiskResponse;

  try {
    payload = JSON.parse(text) as SafetyDataRegionalRiskResponse;
  } catch {
    throw new Error("Landslide regional risk API returned invalid JSON");
  }

  const resultCode = payload.header?.resultCode ?? "";
  const resultMsg = payload.header?.resultMsg ?? "";
  const errorMsg = payload.header?.errorMsg ?? "";

  if (resultCode !== "00") {
    throw new Error(
      `Landslide regional risk API error: ${resultCode} ${resultMsg} ${errorMsg}`.trim()
    );
  }

  const data: LandslideRegionalRiskRecord[] = (payload.body ?? []).map(
    (item) => ({
      managementNumber: str(item.LNLD_RSK_MNG_NO),
      districtName: str(item.DSTRCT_NM),
      detailAddress: str(item.DADDR),
      standardDistrictCode: str(item.STDG_CD),

      forestClassificationCode: str(item.FORST_PSN_SE_CD),
      slopePropertyCode: str(item.MTNC_PRPL_ELPS_CD),

      riskGradeCode: str(item.RSK_GRD_CD),
      riskGradeTypeCode: str(item.RSK_GRD_SE_CD),

      recentLandslideDate: str(item.RCNT_LNLD_OCRN_YMD),
      lastModifiedAt: str(item.LAST_MDFCN_DT),

      dailyExpectedRainfall: num(item.EADA_EXPC_RNFL),
      hourlyExpectedRainfall: num(item.HRLY_EXPC_RNFL),

      expectedPeople: num(item.EXPC_DAM_NOPE),
      expectedHouseholds: num(item.EXPC_DAM_NOHO),
      expectedBuildings: num(item.EXPC_DAM_BLDG_CNT),
      expectedFarmlandArea: num(item.EXPC_DAM_FRND_AREA),
      expectedLandslideArea: num(item.LNLD_EXPC_AREA),

      drainageWidth: num(item.DRST_BRDTH),
      drainageHeight: num(item.DRST_HGT),
      drainageLength: num(item.DRST_LEN),

      shelterName1: str(item.SHNT_PLC_NM_1),
      shelterPhone1: str(item.SHNT_PLC_TELNO_1),
      shelterName2: str(item.SHNT_PLC_NM_2),
      shelterPhone2: str(item.SHNT_PLC_TELNO_2),

      responsibleDepartment: str(item.RSP_PBOFC_OGDP_NM),
      responsiblePosition: str(item.RSP_PBOFC_JBPS_NM),

      citizenOrganization: str(item.CTZN_OGDP_NM),
      citizenPosition: str(item.CTZN_JBGD_NM),

      popularPlaceName: str(item.PPLRLYKNWN_NM),
    })
  );

  return {
    data,
    meta: {
      pageNo: payload.pageNo ?? params.pageNo ?? 1,
      numOfRows: payload.numOfRows ?? params.numOfRows ?? 100,
      totalCount: payload.totalCount ?? data.length,
      count: data.length,
      provider: "Safety Data Landslide Regional Risk",
    },
  };
}
