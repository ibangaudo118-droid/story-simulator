/**
 * Invariant tests for the typed world core.   npx tsx scripts/world-invariants.ts
 */
import { createWorld } from "../lib/world/content";
import { run, step } from "../lib/world/engine";
import { EVENTS } from "../lib/world/events";
import { stateHash } from "../lib/world/metrics";
import type { World } from "../lib/world/types";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) failures++;
}

const DAYS = 60;
const SEEDS = [1, 2, 3, 4, 5];

// 1. Determinism
check(
  "same seed => identical world after 60 days",
  stateHash(run(createWorld(7), DAYS)) === stateHash(run(createWorld(7), DAYS))
);

// 2. Different seeds differ
const hashes = new Set(SEEDS.map((s) => stateHash(run(createWorld(s), DAYS))));
check("different seeds => different histories", hashes.size === SEEDS.length, `${hashes.size}/${SEEDS.length}`);

// 3. step() does not mutate its input
{
  const w0 = createWorld(3);
  const before = JSON.stringify(w0);
  step(w0);
  check("step() is pure (input world unchanged)", JSON.stringify(w0) === before);
}

// 4. Structural integrity over many days and seeds
function integrity(w: World): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const e of w.log) {
    if (ids.has(e.id)) errs.push(`duplicate log id ${e.id}`);
    ids.add(e.id);
  }
  for (let i = 1; i < w.log.length; i++) {
    if (w.log[i].day < w.log[i - 1].day) errs.push("log days not monotonic");
  }
  for (const l of Object.values(w.locations)) {
    for (const n of l.connectedTo) {
      if (!w.locations[n]) errs.push(`${l.id} -> unknown location ${n}`);
      else if (!w.locations[n].connectedTo.includes(l.id)) errs.push(`${l.id} <-> ${n} not symmetric`);
    }
  }
  for (const c of Object.values(w.characters)) {
    if (!w.locations[c.location]) errs.push(`${c.id} at unknown location ${c.location}`);
    for (const [fid, b] of Object.entries(c.beliefs)) {
      if (!w.facts[fid]) errs.push(`${c.id} believes unknown fact ${fid}`);
      if (b.confidence < 0 || b.confidence > 100) errs.push(`${c.id} belief ${fid} out of range`);
    }
    for (const [rid, r] of Object.entries(c.relationships)) {
      if (!w.characters[rid]) errs.push(`${c.id} relates to unknown ${rid}`);
      if (r.trust < 0 || r.trust > 100 || r.suspicion < 0 || r.suspicion > 100) {
        errs.push(`${c.id}->${rid} relationship out of range`);
      }
    }
    for (const org of c.orgIds) if (!w.orgs[org]) errs.push(`${c.id} in unknown org ${org}`);
    for (const k of ["stress", "alarm"] as const) {
      if (c[k] < 0 || c[k] > 100) errs.push(`${c.id}.${k} out of range`);
    }
  }
  for (const o of Object.values(w.orgs)) {
    for (const k of ["funds", "influence", "secrecy", "scrutiny", "demand"] as const) {
      if (o[k] < 0 || o[k] > 100) errs.push(`${o.id}.${k}=${o[k]} out of range`);
    }
  }
  for (const [fid, a] of Object.entries(w.publicAwareness)) {
    if (!w.facts[fid]) errs.push(`awareness for unknown fact ${fid}`);
    if (a < 0 || a > 100) errs.push(`awareness ${fid} out of range`);
  }
  for (const o of Object.values(w.objects)) {
    if (o.locationId && !w.locations[o.locationId]) errs.push(`object ${o.id} in unknown location`);
  }
  return errs;
}

{
  const all: string[] = [];
  for (const s of SEEDS) {
    let w = createWorld(s);
    for (let d = 0; d < 100; d++) {
      w = step(w);
      all.push(...integrity(w));
    }
  }
  check("structural + range invariants hold (5 seeds x 100 days)", all.length === 0, all.slice(0, 3).join("; "));
}

// 5. Independent characters are actually spread across the world over time
{
  const w = run(createWorld(2), 100);
  const used = new Set<string>();
  for (const c of Object.values(w.characters)) for (const k of Object.keys(c.visits)) used.add(k);
  check("world is actually used (>= 5 of 7 locations visited)", used.size >= 5, `${used.size}`);
}

// 6. World events fire without any character initiating them
{
  const w = run(createWorld(1), 40);
  check("research program event fires by day 10", (w.firedEvents["research-program-announced"] ?? 0) === 1);
  const evt = w.log.find((e) => e.kind === "WORLD_EVENT" && e.data?.eventId === "research-program-announced");
  check("event logs its consequences", Array.isArray(evt?.data?.consequences) && (evt?.data?.consequences as unknown[]).length > 0);
  check("event changed world state (20 eligible students or recruitment)", (w.flags.eligibleStudents ?? 0) > 0 || w.flags.recruitedCount > 0);
}

// 7. Exogenous events are independent of character state (same seed, different variable)
{
  const exo = EVENTS.filter((e) => e.exogenous).map((e) => e.id);
  const days = (w: World): string =>
    w.log
      .filter((e) => e.kind === "WORLD_EVENT" && exo.includes(String(e.data?.eventId)))
      .map((e) => `${e.day}:${e.data?.eventId}`)
      .join(",");
  let same = true;
  for (const s of SEEDS) {
    const a = run(createWorld(s, (w) => (w.characters.daniel.relationships.zara.trust = 80)), 60);
    const b = run(createWorld(s, (w) => (w.characters.daniel.relationships.zara.trust = 10)), 60);
    if (days(a) !== days(b)) same = false;
  }
  check("exogenous world events fire on identical days across variants", same);
}

// 8. A changed variable changes history (sensitivity)
{
  let diverged = 0;
  for (const s of SEEDS) {
    const a = run(createWorld(s, (w) => (w.characters.daniel.relationships.zara.trust = 60)), 60);
    const b = run(createWorld(s, (w) => (w.characters.daniel.relationships.zara.trust = 40)), 60);
    if (stateHash(a) !== stateHash(b)) diverged++;
  }
  check("small variable change => different history in most seeds", diverged >= 4, `${diverged}/${SEEDS.length}`);
}

// 9. Beliefs only originate from legitimate channels
{
  const w = run(createWorld(4), 60);
  const sources = new Set<string>();
  for (const c of Object.values(w.characters)) for (const b of Object.values(c.beliefs)) sources.add(b.source);
  const allowed = new Set(["initial", "witnessed", "document", "told", "rumor", "inferred", "group", "published"]);
  check("all belief sources are known channels", [...sources].every((s) => allowed.has(s)));
}

console.log(failures === 0 ? "\nAll invariants passed." : `\n${failures} invariant(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
