import fs from "node:fs/promises";
import path from "node:path";
import { parseEiaHistoryHtml } from "../src/lib/eia-history.mjs";

const config = JSON.parse(await fs.readFile(new URL("../config/eia-series.v1.json", import.meta.url), "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function ageDays(referenceDate, sourceDate) {
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86400000);
}

async function fetchMetric(definition, referenceDate) {
  const response = await fetch(definition.url, {
    headers: { "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(30000),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`EIA HTTP ${response.status}: ${html.slice(0, 300)}`);

  const parsed = parseEiaHistoryHtml(html);
  const latest = parsed.observations.at(-1) ?? null;
  const previous = parsed.observations.at(-2) ?? null;
  if (!latest) throw new Error(`No EIA daily observations parsed from ${definition.url}`);

  const stale = ageDays(referenceDate, latest.sourceDate) > definition.staleAfterDays;
  return {
    latest,
    previous,
    stale,
    title: parsed.title,
    releaseDate: parsed.releaseDate,
    observationCount: parsed.observations.length,
  };
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const outputPath = process.env.OUTPUT_PATH?.trim();
const metrics = [];

for (const definition of config.metrics) {
  try {
    const result = await fetchMetric(definition, referenceDate);
    metrics.push({
      id: definition.id,
      name: definition.name,
      assetClass: "commodities",
      value: result.latest.value,
      unit: definition.unit,
      referenceDate,
      source: config.source,
      sourceDate: result.latest.sourceDate,
      expectedSourceDate: result.releaseDate,
      marketSession: "EIA_WEEKLY_RELEASE_OF_DAILY_SERIES",
      sessionAligned: !result.stale,
      status: result.stale ? "stale" : "available",
      isStale: result.stale,
      qualityNote: "Official EIA daily history table. Kept out of the public bundle pending source-specific redistribution-rights review.",
      collectedAt: new Date().toISOString(),
      sourceMeta: {
        provider: config.provider,
        sourceKey: definition.sourceKey,
        sourceUrl: definition.url,
        pageTitle: result.title,
        releaseDate: result.releaseDate,
        previousObservation: result.previous,
        observationCount: result.observationCount,
        rights: config.rights,
        publicOutputAllowed: false,
      },
    });
  } catch (error) {
    metrics.push({
      id: definition.id,
      name: definition.name,
      assetClass: "commodities",
      value: null,
      unit: definition.unit,
      referenceDate,
      source: config.source,
      sourceDate: null,
      expectedSourceDate: null,
      marketSession: "EIA_WEEKLY_RELEASE_OF_DAILY_SERIES",
      sessionAligned: null,
      status: "error",
      isStale: false,
      qualityNote: error?.message ?? String(error),
      collectedAt: new Date().toISOString(),
      sourceMeta: {
        provider: config.provider,
        sourceKey: definition.sourceKey,
        sourceUrl: definition.url,
        publicOutputAllowed: false,
      },
    });
  }
}

const counts = metrics.reduce((acc, metric) => {
  acc[metric.status] = (acc[metric.status] ?? 0) + 1;
  return acc;
}, {});
const snapshot = {
  schemaVersion: "1.0",
  referenceDate,
  generatedAt: new Date().toISOString(),
  provider: config.provider,
  source: config.source,
  publicOutputAllowed: false,
  publicOutputNote: config.rights,
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
console.log(`EIA transient collection: total=${snapshot.dataQuality.total}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, error=${snapshot.dataQuality.error}, publicOutputAllowed=false`);
for (const metric of metrics) {
  console.log(`${metric.status.toUpperCase()} ${metric.id} value=${metric.value ?? "null"} sourceDate=${metric.sourceDate ?? "null"}`);
}
if (snapshot.dataQuality.error > 0) process.exitCode = 1;
