import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile("config/boe-series.v1.json", "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function minusDays(date, days) {
  const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-days); return d.toISOString().slice(0,10);
}
function boeDate(date) {
  const [y,m,d]=date.split("-");
  const month=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m)-1];
  return `${d}/${month}/${y}`;
}
function normalizeDate(raw) {
  const m=String(raw??"").trim().match(/^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/);
  if(!m) return null;
  const months={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
  return `${m[3]}-${months[m[2]]}-${m[1]}`;
}
function parseCsvLine(line) {
  const out=[]; let cell=""; let quoted=false;
  for(let i=0;i<line.length;i+=1){const ch=line[i]; if(ch==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i+=1;}else quoted=!quoted;}else if(ch===","&&!quoted){out.push(cell);cell="";}else cell+=ch;} out.push(cell); return out;
}
function ageDays(referenceDate, sourceDate) {
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`)-Date.parse(`${sourceDate}T00:00:00Z`))/86400000);
}
async function collectSeries(def, referenceDate) {
  const start=minusDays(referenceDate,45);
  const params=new URLSearchParams({
    "csv.x":"yes",
    Datefrom:boeDate(start),
    Dateto:boeDate(referenceDate),
    SeriesCodes:def.seriesCode,
    CSVF:"TN",
    UsingCodes:"Y",
    VPD:"Y",
    VFD:"N",
  });
  const url=`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?${params.toString()}`;
  const response=await fetch(url,{headers:{"User-Agent":"FinancialOS-MarketData/0.1 (+personal research)"},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`BoE HTTP ${response.status}`);
  const text=(await response.text()).replace(/^\uFEFF/,"");
  const rows=text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const observations=[];
  for(const row of rows){
    const date=normalizeDate(row[0]);
    const candidate=row.slice(1).map((v)=>Number(String(v??"").trim())).find((v)=>Number.isFinite(v));
    if(date&&date<=referenceDate&&Number.isFinite(candidate)) observations.push({date,value:candidate});
  }
  observations.sort((a,b)=>b.date.localeCompare(a.date));
  return {observation:observations[0]??null,url,rowCount:observations.length};
}

const referenceDate=process.env.REFERENCE_DATE?.trim()||kstToday();
const metrics=[];
for(const def of config.metrics){
  try{
    const {observation,url,rowCount}=await collectSeries(def,referenceDate);
    const value=observation?.value??null;
    const sourceDate=observation?.date??null;
    const stale=value!==null&&ageDays(referenceDate,sourceDate)>10;
    metrics.push({id:def.id,name:def.name,assetClass:"rates_credit_global",value,unit:def.unit,referenceDate,source:config.source,sourceDate,expectedSourceDate:null,marketSession:"UK_GILT_DAILY",sessionAligned:stale?false:null,status:value===null?"missing":(stale?"stale":"available"),isStale:stale,qualityNote:value===null?"No numeric Bank of England Database observation found in the 45-day lookback window.":"Exact Bank of England Database 10-year nominal par gilt-yield series downloaded through the documented CSV endpoint.",collectedAt:new Date().toISOString(),sourceMeta:{provider:config.provider,seriesCode:def.seriesCode,seriesTitle:def.seriesTitle,sourceUrl:url,parsedObservationCount:rowCount,rights:config.rights,publicOutputAllowed:true}});
  }catch(error){metrics.push({id:def.id,name:def.name,assetClass:"rates_credit_global",value:null,unit:def.unit,referenceDate,source:config.source,sourceDate:null,expectedSourceDate:null,marketSession:"UK_GILT_DAILY",sessionAligned:null,status:"error",isStale:false,qualityNote:error?.message??String(error),collectedAt:new Date().toISOString(),sourceMeta:{provider:config.provider,seriesCode:def.seriesCode,rights:config.rights,publicOutputAllowed:true}});}
}
const counts=metrics.reduce((a,m)=>{a[m.status]=(a[m.status]??0)+1;return a;},{});
const snapshot={schemaVersion:"1.0",referenceDate,generatedAt:new Date().toISOString(),provider:config.provider,source:config.source,publicOutputAllowed:true,dataQuality:{total:metrics.length,available:counts.available??0,stale:counts.stale??0,missing:counts.missing??0,error:counts.error??0},metrics};
const outputPath=process.env.OUTPUT_PATH?.trim();
if(outputPath){await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.writeFile(outputPath,`${JSON.stringify(snapshot,null,2)}\n`,`utf8`);}
console.log(`BoE collection: total=${metrics.length}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`);
for(const m of metrics) console.log(`${m.status.toUpperCase()} ${m.id} value=${m.value??"null"} sourceDate=${m.sourceDate??"null"}`);
if(snapshot.dataQuality.error>0&&process.env.STRICT_ERRORS==="1") process.exitCode=1;
