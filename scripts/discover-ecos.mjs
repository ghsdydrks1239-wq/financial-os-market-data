import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const apiKey = process.env.ECOS_API_KEY?.trim();
if (!apiKey) throw new Error("ECOS_API_KEY is missing.");

const BASE = "https://ecos.bok.or.kr/api";

async function getJson(path) {
  const response = await fetch(`${BASE}/${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`ECOS HTTP ${response.status}`);
  const data = await response.json();
  if (data.RESULT?.CODE && data.RESULT.CODE !== "INFO-000") {
    throw new Error(`ECOS ${data.RESULT.CODE}: ${data.RESULT.MESSAGE ?? "Unknown error"}`);
  }
  return data;
}

async function getAllTables() {
  const first = await getJson(`StatisticTableList/${encodeURIComponent(apiKey)}/json/kr/1/1000/`);
  const total = Number(first.StatisticTableList?.list_total_count ?? 0);
  const rows = [...(first.StatisticTableList?.row ?? [])];
  for (let start = 1001; start <= total; start += 1000) {
    const end = Math.min(start + 999, total);
    const page = await getJson(`StatisticTableList/${encodeURIComponent(apiKey)}/json/kr/${start}/${end}/`);
    rows.push(...(page.StatisticTableList?.row ?? []));
  }
  return rows;
}

async function getItems(statCode) {
  const first = await getJson(`StatisticItemList/${encodeURIComponent(apiKey)}/json/kr/1/1000/${encodeURIComponent(statCode)}/`);
  const total = Number(first.StatisticItemList?.list_total_count ?? 0);
  const rows = [...(first.StatisticItemList?.row ?? [])];
  for (let start = 1001; start <= total; start += 1000) {
    const end = Math.min(start + 999, total);
    const page = await getJson(`StatisticItemList/${encodeURIComponent(apiKey)}/json/kr/${start}/${end}/${encodeURIComponent(statCode)}/`);
    rows.push(...(page.StatisticItemList?.row ?? []));
  }
  return rows;
}

const tableTerms = [
  "시장금리", "금리", "환율", "외환", "기준금리", "통화정책", "채권", "수익률",
];
const itemTerms = [
  "국고채", "국채", "CD", "CP", "통안", "RP", "환매조건부", "콜금리", "콜 금리",
  "회사채", "AA-", "BBB-", "원/달러", "원/100엔", "원/위안", "원/유로", "원/유로",
  "달러/원", "엔/원", "위안/원", "유로/원", "기준금리",
];

const tables = await getAllTables();
const searchable = tables.filter((row) => String(row.SRCH_YN ?? row.SEARCH_YN ?? "Y").toUpperCase() !== "N");
const candidates = searchable.filter((row) => {
  const text = `${row.STAT_CODE ?? ""} ${row.STAT_NAME ?? ""}`.toLowerCase();
  return tableTerms.some((term) => text.includes(term.toLowerCase()));
});

console.log(`ECOS tables: total=${tables.length}, searchable=${searchable.length}, candidates=${candidates.length}`);
for (const row of candidates) {
  console.log(`TABLE ${row.STAT_CODE} | ${row.STAT_NAME} | cycle=${row.CYCLE ?? ""}`);
}

console.log("\n=== MATCHED ITEMS ===");
let matchCount = 0;
for (const table of candidates) {
  const code = table.STAT_CODE;
  if (!code) continue;
  let items;
  try {
    items = await getItems(code);
  } catch (error) {
    console.log(`ITEM_ERROR ${code}: ${error?.message ?? String(error)}`);
    continue;
  }
  for (const item of items) {
    const text = `${item.ITEM_NAME ?? ""}`.toLowerCase();
    if (!itemTerms.some((term) => text.includes(term.toLowerCase()))) continue;
    matchCount += 1;
    console.log([
      "ITEM",
      item.STAT_CODE,
      item.ITEM_CODE,
      item.ITEM_NAME,
      item.CYCLE,
      item.START_TIME,
      item.END_TIME,
      item.GRP_NAME ?? "",
    ].join(" | "));
  }
}
console.log(`MATCHED_ITEM_COUNT=${matchCount}`);
