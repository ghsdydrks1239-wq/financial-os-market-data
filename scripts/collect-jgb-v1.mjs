import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile("config/japan-mof-jgb.v1.json", "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function normalizeDate(raw) {
  const value=String(raw??"").trim();
  let m=value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=value.match(/^([SHR])(\d+)\.(\d{1,2})\.(\d{1,2})$/i);
  if(!m) return null;
  const era=m[1].toUpperCase(); const n=Number(m[2]);
  const year=era==="R"?2018+n:era==="H"?1988+n:1925+n;
  return `${year}-${m[3].padStart(2,"0")}-${m[4].padStart(2,"0")}`;
}
function parseCsvLine(line) {
  const out=[]; let cell=""; let quoted=false;
  for(let i=0;i<line.length;i+=1){const ch=line[i]; if(ch==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i+=1;}else quoted=!quoted;}else if(ch===","&&!quoted){out.push(cell);cell="";}else cell+=ch;} out.push(cell); return out;
}
async function fetchText(url) {
  const response=await fetch(url,{headers:{"User-Agent":"FinancialOS-MarketData/0.1 (+personal research)"},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes=await response.arrayBuffer();
  return new TextDecoder("shift_jis").decode(bytes);
}
function ageDays(referenceDate,sourceDate){return Math.round((Date.parse(`${referenceDate}T00:00:00Z`)-Date.parse(`${sourceDate}T00:00:00Z`))/86400000);}

const referenceDate=process.env.REFERENCE_DATE?.trim()||kstToday();
const text=await fetchText(config.sourceUrl);
const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter((line)=>line.trim().length>0);
const headerLineIndex=lines.findIndex((line)=>/^(基準日|Date),/i.test(line.trim()));
if(headerLineIndex<0) throw new Error(`Japan MOF JGB CSV header was not found. First lines: ${lines.slice(0,3).join(" | ").slice(0,500)}`);
const header=parseCsvLine(lines[headerLineIndex]).map((v)=>v.trim());
const rows=lines.slice(headerLineIndex+1).map(parseCsvLine).map((row)=>({date:normalizeDate(row[0]),values:Object.fromEntries(header.map((name,i)=>[name,row[i]]))})).filter((row)=>row.date&&row.date<=referenceDate).sort((a,b)=>b.date.localeCompare(a.date));
if(!rows.length) throw new Error(`No Japan MOF JGB rows on or before ${referenceDate}.`);

const metrics=config.metrics.map((definition)=>{
  const observation=rows.find((row)=>Number.isFinite(Number(String(row.values[definition.column]??"").trim())));
  const value=observation?Number(String(observation.values[definition.column]).trim()):null;
  const sourceDate=observation?.date??null; const age=sourceDate?ageDays(referenceDate,sourceDate):null; const stale=value!==null&&age>10;
  return {id:definition.id,name:definition.name,assetClass:"rates_credit_global",value,unit:"%",referenceDate,source:config.source,sourceDate,expectedSourceDate:null,marketSession:"JP_JGB_DAILY",sessionAligned:stale?false:null,status:value===null?"missing":(stale?"stale":"available"),isStale:stale,qualityNote:value===null?`No numeric ${definition.column} constant-maturity observation was found on or before the reference date.`:"Official MOF constant-maturity JGB yield based on prevailing secondary-market prices at the market close.",collectedAt:new Date().toISOString(),sourceMeta:{provider:config.provider,column:definition.column,sourceUrl:config.sourceUrl,rights:config.rights,publicOutputAllowed:true}};
});
const counts=metrics.reduce((acc,m)=>{acc[m.status]=(acc[m.status]??0)+1;return acc;},{});
const snapshot={schemaVersion:"1.0",referenceDate,generatedAt:new Date().toISOString(),provider:config.provider,source:config.source,publicOutputAllowed:true,dataQuality:{total:metrics.length,available:counts.available??0,stale:counts.stale??0,missing:counts.missing??0,error:counts.error??0},metrics};
const outputPath=process.env.OUTPUT_PATH?.trim(); if(outputPath){await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.writeFile(outputPath,`${JSON.stringify(snapshot,null,2)}\n`,`utf8`);}
console.log(`Japan MOF JGB collection: total=${snapshot.dataQuality.total}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}`); for(const m of metrics) console.log(`${m.status.toUpperCase()} ${m.id} value=${m.value??"null"} sourceDate=${m.sourceDate??"null"}`);
