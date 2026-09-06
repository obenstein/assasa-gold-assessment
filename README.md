# Asasa Gold Trading — Demo

A single-user demo for buying and selling 24K gold at live market rates, with server-owned locked quotes and full balance consistency.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Upstash Redis** for all state (wallet, price cache, quotes, trades) — chosen for native TTL support, which maps directly onto the 75s quote lock and 5-minute price cache
- Deployed on **Vercel**

## Prerequisites

- Node.js 18+
- An Upstash Redis database (free tier is sufficient) — [console.upstash.com](https://console.upstash.com)

## Environment variables

Copy `.env.example` to `.env.local` and fill in your own Upstash credentials:

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Get these from your Upstash console → your database → **REST API** section (not the Redis protocol connection string — this app uses the HTTP REST client).

> **Note:** `.env.example` in this repo should contain placeholder values only. If you're setting this up from a clone, always use your own database's credentials, never reuse ones you find committed anywhere.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build & run production locally

```bash
npm run build
npm start
```

## Deploying (Vercel)

1. Import this repository into Vercel.
2. In **Project Settings → Environment Variables**, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the **Production** environment.
3. Deploy. No further configuration is needed — wallet state is seeded automatically on first request.

## Seeded starting state

On the first read of `/api/balances` (or any trade action), the app seeds:

| Balance | Starting value |
|---|---|
| PKR wallet | 5,000,000 |
| Customer gold | 50 g |
| Platform inventory | 5,000 g |

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/price` | GET | Current market snapshot (source, freshness, trust status) plus computed buy/sell prices |
| `/api/balances` | GET | Current wallet state (seeds it if absent) |
| `/api/quote` | POST `{ side, inputType, inputAmount }` | Creates a 75-second locked quote |
| `/api/trade` | POST `{ quoteId }` | Settles a quote into a trade. Idempotent — confirming an already-settled quote returns the original trade rather than creating a second one |

## Pricing sources

- **Primary**: [`api.gold-api.com/price/XAU`](https://api.gold-api.com/price/XAU) (USD/troy oz spot, 24K), converted to PKR/gram using the USD/PKR rate from `open.er-api.com`.
- **Fallback**: [`data-asg.goldprice.org/dbXRates/PKR`](https://data-asg.goldprice.org/dbXRates/PKR), which returns a PKR-denominated rate directly — no FX conversion dependency, so it stays available even if the FX source is down.
- See `WhatIDid.md` for why these are labeled honestly as `GoldAPI` / `GoldPriceOrg` rather than "PakGold".

## Known limitations

See the **Known Gaps** section of `WhatIDid.md`.
