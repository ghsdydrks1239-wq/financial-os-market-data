const url='https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jul/2026&Dateto=13/Aug/2026&SeriesCodes=IUDMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N';
const response=await fetch(url,{headers:{'User-Agent':'FinancialOS-MarketData/0.1 (+personal research)'},signal:AbortSignal.timeout(30000)});
console.log('HTTP',response.status,'TYPE',response.headers.get('content-type'));
const text=await response.text();
console.log('BYTES',text.length);
console.log(text.slice(0,5000).replace(/\r/g,'\\r').replace(/\n/g,'\\n\n'));
