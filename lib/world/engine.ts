import { hashSeed, makeRng, type Rng } from "./rng";
import { runWorldEvents } from "./events";
import {
  addTrace,
  announce,
  clamp,
  combine,
  conf,
  ensureActivityFact,
  ensureRel,
  factIdsMatching,
  learn,
  log,
  matches,
  membersOf,
  poolConf,
  poolLearn,
  present,
  privacyOf,
  sanitize,
} from "./ops";
import type {
  ActionType,
  Character,
  Id,
  Organization,
  World,
  WorldObject,
} from "./types";

/* ------------------------------------------------------------------ */
/* Utility helpers                                                     */
/* ------------------------------------------------------------------ */

interface Cand {
  type: ActionType;
  util: number;
  to?: Id;
  target?: Id;
  objectId?: Id;
  factId?: Id;
}

const squash = (x: number, cap: number): number => cap * (1 - Math.exp(-x / 0.9));

const objectsAt = (w: World, locId: Id): WorldObject[] =>
  Object.values(w.objects).filter((o) => o.locationId === locId);

function goalGap(w: World, c: Character, wanted: string[]): number {
  if (wanted.length === 0) return 0.5;
  let total = 0;
  for (const p of wanted) {
    if (p.includes("*")) {
      const best = factIdsMatching(w, p).reduce(
        (m, id) => (w.facts[id].about === c.id ? m : Math.max(m, conf(c, id))),
        0
      );
      total += 1 - best / 100;
    } else {
      total += 1 - conf(c, p) / 100;
    }
  }
  return total / wanted.length;
}

/** How much `c` wants to learn fact `factId` right now (0..1). */
function desire(w: World, c: Character, factId: Id): number {
  const f = w.facts[factId];
  if (!f) return 0;
  const gap = 1 - conf(c, factId) / 100;
  let best = 0;
  for (const g of c.goals) {
    const explicit = g.wantedFacts.some((p) => matches(p, factId));
    const topical = f.topics.some((t) => g.topics.includes(t));
    const d = explicit ? 1 : topical ? 0.45 : 0;
    best = Math.max(best, (d * g.weight) / 100);
  }
  return best * gap;
}

/** Perceived chance of being caught at a location (0..1). */
function riskAt(w: World, c: Character, locId: Id): number {
  const loc = w.locations[locId];
  if (!loc.controlledBy || c.orgIds.includes(loc.controlledBy)) return 0;
  return clamp(loc.security * (0.6 + c.alarm / 100)) / 100;
}

function attract(w: World, c: Character, locId: Id): number {
  const loc = w.locations[locId];
  let s = 0;
  for (const g of c.goals) {
    const hit =
      g.affordances.filter((a) => loc.affordances.includes(a)).length /
      Math.max(1, g.affordances.length);
    s += hit * goalGap(w, c, g.wantedFacts) * g.weight * 0.35;
  }
  let info = 0;
  for (const o of objectsAt(w, locId)) {
    const readFactor = o.readBy.includes(c.id) ? 0.1 : 1;
    for (const f of o.factIds) {
      info += desire(w, c, f) * (o.confidenceOnRead / 100) * readFactor;
    }
  }
  s += squash(info, 55);
  for (const o of Object.values(w.characters)) {
    if (o.id === c.id || o.location !== locId) continue;
    const r = c.relationships[o.id];
    if (r) {
      s += (r.trust / 100) * (c.traits.loyalty / 100) * 8;
      if (r.suspicion >= 50) s += c.traits.curiosity * 0.08;
    }
    if (o.expertise.some((e) => c.goals.some((g) => g.topics.includes(e)))) s += 5;
    if (shareMission(c, o) && (r?.trust ?? 0) >= 35) s += 9;
  }
  s -= riskAt(w, c, locId) * (20 + 35 * (c.traits.caution / 100)) * (1 + c.alarm / 50);
  if (loc.controlledBy && c.orgIds.includes(loc.controlledBy)) s += 8;
  if (c.alarm > 40) s += (loc.privacy / 100) * (c.alarm - 40) * 0.3;
  return s;
}

function shareMission(c: Character, o: Character): boolean {
  return (
    !o.orgIds.includes("company") &&
    !c.orgIds.includes("company") &&
    c.goals.some((g) => g.topics.includes("harm")) &&
    o.goals.some((g) => g.topics.includes("harm"))
  );
}

const isStudent = (c: Character): boolean => c.role.toLowerCase().includes("student");

function isRecruitable(w: World, t: Character): boolean {
  return (w.flags.eligibleStudents ?? 0) > 0 && isStudent(t) && !t.orgIds.includes("company");
}

