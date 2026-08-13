import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile(new URL("../config/global-rates.v1.json", import.meta.url), "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isoFromTreasuryDate(text) {
  const match = String(text ?? "").trim().match(/^(\d{2})-([A-Z]{3})-(\d{2})$/i);
  if (!match) return null;
  const months = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};
  const month = months[match[2].toUpperCase()];
  if (!month) return null;
  const yy = Number(match[3]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return `${year}-${month}-${match[1]}`;
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function ageDays(referenceDate, sourceDate) {
  if (!sourceDate) return null;
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / 86400000);
}

function normalizedMetric({ id, name, value, unit, referenceDate, source, sourceDate, publicOutputAllowed, sourceMeta, status = "available", qualityNote = null }) {
  const age = ageDays(referenceDate, sourceDate);
  const isStale = status === "available" && age !== null && age > 7;
  return {
    id,
    name,
    assetClass: "rates_credit_global",
    value,
    unit,
    referenceDate,
    source,
    sourceDate,
    expectedSourceDate: sourceDate,
    marketSession: "US_RATES_DAILY",
    sessionAligned: isStale ? false : null,
    status: isStale ? "stale" : status,
    isStale,
    qualityNote: qualityNote ?? (isStale ? "Latest official observation is more than seven calendar days behind the reference date." : "U.S. business-day session alignment is provisional until a holiday calendar is added."),
    collectedAt: new Date().toISOString(),
    sourceMeta: { ...sourceMeta, publicOutputAllowed },
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function collectTreasury(referenceDate) {
  const sourceConfig = config.sources.treasury;
  const xml = await fetchText(sourceConfig.url);
  const dateBlocks = [...xml.matchAll(/<G_NEW_DATE>([\s\S]*?)<\/G_NEW_DATE>/gi)].map((m) => m[1]);
  const observations = dateBlocks
    .map((block) => ({ block, sourceDate: isoFromTreasuryDate(tag(block, "BID_CURVE_DATE")) }))
    .filter((item) => item.sourceDate)
    .sort((a, b) => b.sourceDate.localeCompare(a.sourceDate));
  const latest = observations.find((item) => item.sourceDate <= referenceDate) ?? observations[0];
  if (!latest) throw new Error("Treasury XML contained no dated yield-curve observation.");

  const metrics = config.treasuryMetrics.map((definition) => {
    const raw = tag(latest.block, definition.xmlTag);
    const numeric = raw === null || raw === "" ? null : Number(raw);
    return normalizedMetric({
      id: definition.metricId,
      name: definition.name,
      value: Number.isFinite(numeric) ? numeric : null,
      unit: definition.unit,
      referenceDate,
      source: sourceConfig.name,
      sourceDate: latest.sourceDate,
      publicOutputAllowed: sourceConfig.publicOutputAllowed,
      status: Number.isFinite(numeric) ? "available" : "missing",
      qualityNote: Number.isFinite(numeric) ? null : `Treasury XML tag ${definition.xmlTag} was empty for the latest observation.`,
      sourceMeta: { provider: "US_TREASURY", xmlTag: definition.xmlTag, sourceUrl: sourceConfig.url },
    });
  });

  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  for (const definition of config.treasuryDerived) {
    const left = byId.get(definition.left);
    const right = byId.get(definition.right);
    const usable = [left, right].every((metric) => metric && Number.isFinite(Number(metric.value)) && !["missing", "error"].includes(metric.status));
    const value = usable ? Math.round((Number(left.value) - Number(right.value)) * 10000) / 100 : null;
    metrics.push(normalizedMetric({
      id: definition.metricId,
      name: definition.name,
      value,
      unit: definition.unit,
      referenceDate,
      source: `Derived from ${sourceConfig.name}`,
      sourceDate: latest.sourceDate,
      publicOutputAllowed: sourceConfig.publicOutputAllowed,
      status: usable ? ([left.status, right.status].includes("stale") ? "stale" : "available") : "missing",
      qualityNote: usable ? "Derived directly from official Treasury par-yield inputs." : "One or more Treasury inputs were unavailable.",
      sourceMeta: { provider: "DERIVED_US_TREASURY", formula: definition.formula, inputs: [definition.left, definition.right], publicOutputAllowed: true },
    }));
  }

  return {
    schemaVersion: "1.0",
    referenceDate,
    generatedAt: new Date().toISOString(),
    provider: "US_TREASURY",
    source: sourceConfig.name,
    publicOutputAllowed: sourceConfig.publicOutputAllowed,
    metrics,
  };
}

async function collectNyFed(referenceDate) {
  const sourceConfig = config.sources.nyFed;
  const metrics = [];
  for (const definition of config.nyFedMetrics) {
    try {
      const response = await fetch(definition.url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rows = Array.isArray(data.refRates) ? data.refRates : [];
      const row = [...rows].filter((item) => item.effectiveDate).sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)))[0];
      const numeric = row ? Number(row.percentRate) : NaN;
      metrics.push(normalizedMetric({
        id: definition.metricId,
        name: definition.name,
        value: Number.isFinite(numeric) ? numeric : null,
        unit: definition.unit,
        referenceDate,
        source: sourceConfig.name,
        sourceDate: row?.effectiveDate ?? null,
        publicOutputAllowed: sourceConfig.publicOutputAllowed,
        status: Number.isFinite(numeric) ? "available" : "missing",
        qualityNote: "Internal collection is enabled; public presentation is held back until the required New York Fed reference-rate notice/disclaimer is displayed.",
        sourceMeta: { provider: "NY_FED", endpoint: definition.url, type: row?.type ?? null },
      }));
    } catch (error) {
      metrics.push(normalizedMetric({
        id: definition.metricId,
        name: definition.name,
        value: null,
        unit: definition.unit,
        referenceDate,
        source: sourceConfig.name,
        sourceDate: null,
        publicOutputAllowed: sourceConfig.publicOutputAllowed,
        status: "error",
        qualityNote: error?.message ?? String(error),
        sourceMeta: { provider: "NY_FED", endpoint: definition.url },
      }));
    }
  }
  return {
    schemaVersion: "1.0",
    referenceDate,
    generatedAt: new Date().toISOString(),
    provider: "NY_FED",
    source: sourceConfig.name,
    publicOutputAllowed: sourceConfig.publicOutputAllowed,
    rightsStatus: "presentation_notice_required",
    metrics,
  };
}

