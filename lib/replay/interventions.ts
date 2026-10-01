import { learn, ensureRel, clamp, log } from "../world/ops";
import type { BeliefSource, Id, World } from "../world/types";

/**
 * An Intervention is a small, serializable edit applied to the world at the START of a day,
 * before the engine steps. Forks are fully described by (parent, day, interventions), so a
 * saved branch is a few hundred bytes and replays exactly.
 */
export type Intervention =
  | { kind: "LEARN"; charId: Id; factId: Id; confidence: number; source?: BeliefSource; fromId?: Id }
  | { kind: "MOVE"; charId: Id; to: Id }
  | { kind: "SET_RELATIONSHIP"; from: Id; to: Id; trust?: number; suspicion?: number }
  | { kind: "ADJUST"; charId: Id; stress?: number; alarm?: number };

export function validateIntervention(w: World, iv: Intervention): string | null {
  const hasChar = (id: Id) => !!w.characters[id];
  switch (iv.kind) {
    case "LEARN":
      if (!hasChar(iv.charId)) return `unknown character "${iv.charId}"`;
      if (!w.facts[iv.factId]) return `unknown fact "${iv.factId}"`;
      if (!(iv.confidence > 0 && iv.confidence <= 100)) return "confidence must be in (0, 100]";
      if (iv.fromId && !hasChar(iv.fromId)) return `unknown character "${iv.fromId}"`;
      return null;
    case "MOVE":
      if (!hasChar(iv.charId)) return `unknown character "${iv.charId}"`;
      if (!w.locations[iv.to]) return `unknown location "${iv.to}"`;
      return null;
    case "SET_RELATIONSHIP":
      if (!hasChar(iv.from) || !hasChar(iv.to)) return "unknown character in relationship";
      if (iv.from === iv.to) return "a character cannot have a relationship with itself";
      return null;
    case "ADJUST":
      return hasChar(iv.charId) ? null : `unknown character "${iv.charId}"`;
  }
}

function describe(w: World, iv: Intervention): string {
  const name = (id: Id) => w.characters[id]?.name ?? id;
  switch (iv.kind) {
    case "LEARN":
      return `${name(iv.charId)} is told: ${w.facts[iv.factId].text}`;
    case "MOVE":
      return `${name(iv.charId)} is called away to ${w.locations[iv.to].name}`;
    case "SET_RELATIONSHIP":
      return `Something shifts between ${name(iv.from)} and ${name(iv.to)}`;
    case "ADJUST":
      return `${name(iv.charId)} is shaken by something offstage`;
  }
}

/** Returns a NEW world; never mutates the input. Throws on invalid input. */
export function applyIntervention(prev: World, iv: Intervention): World {
  const bad = validateIntervention(prev, iv);
  if (bad) throw new Error(`Invalid intervention: ${bad}`);
  const w: World = structuredClone(prev);
  switch (iv.kind) {
    case "LEARN":
      learn(w, iv.charId, iv.factId, iv.confidence, iv.source ?? "told", iv.fromId);
      break;
    case "MOVE":
      w.characters[iv.charId].location = iv.to;
      w.characters[iv.charId].stayDays = 0;
      break;
    case "SET_RELATIONSHIP": {
      const r = ensureRel(w.characters[iv.from], iv.to);
      if (iv.trust !== undefined) r.trust = clamp(iv.trust);
      if (iv.suspicion !== undefined) r.suspicion = clamp(iv.suspicion);
      break;
    }
    case "ADJUST": {
      const c = w.characters[iv.charId];
      if (iv.stress !== undefined) c.stress = clamp(c.stress + iv.stress);
      if (iv.alarm !== undefined) c.alarm = clamp(c.alarm + iv.alarm);
      break;
    }
  }
  // Logged as a WORLD_EVENT so the narrator sees it as an ordinary beat and nothing is hidden.
  log(w, {
    kind: "WORLD_EVENT",
    actorId: "charId" in iv ? iv.charId : "from" in iv ? iv.from : undefined,
    text: describe(w, iv),
    data: { intervention: true, spec: iv },
  });
  return w;
}
