function hasUsableValue(metric) {
  return metric
    && metric.value !== null
    && metric.value !== undefined
    && ["available", "stale"].includes(metric.status);
}

export function selectLatestUsableSnapshot(snapshots) {
  return [...snapshots]
    .filter((snapshot) => (snapshot?.metrics ?? []).some(hasUsableValue))
    .sort((a, b) => String(b.referenceDate ?? "").localeCompare(String(a.referenceDate ?? "")))[0] ?? null;
}

export function applyLastGoodFallback({
  metrics,
  previousSnapshot,
  referenceDate,
  collectedAt,
}) {
  const previousById = new Map((previousSnapshot?.metrics ?? []).map((metric) => [metric.id, metric]));
  let liveCollectionErrors = 0;
  let carriedForward = 0;

  const resolved = metrics.map((metric) => {
    if (metric.status !== "error") return metric;
    liveCollectionErrors += 1;

    const previous = previousById.get(metric.id);
    if (!hasUsableValue(previous)) return metric;
    carriedForward += 1;

    const lastGoodDate = previous.sourceDate ?? previousSnapshot?.referenceDate ?? "unknown date";
    return {
      ...metric,
      value: previous.value,
      unit: previous.unit ?? metric.unit,
      referenceDate,
      sourceDate: previous.sourceDate ?? null,
      expectedSourceDate: previous.expectedSourceDate ?? null,
      sessionAligned: false,
      status: "stale",
      isStale: true,
      qualityNote: `Live ECOS collection failed; carried forward the last good observation from ${lastGoodDate}. Error: ${metric.qualityNote}`,
      collectedAt,
      sourceMeta: {
        ...metric.sourceMeta,
        itemCode: previous.sourceMeta?.itemCode ?? metric.sourceMeta?.itemCode ?? null,
        observedItemName: previous.sourceMeta?.observedItemName ?? null,
        carryForward: {
          type: "last_good_snapshot",
          snapshotReferenceDate: previousSnapshot?.referenceDate ?? null,
          previousStatus: previous.status,
        },
      },
    };
  });

  return { metrics: resolved, liveCollectionErrors, carriedForward };
}