function canInviteToGroup(w: World, c: Character, t: Character): boolean {
  if (!c.orgIds.includes("investigation-group")) return false;
  if (t.orgIds.includes("investigation-group") || t.orgIds.includes("company")) return false;
  const cares = (x: Character) =>
    conf(x, "students.isolated") >= 50 || conf(x, "company.harms_students") >= 50;
  const r1 = c.relationships[t.id];
  const r2 = t.relationships[c.id];
  return !!r1 && !!r2 && r1.trust >= 50 && r2.trust >= 50 && cares(c) && cares(t);
}

function companyOrgOf(w: World, c: Character): Organization | undefined {
  const id = c.orgIds.find((o) => w.orgs[o]?.kind === "company");
  return id ? w.orgs[id] : undefined;
}

function reportables(w: World, c: Character, org: Organization) {
  const items: { factId: Id; gain: number; subject?: Id }[] = [];
  for (const b of Object.values(c.beliefs)) {
    const f = w.facts[b.factId];
    if (!f || f.hostileTo !== org.id || f.about === c.id) continue;
    const gain = combine(poolConf(org, b.factId), b.confidence * 0.9) - poolConf(org, b.factId);
    if (gain > 1) items.push({ factId: b.factId, gain, subject: f.about });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Decision: enumerate candidates, score, pick                         */
/* ------------------------------------------------------------------ */

export function candidates(w: World, c: Character): Cand[] {
  const out: Cand[] = [];
  const here = w.locations[c.location];
  const others = present(w, c);
  const gapAvg =
    c.goals.reduce((s, g) => s + goalGap(w, c, g.wantedFacts), 0) / Math.max(1, c.goals.length);

  // MOVE
  const base = attract(w, c, c.location);
  for (const n of here.connectedTo) {
    const ahead = w.locations[n].connectedTo
      .filter((m) => m !== c.location)
      .reduce((mx, m) => Math.max(mx, attract(w, c, m)), -Infinity);
    const value = attract(w, c, n) + (Number.isFinite(ahead) ? 0.5 * Math.max(0, ahead - base) : 0);
    out.push({
      type: "MOVE",
      to: n,
      util: value - base - 4 + Math.min(10, c.stayDays * 0.7),
    });
  }

  // SEARCH
  {
    let best: { o: WorldObject; v: number } | undefined;
    for (const o of objectsAt(w, c.location)) {
      const readFactor = o.readBy.includes(c.id) ? 0.1 : 1;
      let x = 0;
      for (const f of o.factIds) x += desire(w, c, f) * (o.confidenceOnRead / 100) * readFactor;
      const v = squash(x, 55);
      if (v > 1 && (!best || v > best.v)) best = { o, v };
    }
    if (best) {
      const risk = riskAt(w, c, c.location);
      out.push({
        type: "SEARCH",
        objectId: best.o.id,
        util: best.v - risk * (30 + 45 * (c.traits.caution / 100)) * (1 + c.alarm / 50),
      });
    }
  }

  // OBSERVE
  out.push({
    type: "OBSERVE",
    util:
      3 +
      c.traits.curiosity * 0.06 +
      (others.length > 0 ? 3 : 0) +
      (c.alarm > 30 ? (c.alarm - 30) * 0.2 : 0) +
      ((w.flags.eligibleStudents ?? 0) > 0 && here.affordances.includes("recruit") ? 4 : 0),
  });

  // TALK / CONFRONT
  for (const t of others) {
    const r = c.relationships[t.id] ?? { trust: 50, suspicion: 10 };
    const infoHit = c.goals.some((g) => g.topics.some((tp) => t.expertise.includes(tp)));
    const fresh = Math.min(1, (w.day - (c.lastTalkDay[t.id] ?? -99)) / 4);
    const util =
      (infoHit ? 14 * gapAvg * fresh : 0) +
      (r.trust / 100) * (c.traits.loyalty / 100) * 14 +
      (r.suspicion >= 40 ? 6 * fresh : 0) +
      (canInviteToGroup(w, c, t) ? 16 : 0) +
      (shareMission(c, t) && r.trust >= 35 ? 10 * fresh : 0) +
      (c.stress > 40 && r.trust >= 55 ? 6 : 0) +
      (c.capabilities.includes("recruit") && isRecruitable(w, t) ? 20 * fresh : 0) -
      3 -
      (r.trust < 25 ? 6 : 0);
    out.push({ type: "TALK", target: t.id, util });

    if (r.suspicion >= 45) {
      const cool = Math.min(1, (w.day - (c.lastTalkDay[t.id] ?? -99)) / 6) ** 2;
      out.push({
        type: "CONFRONT",
        target: t.id,
        util:
          cool *
            ((r.suspicion / 100) * 38 +
              c.traits.curiosity * 0.1 -
              (r.trust / 100) * (c.traits.loyalty / 100) * 22 -
              c.traits.caution * 0.12 -
              c.alarm * 0.08),
      });
    }
  }

  // REPORT
  {
    const org = companyOrgOf(w, c);
    if (org) {
      const items = reportables(w, c, org);
      const total = items.reduce((s, i) => s + i.gain, 0);
      if (total >= 8) {
        const top = items.reduce((a, b) => (b.gain > a.gain ? b : a));
        const tie = org.leverage[c.id] ?? 30;
        const trust = top.subject ? (c.relationships[top.subject]?.trust ?? 50) : 0;
        out.push({
          type: "REPORT",
          util:
            ((tie / 100) * 0.7 + (c.traits.ambition / 100) * 0.2) * 50 * Math.min(1, total / 40) -
            (trust / 100) * (c.traits.loyalty / 100) * 35 -
            2,
        });
      }
    }
  }

  // PUBLISH
  if (c.capabilities.includes("publish")) {
    const thr = 62 + c.traits.caution * 0.15;
    let best: { id: Id; util: number } | undefined;
    for (const b of Object.values(c.beliefs)) {
      const f = w.facts[b.factId];
      if (!f || !f.threatens || b.confidence < thr) continue;
      const awareness = w.publicAwareness[f.id] ?? 0;
      if (awareness >= 35) continue;
      if (w.day - (w.flags[`pub:${c.id}:${f.id}`] ?? -99) < 30) continue;
      if (w.day - (w.flags[`pubAny:${c.id}`] ?? -99) < 12) continue;
      if (b.corroboration < 2 && b.confidence < 90) continue;
      let u =
        ((b.confidence - thr) / (100 - thr)) * 30 +
        18 * (c.traits.courage / 100) +
        c.traits.ambition * 0.1 -
        c.alarm * 0.25 -
        (w.orgs[f.threatens]?.leverage[c.id] ?? 0) * 0.15;
      u *= 1 - awareness / 100;
      if (!best || u > best.util) best = { id: f.id, util: u };
    }
    if (best) out.push({ type: "PUBLISH", factId: best.id, util: best.util });
  }

  // LAY_LOW
  out.push({
    type: "LAY_LOW",
    util:
      c.alarm * 0.3 +
      c.stress * 0.12 +
      (poolConf(w.orgs.company, `activity:${c.id}:investigating`) >= 60 ? 8 : 0) -
      2,
  });

  return out;
}

/* ------------------------------------------------------------------ */
/* Action resolution                                                   */
/* ------------------------------------------------------------------ */

function nm(w: World, id: Id): string {
  return w.characters[id]?.name ?? id;
}

function willShare(w: World, from: Character, to: Character, factId: Id): boolean {
  const f = w.facts[factId];
  const r = ensureRel(from, to.id);
  if (from.secretFactIds.includes(factId)) return r.trust >= 70 && r.suspicion < 45;
  if (f.threatens && to.orgIds.includes(f.threatens)) {
    return r.trust >= 35 + from.traits.caution * 0.45 + 20;
  }
  if (f.threatens && r.suspicion >= 50 && r.trust < 55) return false;
  return true;
}

function exchange(w: World, from: Character, to: Character): { shared: number; withheld: number } {
  const ranked = Object.values(from.beliefs)
    .filter((b) => b.confidence >= 40 && conf(to, b.factId) < b.confidence - 10)
    .sort(
      (a, b) =>
        desire(w, to, b.factId) * 100 + b.confidence / 10 -
        (desire(w, to, a.factId) * 100 + a.confidence / 10)
    )
    .slice(0, 3);
  let shared = 0;
  let withheld = 0;
  for (const b of ranked) {
    const f = w.facts[b.factId];
    if (f.about === to.id) continue;
    if (willShare(w, from, to, b.factId)) {
      const trust = ensureRel(to, from.id).trust;
      const incoming = b.confidence * (0.35 + 0.65 * (trust / 100)) * (0.6 + 0.4 * (to.traits.credulity / 100));
      learn(w, to.id, b.factId, incoming, "told", from.id);
      shared++;
      if (f.threatens && to.orgIds.includes(f.threatens) && !from.orgIds.includes(f.threatens)) {
        const a = ensureActivityFact(w, from.id);
        learn(w, to.id, a, 60, "witnessed");
        log(w, {
          kind: "CONSEQUENCE",
          actorId: to.id,
          targetId: from.id,
          locationId: from.location,
          text: `${to.name} notes that ${from.name} is asking dangerous questions`,
        });
      }
    } else if (desire(w, to, b.factId) > 0.2 || f.secret) {
      withheld++;
    }
  }
  return { shared, withheld };
}

function resolveTalk(w: World, c: Character, t: Character, rng: Rng): void {
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    targetId: t.id,
    locationId: c.location,
    text: `${c.name} talks with ${t.name} at ${w.locations[c.location].name}`,
    data: { action: "TALK" },
  });
  c.lastTalkDay[t.id] = w.day;
  t.lastTalkDay[c.id] = w.day;
  const s1 = exchange(w, c, t);
  const s2 = exchange(w, t, c);
  const rCT = ensureRel(c, t.id);
  const rTC = ensureRel(t, c.id);
  if (s1.shared > 0 && s2.shared > 0) {
    rCT.trust += 3;
    rTC.trust += 3;
  } else if (s1.shared > 0 || s2.shared > 0) {
    rCT.trust += 1;
    rTC.trust += 1;
  }
  if (s2.withheld > 0 && rng.chance((c.traits.curiosity / 100) * 0.45)) {
    rCT.suspicion += 3;
    rCT.trust -= 1;
    log(w, {
      kind: "CONSEQUENCE",
      actorId: c.id,
      targetId: t.id,
      text: `${c.name} senses that ${t.name} is holding something back`,
    });
  }
  if (s1.withheld > 0 && rng.chance((t.traits.curiosity / 100) * 0.45)) {
    rTC.suspicion += 3;
    rTC.trust -= 1;
    log(w, {
      kind: "CONSEQUENCE",
      actorId: t.id,
      targetId: c.id,
      text: `${t.name} senses that ${c.name} is holding something back`,
    });
  }
  if (c.stress > 40 && rCT.trust >= 55) c.stress -= 3;

  if (canInviteToGroup(w, c, t) && rng.chance(0.5 * (t.traits.courage / 100 + 0.3))) {
    t.orgIds.push("investigation-group");
    log(w, {
      kind: "CONSEQUENCE",
      actorId: c.id,
      targetId: t.id,
      text: `${t.name} joins the Student Investigation Group`,
      data: { alliance: true },
    });
  }

  if (c.capabilities.includes("recruit") && isRecruitable(w, t)) {
    const r = ensureRel(t, c.id);
    let p = 0.12 + (t.traits.ambition / 100) * 0.2 - (r.suspicion / 100) * 0.3;
    if (conf(t, "company.harms_students") >= 50) p *= 0.3;
    if (t.goals.some((g) => g.topics.includes("harm"))) p *= 0.15;
    p = clamp(p, 0.01, 0.5);
    const eligible = w.flags.eligibleStudents;
    if (eligible > 0 && rng.chance(p)) {
      t.orgIds.push("company");
      w.orgs.company.leverage[t.id] = 25;
      w.flags.recruitedCount += 1;
      w.flags.eligibleStudents -= 1;
      t.stress += 5;
      log(w, {
        kind: "CONSEQUENCE",
        actorId: c.id,
        targetId: t.id,
        text: `${t.name} is recruited into the company's program`,
      });
    }
  }
}

