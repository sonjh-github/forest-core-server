import { fetchWithTimeout } from "./fetch-with-timeout.js";

export interface FirmsHotspot {
  latitude: number;
  longitude: number;
  acquiredAt: string;
  satellite?: string;
  instrument?: string;
  confidence?: string;
  frp?: number;
  daynight?: string;
  raw: Record<string, string>;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  values.push(current);
  return values;
}

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]!);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
}

export async function fetchFirmsArea(params: {
  mapKey: string;
  baseUrl: string;
  bbox: string;
  days: number;
  source: string;
}) {
  if (!params.mapKey) {
    throw new Error("NASA_FIRMS_MAP_KEY is not configured");
  }

  const url =
    `${params.baseUrl.replace(/\/+$/, "")}` +
    `/api/area/csv/${encodeURIComponent(params.mapKey)}` +
    `/${encodeURIComponent(params.source)}` +
    `/${params.bbox}` +
    `/${params.days}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "text/csv",
      "User-Agent": "forest-back-demo/1.0",
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`NASA FIRMS request failed: HTTP ${response.status} ${body.slice(0, 200)}`);
  }

  const rows = parseCsv(body);

  const data: FirmsHotspot[] = rows
    .filter((row) => row.latitude && row.longitude)
    .map((row) => ({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      acquiredAt: `${row.acq_date ?? ""}T${String(row.acq_time ?? "").padStart(4, "0").slice(0, 2)}:${String(row.acq_time ?? "").padStart(4, "0").slice(2, 4)}:00Z`,
      satellite: row.satellite,
      instrument: row.instrument,
      confidence: row.confidence,
      frp: row.frp ? Number(row.frp) : undefined,
      daynight: row.daynight,
      raw: row,
    }));

  return {
    data,
    meta: {
      source: params.source,
      bbox: params.bbox,
      days: params.days,
      count: data.length,
      provider: "NASA FIRMS",
    },
  };
}
