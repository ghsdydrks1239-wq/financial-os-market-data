import fs from "node:fs/promises";
import path from "node:path";

const registryPath = process.env.REGISTRY_PATH?.trim() || "config/metric-registry.v1.json";
const publicPath = process.env.PUBLIC_PATH?.trim() || "data/public/latest.json";
const rightsPath = process.env.RIGHTS_PATH?.trim() || "config/source-rights-overrides.v1.json";
const outputJson = process.env.COVERAGE_JSON?.trim() || "data/coverage/latest.json";
const outputMd = process.env.COVERAGE_MD?.trim() || "MARKET_DATA_COVERAGE.md";

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const publicSnapshot = JSON.parse(await fs.readFile(publicPath, "utf8"));
const rights = JSON.parse(await fs.readFile(rightsPath, "utf8"));
const publicById = new Map((publicSnapshot.metrics ?? []).map((m) => [m.id, m]));

const rows = registry.metrics.map((row) => {
  const item = Object.fromEntries(registry.columns.map((name, i) => [name, row[i]]));
  const observed = publicById.get(item.metricId);
  const sourceOverride = rights.sourceFamilyOverrides?.[item.primarySourceId] ?? null;
  const metricOverride = rights.metricOverrides?.[item.metricId] ?? null;
  const override = metricOverride ?? sourceOverride;
  let coverageStatus = "not_collected";
  if (observed) coverageStatus = observed.status === "available" ? "public_available" : `public_${observed.status}`;
  else if (override?.coverageStatus) coverageStatus = override.coverageStatus;
  else if (item.publicRepoSafe === false) coverageStatus = "rights_blocked";
  else if (item.automationStatus === "license_review") coverageStatus = "rights_review";
  else if (["research", "optional_research", "endpoint_mapping_needed", "terms_and_endpoint_review"].includes(item.automationStatus)) coverageStatus = "research_needed";
  else if (String(item.automationStatus).startsWith("derived")) coverageStatus = "dependency_needed";
  else if (["source_ready_series_mapping", "collector_ready", "source_page_ready"].includes(item.automationStatus)) coverageStatus = "source_mapped_not_public_collected";
  return {
    ...item,
    coverageStatus,
    observedStatus: observed?.status ?? null,
    sourceDate: observed?.sourceDate ?? null,
    rightsPublicRepoSafe: override?.publicRepoSafe ?? item.publicRepoSafe ?? null,
    guardReason: override?.reason ?? null,
  };
});

function countBy(items, key) {
  return items.reduce((acc, item) => { const k=String(item[key] ?? "null"); acc[k]=(acc[k]??0)+1; return acc; }, {});
}
const coverage = countBy(rows, "coverageStatus");
const publicCount = rows.filter((r) => r.coverageStatus.startsWith("public_")).length;
const coreRows = rows.filter((r) => r.importance === "core");
const output = {
  schemaVersion: "1.0",
  referenceDate: publicSnapshot.referenceDate,
  generatedAt: new Date().toISOString(),
  masterTotal: rows.length,
  publicObservedTotal: publicCount,
  publicAvailable: coverage.public_available ?? 0,
  publicStale: coverage.public_stale ?? 0,
  publicMissing: coverage.public_missing ?? 0,
  publicError: coverage.public_error ?? 0,
  remaining: rows.length - publicCount,
  coverage,
  byCategory: countBy(rows, "category"),
  core: {
    total: coreRows.length,
    publicObserved: coreRows.filter((r) => r.coverageStatus.startsWith("public_")).length,
    available: coreRows.filter((r) => r.coverageStatus === "public_available").length,
    stale: coreRows.filter((r) => r.coverageStatus === "public_stale").length,
    remaining: coreRows.filter((r) => !r.coverageStatus.startsWith("public_")).length,
  },
  remainingByPrimarySource: countBy(rows.filter((r) => !r.coverageStatus.startsWith("public_")), "primarySourceId"),
  metrics: rows,
};

const categoryLines = Object.entries(output.byCategory).map(([k,v]) => `- ${k}: ${v}`).join("\n");
const sourceLines = Object.entries(output.remainingByPrimarySource).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${v}`).join("\n");
const statusLines = Object.entries(output.coverage).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${v}`).join("\n");
const guardedExamples = rows.filter((r)=>r.guardReason).slice(0,30).map((r)=>`- ${r.metricId} — ${r.name}: ${r.coverageStatus} — ${r.guardReason}`).join("\n") || "- 없음";
const md = `# MARKET DATA COVERAGE\n\n기준일: ${output.referenceDate}\n\n## 전체 진행률\n\n- Master: **${output.masterTotal}**\n- Public snapshot 포함: **${output.publicObservedTotal}**\n- Available: **${output.publicAvailable}**\n- Stale: **${output.publicStale}**\n- Missing: **${output.publicMissing}**\n- Error: **${output.publicError}**\n- 아직 public snapshot에 미포함: **${output.remaining}**\n\n## CORE 진행률\n\n- CORE 전체: **${output.core.total}**\n- Public snapshot 포함: **${output.core.publicObserved}**\n- Available: **${output.core.available}**\n- Stale: **${output.core.stale}**\n- 남음: **${output.core.remaining}**\n\n## Coverage status\n\n${statusLines}\n\n## Master category 수\n\n${categoryLines}\n\n## 남은 지표의 1차 source family\n\n${sourceLines}\n\n## 명시적 권리/접근 가드 대표 항목\n\n${guardedExamples}\n\n## 원칙\n\n- 숫자를 확보했다고 public으로 내보내지 않는다. 재배포 가능성이 확인된 원천만 public snapshot에 포함한다.\n- 명시적 rights/access guard는 registry의 초기 source-stage보다 우선한다.\n- stale은 숨기지 않고 stale로 보존한다.\n- 누락값은 0으로 대체하지 않는다.\n- CORE / DETAIL / REFERENCE는 표시 우선순위일 뿐 수집 제외 기준이 아니다.\n`;

await fs.mkdir(path.dirname(outputJson), { recursive: true });
await fs.writeFile(outputJson, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await fs.writeFile(outputMd, md, "utf8");
console.log(`Coverage: master=${output.masterTotal}, public=${output.publicObservedTotal}, available=${output.publicAvailable}, stale=${output.publicStale}, remaining=${output.remaining}`);
console.log(`CORE: total=${output.core.total}, public=${output.core.publicObserved}, available=${output.core.available}, stale=${output.core.stale}, remaining=${output.core.remaining}`);