function resolveConfront(w: World, c: Character, t: Character, rng: Rng): void {
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    targetId: t.id,
    locationId: c.location,
    text: `${c.name} confronts ${t.name} at ${w.locations[c.location].name}`,
    data: { action: "CONFRONT" },
  });
  // Without this, `cool` in candidates() never resets after a confrontation, and
  // deflection raises suspicion on both sides, so the same pair confronts every day.
  c.lastTalkDay[t.id] = w.day;
  t.lastTalkDay[c.id] = w.day;
  const rCT = ensureRel(c, t.id);
  const rTC = ensureRel(t, c.id);
  const company = w.orgs.company;

  if (t.orgIds.includes("company") && !c.orgIds.includes("company")) {
    learn(w, t.id, ensureActivityFact(w, c.id), 70, "witnessed");
  }
  if (c.orgIds.includes("company") && !t.orgIds.includes("company") && poolConf(company, `activity:${t.id}:investigating`) >= 40) {
    t.alarm += 10;
    log(w, {
      kind: "CONSEQUENCE",
      actorId: t.id,
      text: `${t.name} feels the company is closing in`,
    });
  }

  const tie = company.leverage[t.id] ?? 0;
  const pReveal = clamp(
    0.15 +
      0.5 * (rTC.trust / 100) +
      0.3 * (t.stress / 100) -
      0.3 * (t.traits.caution / 100) -
      0.3 * (tie / 100),
    0.02,
    0.9
  );
  const secrets = t.secretFactIds.filter((f) => conf(t, f) > 0);
  if (secrets.length > 0 && rng.chance(pReveal)) {
    for (const f of secrets) learn(w, c.id, f, conf(t, f) * 0.85, "told", t.id);
    rTC.trust += 4;
    t.stress -= 6;
    log(w, {
      kind: "CONSEQUENCE",
      actorId: t.id,
      targetId: c.id,
      text: `${t.name} breaks down and tells ${c.name} what they know`,
      data: { revealed: secrets },
    });
  } else {
    rTC.suspicion += 8;
    rTC.trust -= 5;
    rCT.suspicion += 4;
    log(w, {
      kind: "CONSEQUENCE",
      actorId: t.id,
      targetId: c.id,
      text: `${t.name} deflects ${c.name}'s questions`,
    });
  }
}

