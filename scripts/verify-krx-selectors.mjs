import dns from "node:dns";
import fs from "node:fs/promises";

dns.setDefaultResultOrder("ipv4first");

const apiKey = process.env.KRX_API_KEY?.trim();
if (!apiKey) throw new Error("KRX_API_KEY is missing.");

const config = JSON.parse(await fs.readFile(new URL("../config/krx-series.v1.json", import.meta.url), "utf8"));

function yyyymmddKst(daysAgo) {
  const now = new Date(Date.now() - daysAgo * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

async function fetchRows(endpoint) {
  for (let daysAgo = 1; daysAgo <= 7; daysAgo += 1) {
    const url = new URL(endpoint);
    url.searchParams.set("basDd", yyyymmddKst(daysAgo));
    const response = await fetch(url, { headers: { AUTH_KEY: apiKey, Accept: "application/json" } });
    if (!response.ok) continue;
    const data = await response.json();
    const rows = Array.isArray(data.OutBlock_1) ? data.OutBlock_1 : [];
    if (rows.length > 0) return rows;
  }
  return [];
}

const cache = new Map();
async function rowsFor(ref) {
  if (!cache.has(ref)) cache.set(ref, await fetchRows(config.confirmedEndpoints[ref]));
  return cache.get(ref);
}

let failed = 0;
for (const metric of config.metrics) {
  const exact = metric.selector?.candidateExact;
  const field = metric.selector?.field;
  if (!metric.endpointRef || !exact || !field) continue;
  const rows = await rowsFor(metric.endpointRef);
  const matches = rows.filter((row) => String(row[field] ?? "") === exact).length;
  const ok = matches === 1;
  console.log(`${ok ? "FOUND" : "PENDING"} ${metric.metricId}: exactSelector=${ok}, matches=${matches}`);
  if (!ok) failed += 1;
}

const futuresRows = await rowsFor("futures");
const kospi200Futures = futuresRows.filter((row) => String(row.PROD_NM ?? "") === "코스피200 선물");
console.log(`${kospi200Futures.length > 0 ? "FOUND" : "PENDING"} kr_deriv_kospi200_futures: productSelector=${kospi200Futures.length > 0}`);
if (kospi200Futures.length === 0) failed += 1;

const optionRows = await rowsFor("options");
const kospi200Options = optionRows.filter((row) => String(row.PROD_NM ?? "") === "코스피200 옵션");
const hasCall = kospi200Options.some((row) => String(row.RGHT_TP_NM ?? "").toUpperCase() === "CALL");
const hasPut = kospi200Options.some((row) => String(row.RGHT_TP_NM ?? "").toUpperCase() === "PUT");
console.log(`${hasCall && hasPut ? "FOUND" : "PENDING"} kr_eq_metric_010: kospi200OptionCallPut=${hasCall && hasPut}`);
if (!hasCall || !hasPut) failed += 1;

console.log(`KRX selector verification complete: pending=${failed}`);
