import fs from "node:fs/promises";
import path from "node:path";

const ecosPath = process.env.ECOS_INPUT?.trim();
const derivedPath = process.env.DERIVED_INPUT?.trim();
const treasuryPath = process.env.TREASURY_INPUT?.trim();
const fedLiquidityPath = process.env.FED_LIQUIDITY_INPUT?.trim();
const usCpPath = process.env.US_CP_INPUT?.trim();
const usLaborSignalsPath = process.env.US_LABOR_SIGNALS_INPUT?.trim();
const outputPath = process.env.OUTPUT_PATH?.trim();
if (!ecosPath || !derivedPath || !outputPath) {
  throw new Error("ECOS_INPUT, DERIVED_INPUT and OUTPUT_PATH are required.");
}

const snapshots = await Promise.all([
  fs.readFile(ecosPath, "utf8").then(JSON.parse),
  fs.readFile(derivedPath, "utf8").then(JSON.parse),
  ...(treasuryPath ? [fs.readFile(treasuryPath, "utf8").then(JSON.parse)] : []),
  ...(fedLiquidityPath ? [fs.readFile(fedLiquidityPath, "utf8").then(JSON.parse)] : []),
  ...(usCpPath ? [fs.readFile(usCpPath, "utf8").then(JSON.parse)] : []),
  ...(usLaborSignalsPath ? [fs.readFile(usLaborSignalsPath, "utf8").then(JSON.parse)] : []),
]);

const referenceDate = snapshots[0]?.referenceDate;
if (!referenceDate || snapshots.some((snapshot) => snapshot.referenceDate !== referenceDate)) {
  throw new Error(`Snapshot referenceDate mismatch: ${snapshots.map((s) => s.referenceDate).join(", ")}`);
}
for (const snapshot of snapshots) {
  if (snapshot.publicOutputAllowed !== true) {
    throw new Error(`A non-public source was passed to the public snapshot builder: ${snapshot.provider ?? "unknown"}`);
  }
}

const metrics = snapshots.flatMap((snapshot) => snapshot.metrics ?? []);
const ids = new Set();
for (const metric of metrics) {
  if (ids.has(metric.id)) throw new Error(`Duplicate metric id in public snapshot: ${metric.id}`);
  ids.add(metric.id);
  if (metric.sourceMeta?.publicOutputAllowed === false) {
    throw new Error(`Metric is not public-output-safe: ${metric.id}`);
  }
}

const order = new Map([["rates_credit_kr", 1], ["rates_credit_global", 2], ["fx", 3]]);
metrics.sort((a, b) => {
  const assetOrder = (order.get(a.assetClass) ?? 99) - (order.get(b.assetClass) ?? 99);
  return assetOrder || String(a.id).localeCompare(String(b.id));
});

const counts = metrics.reduce((acc, metric) => {
  acc[metric.status] = (acc[metric.status] ?? 0) + 1;
  return acc;
}, {});

const output = {
  schemaVersion: "1.0",
  referenceDate,
  generatedAt: new Date().toISOString(),
  purpose: "Financial OS MARKET BRIEF verified-number bundle",
  publicOutputAllowed: true,
  providers: snapshots.map((snapshot) => snapshot.provider),
  excludedProviders: ["KRX", "NY_FED_REFERENCE_RATES", "FRED_COPYRIGHTED"],
  exclusionNote: "KRX values remain excluded pending redistribution-rights resolution. NY Fed SOFR/EFFR reference-rate values remain excluded until their required presentation notice is wired into the frontend; NY Fed reverse-repo operation data are collected directly and are included. Copyrighted FRED series are not ingested into the AI-facing public bundle without a separate rights review.",
  dataQuality: {
    total: metrics.length,
    available: counts.available ?? 0,
    stale: counts.stale ?? 0,
    missing: counts.missing ?? 0,
    error: counts.error ?? 0,
  },
  metrics,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Public snapshot: total=${metrics.length}, available=${output.dataQuality.available}, stale=${output.dataQuality.stale}, missing=${output.dataQuality.missing}, error=${output.dataQuality.error}`);
