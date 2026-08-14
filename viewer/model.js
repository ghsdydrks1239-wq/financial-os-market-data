const STATUS_PRIORITY = new Map([["error", 0], ["missing", 1], ["stale", 2], ["available", 3]]);

function metrics(snapshot) {
  return Array.isArray(snapshot?.metrics) ? snapshot.metrics : [];
}

function statusCounts(snapshot) {
  const counts = { available: 0, stale: 0, missing: 0, error: 0 };
  for (const metric of metrics(snapshot)) {
    if (Object.hasOwn(counts, metric.status)) counts[metric.status] += 1;
  }
  return counts;
}

function metricsByAsset(snapshot, assetClass) {
  return metrics(snapshot)
    .filter((metric) => metric.assetClass === assetClass)
    .sort((a, b) => {
      const statusOrder = (STATUS_PRIORITY.get(a.status) ?? 9) - (STATUS_PRIORITY.get(b.status) ?? 9);
      return statusOrder || String(a.name).localeCompare(String(b.name), "ko");
    });
}

function findMetric(snapshot, id) {
  return metrics(snapshot).find((metric) => metric.id === id) ?? null;
}

function filterMetrics(items, query) {
  const term = String(query ?? "").trim().toLocaleLowerCase("ko");
  if (!term) return items;
  return items.filter((metric) => [metric.id, metric.name, metric.source, metric.unit, metric.sourceMeta?.provider]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase("ko").includes(term)));
}

function formatValue(metric) {
  if (metric?.value === null || metric?.value === undefined || metric?.value === "") return "—";
  if (typeof metric.value !== "number") return String(metric.value);
  const absolute = Math.abs(metric.value);
  const maximumFractionDigits = absolute >= 1000 ? 2 : absolute >= 100 ? 3 : 6;
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits }).format(metric.value);
}

function curvePoints(snapshot, definitions) {
  return definitions
    .map(({ id, tenor, label }) => {
      const metric = findMetric(snapshot, id);
      const value = typeof metric?.value === "number" ? metric.value : null;
      return { id, tenor, label, value, status: metric?.status ?? "missing", sourceDate: metric?.sourceDate ?? null };
    })
    .filter((point) => point.value !== null && point.status === "available");
}

function providerCounts(snapshot) {
  const counts = new Map();
  for (const metric of metrics(snapshot)) {
    const provider = metric.sourceMeta?.provider ?? metric.source ?? "Unknown";
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider));
}

function attentionMetrics(snapshot) {
  return metrics(snapshot).filter((metric) => metric.status !== "available")
    .sort((a, b) => (STATUS_PRIORITY.get(a.status) ?? 9) - (STATUS_PRIORITY.get(b.status) ?? 9));
}

globalThis.MarketModel = {
  attentionMetrics,
  curvePoints,
  filterMetrics,
  findMetric,
  formatValue,
  metrics,
  metricsByAsset,
  providerCounts,
  statusCounts,
};
