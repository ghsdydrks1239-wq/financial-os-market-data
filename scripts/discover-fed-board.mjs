const sources = [
  {
    name: "PRATES",
    url: "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=20&layout=seriescolumn&rel=PRATES&series=c27939ee810cb2e929a920a6bd77d9f6&to=&type=package",
    patterns: [/IORB/i, /reserve balances/i, /RESBM_N\.D/i],
  },
  {
    name: "H41",
    url: "https://www.federalreserve.gov/datadownload/Output.aspx?filetype=csv&from=&label=include&lastobs=5&layout=seriescolumn&rel=H41&series=2704b6bc9b50bc034baf9660364dfb26&to=&type=package",
    patterns: [/Treasury General Account/i, /Treasury deposits/i, /reverse repurchase/i, /repurchase agreement/i, /reserve balances/i],
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

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

for (const source of sources) {
  const text = await fetchText(source.url);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = lines.map(parseCsvLine);
  console.log(`SOURCE ${source.name}: bytes=${Buffer.byteLength(text)}, lines=${lines.length}`);

  const descriptionRow = rows.find((row) => /^Series Description\s*$/i.test(row[0] ?? ""));
  const identifierRow = rows.find((row) => /^Unique Identifier:\s*$/i.test(row[0] ?? ""));
  const shortCodeRow = rows.find((row) => /^Time Period\s*$/i.test(row[0] ?? ""));

  if (!descriptionRow) {
    console.log(`NO_DESCRIPTION_ROW ${source.name}`);
    continue;
  }

  const matches = [];
  for (let i = 1; i < descriptionRow.length; i += 1) {
    const description = descriptionRow[i] ?? "";
    if (!source.patterns.some((pattern) => pattern.test(description))) continue;
    matches.push({
      description,
      identifier: identifierRow?.[i] ?? null,
      shortCode: shortCodeRow?.[i] ?? null,
    });
  }

  console.log(`SERIES_MATCH_COUNT ${source.name}=${matches.length}`);
  for (const match of matches) {
    console.log(`${source.name} SERIES | ${match.identifier ?? "?"} | ${match.shortCode ?? "?"} | ${match.description}`);
  }
}
