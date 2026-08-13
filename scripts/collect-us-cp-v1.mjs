import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile(new URL("../config/us-cp.v1.json", import.meta.url), "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function decodeHtml(text) {
  return String(text ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((cell) => decodeHtml(cell[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function monthNumber(name) {
  const key = name.toLowerCase().replace(/\./g, "");
  const months = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  return months[key] ?? null;
}

function parseMonthDay(text, year) {
  const match = String(text ?? "").trim().match(/^([A-Za-z]+\.?)[\s]+(\d{1,2})\*?$/);
  if (!match) return null;
  const month = monthNumber(match[1]);
  if (!month) return null;
  const day = Number(match[2]);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ageDays(referenceDate, sourceDate) {
  if (!sourceDate) return null;
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86400000);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const outputPath = process.env.OUTPUT_PATH?.trim();
const source = config.source;
const definition = config.metric;
const html = await fetchText(source.url);
const rows = parseRows(html);

const asOfMatch = decodeHtml(html).match(/Data as of\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
const releaseYear = asOfMatch ? Number(asOfMatch[3]) : Number(referenceDate.slice(0, 4));
const dailyIndex = rows.findIndex((cells) => cells.length === 1 && /^Daily$/i.test(cells[0]));
if (dailyIndex < 0) throw new Error("Could not locate the first Daily section in the Federal Reserve CP table.");

const observations = [];
for (let i = dailyIndex + 1; i < rows.length; i += 1) {
  const cells = rows[i];
  if (cells.length === 1 && /^(Annual average|Monthly average|Weekly|Daily|Note)/i.test(cells[0])) {
    if (observations.length) break;
    continue;
  }
  const sourceDate = parseMonthDay(cells[0], releaseYear);
  if (!sourceDate) {
    if (observations.length && cells.some((cell) => /^Note:/i.test(cell))) break;
    continue;
  }
  if (sourceDate > referenceDate) continue;
  const raw = cells[6] ?? null; // date + 1d + 7d + 15d + 30d + 60d + 90d
  const numeric = Number(String(raw ?? "").replace(/,/g, ""));
  observations.push({ sourceDate, raw, value: Number.isFinite(numeric) ? numeric : null, cells });
}

if (!observations.length) {
  throw new Error(`No Federal Reserve CP daily observations were parsed. rowCount=${rows.length}, dailyIndex=${dailyIndex}`);
}

observations.sort((a, b) => b.sourceDate.localeCompare(a.sourceDate));
const latestRow = observations[0];
const selected = observations.find((item) => Number.isFinite(item.value)) ?? null;
const age = selected ? ageDays(referenceDate, selected.sourceDate) : null;
const stale = selected && age !== null && age > 10;

const metric = {
  id: definition.metricId,
  name: definition.name,
  assetClass: "rates_credit_global",
  value: selected?.value ?? null,
  unit: definition.unit,
  referenceDate,
  source: source.name,
  sourceDate: selected?.sourceDate ?? latestRow.sourceDate,
  expectedSourceDate: latestRow.sourceDate,
  marketSession: "US_CP_DAILY",
  sessionAligned: selected ? (stale ? false : null) : false,
  status: selected ? (stale ? "stale" : "available") : "missing",
  isStale: Boolean(stale),
  qualityNote: selected
    ? (selected.sourceDate === latestRow.sourceDate
      ? "Latest available 90-day AA nonfinancial CP observation from the Federal Reserve Board daily release."
      : `The latest daily row (${latestRow.sourceDate}) was n.a.; using the latest prior day with sufficient trade data (${selected.sourceDate}).`)
    : "Federal Reserve Board reported n.a. for all parsed recent 90-day AA nonfinancial CP observations.",
  collectedAt: new Date().toISOString(),
  sourceMeta: {
    provider: "FEDERAL_RESERVE_BOARD_CP",
    seriesConcept: definition.seriesConcept,
    legacySeriesId: definition.legacySeriesId,
    sourceUrl: source.url,
    latestTableDate: latestRow.sourceDate,
    publicOutputAllowed: source.publicOutputAllowed,
  },
};

const counts = { available: 0, stale: 0, missing: 0, error: 0 };
counts[metric.status] += 1;
const snapshot = {
  schemaVersion: "1.0",
  referenceDate,
  generatedAt: new Date().toISOString(),
  provider: "FEDERAL_RESERVE_BOARD_CP",
  source: source.name,
  publicOutputAllowed: source.publicOutputAllowed,
  dataQuality: { total: 1, ...counts },
  metrics: [metric],
};

if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

console.log(`US CP collection: status=${metric.status}, sourceDate=${metric.sourceDate}, latestTableDate=${latestRow.sourceDate}, parsedDailyRows=${observations.length}`);
if (metric.status === "error") process.exitCode = 1;
