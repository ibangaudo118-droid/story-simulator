import type { Brief } from "./brief";

export interface StyleOptions {
  style?: string;
  wordsPerDay?: number;
}

export const DEFAULT_STYLE =
  "Close third person, past tense. Restrained, atmospheric, specific. Show tension through behavior, not adjectives. No melodrama, no cliches.";

export function systemPrompt(opts: StyleOptions = {}): string {
  return [
    "You are the narrator of a simulation-driven story. The simulation has ALREADY decided what happened. You only decide how to tell it.",
    "",
    "HARD RULES",
    "1. Tell only what the beats say. Do not add events, characters, places, objects, numbers or outcomes that are not in the beats.",
    "2. You may add interiority, sensory texture, gesture and short dialogue, but dialogue must not state any fact that its speaker does not already know or learn in that beat. A speaker who is deflecting must not reveal the secret.",
    "3. Facts marked isTrue=false are false rumors. Present them as something a character came to believe, never as true.",
    "4. Do not resolve anything the beats leave open. Do not foreshadow specific future events.",
    "5. Every paragraph must cite the beat ids it draws on.",
    "6. Use only the characters in the cast and places in the brief.",
    "",
    `STYLE: ${opts.style ?? DEFAULT_STYLE}`,
    `LENGTH: about ${opts.wordsPerDay ?? 180} words for the whole day.`,
    "",
    'OUTPUT: respond with JSON only, no markdown fences: {"paragraphs":[{"text":"...","beats":["B3.1","B3.2"]}]}',
  ].join("\n");
}

export function userPrompt(brief: Brief, previousTail?: string): string {
  const payload = {
    day: brief.day,
    cast: brief.cast,
    places: brief.places,
    beats: brief.beats.map((b) => ({
      id: b.id,
      kind: b.kind,
      what: b.summary,
      where: b.locationId ? brief.places[b.locationId] : undefined,
      who: b.actors,
      consequences: b.details,
      learned: b.learned.map((l) => ({
        who: l.actorId,
        fact: l.fact,
        isTrue: l.isTrue,
      })),
    })),
  };
  return [
    previousTail ? `Previous paragraph (for continuity only, do not retell it):\n${previousTail}\n` : "",
    "Narrate this day.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}