function resolveSearch(w: World, c: Character, objectId: Id, rng: Rng): void {
  const o = w.objects[objectId];
  const loc = w.locations[c.location];
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    locationId: c.location,
    text: `${c.name} searches the ${o.name} at ${loc.name}`,
    data: { action: "SEARCH", objectId },
  });
  const controlled = !!loc.controlledBy && !c.orgIds.includes(loc.controlledBy);
  let detected = false;
  if (controlled) {
    const suspicion = poolConf(w.orgs[loc.controlledBy as Id], `activity:${c.id}:investigating`);
    const p = (loc.security / 100) * 0.55 * (1 + suspicion / 200);
    detected = rng.chance(p);
  }
  if (detected) {
    const a = ensureActivityFact(w, c.id);
    poolLearn(w, w.orgs[loc.controlledBy as Id], a, 75, "witnessed");
    addTrace(w, c.id, a);
    c.alarm += 20;
    w.flags.companyBreach += 1;
    const exit = loc.connectedTo.find((id) => !w.locations[id].controlledBy);
    if (exit) c.location = exit;
    log(w, {
      kind: "CONSEQUENCE",
      actorId: c.id,
      locationId: c.location,
      text: `${c.name} is spotted near the ${o.name} and flees`,
    });
    return;
  }
  o.readBy.push(c.id);
  for (const f of o.factIds) {
    learn(w, c.id, f, o.confidenceOnRead, "document");
    log(w, {
      kind: "CONSEQUENCE",
      actorId: c.id,
      locationId: c.location,
      text: `${c.name} learns from the ${o.name}: ${w.facts[f].text}`,
      data: { factId: f },
    });
  }
}

