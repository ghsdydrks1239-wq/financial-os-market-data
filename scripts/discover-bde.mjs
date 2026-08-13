const urls = [
  ['TI_1_3','https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/ti_1_3.csv'],
  ['SINDI','https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/uoi_sindi.csv'],
];
for (const [name,url] of urls) {
  try {
    const response = await fetch(url,{headers:{'User-Agent':'FinancialOS-MarketData/0.1 (+personal research)'},signal:AbortSignal.timeout(30000)});
    console.log(`SOURCE ${name} HTTP=${response.status} type=${response.headers.get('content-type')||''}`);
    const text = await response.text();
    console.log(`BYTES ${text.length}`);
    const lines = text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(0,20)) console.log(line.slice(0,2500));
  } catch (error) {
    console.log(`SOURCE ${name} ERROR ${error?.message ?? String(error)}`);
  }
}

console.log('--- normalized Banco de España collector ---');
await import('./collect-bde-v1.mjs');
