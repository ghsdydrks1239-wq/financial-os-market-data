const urls = [
  ['WTI','https://www.eia.gov/dnav/pet/hist/RWTCD.htm'],
  ['BRENT','https://www.eia.gov/dnav/pet/hist/RBRTED.htm'],
  ['GASOLINE','https://www.eia.gov/dnav/pet/hist/EER_EPMRU_PF4_Y35NY_DPGD.htm'],
  ['HEATING_OIL','https://www.eia.gov/dnav/pet/hist/EER_EPD2F_PF4_Y35NY_DPGD.htm'],
  ['HENRY_HUB','https://www.eia.gov/dnav/ng/hist/rngwhhdd.htm'],
];
for (const [name,url] of urls) {
  const response = await fetch(url,{headers:{'User-Agent':'FinancialOS-MarketData/0.1 (+personal research)'},signal:AbortSignal.timeout(30000)});
  const text=await response.text();
  console.log(`=== ${name} HTTP=${response.status} bytes=${text.length} ===`);
  const idx=Math.max(text.lastIndexOf('2026'),0);
  console.log(text.slice(Math.max(0,idx-4000),Math.min(text.length,idx+5000)).replace(/\s+/g,' ').slice(0,9000));
}
