import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile(new URL("../config/derived-kr-rates.v1.json", import.meta.url), "utf8"));
const inputPath = process.env.INPUT_PATH?.trim();
const outputPath = process.env.OUTPUT_PATH?.trim();
if (!inputPath || !outputPath) {
  throw new Error("INPUT_PATH and OUTPUT_PATH are required.");
}

const snapshot = JSON.parse(await fs.readFile(inputPath, "utf8"));
const byId = new Map((snapshot.metrics ?? []).map((metric) => [metric.id, metric]));

function maxDate(values) {
  const dates = values.filter(Boolean).sort();
  return dates.length ? dates.at(-1) : null;
}

function parseDifference(formula) {
  const match = String(formula).match(/^([A-Za-z0-9_]+)\s*-\s*([A-Za-z0-9_]+)$/);
  if (!match) throw new Error(`Unsupported derived formula: ${formula}`);
  return [match[1], match[2]];
}

const generatedAt = new Date().toISOString();
const metrics = config.metrics.map((definition) => {
  const [leftId, rightId] = parseDifference(definition.formula);
  const left = byId.get(leftId);
  const right = byId.get(rightId);
  const inputs = [left, right];
  const missingInput = inputs.find((input) => !input || input.value === null || input.value === undefined || ["missing", "error"].includes(input.status));
  const anyStale = inputs.some((input) => input?.status === "stale" || input?.isStale === true);
  const sourceDates = Object.fromEntries([[leftId, left?.sourceDate ?? null], [rightId, right?.sourceDate ?? null]]);

  if (missingInput) {
    return {
      id: definition.metricId,
      name: definition.name,
      assetClass: "rates_credit_kr",
      value: null,
      unit: definition.displayUnit,
      referenceDate: snapshot.referenceDate,
      source: "Derived from ECOS inputs",
      sourceDate: maxDate(Object.values(sourceDates)),
      expectedSourceDate: null,
      marketSession: "KR_RATES_DERIVED",
      sessionAligned: false,
      status: "missing",
      isStale: false,
      qualityNote: `Missing input for verified legacy formula: ${definition.formula}`,
      collectedAt: generatedAt,
      sourceMeta: { formula: definition.formula, displayFormula: definition.displayFormula, sourceDates, verification: definition.verification },
    };
  }

  const leftValue = Number(left.value);
  const rightValue = Number(right.value);
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return {
      id: definition.metricId,
      name: definition.name,
      assetClass: "rates_credit_kr",
      value: null,
      unit: definition.displayUnit,
      referenceDate: snapshot.referenceDate,
      source: "Derived from ECOS inputs",
      sourceDate: maxDate(Object.values(sourceDates)),
      expectedSourceDate: null,
      marketSession: "KR_RATES_DERIVED",
      sessionAligned: false,
      status: "error",
      isStale: false,
      qualityNote: `Non-numeric input for derived formula: ${definition.formula}`,
      collectedAt: generatedAt,
      sourceMeta: { formula: definition.formula, displayFormula: definition.displayFormula, sourceDates, verification: definition.verification },
    };
  }

  const value = Math.round((leftValue - rightValue) * 1000000) / 10000;
  const sessionAligned = inputs.every((input) => input.sessionAligned === true) ? true : null;
  return {
    id: definition.metricId,
    name: definition.name,
    assetClass: "rates_credit_kr",
    value,
    unit: definition.displayUnit,
    referenceDate: snapshot.referenceDate,
    source: "Derived from ECOS inputs",
    sourceDate: maxDate(Object.values(sourceDates)),
    expectedSourceDate: null,
    marketSession: "KR_RATES_DERIVED",
    sessionAligned,
    status: anyStale ? "stale" : "available",
    isStale: anyStale,
    qualityNote: "Formula recovered from the legacy workbook audit; no sign convention was guessed.",
    collectedAt: generatedAt,
    sourceMeta: {
      formula: definition.formula,
      displayFormula: definition.displayFormula,
      sourceDates,
      verification: definition.verification,
      publicOutputAllowed: true
    },
  };
});

const quality = metrics.reduce((acc, metric) => {
  acc[metric.status] = (acc[metric.status] ?? 0) + 1;
  return acc;
}, {});

const output = {
  schemaVersion: "1.0",
  referenceDate: snapshot.referenceDate,
  generatedAt,
  provider: "DERIVED_ECOS",
  source: "Verified legacy formulas applied to ECOS inputs",
  publicOutputAllowed: true,
  dataQuality: {
    total: metrics.length,
    available: quality.available ?? 0,
    stale: quality.stale ?? 0,
    missing: quality.missing ?? 0,
    error: quality.error ?? 0
  },
  metrics
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`KR rates derivation: total=${metrics.length}, available=${output.dataQuality.available}, stale=${output.dataQuality.stale}, missing=${output.dataQuality.missing}, error=${output.dataQuality.error}`);
if (output.dataQuality.error > 0) process.exitCode = 1;
