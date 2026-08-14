import dns from "node:dns";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchEcosStatistic } from "../src/collectors/ecos.mjs";
import { applyLastGoodFallback, selectLatestUsableSnapshot } from "../src/lib/last-good-fallback.mjs";

dns.setDefaultResultOrder("ipv4first");

const CONFIG_PATH = new URL("../config/ecos-series.v1.json", import.meta.url);
const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function compactDate(date) {
  return date.replaceAll("-", "");
}

function isoDate(compact) {
  if (!/^\d{8}$/.test(String(compact ?? ""))) return null;
  const text = String(compact);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function minusDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function calendarAgeDays(referenceDate, sourceDate) {
  if (!sourceDate) return null;
  const a = Date.parse(`${referenceDate}T00:00:00Z`);
  const b = Date.parse(`${sourceDate}T00:00:00Z`);
  return Math.round((a - b) / 86400000);
}

function parseValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replaceAll(",", "").trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : String(value);
}

function rowsFrom(data) {
  return Array.isArray(data?.StatisticSearch?.row) ? data.StatisticSearch.row : [];
}

async function loadFallbackSnapshot(inputPath) {
  const directory = path.dirname(inputPath);
  const candidates = [];
  let entries = [];

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const candidatePaths = new Set([inputPath]);
  for (const entry of entries) {
    if (entry.isFile() && (entry.name === "latest.json" || /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))) {
      candidatePaths.add(path.join(directory, entry.name));
    }
  }

  for (const candidatePath of candidatePaths) {
    try {
      candidates.push(JSON.parse(await fs.readFile(candidatePath, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`Ignoring unusable ECOS fallback file ${candidatePath}: ${error?.message ?? error}`);
    }
  }

  return selectLatestUsableSnapshot(candidates);
}

async function fetchRows(metric, referenceDate, itemCode = metric.itemCode) {
  const startDate = compactDate(minusDays(referenceDate, metric.lookbackDays ?? 14));
  const endDate = compactDate(referenceDate);
  const data = await fetchEcosStatistic({
    statisticCode: metric.statisticCode,
    cycle: metric.cycle,
    startDate,
    endDate,
    itemCodes: [itemCode],
    start: 1,
    end: 1000,
  });
  return rowsFrom(data);
}

function latestRow(rows) {
  return [...rows]
    .filter((row) => /^\d{8}$/.test(String(row.TIME ?? "")))
    .sort((a, b) => String(b.TIME).localeCompare(String(a.TIME)))[0] ?? null;
}

async function collectMetric(metric, referenceDate, collectedAt) {
  const assetClass = metric.metricId.startsWith("fx_") ? "fx" : "rates_credit_kr";
  const base = {
    id: metric.metricId,
    name: metric.name,
    assetClass,
    value: null,
    unit: metric.unit ?? null,
    referenceDate,
    source: config.source,
    sourceDate: null,
    expectedSourceDate: null,
    marketSession: assetClass === "fx" ? "KR_FX_DAILY" : "KR_RATES_DAILY",
    sessionAligned: null,
    status: "missing",
    isStale: false,
    qualityNote: null,
    collectedAt,
    sourceMeta: {
      provider: config.provider,
      statisticCode: metric.statisticCode ?? null,
      itemCode: metric.itemCode ?? null,
      definition: metric.definition ?? null,
      publicOutputAllowed: config.publicOutputAllowed,
    },
  };

  if (metric.status === "unresolved") {
    return {
      ...base,
      status: "missing",
      qualityNote: metric.reason ?? "Source mapping unresolved.",
      sourceMeta: { ...base.sourceMeta, mappingStatus: "unresolved" },
    };
  }

  try {
    let rows = await fetchRows(metric, referenceDate);
    let usedItemCode = metric.itemCode;
    let usedFallback = false;

    if (rows.length === 0 && metric.fallbackItemCode) {
      rows = await fetchRows(metric, referenceDate, metric.fallbackItemCode);
      usedItemCode = metric.fallbackItemCode;
      usedFallback = rows.length > 0;
    }

    const row = latestRow(rows);
    if (!row) {
      return { ...base, qualityNote: `No ECOS observation found within ${metric.lookbackDays ?? 14} calendar days.` };
    }

    const sourceDate = isoDate(row.TIME);
    const ageDays = calendarAgeDays(referenceDate, sourceDate);
    const value = parseValue(row.DATA_VALUE);
    if (value === null) {
      return { ...base, sourceDate, status: "missing", qualityNote: "ECOS returned an observation with an empty DATA_VALUE." };
    }

    const latestEffective = metric.freshnessMode === "latest_effective";
    const isStale = !latestEffective && ageDays !== null && ageDays > 7;
    const status = isStale ? "stale" : "available";

    return {
      ...base,
      value,
      unit: row.UNIT_NAME || metric.unit || null,
      sourceDate,
      expectedSourceDate: latestEffective ? null : sourceDate,
      sessionAligned: latestEffective ? true : (isStale ? false : null),
      status,
      isStale,
      qualityNote: usedFallback
        ? `Primary item had no data in range; fallback item ${usedItemCode} was used.`
        : (latestEffective ? "Latest effective policy value; sourceDate is not expected to equal referenceDate." : "Daily-session calendar alignment is provisional until the KR market holiday calendar is added."),
      sourceMeta: {
        ...base.sourceMeta,
        itemCode: usedItemCode,
        fallbackUsed: usedFallback,
        observedItemName: row.ITEM_NAME1 ?? null,
      },
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      qualityNote: error?.message ?? String(error),
    };
  }
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
  throw new Error("REFERENCE_DATE must be YYYY-MM-DD.");
}

const collectedAt = new Date().toISOString();
let metrics = [];
for (const metric of config.metrics) {
  metrics.push(await collectMetric(metric, referenceDate, collectedAt));
}

let liveCollectionErrors = metrics.filter((metric) => metric.status === "error").length;
let carriedForward = 0;
const fallbackInputPath = process.env.FALLBACK_INPUT_PATH?.trim();
if (fallbackInputPath) {
  const previousSnapshot = await loadFallbackSnapshot(fallbackInputPath);
  if (previousSnapshot) {
    const fallback = applyLastGoodFallback({ metrics, previousSnapshot, referenceDate, collectedAt });
    metrics = fallback.metrics;
    liveCollectionErrors = fallback.liveCollectionErrors;
    carriedForward = fallback.carriedForward;
  } else {
    console.warn(`No usable ECOS fallback snapshot found near: ${fallbackInputPath}`);
  }
}

const counts = metrics.reduce((acc, metric) => {
  acc[metric.status] = (acc[metric.status] ?? 0) + 1;
  return acc;
}, {});

const snapshot = {
  schemaVersion: "1.0",
  referenceDate,
  generatedAt: collectedAt,
  provider: config.provider,
  source: config.source,
  publicOutputAllowed: config.publicOutputAllowed,
  dataQuality: {
    total: metrics.length,
    available: counts.available ?? 0,
    stale: counts.stale ?? 0,
    missing: counts.missing ?? 0,
    error: counts.error ?? 0,
    liveCollectionErrors,
    carriedForward,
  },
  metrics,
};

const outputPath = process.env.OUTPUT_PATH?.trim();
if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

console.log(`ECOS collection: referenceDate=${referenceDate}, total=${metrics.length}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`);
if (carriedForward > 0) console.log(`ECOS fallback: carriedForward=${carriedForward}, liveCollectionErrors=${liveCollectionErrors}`);
for (const metric of metrics) {
  const detail = metric.status === "error" ? ` error=${metric.qualityNote}` : "";
  console.log(`${metric.status.toUpperCase()} ${metric.id} sourceDate=${metric.sourceDate ?? "null"}${detail}`);
}

if (snapshot.dataQuality.error > 0 && process.env.STRICT_ERRORS === "1") process.exitCode = 1;
