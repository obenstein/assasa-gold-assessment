import { NextResponse } from "next/server";
import { confirmTrade } from "@/lib/trade";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { quoteId } = body;

    const result = await confirmTrade(quoteId);

    if (result.status !== 200 || !result.trade) {
      return NextResponse.json(
        {
          error: result.error || "Trade confirmation failed",
          code: result.code || "CONFIRMATION_FAILED",
        },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json(result.trade, { status: 200 });
  } catch (error) {
    console.error("POST /api/trade/confirm error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during trade confirmation", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
