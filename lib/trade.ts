import { redis } from "./redis";
import { Quote, Trade, WalletState } from "./types";
import { getOrSeedWalletState } from "./wallet";

export interface ConfirmTradeResult {
  trade?: Trade;
  status: number;
  error?: string;
  code?: string;
}

export async function confirmTrade(quoteId: string): Promise<ConfirmTradeResult> {
  if (!quoteId || typeof quoteId !== "string") {
    return { status: 400, error: "Missing or invalid quoteId parameter", code: "INVALID_INPUT" };
  }

  // 1. Fetch Quote from Redis
  let quote: Quote | null = null;
  try {
    quote = await redis.get<Quote>(`quote:${quoteId}`);
  } catch (err) {
    console.warn(`Redis error fetching quote:${quoteId}:`, err);
  }

  if (!quote) {
    return {
      status: 410,
      error: "Quote expired or not found. Please request a new quote.",
      code: "QUOTE_EXPIRED",
    };
  }

  // 2. If quote is already CONFIRMED, return existing Trade (Idempotence)
  if (quote.status === "CONFIRMED" && quote.tradeId) {
    try {
      const existingTrade = await redis.get<Trade>(`trade:${quote.tradeId}`);
      if (existingTrade) {
        return { status: 200, trade: existingTrade };
      }
    } catch (err) {
      console.warn("Failed to fetch existing trade:", err);
    }
  }

  // 3. Belt-and-braces expiration check
  const nowMs = Date.now();
  const expiresAtMs = new Date(quote.expiresAt).getTime();
  if (expiresAtMs <= nowMs) {
    return {
      status: 410,
      error: "Quote expired. Please request a new quote.",
      code: "QUOTE_EXPIRED",
    };
  }

  // 4. Atomic lock for concurrent double-submit protection
  const lockKey = `lock:confirm:${quoteId}`;
  let lockAcquired = false;
  try {
    const lockResult = await redis.set(lockKey, "LOCKED", { nx: true, ex: 15 });
    lockAcquired = lockResult === "OK" || lockResult === "ok";
  } catch (err) {
    console.warn("Redis SET NX lock error:", err);
    lockAcquired = true;
  }

  if (!lockAcquired) {
    // Another concurrent request is processing or won — retry reading trade
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const updatedQuote = await redis.get<Quote>(`quote:${quoteId}`);
        if (updatedQuote?.status === "CONFIRMED" && updatedQuote.tradeId) {
          const trade = await redis.get<Trade>(`trade:${updatedQuote.tradeId}`);
          if (trade) return { status: 200, trade };
        }
        const linkedTrade = await redis.get<Trade>(`trade:for-quote:${quoteId}`);
        if (linkedTrade) return { status: 200, trade: linkedTrade };
      } catch (e) {
        // ignore
      }
    }
  }

  // Double check quote status after acquiring lock
  try {
    const latestQuote = await redis.get<Quote>(`quote:${quoteId}`);
    if (latestQuote?.status === "CONFIRMED" && latestQuote.tradeId) {
      const trade = await redis.get<Trade>(`trade:${latestQuote.tradeId}`);
      if (trade) return { status: 200, trade };
    }
  } catch (e) {
    // ignore
  }

  // 5. Re-fetch current WalletState and validate sufficient balances
  const walletState = await getOrSeedWalletState();

  if (quote.side === "BUY") {
    if (walletState.pkrBalance < quote.pkrAmount) {
      return {
        status: 422,
        error: "Insufficient PKR cash balance to execute buy trade.",
        code: "INSUFFICIENT_CASH",
      };
    }
    if (walletState.platformInventoryGrams < quote.goldGrams) {
      return {
        status: 422,
        error: "Insufficient platform gold inventory to fulfill buy trade.",
        code: "INSUFFICIENT_INVENTORY",
      };
    }
  } else if (quote.side === "SELL") {
    if (walletState.customerGoldGrams < quote.goldGrams) {
      return {
        status: 422,
        error: "Insufficient customer gold balance to execute sell trade.",
        code: "INSUFFICIENT_GOLD",
      };
    }
  }

  // 6. Compute new balances
  let newPkrBalance = walletState.pkrBalance;
  let newCustomerGoldGrams = walletState.customerGoldGrams;
  let newPlatformInventoryGrams = walletState.platformInventoryGrams;

  if (quote.side === "BUY") {
    newPkrBalance -= quote.pkrAmount;
    newCustomerGoldGrams += quote.goldGrams;
    newPlatformInventoryGrams -= quote.goldGrams;
  } else {
    newPkrBalance += quote.pkrAmount;
    newCustomerGoldGrams -= quote.goldGrams;
    newPlatformInventoryGrams += quote.goldGrams;
  }

  const balancesAfter: WalletState = {
    pkrBalance: Math.round(newPkrBalance),
    customerGoldGrams: Number(newCustomerGoldGrams.toFixed(4)),
    platformInventoryGrams: Number(newPlatformInventoryGrams.toFixed(4)),
    updatedAt: new Date().toISOString(),
  };

  // 7. Create Trade
  const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const receiptNumber = `REC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const trade: Trade = {
    id: tradeId,
    quoteId: quote.id,
    side: quote.side,
    pkrAmount: quote.pkrAmount,
    goldGrams: quote.goldGrams,
    pricePerGramPKR: quote.lockedPricePerGramPKR,
    executedAt: new Date().toISOString(),
    receiptNumber,
    balancesAfter,
  };

  // 8. Persist changes to Redis
  try {
    await redis.set("wallet:state", balancesAfter);
    await redis.set(`trade:${tradeId}`, trade);
    await redis.set(`trade:for-quote:${quote.id}`, trade);

    const updatedQuote: Quote = {
      ...quote,
      status: "CONFIRMED",
      tradeId,
    };
    await redis.set(`quote:${quote.id}`, updatedQuote, { ex: 300 });
  } catch (err) {
    console.warn("Redis write error during trade settlement:", err);
  }

  return { status: 200, trade };
}
