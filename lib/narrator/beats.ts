import type { Id, LogEntry, World } from "../world/types";

/**
 * A Beat is one thing that happened, in structured form.
 * Beats are derived ONLY from the simulation log. The narrator may phrase them,
 * but it cannot add, remove or alter them.
 */
export interface Beat {
  id: string;
  day: number;
  kind: "EVENT" | "ACTION" | "ORG" | "REALIZATION";
  action?: string;
  actors: Id[];
  locationId?: Id;
  summary: string;
  details: string[];
  learned: { actorId: Id; fact: string; confidence: number; isTrue: boolean }[];
  significance: number;
}

const TRIVIAL = new Set(["MOVE", "LAY_LOW", "OBSERVE"]);

function actionOf(e: LogEntry): string | undefined {
  const a = e.data?.action;
  return typeof a === "string" ? a : undefined;
}

function baseSignificance(b: Beat): number {
  if (b.kind === "EVENT") return 8;
  if (b.kind === "ORG") {
    const a = b.action ?? "";
    if (a === "REVIEW") return 7;
    if (["PRESSURE", "DISCREDIT", "SUPPRESS"].includes(a)) return 6;
    return 4;
  }
  if (b.kind === "REALIZATION") return 4;
  switch (b.action) {
    case "PUBLISH": return 9;
    case "REPORT": return 7;
    case "CONFRONT": return 6;
    case "SEARCH": return 5;
    case "TALK": return 3;
    default: return 2;
  }
}

function bump(b: Beat): number {
  let s = baseSignificance(b);
  const text = b.details.join(" ");
  if (/joins the Student Investigation Group/.test(text)) s += 5;
  if (/is recruited into/.test(text)) s += 5;
  if (/breaks down and tells/.test(text)) s += 4;
  if (/is spotted/.test(text)) s += 2;
  if (/deflects/.test(text)) s += 1;
  if (b.learned.length > 0) s += Math.min(3, b.learned.length);
  return Math.max(0, Math.min(10, s));
}

export function extractBeats(world: World): Beat[] {
  const beats: Beat[] = [];
  let current: Beat | null = null;
  const counters: Record<number, number> = {};
  const nextId = (day: number): string => {
    counters[day] = (counters[day] ?? 0) + 1;
    return `B${day}.${counters[day]}`;
  };
  const dayBeats = (day: number): Beat[] => beats.filter((b) => b.day === day);

  const attachLearned = (e: LogEntry): void => {
    const factId = String(e.data?.factId ?? "");
    const fact = world.facts[factId];
    if (!fact || !e.actorId) return;
    const entry = {
      actorId: e.actorId,
      fact: fact.text,
      confidence: Number(e.data?.confidence ?? 0),
      isTrue: fact.truth,
    };
    // attach to the latest same-day beat involving this actor, else to a day-level realization beat
    const mine = dayBeats(e.day).filter((b) => b.actors.includes(e.actorId as Id));
    const target = mine[mine.length - 1];
    if (target) {
      target.learned.push(entry);
      return;
    }
    let dusk = dayBeats(e.day).find((b) => b.kind === "REALIZATION");
    if (!dusk) {
      dusk = {
        id: nextId(e.day),
        day: e.day,
        kind: "REALIZATION",
        actors: [],
        summary: "By the end of the day, realizations settle in",
        details: [],
        learned: [],
        significance: 0,
      };
      beats.push(dusk);
    }
    if (!dusk.actors.includes(e.actorId)) dusk.actors.push(e.actorId);
    dusk.learned.push(entry);
  };

  for (const e of world.log) {
    if (e.kind === "WORLD_EVENT") {
      const cons = Array.isArray(e.data?.consequences) ? (e.data?.consequences as string[]) : [];
      current = {
        id: nextId(e.day),
        day: e.day,
        kind: "EVENT",
        actors: [],
        summary: e.text,
        details: cons,
        learned: [],
        significance: 0,
      };
      beats.push(current);
    } else if (e.kind === "ORG_ACTION") {
      current = {
        id: nextId(e.day),
        day: e.day,
        kind: "ORG",
        action: String(e.data?.action ?? ""),
        actors: [],
        summary: e.text,
        details: [],
        learned: [],
        significance: 0,
      };
      beats.push(current);
    } else if (e.kind === "ACTION") {
      const actors = [e.actorId, e.targetId].filter((x): x is Id => !!x);
      current = {
        id: nextId(e.day),
        day: e.day,
        kind: "ACTION",
        action: actionOf(e),
        actors,
        locationId: e.locationId,
        summary: e.text,
        details: [],
        learned: [],
        significance: 0,
      };
      beats.push(current);
    } else if (e.kind === "CONSEQUENCE") {
      if (current && current.day === e.day && current.kind !== "EVENT") {
        current.details.push(e.text);
        for (const id of [e.actorId, e.targetId]) {
          if (id && !current.actors.includes(id)) current.actors.push(id);
        }
      } else if (current && current.kind === "EVENT") {
        current.details.push(e.text);
      }
    } else if (e.kind === "BELIEF") {
      attachLearned(e);
    }
  }

  const kept = beats.filter((b) => {
    if (b.kind === "ACTION" && b.action && TRIVIAL.has(b.action)) {
      return b.details.length > 0 || b.learned.length > 0;
    }
    return true;
  });
  for (const b of kept) b.significance = bump(b);
  return kept;
}

export function beatsForDay(beats: Beat[], day: number, max = 7): Beat[] {
  const todays = beats.filter((b) => b.day === day);
  const ranked = [...todays].sort((a, b) => b.significance - a.significance).slice(0, max);
  const keep = new Set(ranked.map((b) => b.id));
  return todays.filter((b) => keep.has(b.id));
}
