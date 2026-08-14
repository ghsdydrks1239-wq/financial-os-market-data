import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
await import("./model.js");
const {
  attentionMetrics,
  curvePoints,
  filterMetrics,
  metrics,
  metricsByAsset,
  statusCounts,
} = globalThis.MarketModel;

const snapshot = JSON.parse(await fs.readFile(new URL("../data/public/latest.json", import.meta.url), "utf8"));

test("snapshot health counts reconcile to the metric total", () => {
  const counts = statusCounts(snapshot);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), metrics(snapshot).length);
  assert.equal(metrics(snapshot).length, snapshot.dataQuality.total);
});

test("dashboard exposes the three public asset groups", () => {
  assert.ok(metricsByAsset(snapshot, "rates_credit_kr").length > 0);
  assert.ok(metricsByAsset(snapshot, "rates_credit_global").length > 0);
  assert.ok(metricsByAsset(snapshot, "fx").length > 0);
});

test("search matches metric names and source metadata", () => {
  const all = metrics(snapshot);
  assert.ok(filterMetrics(all, "USD/KRW").some((metric) => metric.id === "fx_usd_krw"));
  assert.ok(filterMetrics(all, "treasury").length > 0);
});

test("attention list contains only non-available metrics", () => {
  assert.ok(attentionMetrics(snapshot).every((metric) => metric.status !== "available"));
});

test("yield curve excludes missing or errored values", () => {
  const definitions = [
    { id: "gl_fi_ust_2y", tenor: 2, label: "2Y" },
    { id: "gl_fi_ust_10y", tenor: 10, label: "10Y" },
    { id: "does_not_exist", tenor: 30, label: "30Y" },
  ];
  assert.ok(curvePoints(snapshot, definitions).every((point) => point.status === "available" && typeof point.value === "number"));
});
