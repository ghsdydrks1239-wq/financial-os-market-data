import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile(new URL("../config/us-labor-signals.v1.json", import.meta.url), "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthDate(year, period) {
  const match = String(period ?? "").match(/^M(\d{2})$/);
  if (!match || match[1] === "13") return null;
  return `${year}-${match[1]}-01`;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function fetchBls() {
  const response = await fetch(config.source.apiUrl, {
    headers: { Accept: "application/json", "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`BLS HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS request failed: ${(payload.message ?? []).join("; ") || payload.status}`);
  }
  const series = payload.Results?.series?.find((item) => item.seriesID === config.source.seriesId) ?? payload.Results?.series?.[0];
  if (!series) throw new Error("BLS response contained no series data.");
  return series.data ?? [];
}

function calculateSahm(rows, referenceDate) {
  const refMonth = `${referenceDate.slice(0, 7)}-01`;
  const observations = rows
    .map((row) => ({
      date: monthDate(row.year, row.period),
      value: Number(row.value),
    }))
    .filter((row) => row.date && row.date <= refMonth && Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (observations.length < 15) {
    throw new Error(`Need at least 15 monthly unemployment observations, received ${observations.length}.`);
  }

  const rolling = [];
  for (let i = 2; i < observations.length; i += 1) {
    const trio = observations.slice(i - 2, i + 1);
    rolling.push({
      date: observations[i].date,
      value: trio.reduce((sum, item) => sum + item.value, 0) / 3,
    });
  }

  const current = rolling.at(-1);
  const prior12 = rolling.slice(-13, -1);
  if (!current || prior12.length < 12) throw new Error("Insufficient rolling observations for Sahm Rule calculation.");
  const priorLow = Math.min(...prior12.map((item) => item.value));

  return {
    value: round2(current.value - priorLow),
    sourceDate: current.date,
    currentThreeMonthAverage: round2(current.value),
    priorTwelveMonthLow: round2(priorLow),
    observationCount: observations.length,
  };
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const outputPath = process.env.OUTPUT_PATH?.trim();
if (!outputPath) throw new Error("OUTPUT_PATH is required.");

let metric;
try {
  const rows = await fetchBls();
  const result = calculateSahm(rows, referenceDate);
  metric = {
    id: "gl_fi_sahm_rule",
    name: "Sahm Rule",
    assetClass: "rates_credit_global",
    value: result.value,
    unit: "pp",
    referenceDate,
    source: config.source.name,
    sourceDate: result.sourceDate,
    expectedSourceDate: result.sourceDate,
    marketSession: "US_LABOR_MONTHLY",
    sessionAligned: true,
    status: "available",
    isStale: false,
    qualityNote: "Derived from the latest seasonally adjusted BLS U-3 unemployment-rate vintage. This is the current Sahm Rule reading, not a reconstruction of historical real-time vintages.",
    collectedAt: new Date().toISOString(),
    sourceMeta: {
      provider: "BLS_DERIVED",
      seriesId: config.source.seriesId,
      seriesName: config.source.seriesName,
      formula: config.metrics[0].formula,
      threshold: config.metrics[0].threshold,
      currentThreeMonthAverage: result.currentThreeMonthAverage,
      priorTwelveMonthLow: result.priorTwelveMonthLow,
      publicOutputAllowed: true,
    },
  };
} catch (error) {
  metric = {
    id: "gl_fi_sahm_rule",
    name: "Sahm Rule",
    assetClass: "rates_credit_global",
    value: null,
    unit: "pp",
    referenceDate,
    source: config.source.name,
    sourceDate: null,
    expectedSourceDate: null,
    marketSession: "US_LABOR_MONTHLY",
    sessionAligned: false,
    status: "error",
    isStale: false,
    qualityNote: error?.message ?? String(error),
    collectedAt: new Date().toISOString(),
    sourceMeta: {
      provider: "BLS_DERIVED",
      seriesId: config.source.seriesId,
      formula: config.metrics[0].formula,
      publicOutputAllowed: true,
    },
  };
}

const snapshot = {
  schemaVersion: "1.0",
  referenceDate,
  generatedAt: new Date().toISOString(),
  provider: "BLS_DERIVED",
  source: config.source.name,
  publicOutputAllowed: true,
  dataQuality: {
    total: 1,
    available: metric.status === "available" ? 1 : 0,
    stale: metric.status === "stale" ? 1 : 0,
    missing: metric.status === "missing" ? 1 : 0,
    error: metric.status === "error" ? 1 : 0,
  },
  metrics: [metric],
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`US labor signals: status=${metric.status}, Sahm=${metric.value}, sourceDate=${metric.sourceDate}`);
if (metric.status === "error") process.exitCode = 1;
