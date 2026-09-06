import { NextResponse } from "next/server";
import { getDebugScenario, setDebugScenario, DebugScenario } from "@/lib/pricing";

const VALID: DebugScenario[] = ["none", "feed_down", "guardrail"];

export async function GET() {
  const scenario = await getDebugScenario();
  return NextResponse.json({ scenario });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const scenario = body?.scenario;

    if (!VALID.includes(scenario)) {
      return NextResponse.json(
        { error: `scenario must be one of: ${VALID.join(", ")}` },
        { status: 400 }
      );
    }

    await setDebugScenario(scenario);
    return NextResponse.json({ scenario });
  } catch (error) {
    console.error("POST /api/debug/scenario error:", error);
    return NextResponse.json({ error: "Failed to set scenario" }, { status: 500 });
  }
}