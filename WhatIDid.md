# What I Did

## How I Understood the Assignment

Build a single-user, no-auth demo where a reviewer can see starting balances, complete a gold trade at a live rate, and see the balances update — without any explanation from me. The core of the brief isn't the UI, it's **trust**: showing where the price came from and how fresh it is, never settling a trade "quietly" at a different price than what was locked, and failing safely (rather than silently) when a price feed, a balance, or a quote can't be trusted.

## What I Built

Mapped to the required 5-step flow:

1. **Price + source + freshness** — home screen shows the live 24K PKR/gram rate, which upstream source it came from, and a human-readable "updated Xs/Xm ago."
2. **Enter PKR or gold** — trade form accepts either unit; the app converts using the side-appropriate price (buy price when buying, sell price when selling).
3. **75-second locked quote** — `POST /api/quote` computes and stores a server-owned quote in Redis with a 75s TTL. The UI shows a live countdown ring against `quote.expiresAt`.
4. **Confirm, settle once** — `POST /api/trade` settles the quote at its *locked* price regardless of what the market has done since. Confirming an already-settled quote returns the original trade rather than creating a second one (see Key Decisions).
5. **Updated balances + receipt** — settlement returns new wallet/gold/inventory balances and a trade receipt with a reference number.

## Assumptions

- **Guardrail definition**: the brief specifies `computeBuyPrice = max(market × 1.10, guardrail)` but doesn't define `guardrail` numerically. I implemented it as `lastKnownGoodPrice × 1.10` — a floor that stops the customer's buy price from crashing below the last trusted rate if the live feed briefly misbehaves. This is a defensible reading, not the only possible one.
- **Seeded balances**: PKR wallet 5,000,000 / customer gold 50g / platform inventory 5,000g — arbitrary but internally consistent starting state, chosen to comfortably support several demo trades.
- **"Trusted" price** = the fetch succeeded, the price is `> 0`, and it's within 15% of the last trusted (`price:last-good`) snapshot. This 15% bound is my own sanity threshold, not specified in the brief.
- **Rounding**: PKR/gram is rounded to the nearest whole rupee. PakGold's own exact rounding/display rule wasn't verifiable (see below), so this is my own choice.
- **PakGold source substitution** (see Key Decisions #1): I did not reverse-engineer pakgold.pk's own endpoint. I'm treating this as an acceptable interpretation of "primary source" rather than a shortcut, but it is an assumption worth calling out explicitly.

## Key Decisions

### 1. Honest source labeling (`GoldAPI` vs `GoldPriceOrg`, not "PakGold")

Investigating `pakgold.pk`'s network traffic showed it doesn't expose its own PKR/gram feed — its frontend fetches XAU/USD spot from `api.gold-api.com/price/XAU` and converts client-side using a USD/PKR rate. Rather than either (a) scraping pakgold.pk's page and calling it "PakGold" when it isn't really an independent endpoint, or (b) silently using a different source but still labeling it "PakGold," I call the same upstream PakGold's own frontend uses and label it honestly as `GoldAPI` in the UI and API. The brief's own trust requirement is to "show source" — mislabeling it would work against that.

### 2. Primary and fallback have genuinely independent failure modes

- **Primary (`GoldAPI`)**: `api.gold-api.com/price/XAU` (USD/oz) → converted to PKR/gram via `open.er-api.com`'s USD/PKR rate. Depends on two upstreams.
- **Fallback (`GoldPriceOrg`)**: `data-asg.goldprice.org/dbXRates/PKR` returns a PKR-denominated rate directly. It does **not** depend on the FX API at all — so if `open.er-api.com` goes down, the app fails over cleanly to a source with no shared dependency, rather than both sources degrading together.

### 3. Price caching and trust gate

`getMarketPrice()` checks a 300s-TTL Redis cache first; on miss, tries primary then fallback; validates the result against `price:last-good` (rejects `<= 0` or >15% deviation); only caches and updates `price:last-good` if the result is trusted. Untrusted results are returned as-is with a `reason` string and are never cached, so a bad reading doesn't poison subsequent requests.

### 4. Trade confirmation idempotency (double-confirm safety)

`POST /api/trade` (implemented in `confirmTrade`):
- If the quote is already `CONFIRMED`, returns the existing `Trade` (HTTP 200) instead of erroring or re-settling.
- Uses a Redis `SET NX` lock (`lock:confirm:{quoteId}`, 15s TTL) so concurrent/replayed confirm requests can't both pass the balance check and both settle — losing requests poll briefly for the winner's result and return that instead.
- Re-validates quote expiry and current balances (cash, customer gold, platform inventory) at confirm time, not just at quote time, since balances can change between quote and confirm.
- Balance-insufficiency errors are specific (`INSUFFICIENT_CASH` / `INSUFFICIENT_GOLD` / `INSUFFICIENT_INVENTORY`), not one generic failure.

### 5. State store: Upstash Redis

Chosen because its native key TTL maps directly onto both the 75-second quote lock and the 5-minute price cache, with no cron jobs or manual expiry bookkeeping needed — and because Vercel's serverless functions have no persistent local disk, ruling out file/SQLite-based state.

## Known Gaps

Being upfront about what's incomplete rather than leaving it to be discovered:

- **No reviewer-facing way to trigger the guardrail or "both sources untrusted" scenarios without redeploying.** The brief explicitly asks for this ("reviewers should be able to try them... without changing your deployed code"), and as of writing this isn't implemented — there's no debug/simulate query param or toggle. This is the most significant gap against the brief as written.
- **`/api/trade` and `/api/trade/confirm` are duplicate routes** with identical logic; only `/api/trade` is actually called by the frontend. `/api/trade/confirm` is dead code left over from an earlier iteration.
- **Trade settlement isn't fully atomic.** `confirmTrade` writes the new wallet state, the trade record, and the quote's `CONFIRMED` status as separate sequential Redis calls. A failure partway through (e.g. the wallet write succeeds but the quote-status write fails) could theoretically allow a subsequent confirm to re-execute against stale quote state before the 15s lock is used up. This is a low-probability edge case (requires a mid-sequence Redis failure) rather than a routine one, but it's not proven safe under partial failure.
- **PakGold's exact PKR/gram calculation (rounding rule, purity handling) was not reproduced.** I use my own conversion and rounding (see Assumptions) rather than pakgold.pk's undocumented client-side formula, since that formula wasn't fully recoverable from the network traffic alone.
- **`.next` build output was committed to git** in earlier commits (missing from `.gitignore`); should be removed from tracking before final submission.