import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile("config/bis-series.v1.json", "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function minusDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function parseCsvLine(line) {
  const out=[]; let cell=""; let quoted=false;
  for (let i=0;i<line.length;i+=1) {
    const ch=line[i];
    if (ch==='"') { if (quoted && line[i+1]==='"') { cell+='"'; i+=1; } else quoted=!quoted; }
    else if (ch==="," && !quoted) { out.push(cell); cell=""; }
    else cell+=ch;
  }
  out.push(cell); return out;
}
async function fetchRows(flow, key, referenceDate) {
  const startPeriod = minusDays(referenceDate, 45);
  const url = `${config.apiBase}/${flow}/1.0/${key}?startPeriod=${startPeriod}&endPeriod=${referenceDate}`;
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.sdmx.data+csv;version=2.0.0", "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`BIS HTTP ${response.status} for ${flow}/${key}`);
  const text = await response.text();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], url };
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine).map((values) => Object.fromEntries(header.map((name, i) => [name, values[i]])));
  return { rows, url };
}
function latestNumeric(rows, referenceDate) {
  return rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.TIME_PERIOD ?? ""))
    .filter((r) => r.TIME_PERIOD <= referenceDate && Number.isFinite(Number(r.OBS_VALUE)))
    .sort((a,b)=>b.TIME_PERIOD.localeCompare(a.TIME_PERIOD))[0] ?? null;
}
function ageDays(referenceDate, sourceDate) {
  if (!sourceDate) return null;
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`))/86400000);
}
function makeMetric(def, row, url, referenceDate, assetClass, flow) {
  const raw = row ? Number(row.OBS_VALUE) : null;
  const transformed = raw === null ? null : (def.transform === "invert" ? 1/raw : raw);
  const value = Number.isFinite(transformed) ? Number(transformed.toFixed(6)) : null;
  const sourceDate = row?.TIME_PERIOD ?? null;
  const staleAfterDays = assetClass === "fx" ? 7 : 14;
  const stale = value !== null && ageDays(referenceDate, sourceDate) > staleAfterDays;
  return {
    id: def.id, name: def.name, assetClass, value,
    unit: assetClass === "fx" ? def.definition : "%",
    referenceDate,
    source: `Bank for International Settlements (BIS) — ${flow === "WS_CBPOL" ? "Central bank policy rates" : "Bilateral exchange rates"}`,
    sourceDate, expectedSourceDate: null,
    marketSession: assetClass === "fx" ? "GLOBAL_FX_DAILY" : "GLOBAL_POLICY_RATE_DAILY",
    sessionAligned: stale ? false : null,
    status: value === null ? "missing" : (stale ? "stale" : "available"),
    isStale: stale,
    qualityNote: value === null ? "No numeric BIS observation found in lookback window." : (def.transform === "invert" ? "BIS publishes local-currency units per USD; value inverted to match the master metric quotation convention." : "Latest BIS observation; sourceDate preserved independently from referenceDate."),
    collectedAt: new Date().toISOString(),
    sourceMeta: {
      provider: config.provider, dataflow: flow, key: def.key,
      originalObsValue: raw, transform: def.transform ?? "identity",
      title: row?.TITLE ?? null, sourceAuthority: row?.SOURCE_REF ?? def.sourceAuthority ?? null,
      sourceUrl: url, rights: config.rights, publicOutputAllowed: true,
    },
  };
}

const referenceDate = process.env.REFERENCE_DATE?.trim() || kstToday();
const metrics=[];
for (const def of config.policyRates) {
  try { const {rows,url}=await fetchRows("WS_CBPOL",def.key,referenceDate); metrics.push(makeMetric(def,latestNumeric(rows,referenceDate),url,referenceDate,"rates_credit_global","WS_CBPOL")); }
  catch(error) { metrics.push({...makeMetric(def,null,null,referenceDate,"rates_credit_global","WS_CBPOL"), status:"error", qualityNote:error?.message??String(error)}); }
}
for (const def of config.fx) {
  try { const {rows,url}=await fetchRows("WS_XRU",def.key,referenceDate); metrics.push(makeMetric(def,latestNumeric(rows,referenceDate),url,referenceDate,"fx","WS_XRU")); }
  catch(error) { metrics.push({...makeMetric(def,null,null,referenceDate,"fx","WS_XRU"), status:"error", qualityNote:error?.message??String(error)}); }
}
const counts=metrics.reduce((a,m)=>{a[m.status]=(a[m.status]??0)+1;return a;},{});
const snapshot={schemaVersion:"1.0",referenceDate,generatedAt:new Date().toISOString(),provider:"BIS",source:"Bank for International Settlements (BIS)",publicOutputAllowed:true,dataQuality:{total:metrics.length,available:counts.available??0,stale:counts.stale??0,missing:counts.missing??0,error:counts.error??0},metrics};
const outputPath=process.env.OUTPUT_PATH?.trim();
if(outputPath){await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.writeFile(outputPath,`${JSON.stringify(snapshot,null,2)}\n`,`utf8`);}
console.log(`BIS collection: total=${metrics.length}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`);
for(const m of metrics) console.log(`${m.status.toUpperCase()} ${m.id} value=${m.value ?? "null"} sourceDate=${m.sourceDate ?? "null"} ${m.qualityNote ?? ""}`);
if(snapshot.dataQuality.error>0 && process.env.STRICT_ERRORS==="1") process.exitCode=1;
