import { NextResponse } from "next/server";

import { groqLlm } from "@/lib/narrator/groq";
import { narrateDay, type Chapter, type LlmFn } from "@/lib/narrator/narrate";
import type { Intervention } from "@/lib/replay/interventions";
import { createTimeline, fork, worldAt } from "@/lib/replay/timeline";
import { cacheGet, cacheSet, clientKey, rateLimit, takeBudget } from "@/lib/server/limits";
import type { World } from "@/lib/world/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_HORIZON = 30;
const MIN_HORIZON = 5;
const MAX_HORIZON = 60;
const MAX_SEED = 999_999;
const MAX_INTERVENTIONS = 8;

/** Every request, per caller per minute. */
const REQUESTS_PER_MINUTE = 30;
/** Requests that actually call the AI, per caller per minute. */
const AI_CALLS_PER_MINUTE = 6;
/** Total AI calls this server instance will make per UTC day. Override with NARRATE_DAILY_LLM_BUDGET. */
const DAILY_AI_BUDGET = Number(process.env.NARRATE_DAILY_LLM_BUDGET ?? 300);

const NO_STORE = { "Cache-Control": "no-store" };

function fail(message: string, status = 400, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { ...NO_STORE, ...headers } });
}

function whole(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function buildWorld(
  seed: number,
  horizon: number,
  day: number,
  forkDay: number | null,
  interventions: Intervention[]
): World {
  let timeline = createTimeline(seed, horizon);
  let branch = "main";
  if (forkDay !== null && interventions.length > 0) {
    timeline = fork(timeline, "main", forkDay, interventions, "branch");
    branch = "branch";
  }
  // The world at the start of day+1 already contains everything that happened on `day`.
  return worldAt(timeline, branch, day + 1);
}

/**
 * POST /api/narrate
 * body: { seed, day, horizon?, forkDay?, interventions? }
 * Narrates ONE day. Uses the AI when it is configured and within limits; otherwise returns the
 * standard (template) narration, which is free. The narrator never changes the simulation.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const caller = clientKey(req);

  const general = rateLimit(`all:${caller}`, REQUESTS_PER_MINUTE, 60_000);
  if (!general.ok) {
    return fail("Too many requests. Wait a moment and try again.", 429, {
      "Retry-After": String(general.retryAfter),
    });
  }

  const raw: unknown = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") return fail("Send a JSON body.");
  const body = raw as Record<string, unknown>;

  const seed = whole(body.seed, 1, MAX_SEED);
  if (seed === null) return fail(`seed must be a whole number from 1 to ${MAX_SEED}.`);

  const horizon =
    body.horizon === undefined ? DEFAULT_HORIZON : whole(body.horizon, MIN_HORIZON, MAX_HORIZON);
  if (horizon === null) {
    return fail(`horizon must be a whole number from ${MIN_HORIZON} to ${MAX_HORIZON}.`);
  }

  const day = whole(body.day, 1, horizon);
  if (day === null) return fail(`day must be a whole number from 1 to ${horizon}.`);

  let forkDay: number | null = null;
  let interventions: Intervention[] = [];
  if (body.interventions !== undefined) {
    if (!Array.isArray(body.interventions) || body.interventions.length > MAX_INTERVENTIONS) {
      return fail(`interventions must be a list of at most ${MAX_INTERVENTIONS}.`);
    }
    forkDay = whole(body.forkDay, 1, horizon);
    if (forkDay === null) {
      return fail(`forkDay must be a whole number from 1 to ${horizon} when interventions are sent.`);
    }
    interventions = body.interventions as Intervention[];
  }

  const cacheKey = JSON.stringify([seed, horizon, forkDay, interventions, day]);
  if (cacheKey.length > 4000) return fail("That request is too large.");

  const cached = cacheGet<Chapter>(cacheKey);
  if (cached) {
    return NextResponse.json(
      { day, chapter: cached, llmEnabled: true, cached: true },
      { headers: NO_STORE }
    );
  }

  // Decide whether this request may spend AI budget.
  let llm: LlmFn | undefined;
  let note: string | undefined;
  if (!process.env.GROQ_API_KEY) {
    note = "AI narration isn't set up on this server, so this is the standard version.";
  } else {
    const perCaller = rateLimit(`ai:${caller}`, AI_CALLS_PER_MINUTE, 60_000);
    if (!perCaller.ok) {
      note = `You've reached the AI narration limit. Try again in ${perCaller.retryAfter} seconds.`;
    } else if (!takeBudget(DAILY_AI_BUDGET)) {
      note = "Today's AI narration budget is used up, so this is the standard version.";
    } else {
      llm = groqLlm();
    }
  }

  let world: World;
  try {
    world = buildWorld(seed, horizon, day, forkDay, interventions);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not build that world.");
  }

  const chapter = await narrateDay(world, day, llm ? { llm } : {});

  if (chapter.mode === "llm") {
    cacheSet(cacheKey, chapter);
  } else if (llm) {
    note = "AI narration didn't work this time, so this is the standard version.";
  }

  return NextResponse.json(
    { day, chapter, llmEnabled: chapter.mode === "llm", note },
    { headers: NO_STORE }
  );
}
