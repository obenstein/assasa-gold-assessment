import { redis } from "./redis";
import { PriceSnapshot } from "./types";

export const GRAMS_PER_TROY_OZ = 31.1034768;

/**
 * Standard rounding rule: Round normalized price per gram to nearest PKR.
 */
export function toPkrPerGram(usdPerOz: number, usdToPkr: number): number {
  const usdPerGram = usdPerOz / GRAMS_PER_TROY_OZ;
  return Math.round(usdPerGram * usdToPkr);
}

/**
 * Shared FX Step: GET https://open.er-api.com/v6/latest/USD
 * Cached in Redis key 'fx:usd-pkr' with 300s TTL.
 */
export async function getUsdToPkr(): Promise<number> {
  try {
    const cachedFx = await redis.get<number>("fx:usd-pkr");
    if (cachedFx && typeof cachedFx === "number" && cachedFx > 0) {
      return cachedFx;
    }
  } catch (err) {
    console.warn("Redis FX cache read error:", err);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`USD/PKR rate fetch HTTP error: ${res.status}`);
    }

    const data = await res.json();
    const rate = Number(data?.rates?.PKR);

    if (!rate || isNaN(rate) || rate <= 0) {
      throw new Error("Invalid USD/PKR rate returned from FX API");
    }

    try {
      await redis.set("fx:usd-pkr", rate, { ex: 300 });
    } catch (err) {
      console.warn("Redis FX cache write error:", err);
    }

    return rate;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Primary Source: Gold-API (XAU spot)
 * GET https://api.gold-api.com/price/XAU
 */
export async function fetchGoldApi(usdToPkr: number): Promise<PriceSnapshot> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Gold-API HTTP error: ${res.status}`);
    }

    const data = await res.json();
    const usdPerOz = Number(data?.price);

    if (!usdPerOz || isNaN(usdPerOz) || usdPerOz <= 0) {
      throw new Error("Invalid XAU price from Gold-API");
    }

    const pricePerGramPKR = toPkrPerGram(usdPerOz, usdToPkr);

    return {
      source: "GoldAPI",
      pricePerGramPKR,
      fetchedAt: new Date().toISOString(),
      trusted: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fallback Source: GoldPrice.org PKR endpoint
 * GET https://data-asg.goldprice.org/dbXRates/PKR
 *
 * Returns PKR-denominated prices directly — no FX conversion needed.
 * Response shape: { items: [{ curr: "PKR", xauPrice: <PKR/troy-oz>, ... }] }
 */
export async function fetchGoldPriceOrg(): Promise<PriceSnapshot> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/PKR", {
      signal: controller.signal,
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        origin: "https://goldprice.org",
        priority: "u=1, i",
        referer: "https://goldprice.org/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`GoldPriceOrg HTTP error: ${res.status}`);
    }

    const data = await res.json();
    const item = data?.items?.[0];
    // xauPrice is PKR per troy ounce — convert to PKR per gram
    const pkrPerOz = Number(item?.xauPrice);

    if (!pkrPerOz || isNaN(pkrPerOz) || pkrPerOz <= 0) {
      throw new Error("Invalid xauPrice from GoldPrice.org PKR endpoint");
    }

    const pricePerGramPKR = Math.round(pkrPerOz / GRAMS_PER_TROY_OZ);

    return {
      source: "GoldPriceOrg",
      pricePerGramPKR,
      fetchedAt: new Date().toISOString(),
      trusted: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validates a PriceSnapshot against sanity guardrails:
 * 1. pricePerGramPKR > 0
 * 2. Deviation <= 15% from price:last-good (if present in Redis)
 */
export async function validatePriceSnapshot(snapshot: PriceSnapshot): Promise<PriceSnapshot> {
  if (!snapshot.pricePerGramPKR || isNaN(snapshot.pricePerGramPKR) || snapshot.pricePerGramPKR <= 0) {
    return {
      ...snapshot,
      trusted: false,
      reason: "Price is invalid (<= 0)",
    };
  }

  try {
    const lastGood = await redis.get<PriceSnapshot | number>("price:last-good");
    let lastGoodPrice: number | null = null;

    if (typeof lastGood === "number") {
      lastGoodPrice = lastGood;
    } else if (lastGood && typeof lastGood === "object" && "pricePerGramPKR" in lastGood) {
      lastGoodPrice = Number(lastGood.pricePerGramPKR);
    }

    if (lastGoodPrice && lastGoodPrice > 0) {
      const deviation = Math.abs(snapshot.pricePerGramPKR - lastGoodPrice) / lastGoodPrice;
      if (deviation > 0.15) {
        return {
          ...snapshot,
          trusted: false,
          reason: `Price (${snapshot.pricePerGramPKR} PKR/g) deviates by ${(deviation * 100).toFixed(
            2
          )}% (>15%) from last trusted price (${lastGoodPrice} PKR/g)`,
        };
      }
    }
  } catch (err) {
    console.warn("Failed to check price:last-good from Redis:", err);
  }

  return {
    ...snapshot,
    trusted: true,
  };
}

/**
 * Retrieves market price, managing Redis cache (300s TTL) and failover.
 * - Checks price:cache (TTL 300s). Returns if cached.
 * - Retrieves USD/PKR FX rate (cached under fx:usd-pkr for 300s).
 * - Attempts GoldAPI (Primary).
 * - Attempts GoldPriceOrg (Fallback) if GoldAPI fails.
 * - Evaluates snapshot guardrails (price > 0 & <=15% deviation from price:last-good).
 * - If trusted: caches in price:cache (TTL 300s) and updates price:last-good (no TTL).
 * - If untrusted: returns snapshot with trusted: false and clear reason string.
 */
export async function getMarketPrice(): Promise<PriceSnapshot> {
  try {
    const cached = await redis.get<PriceSnapshot>("price:cache");
    if (cached && typeof cached === "object" && cached.pricePerGramPKR > 0) {
      return cached;
    }
  } catch (err) {
    console.warn("Redis read error for price:cache:", err);
  }

  let usdToPkr: number;
  try {
    usdToPkr = await getUsdToPkr();
  } catch (fxErr) {
    console.warn("USD/PKR FX rate fetch failed:", fxErr);
    return {
      source: "GoldPriceOrg",
      pricePerGramPKR: 0,
      fetchedAt: new Date().toISOString(),
      trusted: false,
      reason: "USD/PKR exchange rate source unreachable",
    };
  }

  let snapshot: PriceSnapshot | null = null;
  try {
    snapshot = await fetchGoldApi(usdToPkr);
  } catch (primaryError) {
    console.warn("Primary pricing source (Gold-API) failed:", primaryError);
    // Fallback: GoldPrice.org PKR endpoint — no FX rate needed
    try {
      snapshot = await fetchGoldPriceOrg();
    } catch (fallbackError) {
      console.warn("Fallback pricing source (GoldPriceOrg/PKR) failed:", fallbackError);
      snapshot = null;
    }
  }

  if (!snapshot) {
    return {
      source: "GoldPriceOrg",
      pricePerGramPKR: 0,
      fetchedAt: new Date().toISOString(),
      trusted: false,
      reason: "Neither primary (Gold-API) nor fallback (GoldPriceOrg) source could be reached",
    };
  }

  const validatedSnapshot = await validatePriceSnapshot(snapshot);

  if (validatedSnapshot.trusted) {
    try {
      await redis.set("price:cache", validatedSnapshot, { ex: 300 });
      await redis.set("price:last-good", validatedSnapshot);
    } catch (err) {
      console.warn("Redis write error:", err);
    }
  }

  return validatedSnapshot;
}
