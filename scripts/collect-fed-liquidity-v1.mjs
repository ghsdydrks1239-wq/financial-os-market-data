import fs from "node:fs/promises";
import path from "node:path";

const PRATES_URL = "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=20&layout=seriescolumn&rel=PRATES&series=c27939ee810cb2e929a920a6bd77d9f6&to=&type=package";
const H41_URL = "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=8&layout=seriescolumn&rel=H41&series=2704b6bc9b50bc034baf9660364dfb26&to=&type=package";
const FRED_RRP_BALANCE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=RRPONTSYD";
const FRED_RRP_RATE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=RRPONTSYAWARD";

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function ageDays(referenceDate, sourceDate) {
  if (!sourceDate) return null;
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86400000);
}

function metric({ id, name, value, unit, referenceDate, sourceDate, source, frequency, staleAfterDays, sourceMeta }) {
  const numeric = Number(value);
  const available = Number.isFinite(numeric);
  const age = ageDays(referenceDate, sourceDate);
  const stale = available && age !== null && age > staleAfterDays;
  return {
    id,
    name,
    assetClass: "rates_credit_global",
    value: available ? numeric : null,
    unit,
    referenceDate,
    source,
    sourceDate: sourceDate ?? null,
    expectedSourceDate: null,
    marketSession: frequency === "weekly" ? "US_LIQUIDITY_WEEKLY" : "US_LIQUIDITY_DAILY",
    sessionAligned: stale ? false : null,
    status: available ? (stale ? "stale" : "available") : "missing",
    isStale: stale,
    qualityNote: available
      ? (stale ? `Latest official observation is more than ${staleAfterDays} calendar days behind the reference date.` : `${frequency === "weekly" ? "Weekly" : "Daily"} official observation; holiday/session alignment is preserved separately from sourceDate.`)
      : "No usable numeric observation was found in the official series response.",
    collectedAt: new Date().toISOString(),
    sourceMeta: { ...sourceMeta, publicOutputAllowed: true },
  };
}

