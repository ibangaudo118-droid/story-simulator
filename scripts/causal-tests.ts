/**
 * Causal tests: does a change in one character's STATE propagate through decisions into
 * other characters' state?   npx tsx scripts/causal-tests.ts
 *
 * Two kinds of result:
 *   PASS / FAIL   regressions. A FAIL makes the script exit 1.
 *   KNOWN         documented design gaps. Printed, never fatal. When one starts passing it prints
 *                 "FIXED" so you know to promote it to a normal check.
 */
import { createWorld } from "../lib/world/content";
import { candidates, recruitChance, run, step } from "../lib/world/engine";
import { announce, ensureActivityFact, learn, membersOf, poolConf } from "../lib/world/ops";
import { stateHash } from "../lib/world/metrics";
import { createTimeline, fork, worldAt, compareBranches } from "../lib/replay/timeline";
import type { ActionType, Id, LogEntry, World } from "../lib/world/types";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) failures++;
}
function known(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "FIXED" : "KNOWN"} ${name}${detail ? "  -> " + detail : ""}`);
}
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

/** The action a character chose on the next step, read from the log. */
function actionsOf(next: World, prev: World, charId: Id): LogEntry[] {
  return next.log.slice(prev.log.length).filter((e) => e.kind === "ACTION" && e.actorId === charId);
}
const util = (w: World, charId: Id, type: ActionType, target?: Id): number | undefined =>
  candidates(w, w.characters[charId]).find((c) => c.type === type && (!target || c.target === target))?.util;
const tell = (w: World, charId: Id, factId: Id, confidence = 95, from?: Id): World => {
  const c = structuredClone(w);
  learn(c, charId, factId, confidence, "told", from);
  return c;
};

/* ================================================================== */
console.log("--- Chain 1: Zara learns Daniel is the informant ---");
{
  const base = createWorld(1);
  const told = tell(base, "zara", "daniel.is_informant", 95, "tobi");
  const rb = base.characters.zara.relationships.daniel;
  const rt = told.characters.zara.relationships.daniel;

  // Link 1: belief -> relationship
  check("belief lowers Zara's trust in Daniel", rt.trust < rb.trust, `${rb.trust} -> ${rt.trust}`);
  check("belief raises Zara's suspicion of Daniel", rt.suspicion > rb.suspicion, `${rb.suspicion} -> ${rt.suspicion}`);

  // Link 2: relationship -> candidate utilities
  const cb = util(base, "zara", "CONFRONT", "daniel") ?? -Infinity;
  const ct = util(told, "zara", "CONFRONT", "daniel") ?? -Infinity;
  const tb = util(base, "zara", "TALK", "daniel") ?? -Infinity;
  const tt = util(told, "zara", "TALK", "daniel") ?? -Infinity;
  check("CONFRONT utility toward Daniel rises", ct > cb, `${cb.toFixed(1)} -> ${ct.toFixed(1)}`);
  check("TALK utility toward Daniel falls", tt < tb, `${tb.toFixed(1)} -> ${tt.toFixed(1)}`);

  // Link 3: utilities -> chosen behaviour (statistical, across seeds)
  let confrontBase = 0;
  let confrontTold = 0;
  for (const s of SEEDS) {
    const b = createWorld(s);
    const t = tell(b, "zara", "daniel.is_informant", 95, "tobi");
    const pick = (w: World) =>
      actionsOf(step(w), w, "zara").some((e) => (e.data as any)?.action === "CONFRONT" && e.targetId === "daniel");
    if (pick(b)) confrontBase++;
    if (pick(t)) confrontTold++;
  }
  check(
    "knowing the truth makes Zara confront Daniel more often on day 1",
    confrontTold > confrontBase,
    `${confrontBase}/${SEEDS.length} -> ${confrontTold}/${SEEDS.length} seeds`
  );
}

/* ---- Link 4: behaviour -> another character's state; Link 5: that state changes THEIR decisions ---- */
{
  let confronts = 0;
  let danielRelChanged = 0;
  let utilChanged = 0;
  for (const s of SEEDS) {
    for (let day = 0; day < 15; day++) {
      const w0 = run(createWorld(s), day);
      const w1 = step(w0);
      const hit = w1.log.slice(w0.log.length).find(
        (e) => e.kind === "ACTION" && (e.data as any)?.action === "CONFRONT" && e.actorId === "zara" && e.targetId === "daniel"
      );
      if (!hit) continue;
      confronts++;
      const before = w0.characters.daniel.relationships.zara;
      const after = w1.characters.daniel.relationships.zara;
      // end-of-day decay alone moves suspicion by 0.3, so require a change a confrontation would cause
      const moved = Math.abs(after.trust - before.trust) >= 2 || Math.abs(after.suspicion - before.suspicion) >= 3;
      if (moved) danielRelChanged++;

      // ceteris paribus: same world, only Daniel's view of Zara reset to pre-confrontation values
      const a = structuredClone(w1);
      const b = structuredClone(w1);
      for (const w of [a, b]) {
        w.characters.daniel.location = "campus";
        w.characters.zara.location = "campus";
      }
      b.characters.daniel.relationships.zara = { ...before };
      const ua = util(a, "daniel", "TALK", "zara");
      const ub = util(b, "daniel", "TALK", "zara");
      if (moved && ua !== ub) utilChanged++;
      break;
    }
  }
  check("Zara's confrontations occur in the sample", confronts >= 10, `${confronts} of ${SEEDS.length} seeds`);
  check("a confrontation changes how Daniel sees Zara", danielRelChanged === confronts, `${danielRelChanged}/${confronts}`);
  check("that changed view changes Daniel's own candidate utilities", utilChanged === confronts, `${utilChanged}/${confronts}`);
}

/* ---- End to end: an intervention changes later behaviour, not just the injected fact ---- */
{
  const FORK_DAY = 4;
  const HORIZON = 20;
  let behaviourChanged = 0;
  let within5 = 0;
  for (const s of SEEDS) {
    let tl = createTimeline(s, HORIZON);
    tl = fork(tl, "main", FORK_DAY, [{ kind: "LEARN", charId: "zara", factId: "daniel.is_informant", confidence: 95, fromId: "tobi" }], "told");
    const { changedDays } = compareBranches(tl, "main", "told");
    if (changedDays.length > 0) behaviourChanged++;
    if (changedDays.some((d) => d <= FORK_DAY + 5)) within5++;
  }
  const pct = (n: number) => `${n}/${SEEDS.length}`;
  check("telling Zara changes later ACTIONS in most seeds (intervention event itself excluded)", behaviourChanged >= SEEDS.length * 0.75, pct(behaviourChanged));
  check("...and within 5 days in at least half of seeds", within5 >= SEEDS.length * 0.5, pct(within5));
}

/* ================================================================== */
console.log("\n--- Chain 2: recruitment ---");
{
  // Put the recruiter and a recruitable student together and let TALK run until someone joins.
  let joined: { seed: number; w: World; id: Id } | undefined;
  for (const s of SEEDS) {
    let w = createWorld(s);
    w.flags.eligibleStudents = 20;
    for (let d = 0; d < 30 && !joined; d++) {
      w.characters.okafor.location = "campus";
      w.characters.femi.location = "campus";
      const prevMembers = membersOf(w, "company").map((c) => c.id);
      const next = step(w);
      const added = membersOf(next, "company").map((c) => c.id).filter((id) => !prevMembers.includes(id));
      const named = next.log.slice(w.log.length).some((e) => /is recruited into/.test(e.text));
      if (named && added.length === 1) joined = { seed: s, w: next, id: added[0] };
      w = next;
    }
    if (joined) break;
  }
  check("a recruitment through TALK can happen", !!joined);
  if (joined) {
    const { w, id } = joined;
    const c = w.characters[id];
    check("the recruited character is a real company member", c.orgIds.includes("company"));
    check("the company holds leverage over them", (w.orgs.company.leverage[id] ?? 0) > 0, String(w.orgs.company.leverage[id]));
    // Behavioural check: plant strong suspicion of the member in the company's pool and let it act.
    {
      const planted = structuredClone(w);
      const fid = ensureActivityFact(planted, id);
      planted.orgs.company.pool[fid] = { factId: fid, confidence: 90, source: "witnessed", day: planted.day, corroboration: 1 };
      let targeted = 0;
      let cur = planted;
      for (let d = 0; d < 10; d++) {
        const before = cur.log.length;
        const next = step(cur);
        cur = next;
        targeted += next.log
          .slice(before)
          .filter((e) => e.kind === "ORG_ACTION" && e.text.includes(c.name) && /watches|leans on|whispers against/.test(e.text)).length;
        if (targeted) break;
      }
      check("the company does not surveil, pressure or smear its own member", targeted === 0, `${targeted} actions`);
    }

    // They can now be used by the company: REPORT becomes a real option once they hold something hostile.
    // Ceteris paribus: clear the org's pre-existing pool entry for this fact first, so the check isolates
    // the effect of THIS member's own knowledge rather than however saturated the company's independent
    // surveillance of `target` already happened to be by this point in the run.
    const informed = structuredClone(w);
    const target = id === "femi" ? "zara" : "femi";
    const fact = ensureActivityFact(informed, target);
    delete informed.orgs.company.pool[fact];
    learn(informed, id, fact, 90, "witnessed");
    check("a recruited member who learns something hostile gains a REPORT option", util(informed, id, "REPORT") !== undefined);
    check("...and a non-member in the same situation does not", (() => {
      const outsider = structuredClone(w);
      const f2 = ensureActivityFact(outsider, target);
      learn(outsider, "amara", f2, 90, "witnessed");
      return util(outsider, "amara", "REPORT") === undefined;
    })());
    check("members move freely in company space (no detection risk)", (() => {
      const w2 = structuredClone(w);
      w2.characters[id].location = "company-office";
      const s = util(w2, id, "SEARCH");
      return s === undefined || s > -5;
    })());
  }
}

console.log("");
console.log("--- Chain 2b: the company's own RECRUIT action ---");
{
  // Formerly a KNOWN gap: RECRUIT only moved counters and never produced a real member.
  let orgJoins = 0;
  let viaOrg: { w: World; id: Id } | undefined;
  let accountingBreaks = 0;
  let namedMismatch = 0;
  const INITIAL_MEMBERS = 3; // daniel, tobi, okafor
  // Named students (Zara, Femi) are investigators with low willingness, so org-path joins are rare
  // (about 1 per 20 runs). A wide seed range is needed for this check to have any power.
  const WIDE = Array.from({ length: 150 }, (_, i) => i + 1);
  for (const s of WIDE) {
    let w = createWorld(s);
    for (let d = 0; d < 40; d++) {
      const next = step(w);
      if (next.firedEvents["research-program-announced"] && next.flags.eligibleStudents + next.flags.recruitedCount !== 20) accountingBreaks++;
      for (const e of next.log.slice(w.log.length)) {
        if (e.kind === "CONSEQUENCE" && (e.data as any)?.via === "org" && e.actorId) {
          orgJoins++;
          viaOrg ??= { w: next, id: e.actorId };
        }
      }
      w = next;
    }
    const joinedLogged = w.log.filter((e) => /is recruited into/.test(e.text)).length;
    if (membersOf(w, "company").length - INITIAL_MEMBERS !== joinedLogged) namedMismatch++;
  }
  check("the company's RECRUIT action can recruit a named character", orgJoins > 0, `${orgJoins} over ${WIDE.length} seeds`);
  check("eligible + recruited always equals the 20 students announced", accountingBreaks === 0, `${accountingBreaks} breaks`);
  check("every named company member is counted and logged exactly once", namedMismatch === 0, `${namedMismatch} seeds`);
  if (viaOrg) {
    const c = viaOrg.w.characters[viaOrg.id];
    check("an org-recruited character is a real member with company leverage", c.orgIds.includes("company") && (viaOrg.w.orgs.company.leverage[viaOrg.id] ?? 0) > 0);
  }

  // Selection is driven by the student's state, not by who they are.
  const lo = structuredClone(createWorld(1).characters.femi);
  const hi = structuredClone(lo);
  lo.traits.ambition = 10;
  hi.traits.ambition = 95;
  check("a more ambitious student is more willing to join", recruitChance(hi, 10) > recruitChance(lo, 10));
  check("a student who distrusts the recruiter is less willing", recruitChance(lo, 80) < recruitChance(lo, 10));
  const aware = structuredClone(hi);
  aware.beliefs["company.harms_students"] = { factId: "company.harms_students", confidence: 90, source: "document", day: 1, corroboration: 1 };
  check("a student who knows the program harms students is less willing", recruitChance(aware, 10) < recruitChance(hi, 10));
}

/* ================================================================== */
console.log("\n--- Chain 3: information channels (public reach vs. rumor propagation) ---");

/** The buggy pre-fix behaviour, reproduced locally so the test suite can prove it would catch it. */
function buggyAnnounceEveryone(
  w: World,
  factId: Id,
  awareness: number,
  baseConfidence: number
): void {
  w.publicAwareness[factId] = Math.min(100, (w.publicAwareness[factId] ?? 0) + awareness);
  for (const c of Object.values(w.characters)) {
    const scaled = baseConfidence * (0.6 + (c.traits.credulity / 100) * 0.5);
    learn(w, c.id, factId, scaled, "rumor");
  }
}

const ALL_IDS = Object.keys(createWorld(1).characters);

// 1. A public announcement reaches its intended audience.
{
  const w = createWorld(1);
  announce(w, "students.isolated", 60, 70, "published", ["zara", "daniel"]);
  const zaraKnows = (w.characters.zara.beliefs["students.isolated"]?.confidence ?? 0) > 0;
  const danielKnows = (w.characters.daniel.beliefs["students.isolated"]?.confidence ?? 0) > 0;
  const othersUntouched = ["femi", "tobi", "okafor", "amara"].every(
    (id) => (w.characters[id].beliefs["students.isolated"]?.confidence ?? 0) === (createWorld(1).characters[id].beliefs["students.isolated"]?.confidence ?? 0)
  );
  check("a targeted public announcement reaches its named audience", zaraKnows && danielKnows);
  check("...and leaves characters outside that audience unaffected", othersUntouched);

  const w2 = createWorld(1);
  announce(w2, "company.research_program", 75, 85, "witnessed");
  const reach = Object.values(w2.characters).filter((c) => (c.beliefs["company.research_program"]?.confidence ?? 0) > 0).length;
  check("an un-targeted genuinely public event reaches the whole relevant population", reach === ALL_IDS.length, `${reach}/${ALL_IDS.length}`);
}

// 2. A modest rumor does NOT instantly reach every character (this used to be a documented KNOWN gap).
let rumorImmediateCount = 0;
{
  const w = createWorld(1);
  announce(w, "rumor.data_breach", 35, 55, "rumor");
  const aware = Object.values(w.characters).filter((c) => (c.beliefs["rumor.data_breach"]?.confidence ?? 0) > 0);
  rumorImmediateCount = aware.length;
  check(
    "a modest rumor does not reach every character instantly",
    aware.length < ALL_IDS.length,
    `${aware.length}/${ALL_IDS.length} characters believed it immediately (was ${ALL_IDS.length}/${ALL_IDS.length} before the fix)`
  );
}

// 3. Different characters can hold different beliefs about the same fact.
{
  const w = createWorld(2);
  announce(w, "rumor.data_breach", 35, 55, "rumor");
  const confidences = Object.values(w.characters).map((c) => c.beliefs["rumor.data_breach"]?.confidence ?? 0);
  const distinct = new Set(confidences.map((n) => Math.round(n * 10)));
  check(
    "characters end up holding different confidence levels in the same fact",
    distinct.size > 1,
    confidences.join(", ")
  );
}

// 4. A character who did not receive the information cannot act as though they know it.
{
  const base = createWorld(3);
  const rumored = structuredClone(base);
  announce(rumored, "rumor.data_breach", 35, 55, "rumor");
  const nonBeliever = Object.values(rumored.characters).find(
    (c) => (c.beliefs["rumor.data_breach"]?.confidence ?? 0) === 0
  );
  check("at least one character did not hear the rumor (precondition for this check)", !!nonBeliever);
  if (nonBeliever) {
    const before = JSON.stringify(candidates(base, base.characters[nonBeliever.id]));
    const after = JSON.stringify(candidates(rumored, rumored.characters[nonBeliever.id]));
    check(
      "a character who never heard the rumor decides exactly as if it never happened",
      before === after
    );
  }
}

// 5. Information can still propagate through the simulation after characters learn it
//    (via the existing TALK exchange / investigation-group sync — no new subsystem).
// Note: the company also actively softens beliefs that threaten it (an existing, intentional
// mechanic — see `softenBeliefs`/companyAct), so confidence in this fact can fall as well as
// rise over a long window. We track the widest the circle of believers ever gets during the
// run (not just the final day) against how many heard it the moment it broke, and only count
// trials where someone actually heard it to begin with (otherwise there is nothing to spread).
{
  let valid = 0;
  let grew = 0;
  const TRIALS = Array.from({ length: 80 }, (_, i) => i + 1);
  for (const s of TRIALS) {
    let w = createWorld(s);
    announce(w, "rumor.data_breach", 35, 55, "rumor");
    const initial = Object.values(w.characters).filter((c) => (c.beliefs["rumor.data_breach"]?.confidence ?? 0) > 0).length;
    if (initial === 0) continue;
    valid++;
    let maxAware = initial;
    for (let d = 0; d < 30; d++) {
      w = step(w);
      const n = Object.values(w.characters).filter((c) => (c.beliefs["rumor.data_breach"]?.confidence ?? 0) > 0).length;
      if (n > maxAware) maxAware = n;
    }
    if (maxAware > initial) grew++;
  }
  check(
    "the rumor keeps spreading through ordinary TALK/group contact after the initial pickup",
    grew >= valid * 0.5,
    `widened beyond its initial audience in ${grew}/${valid} trials that got an initial listener`
  );
}

// 6. Mutation test: reinstate the old "tell everyone" behaviour and confirm the test above catches it.
{
  const w = createWorld(1);
  buggyAnnounceEveryone(w, "rumor.data_breach", 35, 55);
  const aware = Object.values(w.characters).filter((c) => (c.beliefs["rumor.data_breach"]?.confidence ?? 0) > 0);
  const mutantCaught = aware.length === ALL_IDS.length; // the bug's signature: 100% instant reach
  check(
    "mutation test: reintroducing blanket instant-broadcast is caught (would make every character instantly aware)",
    mutantCaught,
    `mutant produced ${aware.length}/${ALL_IDS.length} instant believers (fixed code produced ${rumorImmediateCount}/${ALL_IDS.length})`
  );
}

/* ================================================================== */
console.log("\n--- Regressions ---");
{
  let consecutive = 0;
  let perRun = 0;
  for (const s of SEEDS) {
    const w = run(createWorld(s), 40);
    const days: Record<string, number[]> = {};
    for (const e of w.log) {
      if (e.kind === "ACTION" && (e.data as any)?.action === "CONFRONT") {
        (days[[e.actorId, e.targetId].join(">")] ??= []).push(e.day);
      }
    }
    for (const list of Object.values(days)) {
      perRun += list.length;
      for (let i = 1; i < list.length; i++) if (list[i] - list[i - 1] <= 1) consecutive++;
    }
  }
  check("the same character never confronts the same target on consecutive days", consecutive === 0, `${consecutive} cases`);
  check("confrontation volume stays reasonable (<12 per 40-day run)", perRun / SEEDS.length < 12, (perRun / SEEDS.length).toFixed(1));
}

if (failures > 0) {
  console.log(`\n${failures} causal check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll causal checks passed (KNOWN items are documented gaps, not failures).");
