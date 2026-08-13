import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const apiKey = process.env.KRX_API_KEY?.trim();
if (!apiKey) {
  console.error("KRX_API_KEY is missing.");
  process.exit(1);
}

const endpoint = "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd";

function yyyymmddKst(daysAgo) {
  const now = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

let lastError = null;
for (let daysAgo = 1; daysAgo <= 10; daysAgo += 1) {
  const basDd = yyyymmddKst(daysAgo);
  const url = new URL(endpoint);
  url.searchParams.set("basDd", basDd);

  try {
    const response = await fetch(url, {
      headers: {
        AUTH_KEY: apiKey,
        Accept: "application/json",
      },
    });

    const text = await response.text();
    if (!response.ok) {
      lastError = `KRX HTTP ${response.status} on ${basDd}: ${text.slice(0, 300)}`;
      if ([401, 403].includes(response.status)) break;
      continue;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      lastError = `KRX returned non-JSON on ${basDd}: ${text.slice(0, 300)}`;
      continue;
    }

    const rows = data.OutBlock_1;
    if (Array.isArray(rows) && rows.length > 0) {
      console.log(`KRX smoke test OK: ${basDd}, received ${rows.length} KOSPI stock rows.`);
      const sample = rows[0] ?? {};
      console.log(`Sample: ${sample.ISU_SRT_CD ?? ""} ${sample.ISU_ABBRV ?? ""} ${sample.TDD_CLSPRC ?? ""}`.trim());
      process.exit(0);
    }

    const code = data.RESULT?.CODE ?? data.code ?? data.status ?? "";
    const message = data.RESULT?.MESSAGE ?? data.message ?? "no rows";
    lastError = `KRX response on ${basDd}: ${code} ${message}`.trim();
  } catch (error) {
    lastError = `KRX request failed on ${basDd}: ${error?.message ?? String(error)}`;
  }
}

throw new Error(lastError ?? "KRX smoke test returned no usable data in the last 10 calendar days.");
