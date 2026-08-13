import fs from "node:fs/promises";
import path from "node:path";

const config = JSON.parse(await fs.readFile("config/boe-series.v1.json", "utf8"));

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function minusDays(date, days) { const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-days); return d.toISOString().slice(0,10); }
function monthName(month) { return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(month)-1]; }
function dateParams(date, prefix) { const [y,m,d]=date.split("-"); return {[`${prefix}D`]:String(Number(d)),[`${prefix}M`]:monthName(m),[`${prefix}Y`]:y}; }
function decodeHtml(text) { return text.replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&lt;/gi,"<").replace(/&gt;/gi,">"); }
function stripHtml(html) { return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," "); }
function parseBoEDate(raw) {
  const m=raw.match(/^(\d{2}) ([A-Z][a-z]{2}) (\d{2})$/); if(!m) return null;
  const months={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
  return `20${m[3]}-${months[m[2]]}-${m[1]}`;
}
function ageDays(referenceDate, sourceDate) { return Math.round((Date.parse(`${referenceDate}T00:00:00Z`)-Date.parse(`${sourceDate}T00:00:00Z`))/86400000); }
async function collectSeries(def, referenceDate) {
  const start=minusDays(referenceDate,45); const p=new URLSearchParams({CSVF:"TT",DAT:"RNG",FNY:"Y",Filter:"N",FromSeries:"1",ToSeries:"50",Travel:"NIxAZxSUx",UsingCodes:"Y",VPD:"Y",SeriesCodes:def.seriesCode,title:def.seriesCode,...dateParams(start,"F"),...dateParams(referenceDate,"T")});
  const url=`https://www.bankofengland.co.uk/boeapps/database/fromshowcolumns.asp?${p}`;
  const response=await fetch(url,{headers:{"User-Agent":"FinancialOS-MarketData/0.1 (+personal research)"},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`BoE HTTP ${response.status}`);
  const text=stripHtml(await response.text());
  const anchor=text.lastIndexOf(def.seriesCode); const body=anchor>=0?text.slice(anchor):text;
  const matches=[...body.matchAll(/(\d{2} [A-Z][a-z]{2} \d{2})\s+(-?\d+(?:\.\d+)?)/g)].map((m)=>({date:parseBoEDate(m[1]),value:Number(m[2])})).filter((r)=>r.date&&r.date<=referenceDate&&Number.isFinite(r.value)).sort((a,b)=>b.date.localeCompare(a.date));
  return {observation:matches[0]??null,url};
}

const referenceDate=process.env.REFERENCE_DATE?.trim()||kstToday();
const metrics=[];
for(const def of config.metrics){
  try{
    const {observation,url}=await collectSeries(def,referenceDate); const value=observation?.value??null; const sourceDate=observation?.date??null; const stale=value!==null&&ageDays(referenceDate,sourceDate)>10;
    metrics.push({id:def.id,name:def.name,assetClass:"rates_credit_global",value,unit:def.unit,referenceDate,source:config.source,sourceDate,expectedSourceDate:null,marketSession:"UK_GILT_DAILY",sessionAligned:stale?false:null,status:value===null?"missing":(stale?"stale":"available"),isStale:stale,qualityNote:value===null?"No numeric Bank of England Database observation found in the lookback window.":"Exact Bank of England Database 10-year nominal par gilt-yield series; sourceDate preserved independently from referenceDate.",collectedAt:new Date().toISOString(),sourceMeta:{provider:config.provider,seriesCode:def.seriesCode,seriesTitle:def.seriesTitle,sourceUrl:url,rights:config.rights,publicOutputAllowed:true}});
  }catch(error){metrics.push({id:def.id,name:def.name,assetClass:"rates_credit_global",value:null,unit:def.unit,referenceDate,source:config.source,sourceDate:null,expectedSourceDate:null,marketSession:"UK_GILT_DAILY",sessionAligned:null,status:"error",isStale:false,qualityNote:error?.message??String(error),collectedAt:new Date().toISOString(),sourceMeta:{provider:config.provider,seriesCode:def.seriesCode,rights:config.rights,publicOutputAllowed:true}});}
}
const counts=metrics.reduce((a,m)=>{a[m.status]=(a[m.status]??0)+1;return a;},{});
const snapshot={schemaVersion:"1.0",referenceDate,generatedAt:new Date().toISOString(),provider:config.provider,source:config.source,publicOutputAllowed:true,dataQuality:{total:metrics.length,available:counts.available??0,stale:counts.stale??0,missing:counts.missing??0,error:counts.error??0},metrics};
const outputPath=process.env.OUTPUT_PATH?.trim(); if(outputPath){await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.writeFile(outputPath,`${JSON.stringify(snapshot,null,2)}\n`,`utf8`);}
console.log(`BoE collection: total=${metrics.length}, available=${snapshot.dataQuality.available}, stale=${snapshot.dataQuality.stale}, missing=${snapshot.dataQuality.missing}, error=${snapshot.dataQuality.error}`); for(const m of metrics) console.log(`${m.status.toUpperCase()} ${m.id} value=${m.value??"null"} sourceDate=${m.sourceDate??"null"}`);
if(snapshot.dataQuality.error>0&&process.env.STRICT_ERRORS==="1") process.exitCode=1;
