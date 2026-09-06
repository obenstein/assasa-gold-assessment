import { redis } from "./redis";
import { PriceSnapshot, Quote, Side, InputType } from "./types";
import { getMarketPrice } from "./pricing";

export const GUARDRAIL_MULTIPLIER = 1.10; // Buy markup applied to last-known-good price

/**
 * Computes customer's buy price per gram in PKR.
 * Customer buy price = max(marketPKR * 1.10, lastGoodPKR * 1.10)
 */
export function computeBuyPrice(marketPKR: number, lastGoodPKR: number): number {
  const effectiveLastGood = lastGoodPKR > 0 ? lastGoodPKR : marketPKR;
  const guardrail = effectiveLastGood * GUARDRAIL_MULTIPLIER;
  return Math.round(Math.max(marketPKR * 1.10, guardrail));
}

/**
 * Computes customer's sell price per gram in PKR.
 * Customer sell price = marketPKR * 0.90
 */
export function computeSellPrice(marketPKR: number): number {
  return Math.round(marketPKR * 0.90);
}

export interface CreateQuoteInput {
  side: Side;
  inputType: InputType;
  inputAmount: number;
}

/**
 * Generates a locked quote valid for 75 seconds.
 */
export async function createQuote(input: CreateQuoteInput): Promise<{ quote?: Quote; error?: string }> {
  const { side, inputType, inputAmount } = input;

  if (!side || (side !== "BUY" && side !== "SELL")) {
    return { error: "Invalid side. Must be 'BUY' or 'SELL'." };
  }
  if (!inputType || (inputType !== "PKR" && inputType !== "GOLD")) {
    return { error: "Invalid inputType. Must be 'PKR' or 'GOLD'." };
  }
  if (typeof inputAmount !== "number" || isNaN(inputAmount) || inputAmount <= 0) {
    return { error: "Invalid inputAmount. Must be a positive number." };
  }

  const marketSnapshot = await getMarketPrice();

  if (!marketSnapshot.trusted) {
    return {
      error: marketSnapshot.reason || "Market price is currently untrusted. Trading is paused.",
    };
  }

  let lastGoodPrice = marketSnapshot.pricePerGramPKR;
  try {
    const lastGood = await redis.get<PriceSnapshot | number>("price:last-good");
    if (typeof lastGood === "number" && lastGood > 0) {
      lastGoodPrice = lastGood;
    } else if (lastGood && typeof lastGood === "object" && "pricePerGramPKR" in lastGood && lastGood.pricePerGramPKR > 0) {
      lastGoodPrice = Number(lastGood.pricePerGramPKR);
    }
  } catch (err) {
    console.warn("Failed to fetch price:last-good for quote computation:", err);
  }

  let lockedPricePerGramPKR: number;
  if (side === "BUY") {
    lockedPricePerGramPKR = computeBuyPrice(marketSnapshot.pricePerGramPKR, lastGoodPrice);
  } else {
    lockedPricePerGramPKR = computeSellPrice(marketSnapshot.pricePerGramPKR);
  }

  let pkrAmount: number;
  let goldGrams: number;

  if (inputType === "PKR") {
    pkrAmount = inputAmount;
    goldGrams = Number((pkrAmount / lockedPricePerGramPKR).toFixed(4));
  } else {
    goldGrams = inputAmount;
    pkrAmount = Math.round(goldGrams * lockedPricePerGramPKR);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 75 * 1000);
  const id = `quote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const quote: Quote = {
    id,
    side,
    inputType,
    inputAmount,
    lockedPricePerGramPKR,
    pkrAmount,
    goldGrams,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "PENDING",
  };

  try {
    await redis.set(`quote:${quote.id}`, quote, { ex: 75 });
  } catch (err) {
    console.warn("Failed to save quote to Redis:", err);
  }

  return { quote };
}
