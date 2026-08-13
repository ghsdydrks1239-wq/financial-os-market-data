import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile(new URL("../config/bde-series.v1.json", import.meta.url), "utf8"));

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

const MONTHS = new Map([
  ["ENE", "01"], ["FEB", "02"], ["MAR", "03"], ["ABR", "04"],
  ["MAY", "05"], ["JUN", "06"], ["JUL", "07"], ["AGO", "08"],
  ["SEP", "09"], ["OCT", "10"], ["NOV", "11"], ["DIC", "12"],
]);

function parseSpanishDate(raw) {
  const match = String(raw ?? "").trim().toUpperCase().match(/^(\d{2})\s+([A-ZÁÉÍÓÚÑ]{3})\s+(\d{4})$/u);
  if (!match) return null;
  const [, dd, mon, yyyy] = match;
  const mm = MONTHS.get(mon);
  return mm ? `${yyyy}-${mm}-${dd}` : null;
}

function ageDays(referenceDate, sourceDate) {
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86400000);
}

async function fetchCsv() {
  const response = await fetch(config.sourceUrl, {
    headers: { "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Banco de España HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new TextDecoder(config.encoding ?? "windows-1252").decode(bytes).replace(/^\uFEFF/, "");
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const outputPath = process.env.OUTPUT_PATH?.trim();
const text = await fetchCsv();
const rows = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
const codeRow = rows.find((row) => /C[ÓO]DIGO DE LA SERIE/i.test(row[0] ?? ""));
if (!codeRow) throw new Error("Banco de España series-code row not found");

const metrics = [];
for (const definition of config.metrics) {
  const columnIndex = codeRow.findIndex((value) => String(value).trim() === definition.seriesCode);
  if (columnIndex < 0) {
    metrics.push({
      id: definition.id,
      name: definition.name,
      assetClass: "rates_credit_global",
      value: null,
      unit: definition.unit,
      referenceDate,
      source: config.source,
      sourceDate: null,
      expectedSourceDate: null,
      marketSession: "EU_GOVT_YIELD_DAILY",
      sessionAligned: null,
      status: "error",
      isStale: false,
      qualityNote: `Series code ${definition.seriesCode} not found in Banco de España CSV.`,
      collectedAt: new Date().toISOString(),
      sourceMeta: { provider: config.provider, seriesCode: definition.seriesCode, sourceUrl: config.sourceUrl, publicOutputAllowed: true },
    });
    continue;
  }

  const observations = rows
    .map((row) => ({ date: parseSpanishDate(row[0]), raw: row[columnIndex] }))
    .filter((row) => row.date && row.date <= referenceDate)
    .map((row) => ({ ...row, value: Number(String(row.raw ?? "").replace(",", ".")) }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => b.date.localeCompare(a.date));

  const latest = observations[0] ?? null;
  const stale = latest ? ageDays(referenceDate, latest.date) > (definition.staleAfterDays ?? 7) : false;
  metrics.push({
    id: definition.id,
    name: definition.name,
    assetClass: "rates_credit_global",
    value: latest?.value ?? null,
    unit: definition.unit,
    referenceDate,
    source: config.source,
    sourceDate: latest?.date ?? null,
    expectedSourceDate: null,
    marketSession: "EU_GOVT_YIELD_DAILY",
    sessionAligned: latest ? (stale ? false : null) : null,
    status: latest ? (stale ? "stale" : "available") : "missing",
    isStale: stale,
    qualityNote: latest
      ? "Official Banco de España daily secondary-market government-bond yield; sourceDate preserved independently from referenceDate."
      : "No usable observation was found for the configured Banco de España series.",
    collectedAt: new Date().toISOString(),
    sourceMeta: {
      provider: config.provider,
      seriesCode: definition.seriesCode,
      seriesDescription: definition.seriesDescription,
      sourceUrl: config.sourceUrl,
      rights: config.rights,
      publicOutputAllowed: true,
    },
  });
}

const counts = metrics.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] ?? 0) + 1;
  return acc;
}, {});
const snapshot = {
  schemaVersion: "1.0",
  referenceDate,
  generatedAt: new Date().toISOString(),
  provider: config.provider,
  source: config.source,
  publicOutputAllowed: config.publicOutputAllowed === true,
  dataQuality: {
    total: metrics.length,
    available: counts.available ?? 0,
    stale: counts.stale ?? 0,
    missing: counts.missing ?? 0,
    error: counts.error ?? 0,
  },
  metrics,
};

if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
console.log(`Banco de España collection: total=${snapshot.dataQuality.total}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`);
for (const item of metrics) console.log(`${item.status.toUpperCase()} ${item.id} value=${item.value ?? "null"} sourceDate=${item.sourceDate ?? "null"}`);
if (snapshot.dataQuality.error > 0) process.exitCode = 1;
