import { NextResponse } from "next/server";
import { createWorld } from "../../../lib/world/content";
import { run } from "../../../lib/world/engine";
import { groqLlm } from "../../../lib/narrator/groq";
import { narrateRange } from "../../../lib/narrator/narrate";

export const runtime = "nodejs";

/**
 * POST /api/narrate
 * body: { seed?: number, days?: number, fromDay?: number, toDay?: number, useLlm?: boolean }
 * Runs the simulation, then narrates fromDay..toDay (max 10 days per request).
 * The narrator is read-only: it receives the finished log and returns text.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    seed?: number;
    days?: number;
    fromDay?: number;
    toDay?: number;
    useLlm?: boolean;
  };
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : 1;
  const days = Math.min(100, Math.max(1, Number(body.days ?? 30)));
  const fromDay = Math.max(1, Number(body.fromDay ?? 1));
  const toDay = Math.min(days, Number(body.toDay ?? Math.min(days, fromDay + 9)), fromDay + 9);

  const world = run(createWorld(seed), days);
  let llm;
  if (body.useLlm !== false && process.env.GROQ_API_KEY) llm = groqLlm();

  const chapters = await narrateRange(world, fromDay, toDay, { llm });
  return NextResponse.json({
    seed,
    fromDay,
    toDay,
    llmEnabled: !!llm,
    chapters,
  });
}
