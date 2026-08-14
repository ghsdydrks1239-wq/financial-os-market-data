import test from "node:test";
import assert from "node:assert/strict";
import { applyLastGoodFallback, selectLatestUsableSnapshot } from "../src/lib/last-good-fallback.mjs";

const previousSnapshot = {
  referenceDate: "2026-08-13",
  metrics: [
    {
      id: "kr_fi_3y",
      value: 3.781,
      unit: "%",
      sourceDate: "2026-08-13",
      status: "available",
      sourceMeta: { itemCode: "010200000", observedItemName: "국고채(3년)" },
    },
  ],
};

test("carries forward the last good value as stale after a live error", () => {
  const result = applyLastGoodFallback({
    metrics: [{
      id: "kr_fi_3y",
      value: null,
      unit: "%",
      sourceDate: null,
      status: "error",
      isStale: false,
      qualityNote: "fetch failed",
      sourceMeta: { itemCode: "010200000" },
    }],
    previousSnapshot,
    referenceDate: "2026-08-14",
    collectedAt: "2026-08-14T00:00:00.000Z",
  });

  assert.equal(result.liveCollectionErrors, 1);
  assert.equal(result.carriedForward, 1);
  assert.equal(result.metrics[0].value, 3.781);
  assert.equal(result.metrics[0].status, "stale");
  assert.equal(result.metrics[0].sourceDate, "2026-08-13");
  assert.equal(result.metrics[0].sessionAligned, false);
  assert.match(result.metrics[0].qualityNote, /carried forward/);
  assert.equal(result.metrics[0].sourceMeta.carryForward.snapshotReferenceDate, "2026-08-13");
});

test("does not replace an error when no usable prior value exists", () => {
  const result = applyLastGoodFallback({
    metrics: [{ id: "fx_usd_krw", value: null, status: "error", qualityNote: "fetch failed" }],
    previousSnapshot,
    referenceDate: "2026-08-14",
    collectedAt: "2026-08-14T00:00:00.000Z",
  });

  assert.equal(result.carriedForward, 0);
  assert.equal(result.metrics[0].status, "error");
  assert.equal(result.metrics[0].value, null);
});

test("leaves successful live observations unchanged", () => {
  const live = { id: "kr_fi_3y", value: 3.8, status: "available", sourceDate: "2026-08-14" };
  const result = applyLastGoodFallback({
    metrics: [live],
    previousSnapshot,
    referenceDate: "2026-08-14",
    collectedAt: "2026-08-14T00:00:00.000Z",
  });

  assert.deepEqual(result.metrics[0], live);
  assert.equal(result.liveCollectionErrors, 0);
  assert.equal(result.carriedForward, 0);
});

test("selects an older usable snapshot when the newest snapshot contains only errors", () => {
  const failedSnapshot = {
    referenceDate: "2026-08-14",
    metrics: [{ id: "kr_fi_3y", value: null, status: "error" }],
  };

  assert.equal(
    selectLatestUsableSnapshot([previousSnapshot, failedSnapshot]),
    previousSnapshot,
  );
});
