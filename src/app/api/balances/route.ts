import { NextResponse } from "next/server";
import { getOrSeedWalletState } from "@/lib/wallet";

export async function GET() {
  try {
    const balances = await getOrSeedWalletState();
    return NextResponse.json(balances, { status: 200 });
  } catch (error) {
    console.error("GET /api/balances error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve wallet balances" },
      { status: 500 }
    );
  }
}
