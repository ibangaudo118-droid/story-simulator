import { stateHash } from "../world/metrics";
import type { World } from "../world/types";
import { beatsForDay, extractBeats, type Beat } from "./beats";
import { buildBrief, type Brief } from "./brief";
import { systemPrompt, userPrompt, type StyleOptions } from "./prompt";
import { renderTemplate } from "./template";

export type LlmFn = (req: { system: string; user: string }) => Promise<string>;

export interface Paragraph {
  text: string;
  beats: string[];
}

export interface Chapter {
  day: number;
  paragraphs: Paragraph[];
  mode: "llm" | "template";
  warnings: string[];
}

export interface NarrationOptions extends StyleOptions {
  llm?: LlmFn;
  maxBeatsPerDay?: number;
}

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function parseParagraphs(raw: string): Paragraph[] | null {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as { paragraphs?: unknown };
    if (!Array.isArray(obj.paragraphs)) return null;
    const out: Paragraph[] = [];
    for (const p of obj.paragraphs) {
      const q = p as { text?: unknown; beats?: unknown };
      if (typeof q.text !== "string" || !Array.isArray(q.beats)) return null;
      out.push({ text: q.text, beats: q.beats.map(String) });
    }
    return out;
  } catch {
    return null;
  }
}

/** Grounding checks. Errors force a retry/fallback; warnings are surfaced but allowed. */
export function validate(paragraphs: Paragraph[], brief: Brief): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(brief.beats.map((b) => b.id));
  if (paragraphs.length === 0) errors.push("no paragraphs");
  const cited = new Set<string>();
  paragraphs.forEach((p, i) => {
    if (p.text.trim().length === 0) errors.push(`paragraph ${i + 1} is empty`);
    if (p.beats.length === 0) errors.push(`paragraph ${i + 1} cites no beats`);
    for (const b of p.beats) {
      if (!ids.has(b)) errors.push(`paragraph ${i + 1} cites unknown beat ${b}`);
      else cited.add(b);
    }
  });
  for (const b of brief.beats) {
    if (b.significance >= 8 && !cited.has(b.id)) {
      errors.push(`high-significance beat ${b.id} was left out`);
    }
  }

  const allowed = new Set<string>(brief.allowedNames.map((n) => n.toLowerCase()));
  const beatText = brief.beats
    .map((b) => [b.summary, ...b.details, ...b.learned.map((l) => l.fact)].join(" "))
    .join(" ");
  for (const m of beatText.matchAll(/\b[A-Za-z]+\b/g)) allowed.add(m[0].toLowerCase());
  for (const c of brief.cast) {
    c.role.split(/\W+/).forEach((w) => allowed.add(w.toLowerCase()));
  }
  const unknown = new Set<string>();
  const beatNumbers = new Set(beatText.match(/\d+/g) ?? []);
  const unknownNumbers = new Set<string>();
  for (const p of paragraphs) {
    const re = /(^|[.!?]["”']?\s+|["“]\s*)([A-Z][a-z]+)|(?<=[a-z,;:]\s)([A-Z][a-z]+)/g;
    for (const m of p.text.matchAll(re)) {
      const word = m[3];
      if (word && !allowed.has(word.toLowerCase())) unknown.add(word);
    }
    for (const n of p.text.match(/\b\d+\b/g) ?? []) {
      if (!beatNumbers.has(n) && n !== String(brief.day)) unknownNumbers.add(n);
    }
  }
  if (unknown.size > 0) warnings.push(`possible invented names: ${[...unknown].join(", ")}`);
  if (unknownNumbers.size > 0) warnings.push(`numbers not in the beats: ${[...unknownNumbers].join(", ")}`);
  return { ok: errors.length === 0, errors, warnings };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

async function narrateBrief(
  brief: Brief,
  opts: NarrationOptions,
  previousTail?: string
): Promise<Chapter> {
  const fallbackWarnings: string[] = [];
  if (opts.llm) {
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await opts.llm({
          system: systemPrompt(opts),
          user: userPrompt(brief, previousTail) + feedback,
        });
        const paragraphs = parseParagraphs(raw);
        if (!paragraphs) {
          feedback = "\n\nYour last reply was not valid JSON in the required shape. Reply with JSON only.";
          fallbackWarnings.push(`attempt ${attempt + 1}: unparseable output`);
          continue;
        }
        const v = validate(paragraphs, brief);
        if (v.ok) return { day: brief.day, paragraphs, mode: "llm", warnings: v.warnings };
        feedback = `\n\nYour last reply broke these rules: ${v.errors.join("; ")}. Fix them and reply with JSON only.`;
        fallbackWarnings.push(`attempt ${attempt + 1}: ${v.errors.join("; ")}`);
      } catch (err) {
        fallbackWarnings.push(`attempt ${attempt + 1}: ${(err as Error).message}`);
        break;
      }
    }
    fallbackWarnings.push("fell back to template narration");
  }
  return {
    day: brief.day,
    paragraphs: renderTemplate(brief),
    mode: "template",
    warnings: fallbackWarnings,
  };
}

/**
 * Read-only by construction: works on a frozen clone, and verifies the original world's
 * hash is unchanged afterwards. The narrator can never alter simulation state.
 */
export async function narrateRange(
  world: World,
  fromDay: number,
  toDay: number,
  opts: NarrationOptions = {}
): Promise<Chapter[]> {
  const before = stateHash(world);
  const frozen = deepFreeze(structuredClone(world));
  const beats: Beat[] = extractBeats(frozen);
  const chapters: Chapter[] = [];
  let tail: string | undefined;
  for (let day = fromDay; day <= toDay; day++) {
    const dayBeats = beatsForDay(beats, day, opts.maxBeatsPerDay ?? 7);
    const brief = buildBrief(frozen, day, dayBeats);
    const chapter = await narrateBrief(brief, opts, tail);
    chapters.push(chapter);
    const last = chapter.paragraphs[chapter.paragraphs.length - 1];
    tail = last ? last.text : tail;
  }
  if (stateHash(world) !== before) {
    throw new Error("Narrator invariant violated: world state changed during narration");
  }
  return chapters;
}

export async function narrateDay(
  world: World,
  day: number,
  opts: NarrationOptions = {}
): Promise<Chapter> {
  return (await narrateRange(world, day, day, opts))[0];
}
