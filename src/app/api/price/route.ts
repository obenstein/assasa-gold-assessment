import { NextResponse } from "next/server";
import { getMarketPrice } from "@/lib/pricing";
import { computeBuyPrice, computeSellPrice } from "@/lib/quote";
import { redis } from "@/lib/redis";
import { PriceSnapshot } from "@/lib/types";

export async function GET() {
  try {
    const snapshot = await getMarketPrice();

    let lastGoodPrice = snapshot.pricePerGramPKR;
    try {
      const lastGood = await redis.get<PriceSnapshot | number>("price:last-good");
      if (typeof lastGood === "number" && lastGood > 0) {
        lastGoodPrice = lastGood;
      } else if (lastGood && typeof lastGood === "object" && "pricePerGramPKR" in lastGood && Number(lastGood.pricePerGramPKR) > 0) {
        lastGoodPrice = Number(lastGood.pricePerGramPKR);
      }
    } catch (err) {
      console.warn("Failed to fetch price:last-good for API price route:", err);
    }

    const buyPricePerGramPKR = computeBuyPrice(snapshot.pricePerGramPKR, lastGoodPrice);
    const sellPricePerGramPKR = computeSellPrice(snapshot.pricePerGramPKR);

    return NextResponse.json(
      {
        snapshot,
        buyPricePerGramPKR,
        sellPricePerGramPKR,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/price error:", error);
    return NextResponse.json(
      {
        snapshot: {
          source: "GoldPriceOrg",
          pricePerGramPKR: 0,
          fetchedAt: new Date().toISOString(),
          trusted: false,
          reason: "An unexpected error occurred while fetching market price",
        },
        buyPricePerGramPKR: 0,
        sellPricePerGramPKR: 0,
      },
      { status: 200 }
    );
  }
}
