# What I Did - Pricing Pipeline, Quotes & Trade Settlement Architecture

## Source Attribution & Architecture Decisions

### 1. Honest Upstream Source Labeling (`GoldAPI` vs `GoldPriceOrg`)
- **Finding**: PakGold's frontend does not expose a proprietary or raw PKR/gram endpoint. Instead, PakGold's client-side frontend fetches XAU/USD spot prices from `https://api.gold-api.com/price/XAU` and multiplies by the USD/PKR exchange rate (`open.er-api.com`).
- **Decision**: To meet the brief's trust requirement ("show source honestly"), we label the primary source `GoldAPI` (`"GoldAPI"` in `PriceSnapshot`) rather than misattributing it as "PakGold". The fallback source is `GoldPriceOrg` (`https://data-asg.goldprice.org/dbXRates/USD`).

### 2. Shared USD/PKR Exchange Rate Dependency
- Both `GoldAPI` and `GoldPriceOrg` provide XAU spot prices in USD/troy ounce.
- To convert USD/troy oz to PKR/gram, both sources rely on the USD/PKR exchange rate fetched from `https://open.er-api.com/v6/latest/USD`.
- **Cache Strategy**: The exchange rate is cached in Redis key `fx:usd-pkr` with a 300-second (5-minute) TTL.
- **Known Trade-off**: If the FX rate API (`open.er-api.com`) becomes unreachable and no cached rate is present, both gold pricing sources will degrade together.

### 3. Guardrail Multiplier Assumption (`computeBuyPrice`)
- **Assumption**: The brief specifies `computeBuyPrice(marketPKR, lastGoodPKR) = Math.max(marketPKR * 1.10, lastGoodPKR * 1.10)`. The brief does not define "guardrail" numerically. We treat it as `lastKnownGoodPrice × 1.10` — a price floor that prevents the customer's buy price from crashing below the last trusted rate even if the live market feed briefly drops or misbehaves.

### 4. Trade Confirmation Idempotency & Concurrency (`POST /api/trade/confirm`)
- **Double-Submit / Double-Click Safety**:
  - Uses `redis.set("lock:confirm:" + quoteId, "LOCKED", { nx: true, ex: 15 })` to ensure atomic processing of concurrent requests.
  - If a second request or double-click occurs for a quote marked `CONFIRMED`, it returns the existing `Trade` object (HTTP 200) linking to `quote.tradeId`.
  - Re-checks expiration (`expiresAt > Date.now()`) and validates current balances (`INSUFFICIENT_CASH`, `INSUFFICIENT_GOLD`, `INSUFFICIENT_INVENTORY`) returning HTTP 422 with specific error codes if balance checks fail.
