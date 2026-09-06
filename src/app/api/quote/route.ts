import { NextResponse } from "next/server";
import { createQuote } from "@/lib/quote";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { side, inputType, inputAmount } = body;

    const result = await createQuote({
      side,
      inputType,
      inputAmount: Number(inputAmount),
    });

    if (result.error || !result.quote) {
      return NextResponse.json(
        { error: result.error || "Failed to create quote" },
        { status: 400 }
      );
    }

    return NextResponse.json(result.quote, { status: 200 });
  } catch (error) {
    console.error("POST /api/quote error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while generating quote" },
      { status: 500 }
    );
  }
}
