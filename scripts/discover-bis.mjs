const tests = [
  {
    name: "CBPOL_V2_JSON",
    url: "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.XM?startPeriod=2026-07-01",
    accept: "application/vnd.sdmx.data+csv;version=2.0.0",
  },
  {
    name: "CBPOL_V1_CSV",
    url: "https://stats.bis.org/api/v1/data/WS_CBPOL/D.XM/all?startPeriod=2026-07-01",
    accept: "csvfile",
  },
  {
    name: "XRU_V2_CSV",
    url: "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_XRU/1.0/D.XM.EUR.A?startPeriod=2026-07-01",
    accept: "application/vnd.sdmx.data+csv;version=2.0.0",
  },
  {
    name: "XRU_V1_CSV",
    url: "https://stats.bis.org/api/v1/data/WS_XRU/D.XM.EUR.A/all?startPeriod=2026-07-01",
    accept: "csvfile",
  },
];

for (const test of tests) {
  try {
    const response = await fetch(test.url, {
      headers: {
        Accept: test.accept,
        "User-Agent": "FinancialOS-MarketData/0.1 (+personal research)",
      },
      signal: AbortSignal.timeout(25000),
    });
    const text = await response.text();
    console.log(`TEST ${test.name} HTTP=${response.status} contentType=${response.headers.get("content-type") ?? ""} bytes=${text.length}`);
    console.log(text.slice(0, 1500).replaceAll("\n", "\\n"));
  } catch (error) {
    console.log(`TEST ${test.name} ERROR ${error?.message ?? String(error)}`);
  }
}
