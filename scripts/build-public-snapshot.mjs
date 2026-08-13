import fs from "node:fs/promises";
import path from "node:path";

const ecosPath = process.env.ECOS_INPUT?.trim();
const derivedPath = process.env.DERIVED_INPUT?.trim();
const outputPath = process.env.OUTPUT_PATH?.trim();
if (!ecosPath || !derivedPath || !outputPath) {
  throw new Error("ECOS_INPUT, DERIVED_INPUT and OUTPUT_PATH are required.");
}

const [ecos, derived] = await Promise.all([
  fs.readFile(ecosPath, "utf8").then(JSON.parse),
  fs.readFile(derivedPath, "utf8").then(JSON.parse),
]);

if (ecos.referenceDate !== derived.referenceDate) {
  throw new Error(`Snapshot referenceDate mismatch: ECOS=${ecos.referenceDate}, derived=${derived.referenceDate}`);
}
if (ecos.publicOutputAllowed !== true || derived.publicOutputAllowed !== true) {
  throw new Error("A non-public source was passed to the public snapshot builder.");
}

const metrics = [...(ecos.metrics ?? []), ...(derived.metrics ?? [])];
const ids = new Set();
for (const metric of metrics) {
  if (ids.has(metric.id)) throw new Error(`Duplicate metric id in public snapshot: ${metric.id}`);
  ids.add(metric.id);
  if (metric.sourceMeta?.publicOutputAllowed === false) {
    throw new Error(`Metric is not public-output-safe: ${metric.id}`);
  }
}

const order = new Map([["rates_credit_kr", 1], ["fx", 2]]);
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
  referenceDate: ecos.referenceDate,
  generatedAt: new Date().toISOString(),
  purpose: "Financial OS MARKET BRIEF verified-number bundle",
  publicOutputAllowed: true,
  providers: ["ECOS", "DERIVED_ECOS"],
  excludedProviders: ["KRX"],
  exclusionNote: "KRX OPEN API values are intentionally excluded from this public bundle pending redistribution-rights resolution.",
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
