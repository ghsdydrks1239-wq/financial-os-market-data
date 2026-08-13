const today = new Date();
const start = new Date(today.getTime() - 21 * 86400000);
const ymd = (d) => d.toISOString().slice(0, 10);

const urls = [
  `https://markets.newyorkfed.org/api/rp/reverserepo/all/results/lastTwoWeeks.json`,
  `https://markets.newyorkfed.org/api/rp/reverserepo/propositions/search.json?startDate=${ymd(start)}&endDate=${ymd(today)}`,
];

for (const url of urls) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(20000),
  });
  console.log(`URL ${url}`);
  console.log(`HTTP ${response.status}`);
  if (!response.ok) continue;
  const payload = await response.json();
  console.log(`TOP_KEYS ${Object.keys(payload).join(",")}`);
  const repo = payload.repo ?? payload.reverseRepo ?? payload;
  console.log(`REPO_KEYS ${Object.keys(repo ?? {}).join(",")}`);
  const operations = repo?.operations ?? repo?.results ?? [];
  console.log(`OPERATIONS ${Array.isArray(operations) ? operations.length : "not-array"}`);
  if (Array.isArray(operations)) {
    for (const row of operations.slice(0, 3)) {
      console.log(`ROW_KEYS ${Object.keys(row).join(",")}`);
      console.log(`ROW ${JSON.stringify(row).slice(0, 2000)}`);
    }
  }
}
