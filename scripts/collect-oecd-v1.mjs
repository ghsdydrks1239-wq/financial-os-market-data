import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile(new URL("../config/oecd-series.v1.json", import.meta.url), "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthStart(referenceDate, monthsBack = 12) {
  const d = new Date(`${referenceDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return d.toISOString().slice(0, 7);
}

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { out.push(value); value = ""; }
    else value += c;
  }
  out.push(value);
  return out;
}

function ageDays(referenceDate, sourceDate) {
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86400000);
}

async function fetchMetric(definition, referenceDate) {
  const startPeriod = monthStart(referenceDate, 15);
  const url = `https://sdmx.oecd.org/public/rest/data/${config.dataset}/${definition.queryKey}?startPeriod=${startPeriod}&dimensionAtObservation=AllDimensions`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/csv",
      "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`OECD HTTP ${response.status}`);
  const text = (await response.text()).replace(/^\uFEFF/, "");
  const rows = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const header = rows[0] ?? [];
  const timeIndex = header.findIndex((v) => v === "TIME_PERIOD");
  const valueIndex = header.findIndex((v) => v === "OBS_VALUE");
  const areaIndex = header.findIndex((v) => v === "REF_AREA");
  if (timeIndex < 0 || valueIndex < 0) throw new Error(`OECD CSV columns missing: ${header.slice(0, 20).join("|")}`);
  const observations = rows.slice(1)
    .filter((row) => !areaIndex || areaIndex < 0 || row[areaIndex] === definition.referenceArea)
    .map((row) => ({ period: row[timeIndex], value: Number(row[valueIndex]) }))
    .filter((row) => /^\d{4}-\d{2}$/.test(row.period ?? "") && Number.isFinite(row.value))
    .sort((a, b) => b.period.localeCompare(a.period));
  return { latest: observations[0] ?? null, url };
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const outputPath = process.env.OUTPUT_PATH?.trim();
const metrics = [];

for (const definition of config.metrics) {
  try {
    const { latest, url } = await fetchMetric(definition, referenceDate);
    const sourceDate = latest ? `${latest.period}-01` : null;
    const stale = sourceDate ? ageDays(referenceDate, sourceDate) > (definition.staleAfterDays ?? 70) : false;
    metrics.push({
      id: definition.id,
      name: definition.name,
      assetClass: "rates_credit_global",
      value: latest?.value ?? null,
      unit: definition.unit,
      referenceDate,
      source: config.source,
      sourceDate,
      expectedSourceDate: null,
      marketSession: "OECD_MONTHLY",
      sessionAligned: latest ? !stale : null,
      status: latest ? (stale ? "stale" : "available") : "missing",
      isStale: stale,
      qualityNote: latest
        ? "United States OECD harmonised composite leading indicator (CLI), amplitude adjusted; monthly source period is stored as the first day of the month."
        : "No usable OECD CLI observation was returned.",
      collectedAt: new Date().toISOString(),
      sourceMeta: {
        provider: config.provider,
        dataset: config.dataset,
        queryKey: definition.queryKey,
        referenceArea: definition.referenceArea,
        definition: definition.definition,
        legacyFREDSeries: definition.legacyFREDSeries,
        sourceUrl: url,
        rights: config.rights,
        publicOutputAllowed: true,
      },
    });
  } catch (error) {
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
      marketSession: "OECD_MONTHLY",
      sessionAligned: null,
      status: "error",
      isStale: false,
      qualityNote: error?.message ?? String(error),
      collectedAt: new Date().toISOString(),
      sourceMeta: { provider: config.provider, dataset: config.dataset, queryKey: definition.queryKey, publicOutputAllowed: true },
    });
  }
}

const counts = metrics.reduce((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
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
console.log(`OECD collection: total=${snapshot.dataQuality.total}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`);
for (const item of metrics) console.log(`${item.status.toUpperCase()} ${item.id} value=${item.value ?? "null"} sourceDate=${item.sourceDate ?? "null"}`);
if (snapshot.dataQuality.error > 0) process.exitCode = 1;
