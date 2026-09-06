import { NextResponse } from "next/server";
import { confirmTrade } from "@/lib/trade";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { quoteId } = body;

    const result = await confirmTrade(quoteId);

    if (result.error || !result.trade) {
      return NextResponse.json(
        { error: result.error || "Failed to confirm trade", code: result.code },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json(result.trade, { status: 200 });
  } catch (error) {
    console.error("POST /api/trade error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while confirming trade" },
      { status: 500 }
    );
  }
}
