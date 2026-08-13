const MONTHS = new Map([
  ["Jan", 0], ["Feb", 1], ["Mar", 2], ["Apr", 3], ["May", 4], ["Jun", 5],
  ["Jul", 6], ["Aug", 7], ["Sep", 8], ["Oct", 9], ["Nov", 10], ["Dec", 11],
]);

function decodeHtmlText(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseReleaseDate(html) {
  const match = html.match(/Release Date:\s*([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})/i);
  if (!match) return null;
  return isoDate(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
}

function parseWeekLabel(label) {
  const match = label.match(/(\d{4})\s+([A-Z][a-z]{2})-\s*(\d{1,2})\s+to\s+([A-Z][a-z]{2})-\s*(\d{1,2})/);
  if (!match) return null;
  const startMonth = MONTHS.get(match[2]);
  if (startMonth === undefined) return null;
  return isoDate(Number(match[1]), startMonth, Number(match[3]));
}

export function parseEiaHistoryHtml(html) {
  const title = decodeHtmlText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const observations = [];
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({
      className: match[1].match(/class\s*=\s*['"]([^'"]+)['"]/i)?.[1] ?? "",
      text: decodeHtmlText(match[2]),
    }));
    const label = cells.find((cell) => cell.className.split(/\s+/).includes("B6"))?.text;
    const startDate = label ? parseWeekLabel(label) : null;
    if (!startDate) continue;

    const values = cells
      .filter((cell) => cell.className.split(/\s+/).includes("B3"))
      .slice(0, 5);
    values.forEach((cell, index) => {
      if (!cell.text || ["-", "--", "NA", "W"].includes(cell.text.toUpperCase())) return;
      const value = Number(cell.text.replace(/,/g, ""));
      if (!Number.isFinite(value)) return;
      observations.push({ sourceDate: addDays(startDate, index), value });
    });
  }

  observations.sort((a, b) => a.sourceDate.localeCompare(b.sourceDate));
  return { title, releaseDate: parseReleaseDate(html), observations };
}
