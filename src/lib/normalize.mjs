const VALID_STATUS = new Set(["available", "stale", "missing", "error"]);

export function normalizeMetric(input) {
  const status = VALID_STATUS.has(input.status) ? input.status : "error";
  const value = input.value === undefined ? null : input.value;

  return {
    id: input.id,
    name: input.name,
    assetClass: input.assetClass,
    value,
    unit: input.unit ?? null,
    referenceDate: input.referenceDate ?? null,
    source: input.source ?? null,
    sourceDate: input.sourceDate ?? null,
    expectedSourceDate: input.expectedSourceDate ?? null,
    marketSession: input.marketSession ?? null,
    sessionAligned: input.sessionAligned ?? null,
    status,
    isStale: status === "stale",
    qualityNote: input.qualityNote ?? null,
    collectedAt: input.collectedAt ?? new Date().toISOString(),
  };
}

export function missingMetric(meta, reason) {
  return normalizeMetric({
    ...meta,
    value: null,
    status: "missing",
    qualityNote: reason,
  });
}
