const checks = [
  ["NYFED_SOFR", "https://markets.newyorkfed.org/api/rates/secured/sofr/last/3.json", "json"],
  ["NYFED_EFFR", "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/3.json", "json"],
  ["UST_CSV", "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/all?_format=csv&type=daily_treasury_yield_curve", "text"],
  ["UST_XML_STATIC", "https://home.treasury.gov/sites/default/files/interest-rates/yield.xml", "text"],
];

let failures = 0;
for (const [name, url, mode] of checks) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: mode === "json" ? "application/json" : "text/csv,application/xml,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.log(`FAIL ${name}: HTTP ${response.status}`);
      failures += 1;
      continue;
    }
    if (mode === "json") {
      const data = await response.json();
      const topKeys = Object.keys(data ?? {});
      const refRates = data?.refRates ?? data?.rates ?? [];
      const first = Array.isArray(refRates) ? refRates[0] : null;
      console.log(`OK ${name}: topKeys=${topKeys.join(",")}; rowKeys=${first ? Object.keys(first).join(",") : "none"}`);
    } else {
      const text = await response.text();
      const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
      console.log(`OK ${name}: bytes=${text.length}; firstLine=${firstLine.slice(0, 240)}`);
    }
  } catch (error) {
    console.log(`FAIL ${name}: ${error?.name ?? "Error"}`);
    failures += 1;
  }
}

if (failures === checks.length) process.exitCode = 1;