function resolveObserve(w: World, c: Character, rng: Rng): void {
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    locationId: c.location,
    text: `${c.name} watches the room at ${w.locations[c.location].name}`,
    data: { action: "OBSERVE" },
  });
  const loc = w.locations[c.location];
  if ((w.flags.eligibleStudents ?? 0) > 0 && loc.affordances.includes("recruit")) {
    learn(w, c.id, "company.research_program", 70, "witnessed");
  }
  for (const d of present(w, c)) {
    if (d.stress > 40 && d.secretFactIds.length > 0 && rng.chance((c.traits.curiosity / 100) * 0.35)) {
      ensureRel(c, d.id).suspicion += 3;
      log(w, {
        kind: "CONSEQUENCE",
        actorId: c.id,
        targetId: d.id,
        text: `${c.name} notices ${d.name} is on edge`,
      });
    }
  }
}

function resolveReport(w: World, c: Character): void {
  const org = companyOrgOf(w, c) as Organization;
  const items = reportables(w, c, org);
  const reported: Id[] = [];
  for (const i of items) {
    poolLearn(w, org, i.factId, conf(c, i.factId) * 0.9, "told", c.id);
    reported.push(i.factId);
  }
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    locationId: c.location,
    text: `${c.name} passes information to the company`,
    data: { action: "REPORT", reported },
  });
  const guilty = items.some(
    (i) => i.subject && (c.relationships[i.subject]?.trust ?? 0) > 50
  );
  if (guilty) c.stress += 6;
  const tell = `${c.id}.is_informant`;
  if (w.facts[tell]) {
    const rng = makeRng(w.seed, w.day, "report-notice", c.id);
    for (const o of present(w, c)) {
      if ((o.relationships[c.id]?.suspicion ?? 0) >= 45 && rng.chance(0.2)) {
        learn(w, o.id, tell, 30, "inferred");
      }
    }
  }
}

function resolvePublish(w: World, c: Character, factId: Id): void {
  const f = w.facts[factId];
  const b = c.beliefs[factId];
  const journalist = c.role.toLowerCase().includes("journalist");
  const gain = 25 + 0.3 * b.confidence + (journalist ? 10 : 0);
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    locationId: c.location,
    text: `${c.name} publishes: ${f.text}`,
    data: { action: "PUBLISH", factId, truth: f.truth },
  });
  announce(w, factId, gain, gain, "published");
  w.flags[`pub:${c.id}:${factId}`] = w.day;
  w.flags[`pubAny:${c.id}`] = w.day;
  c.alarm += 15;
  c.stress += 5;
  if (f.threatens && w.orgs[f.threatens]) {
    const org = w.orgs[f.threatens];
    org.scrutiny += gain * 0.4;
    org.secrecy -= gain * 0.15;
    if (org.kind === "company") {
      poolLearn(w, org, ensureActivityFact(w, c.id), 90, "witnessed");
    }
  }
  log(w, {
    kind: "CONSEQUENCE",
    actorId: c.id,
    text: `The story spreads across campus`,
    data: { factId },
  });
}

