import { optionalEnv, requireEnv } from "../lib/env.mjs";

const DEFAULT_BASE_URL = "https://ecos.bok.or.kr/api";

/**
 * Generic ECOS StatisticSearch request.
 * Exact statistic codes/item codes are intentionally supplied by config,
 * not hard-coded here.
 */
export async function fetchEcosStatistic({
  statisticCode,
  cycle,
  startDate,
  endDate,
  itemCodes = [],
  start = 1,
  end = 100,
  language = "kr",
  format = "json",
}) {
  const apiKey = requireEnv("ECOS_API_KEY");
  const baseUrl = optionalEnv("ECOS_API_BASE_URL", DEFAULT_BASE_URL).replace(/\/$/, "");

  if (!statisticCode || !cycle || !startDate || !endDate) {
    throw new Error("ECOS request requires statisticCode, cycle, startDate and endDate.");
  }

  const pathParts = [
    "StatisticSearch",
    encodeURIComponent(apiKey),
    format,
    language,
    String(start),
    String(end),
    encodeURIComponent(statisticCode),
    encodeURIComponent(cycle),
    encodeURIComponent(startDate),
    encodeURIComponent(endDate),
    ...itemCodes.filter(Boolean).map(encodeURIComponent),
  ];

  const url = `${baseUrl}/${pathParts.join("/")}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`ECOS HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.RESULT?.CODE && data.RESULT.CODE !== "INFO-000") {
    throw new Error(`ECOS ${data.RESULT.CODE}: ${data.RESULT.MESSAGE ?? "Unknown error"}`);
  }

  return data;
}
