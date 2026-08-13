import { requireEnv } from "../lib/env.mjs";

/**
 * Generic KRX OPEN API request.
 * KRX requires the authentication key in the AUTH_KEY request header.
 * Each approved API product's exact URL/API ID is kept in config rather than
 * guessed in collector code.
 */
export async function fetchKrxApi({ url, query = {} }) {
  const apiKey = requireEnv("KRX_API_KEY");
  if (!url) throw new Error("KRX request requires an approved API URL from config.");

  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      target.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(target, {
    headers: {
      AUTH_KEY: apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`KRX HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`KRX returned a non-JSON response: ${text.slice(0, 200)}`);
  }
}
