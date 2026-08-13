import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const apiKey = process.env.KRX_API_KEY?.trim();
if (!apiKey) {
  console.error("KRX_API_KEY is missing.");
  process.exit(1);
}

const services = [
  ["KOSPI index", "https://data-dbg.krx.co.kr/svc/apis/idx/kospi_dd_trd"],
  ["KOSDAQ index", "https://data-dbg.krx.co.kr/svc/apis/idx/kosdaq_dd_trd"],
  ["KOSPI stocks", "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd"],
  ["KOSDAQ stocks", "https://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd"],
  ["ETF", "https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"],
  ["Futures", "https://data-dbg.krx.co.kr/svc/apis/drv/fut_bydd_trd"],
  ["Options", "https://data-dbg.krx.co.kr/svc/apis/drv/opt_bydd_trd"],
];

function yyyymmddKst(daysAgo) {
  const now = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

const basDd = yyyymmddKst(1);
let successCount = 0;
let unauthorizedCount = 0;

for (const [name, endpoint] of services) {
  const url = new URL(endpoint);
  url.searchParams.set("basDd", basDd);

  try {
    const response = await fetch(url, {
      headers: {
        AUTH_KEY: apiKey,
        Accept: "application/json",
      },
    });
    const text = await response.text();

    if (response.status === 401 || response.status === 403) {
      unauthorizedCount += 1;
      console.log(`UNAUTHORIZED ${name}: HTTP ${response.status}`);
      continue;
    }

    if (!response.ok) {
      console.log(`ERROR ${name}: HTTP ${response.status} ${text.slice(0, 160)}`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log(`ERROR ${name}: non-JSON ${text.slice(0, 160)}`);
      continue;
    }

    const rows = Array.isArray(data.OutBlock_1) ? data.OutBlock_1 : [];
    successCount += 1;
    console.log(`AUTHORIZED ${name}: HTTP 200, rows=${rows.length}`);
    if (rows[0]) {
      const sample = rows[0];
      console.log(`  keys=${Object.keys(sample).join(",")}`);
      console.log(`  sample=${JSON.stringify(sample).slice(0, 1200)}`);
    }
  } catch (error) {
    console.log(`ERROR ${name}: ${error?.message ?? String(error)}`);
  }
}

console.log(`KRX authorization summary for ${basDd}: authorized=${successCount}, unauthorized=${unauthorizedCount}, tested=${services.length}`);
if (successCount === 0) {
  throw new Error("No tested KRX service accepted this API key. The key may be approved while individual API-service access is still unapproved or not yet active.");
}
