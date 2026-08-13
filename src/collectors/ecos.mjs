import dns from "node:dns";
import { optionalEnv, requireEnv } from "../lib/env.mjs";

// GitHub-hosted runners can prefer an ECOS route that times out; IPv4-first
// was verified against ecos.bok.or.kr from Actions on 2026-08-13.
dns.setDefaultResultOrder("ipv4first");

const DEFAULT_BASE_URL = "https://ecos.bok.or.kr/api";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= DEFAULT_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (response.ok || response.status < 500 || attempt === DEFAULT_ATTEMPTS) {
        return response;
      }
      lastError = new Error(`ECOS HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt === DEFAULT_ATTEMPTS) throw error;
    }
    await sleep(400 * attempt);
  }
  throw lastError ?? new Error("ECOS request failed.");
}

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
  const response = await fetchWithRetry(url, {
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
