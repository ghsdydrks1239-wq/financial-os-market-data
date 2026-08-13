import fs from "node:fs/promises";

const registryPath = process.env.REGISTRY_PATH?.trim() || "config/metric-registry.v1.json";
const publicPath = process.env.PUBLIC_PATH?.trim() || "data/public/latest.json";

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
if (!Array.isArray(registry.columns) || !Array.isArray(registry.metrics)) {
  throw new Error("Registry must contain columns[] and metrics[].");
}
if (registry.metricCount !== 277 || registry.metrics.length !== 277) {
  throw new Error(`Expected 277 registry rows; header=${registry.metricCount}, rows=${registry.metrics.length}`);
}
const index = Object.fromEntries(registry.columns.map((name, i) => [name, i]));
for (const required of ["metricId", "category", "name", "kind", "importance", "primarySourceId", "automationStatus", "publicRepoSafe"]) {
  if (!(required in index)) throw new Error(`Missing registry column: ${required}`);
}
const ids = registry.metrics.map((row) => row[index.metricId]);
const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (duplicates.length) throw new Error(`Duplicate metricId(s): ${duplicates.join(", ")}`);
if (new Set(ids).size !== 277 || registry.uniqueMetricIdCount !== 277) {
  throw new Error(`Expected 277 unique ids; got ${new Set(ids).size}`);
}

const countBy = (field) => registry.metrics.reduce((acc, row) => {
  const key = String(row[index[field]] ?? "null");
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

let publicSnapshot = null;
try {
  publicSnapshot = JSON.parse(await fs.readFile(publicPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (publicSnapshot) {
  const registryIds = new Set(ids);
  const unknown = (publicSnapshot.metrics ?? []).map((m) => m.id).filter((id) => !registryIds.has(id));
  if (unknown.length) throw new Error(`Public snapshot contains ids absent from registry: ${unknown.join(", ")}`);
}

console.log(`Registry OK: rows=${registry.metrics.length}, uniqueIds=${new Set(ids).size}`);
console.log(`Categories: ${JSON.stringify(countBy("category"))}`);
console.log(`Importance: ${JSON.stringify(countBy("importance"))}`);
console.log(`Automation: ${JSON.stringify(countBy("automationStatus"))}`);
console.log(`Public-safe flags: ${JSON.stringify(countBy("publicRepoSafe"))}`);
if (publicSnapshot) console.log(`Public snapshot ids checked: ${(publicSnapshot.metrics ?? []).length}`);
