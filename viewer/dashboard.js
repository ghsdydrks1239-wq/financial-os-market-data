const {
  attentionMetrics,
  curvePoints,
  filterMetrics,
  findMetric,
  formatValue,
  metrics,
  metricsByAsset,
  providerCounts,
  statusCounts,
} = window.MarketModel;

const snapshot = window.MARKET_DATA;
const localMeta = window.MARKET_LOCAL_META ?? {};
const root = document.querySelector("#dashboard");
const searchInput = document.querySelector("#metric-search");
const resultCount = document.querySelector("#result-count");
const state = { tab: "overview", query: "" };

const STATUS_LABEL = { available: "정상", stale: "지연", missing: "누락", error: "오류" };
const STATUS_CLASS = { available: "ok", stale: "warn", missing: "muted", error: "bad" };

const CURVES = {
  korea: [
    { id: "kr_fi_3y", tenor: 3, label: "3Y" }, { id: "kr_fi_5y", tenor: 5, label: "5Y" },
    { id: "kr_fi_10y", tenor: 10, label: "10Y" }, { id: "kr_fi_20y", tenor: 20, label: "20Y" },
    { id: "kr_fi_30y", tenor: 30, label: "30Y" }, { id: "kr_fi_50y", tenor: 50, label: "50Y" },
  ],
  us: [
    { id: "gl_fi_ust_3m", tenor: 0.25, label: "3M" }, { id: "gl_fi_ust_1y", tenor: 1, label: "1Y" },
    { id: "gl_fi_ust_2y", tenor: 2, label: "2Y" }, { id: "gl_fi_ust_3y", tenor: 3, label: "3Y" },
    { id: "gl_fi_ust_5y", tenor: 5, label: "5Y" }, { id: "gl_fi_ust_10y", tenor: 10, label: "10Y" },
    { id: "gl_fi_ust_20y", tenor: 20, label: "20Y" }, { id: "gl_fi_ust_30y", tenor: 30, label: "30Y" },
  ],
  japan: [
    { id: "gl_fi_jgb_2y", tenor: 2, label: "2Y" }, { id: "gl_fi_jgb_3y", tenor: 3, label: "3Y" },
    { id: "gl_fi_jgb_5y", tenor: 5, label: "5Y" }, { id: "gl_fi_jgb_10y", tenor: 10, label: "10Y" },
    { id: "gl_fi_jgb_20y", tenor: 20, label: "20Y" }, { id: "gl_fi_jgb_30y", tenor: 30, label: "30Y" },
    { id: "gl_fi_jgb_40y", tenor: 40, label: "40Y" },
  ],
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function statusPill(status) {
  return `<span class="status-pill ${STATUS_CLASS[status] ?? "muted"}">${STATUS_LABEL[status] ?? escapeHtml(status)}</span>`;
}

function metricCard(metric) {
  if (!metric) return "";
  return `<article class="metric-card ${STATUS_CLASS[metric.status] ?? "muted"}">
    <div class="metric-heading"><span>${escapeHtml(metric.name)}</span>${statusPill(metric.status)}</div>
    <div class="metric-value">${escapeHtml(formatValue(metric))}<small>${escapeHtml(metric.unit ?? "")}</small></div>
    <div class="metric-meta"><span>${escapeHtml(metric.sourceDate ?? "기준일 없음")}</span><span title="${escapeHtml(metric.source)}">${escapeHtml(metric.sourceMeta?.provider ?? metric.source ?? "출처 없음")}</span></div>
  </article>`;
}

function metricTable(items, emptyMessage = "표시할 지표가 없습니다.") {
  const filtered = filterMetrics(items, state.query);
  resultCount.textContent = String(filtered.length);
  if (!filtered.length) return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>지표</th><th class="number">값</th><th>단위</th><th>기준일</th><th>상태</th><th>출처</th></tr></thead>
    <tbody>${filtered.map((metric) => `<tr>
      <td><strong>${escapeHtml(metric.name)}</strong><small>${escapeHtml(metric.id)}</small></td>
      <td class="number value-cell">${escapeHtml(formatValue(metric))}</td>
      <td>${escapeHtml(metric.unit ?? "—")}</td><td>${escapeHtml(metric.sourceDate ?? "—")}</td>
      <td>${statusPill(metric.status)}</td><td class="source-cell" title="${escapeHtml(metric.source)}">${escapeHtml(metric.sourceMeta?.provider ?? metric.source ?? "—")}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function curveChart(title, definitions) {
  const points = curvePoints(snapshot, definitions);
  if (points.length < 2) return `<section class="curve-panel"><div class="section-title"><h3>${escapeHtml(title)}</h3></div><div class="empty-state compact">표시 가능한 수익률이 부족합니다.</div></section>`;
  const width = 760; const height = 250; const left = 56; const right = 28; const top = 28; const bottom = 46;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values); const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.18, 0.08);
  const yMin = minimum - padding; const yMax = maximum + padding;
  const x = (index) => left + (index * (width - left - right)) / Math.max(points.length - 1, 1);
  const y = (value) => top + ((yMax - value) * (height - top - bottom)) / (yMax - yMin);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((ratio) => {
    const value = yMax - (yMax - yMin) * ratio; const yy = top + (height - top - bottom) * ratio;
    return `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" class="grid-line"/><text x="${left - 10}" y="${yy + 4}" text-anchor="end" class="axis-label">${value.toFixed(2)}%</text>`;
  }).join("");
  const marks = points.map((point, index) => `<g><circle cx="${x(index)}" cy="${y(point.value)}" r="4.5"/><text x="${x(index)}" y="${height - 17}" text-anchor="middle" class="axis-label">${point.label}</text><text x="${x(index)}" y="${y(point.value) - 11}" text-anchor="middle" class="point-label">${point.value.toFixed(2)}</text></g>`).join("");
  return `<section class="curve-panel"><div class="section-title"><h3>${escapeHtml(title)}</h3><span>${escapeHtml(points[0].sourceDate ?? "")}</span></div>
    <svg class="curve-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)} 수익률곡선">${ticks}<path d="${path}" class="curve-line"/>${marks}</svg></section>`;
}

function sectionHeading(kicker, title, description) {
  return `<div class="section-heading"><div><p>${escapeHtml(kicker)}</p><h2>${escapeHtml(title)}</h2></div><span>${escapeHtml(description)}</span></div>`;
}

function renderOverview() {
  const counts = statusCounts(snapshot);
  const keyIds = ["kr_fi_metric_134", "kr_fi_3y", "kr_fi_10y", "kr_fi_aa", "fx_usd_krw", "gl_fi_ust_2y", "gl_fi_ust_10y", "gl_fi_ust_2s10s", "gl_fi_iorb", "gl_fi_on_rrp_balance", "gl_fi_sahm_rule", "gl_fi_oecd_leading_indicators"];
  const keys = filterMetrics(keyIds.map((id) => findMetric(snapshot, id)).filter(Boolean), state.query);
  resultCount.textContent = String(keys.length);
  const issues = attentionMetrics(snapshot).slice(0, 6);
  return `${sectionHeading("DAILY CONTROL BOARD", "Overview", "현재 확보된 금리·유동성·환율을 한 화면에서 확인합니다.")}
    <section class="health-strip">
      <div><span>전체</span><strong>${metrics(snapshot).length}</strong></div>
      <div class="ok"><span>정상</span><strong>${counts.available}</strong></div>
      <div class="warn"><span>지연</span><strong>${counts.stale}</strong></div>
      <div class="muted"><span>누락</span><strong>${counts.missing}</strong></div>
      <div class="bad"><span>오류</span><strong>${counts.error}</strong></div>
    </section>
    ${issues.length ? `<section class="attention"><div><p>DATA ATTENTION</p><strong>${issues.length}개 우선 표시</strong></div><div>${issues.map((item) => `<span>${statusPill(item.status)} ${escapeHtml(item.name)}</span>`).join("")}</div></section>` : ""}
    <div class="metric-grid">${keys.map(metricCard).join("") || `<div class="empty-state">검색 결과가 없습니다.</div>`}</div>
    <div class="curve-grid">${curveChart("Korea Government Curve", CURVES.korea)}${curveChart("U.S. Treasury Curve", CURVES.us)}</div>`;
}

function renderKorea() {
  return `${sectionHeading("DOMESTIC FIXED INCOME", "Korea Rates & Credit", "국고채·단기금리·회사채와 검증된 파생 스프레드")}
    <div class="curve-grid single">${curveChart("Korea Government Curve", CURVES.korea)}</div>
    ${metricTable(metricsByAsset(snapshot, "rates_credit_kr"))}`;
}

function renderGlobal() {
  return `${sectionHeading("GLOBAL FIXED INCOME", "Global Rates & Liquidity", "미국·일본·유럽 금리와 중앙은행 유동성 지표")}
    <div class="curve-grid">${curveChart("U.S. Treasury Curve", CURVES.us)}${curveChart("Japan Government Curve", CURVES.japan)}</div>
    ${metricTable(metricsByAsset(snapshot, "rates_credit_global"))}`;
}

function renderFx() {
  return `${sectionHeading("CROSS-BORDER PRICES", "Foreign Exchange", "원화 환율과 BIS 기준 주요 달러 교차환율")}
    ${metricTable(metricsByAsset(snapshot, "fx"))}`;
}

function renderQuality() {
  const counts = statusCounts(snapshot);
  const attention = filterMetrics(attentionMetrics(snapshot), state.query);
  resultCount.textContent = String(attention.length);
  const providers = providerCounts(snapshot);
  return `${sectionHeading("PIPELINE CONTROL", "Data Quality", "누락·오류·기준일·출처를 숨기지 않고 표시합니다.")}
    <section class="health-strip large">
      <div class="ok"><span>Available</span><strong>${counts.available}</strong></div><div class="warn"><span>Stale</span><strong>${counts.stale}</strong></div>
      <div class="muted"><span>Missing</span><strong>${counts.missing}</strong></div><div class="bad"><span>Error</span><strong>${counts.error}</strong></div>
    </section>
    <section class="provider-panel"><div class="section-title"><h3>Source Coverage</h3><span>${providers.length} providers</span></div>
      <div class="provider-grid">${providers.map((item) => `<div><span>${escapeHtml(item.provider)}</span><strong>${item.count}</strong></div>`).join("")}</div></section>
    <section class="quality-table"><div class="section-title"><h3>Needs Attention</h3><span>${attention.length} metrics</span></div>
      ${metricTable(attention, "현재 누락·지연·오류 지표가 없습니다.")}</section>`;
}

function render() {
  if (!snapshot) return;
  const renderers = { overview: renderOverview, korea: renderKorea, global: renderGlobal, fx: renderFx, quality: renderQuality };
  root.innerHTML = (renderers[state.tab] ?? renderOverview)();
}

function initialize() {
  if (!snapshot) {
    root.innerHTML = `<div class="fatal-state"><strong>데이터 파일을 찾지 못했습니다.</strong><span>저장소 루트의 START_MARKET_DASHBOARD.bat를 더블클릭해 주세요.</span></div>`;
    document.querySelector(".toolbar").hidden = true;
    return;
  }
  const counts = statusCounts(snapshot);
  document.querySelector("#reference-date").textContent = `${snapshot.referenceDate ?? "—"} · KST`;
  document.querySelector("#health-label").textContent = `${counts.available}/${metrics(snapshot).length} 정상`;
  document.querySelector("#health-label").className = counts.error ? "text-bad" : counts.missing || counts.stale ? "text-warn" : "text-ok";
  document.querySelector("#loaded-at").textContent = formatDateTime(localMeta.loadedAt ?? snapshot.generatedAt);
  document.querySelector("#data-source-label").textContent = localMeta.source ?? "Local snapshot";
  if (localMeta.warning) {
    const notice = document.querySelector("#notice"); notice.hidden = false; notice.textContent = localMeta.warning;
  }
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
    state.tab = button.dataset.tab;
    document.querySelectorAll(".tab").forEach((tab) => { tab.classList.toggle("is-active", tab === button); tab.setAttribute("aria-selected", String(tab === button)); });
    render(); root.focus({ preventScroll: true });
  }));
  searchInput.addEventListener("input", () => { state.query = searchInput.value; render(); });
  render();
}

initialize();