async function collectBoardDdp({ url, shortCode, referenceDate }) {
  const rows = (await fetchText(url)).split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const headerIndex = rows.findIndex((row) => /^Time Period\s*$/i.test(row[0] ?? ""));
  if (headerIndex < 0) throw new Error(`DDP Time Period row missing for ${shortCode}`);
  const header = rows[headerIndex];
  const columnIndex = header.findIndex((value) => value === shortCode);
  if (columnIndex < 0) throw new Error(`DDP series ${shortCode} not found`);

  const observations = rows.slice(headerIndex + 1)
    .map((row) => ({ date: row[0], raw: row[columnIndex] }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date ?? ""))
    .filter((row) => row.date <= referenceDate)
    .map((row) => ({ ...row, value: Number(row.raw) }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return observations[0] ?? null;
}

async function collectFredCsv({ url, seriesId, referenceDate }) {
  const rows = (await fetchText(url)).split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const header = rows[0] ?? [];
  const dateIndex = header.findIndex((value) => /^(observation_date|DATE)$/i.test(value));
  const valueIndex = header.findIndex((value) => value === seriesId);
  if (dateIndex < 0 || valueIndex < 0) throw new Error(`FRED CSV columns not found for ${seriesId}`);

  const observations = rows.slice(1)
    .map((row) => ({ date: row[dateIndex], raw: row[valueIndex] }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date ?? ""))
    .filter((row) => row.date <= referenceDate)
    .map((row) => ({ ...row, value: Number(row.raw) }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return observations[0] ?? null;
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const definitions = [
  {
    id: "gl_fi_iorb", name: "IORB", unit: "%", frequency: "daily", staleAfterDays: 7,
    fetcher: () => collectBoardDdp({ url: PRATES_URL, shortCode: "RESBM_N.D", referenceDate }),
    source: "Board of Governors of the Federal Reserve System — Policy Rates",
    sourceMeta: { provider: "FED_BOARD_PRATES", seriesId: "PRATES/PRATES_POLICY_RATES/RESBM_N.D", sourceUrl: PRATES_URL, rights: "Board website information is public domain unless otherwise indicated; cite the Board as source." },
  },
  {
    id: "gl_fi_tga_balance", name: "TGA Balance", unit: "USD millions", frequency: "weekly", staleAfterDays: 14,
    fetcher: () => collectBoardDdp({ url: H41_URL, shortCode: "RESPPLLDT_XAW_N.WW", referenceDate }),
    source: "Board of Governors of the Federal Reserve System — H.4.1",
    sourceMeta: { provider: "FED_BOARD_H41", seriesId: "H41/H41/RESPPLLDT_XAW_N.WW", sourceUrl: H41_URL, definition: "U.S. Treasury General Account, week average", rights: "Board website information is public domain unless otherwise indicated; cite the Board as source." },
  },
  {
    id: "gl_fi_on_rrp_balance", name: "ON RRP Balance", unit: "USD billions", frequency: "daily", staleAfterDays: 7,
    fetcher: () => collectFredCsv({ url: FRED_RRP_BALANCE_URL, seriesId: "RRPONTSYD", referenceDate }),
    source: "Federal Reserve Bank of New York via FRED",
    sourceMeta: { provider: "FRED_NYFED", seriesId: "RRPONTSYD", sourceUrl: FRED_RRP_BALANCE_URL, underlyingSource: "Federal Reserve Bank of New York — Temporary Open Market Operations", attributionRequired: true },
  },
  {
    id: "gl_fi_on_rrp_rate", name: "ON RRP Rate", unit: "%", frequency: "daily", staleAfterDays: 7,
    fetcher: () => collectFredCsv({ url: FRED_RRP_RATE_URL, seriesId: "RRPONTSYAWARD", referenceDate }),
    source: "Federal Reserve Bank of New York via FRED",
    sourceMeta: { provider: "FRED_NYFED", seriesId: "RRPONTSYAWARD", sourceUrl: FRED_RRP_RATE_URL, underlyingSource: "Federal Reserve Bank of New York — Temporary Open Market Operations", attributionRequired: true },
  },
];

const metrics = [];
for (const definition of definitions) {
  try {
    const observation = await definition.fetcher();
    metrics.push(metric({
      ...definition,
      value: observation?.value,
      sourceDate: observation?.date ?? null,
      referenceDate,
    }));
  } catch (error) {
    metrics.push({
      id: definition.id,
      name: definition.name,
      assetClass: "rates_credit_global",
      value: null,
      unit: definition.unit,
      referenceDate,
      source: definition.source,
      sourceDate: null,
      expectedSourceDate: null,
      marketSession: definition.frequency === "weekly" ? "US_LIQUIDITY_WEEKLY" : "US_LIQUIDITY_DAILY",
      sessionAligned: null,
      status: "error",
      isStale: false,
      qualityNote: error?.message ?? String(error),
      collectedAt: new Date().toISOString(),
      sourceMeta: { ...definition.sourceMeta, publicOutputAllowed: true },
    });
  }
}

const counts = metrics.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] ?? 0) + 1;
  return acc;
}, {});
const snapshot = {
  schemaVersion: "1.0",
  referenceDate,
  generatedAt: new Date().toISOString(),
  provider: "FED_LIQUIDITY",
  source: "Federal Reserve Board + Federal Reserve Bank of New York via FRED",
  publicOutputAllowed: true,
  dataQuality: {
    total: metrics.length,
    available: counts.available ?? 0,
    stale: counts.stale ?? 0,
    missing: counts.missing ?? 0,
    error: counts.error ?? 0,
  },
  metrics,
};

const outputPath = process.env.OUTPUT_PATH?.trim();
if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
console.log(`Fed liquidity collection: total=${snapshot.dataQuality.total}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`);
for (const item of metrics) console.log(`${item.status.toUpperCase()} ${item.id} sourceDate=${item.sourceDate ?? "null"}`);
if (snapshot.dataQuality.error > 0) process.exitCode = 1;