function resolveLayLow(w: World, c: Character): void {
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    locationId: c.location,
    text: `${c.name} keeps a low profile`,
    data: { action: "LAY_LOW" },
  });
  let loc = w.locations[c.location];
  if (loc.controlledBy && !c.orgIds.includes(loc.controlledBy)) {
    const exit = loc.connectedTo.find((id) => !w.locations[id].controlledBy);
    if (exit) {
      c.location = exit;
      c.stayDays = 0;
      loc = w.locations[exit];
    }
  } else if (loc.privacy < 50) {
    const refuge = loc.connectedTo
      .filter((id) => !w.locations[id].controlledBy)
      .sort((a, b) => w.locations[b].privacy - w.locations[a].privacy)[0];
    if (refuge && w.locations[refuge].privacy > loc.privacy) {
      c.location = refuge;
      c.stayDays = 0;
      loc = w.locations[refuge];
    }
  }
  c.alarm -= 12 + (loc.privacy > 70 ? 4 : 0);
  c.stress -= 6;
}

function resolveMove(w: World, c: Character, to: Id): void {
  const from = c.location;
  c.location = to;
  log(w, {
    kind: "ACTION",
    actorId: c.id,
    locationId: to,
    text: `${c.name} moves from ${w.locations[from].name} to ${w.locations[to].name}`,
    data: { action: "MOVE", from, to },
  });
}

