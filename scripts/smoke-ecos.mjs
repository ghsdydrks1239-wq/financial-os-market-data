const apiKey = process.env.ECOS_API_KEY?.trim();
if (!apiKey) {
  console.error("ECOS_API_KEY is missing.");
  process.exit(1);
}

const url = `https://ecos.bok.or.kr/api/StatisticTableList/${encodeURIComponent(apiKey)}/json/kr/1/5/`;
const response = await fetch(url, { headers: { Accept: "application/json" } });

if (!response.ok) {
  throw new Error(`ECOS HTTP ${response.status}: ${response.statusText}`);
}

const data = await response.json();
if (data.RESULT?.CODE && data.RESULT.CODE !== "INFO-000") {
  throw new Error(`ECOS ${data.RESULT.CODE}: ${data.RESULT.MESSAGE ?? "Unknown error"}`);
}

const rows = data.StatisticTableList?.row ?? [];
if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error("ECOS key was accepted but StatisticTableList returned no rows.");
}

console.log(`ECOS smoke test OK: received ${rows.length} table rows.`);
console.log(rows.slice(0, 3).map((row) => `${row.SRCH_YN ?? ""} ${row.STAT_CODE ?? ""} ${row.STAT_NAME ?? ""}`).join("\n"));
