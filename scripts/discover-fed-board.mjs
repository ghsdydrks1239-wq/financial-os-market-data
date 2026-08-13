const sources = [
  {
    name: "PRATES",
    url: "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=20&layout=seriescolumn&rel=PRATES&series=c27939ee810cb2e929a920a6bd77d9f6&to=&type=package",
    patterns: [/IORB/i, /reserve balances/i, /RESBM_N\.D/i],
  },
  {
    name: "H41",
    url: "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=5&layout=seriescolumn&rel=H41&series=2704b6bc9b50bc034baf9660364dfb26&to=&type=package",
    patterns: [/Treasury General Account/i, /U\.S\. Treasury/i, /reverse repurchase/i, /repurchase agreement/i, /reserve balances/i],
  },
];

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

for (const source of sources) {
  const text = await fetchText(source.url);
  const lines = text.split(/\r?\n/).filter(Boolean);
  console.log(`SOURCE ${source.name}: bytes=${Buffer.byteLength(text)}, lines=${lines.length}`);

  const matches = lines.filter((line) => source.patterns.some((pattern) => pattern.test(line)));
  console.log(`MATCH_COUNT ${source.name}=${matches.length}`);
  for (const line of matches.slice(0, 80)) {
    console.log(`${source.name} | ${line.slice(0, 1200)}`);
  }
}