function attachQuality(snapshot) {
  const counts = snapshot.metrics.reduce((acc, metric) => {
    acc[metric.status] = (acc[metric.status] ?? 0) + 1;
    return acc;
  }, {});
  snapshot.dataQuality = {
    total: snapshot.metrics.length,
    available: counts.available ?? 0,
    stale: counts.stale ?? 0,
    missing: counts.missing ?? 0,
    error: counts.error ?? 0,
  };
  return snapshot;
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const treasury = attachQuality(await collectTreasury(referenceDate));
const nyFed = attachQuality(await collectNyFed(referenceDate));

for (const [envName, snapshot] of [["TREASURY_OUTPUT", treasury], ["NYFED_OUTPUT", nyFed]]) {
  const outputPath = process.env[envName]?.trim();
  if (!outputPath) continue;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

console.log(`US Treasury collection: total=${treasury.dataQuality.total}, available=${treasury.dataQuality.available}, stale=${treasury.dataQuality.stale}, missing=${treasury.dataQuality.missing}, error=${treasury.dataQuality.error}`);
console.log(`NY Fed collection: total=${nyFed.dataQuality.total}, available=${nyFed.dataQuality.available}, stale=${nyFed.dataQuality.stale}, missing=${nyFed.dataQuality.missing}, error=${nyFed.dataQuality.error}; publicOutputAllowed=${nyFed.publicOutputAllowed}`);
if (treasury.dataQuality.error > 0 || nyFed.dataQuality.error > 0) process.exitCode = 1;
