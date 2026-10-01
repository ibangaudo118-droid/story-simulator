import type {
  Belief,
  BeliefSource,
  Character,
  Id,
  LogEntry,
  Organization,
  Relationship,
  World,
} from "./types";

export const clamp = (v: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, v));

export const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Noisy-or evidence accumulation: corroboration raises confidence, it never lowers it. */
export function combine(existing: number, incoming: number): number {
  return clamp(100 - ((100 - existing) * (100 - clamp(incoming))) / 100);
}

export function log(
  w: World,
  entry: Omit<LogEntry, "id" | "day">
): void {
  w.log.push({ id: `L${w.log.length + 1}`, day: w.day, ...entry });
}

export function ensureRel(c: Character, otherId: Id): Relationship {
  if (!c.relationships[otherId]) {
    c.relationships[otherId] = { trust: 50, suspicion: 10 };
  }
  return c.relationships[otherId];
}

export function conf(c: Character, factId: Id): number {
  return c.beliefs[factId]?.confidence ?? 0;
}

export function believes(c: Character, factId: Id, threshold = 50): boolean {
  return conf(c, factId) >= threshold;
}

export function matches(pattern: string, factId: Id): boolean {
  if (!pattern.includes("*")) return pattern === factId;
  const re = new RegExp(
    "^" +
      pattern
        .split("*")
        .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$"
  );
  return re.test(factId);
}

export function factIdsMatching(w: World, pattern: string): Id[] {
  return Object.keys(w.facts).filter((id) => matches(pattern, id));
}

export function membersOf(w: World, orgId: Id): Character[] {
  return Object.values(w.characters).filter((c) => c.orgIds.includes(orgId));
}

export function present(w: World, c: Character): Character[] {
  return Object.values(w.characters).filter(
    (o) => o.id !== c.id && o.location === c.location
  );
}

export function privacyOf(w: World, locId: Id): number {
  const loc = w.locations[locId];
  const crowded = locId === "library" && w.day <= (w.flags.examWeekUntil ?? -1);
  return clamp(loc.privacy - (crowded ? 35 : 0));
}

/**
 * The single door through which a character acquires a belief.
 * Returns the confidence gained (0 if nothing new).
 */
export function learn(
  w: World,
  charId: Id,
  factId: Id,
  confidence: number,
  source: BeliefSource,
  fromId?: Id
): number {
  const c = w.characters[charId];
  const fact = w.facts[factId];
  if (!c || !fact || confidence <= 0) return 0;

  const prevBelief = c.beliefs[factId];
  const prev = prevBelief?.confidence ?? 0;
  const next = round1(combine(prev, confidence));
  if (next <= prev + 0.4) return 0;

  c.beliefs[factId] = {
    factId,
    confidence: next,
    source: confidence >= prev ? source : prevBelief.source,
    fromId: confidence >= prev ? fromId : prevBelief?.fromId,
    day: w.day,
    corroboration: (prevBelief?.corroboration ?? 0) + 1,
  };

  const gain = next - prev;

  if (fact.about && fact.about !== charId) {
    const rel = ensureRel(c, fact.about);
    if (fact.valence) {
      const delta = (gain / 100) * 30;
      rel.trust = clamp(rel.trust + fact.valence * delta);
      rel.suspicion = clamp(rel.suspicion - fact.valence * delta);
    }
    if (fact.hostileTo && c.orgIds.includes(fact.hostileTo)) {
      rel.suspicion = clamp(rel.suspicion + (gain / 100) * 35);
      rel.trust = clamp(rel.trust - (gain / 100) * 12);
    }
  }

  if (prev < 50 && next >= 50) {
    log(w, {
      kind: "BELIEF",
      actorId: charId,
      text: `${c.name} now believes: ${fact.text}`,
      data: { factId, confidence: next, source },
    });
  }
  return gain;
}

/** Lazily create the dynamic "X is investigating" fact. */
export function ensureActivityFact(w: World, charId: Id): Id {
  const id = `activity:${charId}:investigating`;
  if (!w.facts[id]) {
    w.facts[id] = {
      id,
      text: `${w.characters[charId].name} is investigating the company`,
      truth: true,
      topics: ["activity", "company", "investigation"],
      secret: false,
      about: charId,
      hostileTo: "company",
    };
  }
  return id;
}

export function poolConf(org: Organization, factId: Id): number {
  return org.pool[factId]?.confidence ?? 0;
}

export function poolLearn(
  w: World,
  org: Organization,
  factId: Id,
  confidence: number,
  source: BeliefSource = "witnessed",
  fromId?: Id
): number {
  const prev = poolConf(org, factId);
  const next = round1(combine(prev, confidence));
  if (next <= prev + 0.4) return 0;
  org.pool[factId] = {
    factId,
    confidence: next,
    source,
    fromId,
    day: w.day,
    corroboration: (org.pool[factId]?.corroboration ?? 0) + 1,
  };
  // members who are hostile to the subject update their private suspicion too
  const fact = w.facts[factId];
  if (fact?.about && fact.hostileTo === org.id) {
    for (const m of membersOf(w, org.id)) {
      if (m.id === fact.about) continue;
      const rel = ensureRel(m, fact.about);
      rel.suspicion = clamp(rel.suspicion + ((next - prev) / 100) * 10);
    }
  }
  return next - prev;
}

export function addTrace(w: World, actorId: Id, factId: Id): void {
  w.traces.push({
    actorId,
    factId,
    locationId: w.characters[actorId].location,
  });
}

/** Spread a fact through the whole population (rumor, notice, publication). */
export function announce(
  w: World,
  factId: Id,
  awareness: number,
  baseConfidence: number,
  source: BeliefSource,
  audience?: Id[]
): void {
  w.publicAwareness[factId] = round1(
    combine(w.publicAwareness[factId] ?? 0, awareness)
  );
  for (const c of Object.values(w.characters)) {
    if (audience && !audience.includes(c.id)) continue;
    const scaled = baseConfidence * (0.6 + (c.traits.credulity / 100) * 0.5);
    learn(w, c.id, factId, scaled, source);
  }
}

export function sanitize(w: World): void {
  for (const c of Object.values(w.characters)) {
    c.stress = round1(clamp(c.stress));
    c.alarm = round1(clamp(c.alarm));
    for (const r of Object.values(c.relationships)) {
      r.trust = round1(clamp(r.trust));
      r.suspicion = round1(clamp(r.suspicion));
    }
  }
  for (const o of Object.values(w.orgs)) {
    o.funds = round1(clamp(o.funds));
    o.influence = round1(clamp(o.influence));
    o.secrecy = round1(clamp(o.secrecy));
    o.scrutiny = round1(clamp(o.scrutiny));
    o.demand = round1(clamp(o.demand));
    for (const k of Object.keys(o.leverage)) {
      o.leverage[k] = round1(clamp(o.leverage[k]));
    }
  }
  for (const k of Object.keys(w.publicAwareness)) {
    w.publicAwareness[k] = round1(clamp(w.publicAwareness[k]));
  }
  for (const l of Object.values(w.locations)) {
    l.security = round1(clamp(l.security, 0, 95));
  }
}
