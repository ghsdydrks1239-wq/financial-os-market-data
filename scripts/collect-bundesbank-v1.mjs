import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile("config/bundesbank-series.v1.json", "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function minusDays(date, days) { const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-days); return d.toISOString().slice(0,10); }
function parseCsvLine(line) {
  const out=[]; let cell=""; let quoted=false;
  for(let i=0;i<line.length;i+=1){const ch=line[i]; if(ch==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i+=1;}else quoted=!quoted;}else if(ch===","&&!quoted){out.push(cell);cell="";}else cell+=ch;} out.push(cell); return out;
}
function ageDays(referenceDate, sourceDate) { return Math.round((Date.parse(`${referenceDate}T00:00:00Z`)-Date.parse(`${sourceDate}T00:00:00Z`))/86400000); }
async function collectSeries(def, referenceDate) {
  const start=minusDays(referenceDate,45);
  const url=`${config.apiBase}/${def.key}?format=sdmx_csv&lang=en&startPeriod=${start}&endPeriod=${referenceDate}`;
  const response=await fetch(url,{headers:{Accept:"application/vnd.sdmx.data+csv;version=1.0.0","Accept-Language":"en","User-Agent":"FinancialOS-MarketData/0.1 (+personal research)"},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`Bundesbank HTTP ${response.status} for ${def.key}`);
  const text=(await response.text()).replace(/^\uFEFF/,"");
  const lines=text.split(/\r?\n/).filter(Boolean);
  if(lines.length<2) return {observation:null,url};
  const header=parseCsvLine(lines[0]);
  const rows=lines.slice(1).map(parseCsvLine).map((values)=>Object.fromEntries(header.map((name,i)=>[name,values[i]])));
  const observations=rows.map((r)=>({date:r.TIME_PERIOD??r.TIME??r.time_period,value:Number(r.OBS_VALUE??r.OBS_VALUE_ORIGINAL??r.value)}))
    .filter((r)=>/^\d{4}-\d{2}-\d{2}$/.test(r.date??"")&&r.date<=referenceDate&&Number.isFinite(r.value))
    .sort((a,b)=>b.date.localeCompare(a.date));
  return {observation:observations[0]??null,url};
}

const referenceDate=process.env.REFERENCE_DATE?.trim()||kstToday();
const metrics=[];
for(const def of config.metrics){
  try{
    const {observation,url}=await collectSeries(def,referenceDate); const value=observation?.value??null; const sourceDate=observation?.date??null; const stale=value!==null&&ageDays(referenceDate,sourceDate)>10;
    metrics.push({id:def.id,name:def.name,assetClass:"rates_credit_global",value,unit:"%",referenceDate,source:config.source,sourceDate,expectedSourceDate:null,marketSession:"DE_GOVT_YIELD_DAILY",sessionAligned:stale?false:null,status:value===null?"missing":(stale?"stale":"available"),isStale:stale,qualityNote:value===null?"No numeric Deutsche Bundesbank observation found in the 45-day lookback window.":"Official daily yield of the current German Federal security at the specified original maturity.",collectedAt:new Date().toISOString(),sourceMeta:{provider:config.provider,key:def.key,seriesTitle:def.seriesTitle,sourceUrl:url,rights:config.rights,publicOutputAllowed:true}});
  }catch(error){metrics.push({id:def.id,name:def.name,assetClass:"rates_credit_global",value:null,unit:"%",referenceDate,source:config.source,sourceDate:null,expectedSourceDate:null,marketSession:"DE_GOVT_YIELD_DAILY",sessionAligned:null,status:"error",isStale:false,qualityNote:error?.message??String(error),collectedAt:new Date().toISOString(),sourceMeta:{provider:config.provider,key:def.key,seriesTitle:def.seriesTitle,rights:config.rights,publicOutputAllowed:true}});}
}
const counts=metrics.reduce((a,m)=>{a[m.status]=(a[m.status]??0)+1;return a;},{});
const snapshot={schemaVersion:"1.0",referenceDate,generatedAt:new Date().toISOString(),provider:config.provider,source:config.source,publicOutputAllowed:true,dataQuality:{total:metrics.length,available:counts.available??0,stale:counts.stale??0,missing:counts.missing??0,error:counts.error??0},metrics};
const outputPath=process.env.OUTPUT_PATH?.trim(); if(outputPath){await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.writeFile(outputPath,`${JSON.stringify(snapshot,null,2)}\n`,`utf8`);}
console.log(`Bundesbank collection: total=${metrics.length}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`); for(const m of metrics) console.log(`${m.status.toUpperCase()} ${m.id} value=${m.value??"null"} sourceDate=${m.sourceDate??"null"} ${m.qualityNote??""}`);
if(snapshot.dataQuality.error>0&&process.env.STRICT_ERRORS==="1") process.exitCode=1;
