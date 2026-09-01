import { Hono } from "hono";

import { fetchFirmsArea } from "./firms.js";
import { fetchWildfireRisk } from "./wildfire-risk.js";
import { fetchLandslideForecast } from "./landslide-forecast.js";
import { fetchLandslideHistory } from "./landslide-history.js";
import { fetchLandslideRegionalRisk } from "./landslide-regional-risk.js";

export const externalRoutes = new Hono();

externalRoutes.get("/wildfire/firms", async (c) => {
  const bbox =
    c.req.query("bbox") ??
    process.env.NASA_FIRMS_DEFAULT_BBOX?.trim() ??
    "124.0,33.0,132.0,39.5";

  const daysRaw = Number.parseInt(c.req.query("days") ?? "1", 10);
  const days = Number.isFinite(daysRaw)
    ? Math.min(Math.max(daysRaw, 1), 10)
    : 1;

  const source =
    c.req.query("source") ??
    process.env.NASA_FIRMS_SOURCE?.trim() ??
    "VIIRS_SNPP_NRT";

  return c.json(
    await fetchFirmsArea({
      mapKey: process.env.NASA_FIRMS_MAP_KEY?.trim() ?? "",
      baseUrl:
        process.env.NASA_FIRMS_BASE_URL?.trim() ??
        "https://firms.modaps.eosdis.nasa.gov",
      bbox,
      days,
      source,
    }),
  );
});

externalRoutes.get("/wildfire/risk", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  return c.json(
    await fetchWildfireRisk({
      serviceKey: process.env.KFS_WILDFIRE_SERVICE_KEY?.trim() ?? "",
      baseUrl:
        process.env.KFS_WILDFIRE_BASE_URL?.trim() ??
        "http://apis.data.go.kr/1400377/forestPointV2",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
    }),
  );
});

externalRoutes.get("/landslide/forecast", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  return c.json(
    await fetchLandslideForecast({
      serviceKey:
        process.env.LANDSLIDE_FORECAST_SERVICE_KEY?.trim() ?? "",
      baseUrl:
        process.env.SAFETY_DATA_BASE_URL?.trim() ??
        "https://www.safetydata.go.kr",
      endpoint:
        process.env.LANDSLIDE_FORECAST_ENDPOINT?.trim() ??
        "/V2/api/DSSP-IF-00735",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
      inquiryDate: c.req.query("inqDt"),
    }),
  );
});

externalRoutes.get("/landslide/history", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  return c.json(
    await fetchLandslideHistory({
      serviceKey:
        process.env.LANDSLIDE_HISTORY_SERVICE_KEY?.trim() ?? "",
      baseUrl:
        process.env.SAFETY_DATA_BASE_URL?.trim() ??
        "https://www.safetydata.go.kr",
      endpoint:
        process.env.LANDSLIDE_HISTORY_ENDPOINT?.trim() ??
        "/V2/api/DSSP-IF-00134",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
    }),
  );
});

externalRoutes.get("/landslide/regional-risk", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  return c.json(
    await fetchLandslideRegionalRisk({
      serviceKey:
        process.env.LANDSLIDE_REGIONAL_HISTORY_SERVICE_KEY?.trim() ??
        "",
      baseUrl:
        process.env.SAFETY_DATA_BASE_URL?.trim() ??
        "https://www.safetydata.go.kr",
      endpoint:
        process.env.LANDSLIDE_REGIONAL_RISK_ENDPOINT?.trim() ??
        "/V2/api/DSSP-IF-10076",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
    }),
  );
});