function act(w: World, id: Id): void {
  const c = w.characters[id];
  const rng = makeRng(w.seed, w.day, "act", id);
  const cands = candidates(w, c);
  let best = cands[0];
  let bestScore = -Infinity;
  for (const cand of cands) {
    const s = cand.util + rng.noise(3);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  const sub = makeRng(w.seed, w.day, "resolve", id);
  switch (best.type) {
    case "MOVE":
      resolveMove(w, c, best.to as Id);
      break;
    case "SEARCH":
      resolveSearch(w, c, best.objectId as Id, sub);
      break;
    case "OBSERVE":
      resolveObserve(w, c, sub);
      break;
    case "TALK":
      resolveTalk(w, c, w.characters[best.target as Id], sub);
      break;
    case "CONFRONT":
      resolveConfront(w, c, w.characters[best.target as Id], sub);
      break;
    case "REPORT":
      resolveReport(w, c);
      break;
    case "PUBLISH":
      resolvePublish(w, c, best.factId as Id);
      break;
    case "LAY_LOW":
      resolveLayLow(w, c);
      break;
  }
  c.lastActions.push(best.type);
  if (c.lastActions.length > 6) c.lastActions.shift();
}

/* ------------------------------------------------------------------ */
/* Organizations                                                       */
/* ------------------------------------------------------------------ */

interface OrgCand {
  name: string;
  value: number;
  apply: () => string;
}

function suspectsOf(w: World, org: Organization): { id: Id; conf: number }[] {
  const out: { id: Id; conf: number }[] = [];
  for (const fid of Object.keys(org.pool)) {
    if (!fid.startsWith("activity:") || !fid.endsWith(":investigating")) continue;
    const who = w.facts[fid]?.about;
    if (!who || !w.characters[who] || w.characters[who].orgIds.includes(org.id)) continue;
    out.push({ id: who, conf: org.pool[fid].confidence });
  }
  return out.sort((a, b) => b.conf - a.conf);
}

function threatAwareness(w: World, orgId: Id): number {
  let max = 0;
  for (const f of Object.values(w.facts)) {
    if (f.threatens === orgId) max = Math.max(max, w.publicAwareness[f.id] ?? 0);
  }
  return max;
}

function softenBeliefs(w: World, orgId: Id, strength: number): void {
  for (const c of Object.values(w.characters)) {
    for (const b of Object.values(c.beliefs)) {
      const f = w.facts[b.factId];
      if (!f || f.threatens !== orgId || c.orgIds.includes(orgId)) continue;
      const sticky = b.source === "witnessed" || b.source === "document" ? 0.25 : 1;
      b.confidence = Math.max(0, Math.round((b.confidence - strength * sticky * (1 - c.traits.courage / 150)) * 10) / 10);
    }
  }
}

function companyAct(w: World, org: Organization): void {
  const suspects = suspectsOf(w, org);
  const top = suspects[0];
  const awareness = threatAwareness(w, org.id);
  const cands: OrgCand[] = [];

  cands.push({
    name: "RECRUIT",
    value: (w.flags.eligibleStudents ?? 0) > 0 && org.funds >= 5 ? 34 - org.scrutiny * 0.35 : -99,
    apply: () => {
      const rng = makeRng(w.seed, w.day, "org-recruit");
      const n = Math.min(w.flags.eligibleStudents, 1 + rng.int(3));
      w.flags.recruitedCount += n;
      w.flags.eligibleStudents -= n;
      org.funds -= n * 1.5;
      org.influence += 0.5;
      return `The company recruits ${n} more student${n > 1 ? "s" : ""}`;
    },
  });

  if (top) {
    cands.push({
      name: "SURVEIL",
      value: (top.conf * 0.55 * (100 - top.conf)) / 60,
      apply: () => {
        poolLearn(w, org, `activity:${top.id}:investigating`, 18, "witnessed");
        const rng = makeRng(w.seed, w.day, "org-surveil");
        if (rng.chance(0.12)) w.characters[top.id].alarm += 12;
        return `The company watches ${nm(w, top.id)}`;
      },
    });
    cands.push({
      name: "PRESSURE",
      value:
        top.conf >= 55
          ? ((top.conf - 45) * 0.8 - org.scrutiny * 0.25) *
            (1 - w.characters[top.id].alarm / 100)
          : -99,
      apply: () => {
        const t = w.characters[top.id];
        t.alarm += 18;
        t.stress += 8;
        return `The company leans on ${t.name}`;
      },
    });
    cands.push({
      name: "DISCREDIT",
      value:
        top.conf >= 70 && w.day - (w.flags[`smear:${top.id}`] ?? -99) >= 10
          ? (top.conf - 60) * 0.9 - org.scrutiny * 0.2
          : -99,
      apply: () => {
        const t = w.characters[top.id];
        for (const o of Object.values(w.characters)) {
          if (o.id === t.id) continue;
          const r = ensureRel(o, t.id);
          const delta = 6 * (0.5 + o.traits.credulity / 100) * (org.influence / 60) * (r.trust / 100);
          r.trust -= delta;
          r.suspicion += delta / 2;
        }
        w.flags[`smear:${t.id}`] = w.day;
        t.stress += 5;
        org.funds -= 4;
        return `The company whispers against ${t.name}`;
      },
    });
  }

  cands.push({
    name: "HOLD_THE_LINE",
    value: top && top.conf >= 55 ? -99 : 14,
    apply: () => {
      const tied = Object.keys(org.leverage)
        .filter((id) => w.characters[id])
        .sort((a, b) => org.leverage[a] - org.leverage[b])[0];
      if (!tied) return "The company runs its daily business";
      org.leverage[tied] += 6;
      w.characters[tied].alarm += 10;
      w.characters[tied].stress += 6;
      return `The company reminds ${nm(w, tied)} of their obligations`;
    },
  });

  cands.push({
    name: "PR",
    value: org.scrutiny * 0.6 + awareness * 0.3 - 8,
    apply: () => {
      org.scrutiny -= 10;
      org.funds -= 6;
      for (const f of Object.values(w.facts)) {
        if (f.threatens === org.id && w.publicAwareness[f.id]) {
          w.publicAwareness[f.id] -= 4;
        }
      }
      return "The company launches a charm offensive";
    },
  });

  cands.push({
    name: "SUPPRESS",
    value: awareness >= 25 ? awareness * 0.55 : -99,
    apply: () => {
      softenBeliefs(w, org.id, org.influence * 0.18);
      for (const f of Object.values(w.facts)) {
        if (f.threatens === org.id && w.publicAwareness[f.id]) {
          w.publicAwareness[f.id] -= 6;
        }
      }
      org.funds -= 5;
      org.influence -= 1;
      org.scrutiny += org.scrutiny > 50 ? 6 : -2;
      return "The company works to bury the story";
    },
  });

  cands.push({
    name: "LOCKDOWN",
    value: w.flags.companyBreach > 0 ? 28 : -99,
    apply: () => {
      for (const l of Object.values(w.locations)) {
        if (l.controlledBy === org.id) l.security += 8;
      }
      w.flags.companyBreach = 0;
      org.funds -= 3;
      return "The company tightens security after a breach";
    },
  });

  cands.push({ name: "IDLE", value: 10, apply: () => "The company carries on quietly" });

  const rng = makeRng(w.seed, w.day, "org", org.id);
  let best = cands[0];
  let bestScore = -Infinity;
  for (const cand of cands) {
    const s = cand.value + rng.noise(2);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  const text = best.apply();
  if (best.name !== "IDLE") {
    log(w, { kind: "ORG_ACTION", text, data: { orgId: org.id, action: best.name } });
  }
}

function universityAct(w: World, org: Organization): void {
  const company = w.orgs.company;
  const awareness = threatAwareness(w, "company");
  const dependence = w.flags.universityDependence ?? 50;
  const defend = awareness * 0.45 + (awareness > 0 ? dependence * 0.3 : 0) - 5;
  const review =
    company.scrutiny * 0.5 + w.orgs["student-association"].demand * 0.4 - dependence * 0.35;
  const reviewOpen = (w.flags.reviewOpen ?? -1) >= 0;
  const rng = makeRng(w.seed, w.day, "org", org.id);
  const d = defend + rng.noise(2);
  const r = (reviewOpen ? -99 : review) + rng.noise(2);
  if (Math.max(d, r) < 8) return;
  if (r > d) {
    w.flags.reviewOpen = w.day;
    company.scrutiny += 5;
    company.secrecy -= 6;
    w.orgs["student-association"].demand -= 8;
    log(w, { kind: "ORG_ACTION", text: "The university opens a review of the company partnership", data: { orgId: org.id, action: "REVIEW" } });
  } else {
    company.scrutiny -= 3;
    for (const m of membersOf(w, org.id)) m.alarm += 8;
    for (const f of Object.values(w.facts)) {
      if (f.threatens === "company" && w.publicAwareness[f.id]) w.publicAwareness[f.id] -= 3;
    }
    log(w, { kind: "ORG_ACTION", text: "The university defends its partnership", data: { orgId: org.id, action: "DEFEND" } });
  }
}

function associationAct(w: World, org: Organization): void {
  const awareness = threatAwareness(w, "company");
  const value = awareness * 0.5 + (w.flags.recruitedCount ?? 0) * 0.8;
  if (value < 10) return;
  org.demand += 6;
  w.orgs.company.scrutiny += 2;
  log(w, { kind: "ORG_ACTION", text: "The Student Association presses for answers", data: { orgId: org.id, action: "ASK" } });
}

function groupSync(w: World): void {
  const members = membersOf(w, "investigation-group");
  if (members.length < 2) return;
  for (const a of members) {
    for (const b of members) {
      if (a.id === b.id) continue;
      const trust = ensureRel(b, a.id).trust;
      for (const belief of Object.values(a.beliefs)) {
        if (belief.confidence < 45) continue;
        learn(w, b.id, belief.factId, belief.confidence * 0.55 * Math.min(1, trust / 100 + 0.3), "group", a.id);
      }
      ensureRel(b, a.id).trust += 0.5;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Day loop                                                            */
/* ------------------------------------------------------------------ */

function endOfDay(w: World): void {
  w.traces.forEach((trace, idx) => {
    const actor = w.characters[trace.actorId];
    const privacy = privacyOf(w, trace.locationId);
    for (const c of Object.values(w.characters)) {
      if (c.id === actor.id || c.location !== trace.locationId) continue;
      const rng = makeRng(w.seed, w.day, "perceive", c.id, idx);
      const susp = c.relationships[actor.id]?.suspicion ?? 0;
      const p =
        (1 - privacy / 100) *
        (c.lastActions[c.lastActions.length - 1] === "OBSERVE" ? 0.65 : 0.2) *
        (0.6 + (c.traits.curiosity / 100) * 0.6) *
        (susp >= 40 ? 1.3 : 1);
      if (rng.chance(p)) learn(w, c.id, trace.factId, 60, "witnessed");
    }
  });
  w.traces = [];

  const exam = w.day <= (w.flags.examWeekUntil ?? -1);
  for (const c of Object.values(w.characters)) {
    c.alarm -= 6;
    c.stress -= 2;
    if (exam && isStudent(c)) c.stress += 3;
    for (const r of Object.values(c.relationships)) {
      r.suspicion = Math.max(0, r.suspicion - 0.3);
    }
    c.visits[c.location] = (c.visits[c.location] ?? 0) + 1;
    c.stayDays = c.lastActions[c.lastActions.length - 1] === "MOVE" ? 0 : c.stayDays + 1;
  }
  for (const o of Object.values(w.orgs)) {
    o.scrutiny -= 0.4;
    o.funds += 1;
    o.secrecy += 0.25;
    for (const [fid, b] of Object.entries(o.pool)) {
      if (fid.startsWith("activity:")) b.confidence = Math.max(0, Math.round((b.confidence - 1.2) * 10) / 10);
    }
  }
  sanitize(w);
}

export function step(prev: World): World {
  const w: World = structuredClone(prev);
  runWorldEvents(w);
  groupSync(w);

  const order = Object.keys(w.characters).sort(
    (a, b) => hashSeed(w.seed, w.day, "order", a) - hashSeed(w.seed, w.day, "order", b)
  );
  for (const id of order) act(w, id);

  for (const org of Object.values(w.orgs)) {
    if (org.kind === "company") companyAct(w, org);
    else if (org.kind === "university") universityAct(w, org);
    else if (org.kind === "association") associationAct(w, org);
  }

  endOfDay(w);
  w.day += 1;
  return w;
}

export function run(w: World, days: number): World {
  let cur = w;
  for (let i = 0; i < days; i++) cur = step(cur);
  return cur;
}
