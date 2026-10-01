/**
 * Pass 3 core tests (snapshots, replay, fork).   npx tsx scripts/replay-tests.ts
 */
import { createWorld } from "../lib/world/content";
import { run } from "../lib/world/engine";
import { stateHash } from "../lib/world/metrics";
import {
  compareBranches,
  createTimeline,
  deserialize,
  finalWorld,
  fork,
  serialize,
  worldAt,
} from "../lib/replay/timeline";
import { applyIntervention, type Intervention } from "../lib/replay/interventions";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) failures++;
}
const throws = (f: () => unknown): boolean => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

const SEED = 3;
const H = 30;
const tell: Intervention = { kind: "LEARN", charId: "zara", factId: "daniel.is_informant", confidence: 95, fromId: "tobi" };

// 1. Replay: every snapshot equals a fresh run of the engine.
{
  const tl = createTimeline(SEED, H);
  let ok = true;
  for (const d of [1, 2, 10, 20, H + 1]) {
    if (stateHash(worldAt(tl, "main", d)) !== stateHash(run(createWorld(SEED), d - 1))) ok = false;
  }
  check("snapshots match a fresh run from the seed", ok);
  check("two timelines from one seed are identical", stateHash(finalWorld(createTimeline(SEED, H), "main")) === stateHash(finalWorld(tl, "main")));
}

// 2. Fork with no interventions is identical to the parent.
{
  const tl = fork(createTimeline(SEED, H), "main", 8, [], "same");
  check("empty fork reproduces the parent exactly", stateHash(finalWorld(tl, "same")) === stateHash(finalWorld(tl, "main")));
}

// 3. Fork with an intervention: identical before the fork day, different after, parent untouched.
{
  const base = createTimeline(SEED, H);
  const before = stateHash(finalWorld(base, "main"));
  const tl = fork(base, "main", 8, [tell], "told");
  const cmp = compareBranches(tl, "main", "told");
  check("parent is unchanged by forking", stateHash(finalWorld(tl, "main")) === before);
  check("fork matches parent before the fork day", stateHash(worldAt(tl, "told", 7)) === stateHash(worldAt(tl, "main", 7)));
  check("fork diverges from the fork day", cmp.firstDivergence === 8, `first=${cmp.firstDivergence}`);
  check("divergence changes later days' actions", cmp.changedDays.length > 0 && Math.min(...cmp.changedDays) >= 8, JSON.stringify(cmp.changedDays));
  check("the intervention is visible in the log", finalWorld(tl, "told").log.some((e) => e.kind === "WORLD_EVENT" && (e.data as any)?.intervention === true));
  check("intervention took effect (Zara's belief at fork day)", (worldAt(tl, "told", 8).characters.zara.beliefs["daniel.is_informant"]?.confidence ?? 0) >= 90);
}

// 4. Nested forks and ancestor lookup.
{
  let tl = fork(createTimeline(SEED, H), "main", 5, [tell], "a");
  tl = fork(tl, "a", 12, [{ kind: "ADJUST", charId: "daniel", alarm: 40 }], "a2");
  check("fork of a fork matches its parent before its own fork day", stateHash(worldAt(tl, "a2", 11)) === stateHash(worldAt(tl, "a", 11)));
  check("a2 inherits main's history before day 5", stateHash(worldAt(tl, "a2", 4)) === stateHash(worldAt(tl, "main", 4)));
  check("a2 differs from a after day 12", compareBranches(tl, "a", "a2").firstDivergence === 12);
}

// 5. Persistence: save is small, reload replays and verifies.
{
  let tl = fork(createTimeline(SEED, H), "main", 5, [tell], "a");
  tl = fork(tl, "a", 12, [{ kind: "MOVE", charId: "zara", to: "library" }], "a2");
  const saved = JSON.parse(JSON.stringify(serialize(tl)));
  const back = deserialize(saved);
  check("save/load roundtrip reproduces every branch", ["main", "a", "a2"].every((id) => stateHash(finalWorld(back, id)) === stateHash(finalWorld(tl, id))));
  check("save file is small", JSON.stringify(saved).length < 2000, String(JSON.stringify(saved).length));
  saved.branches[1].finalHash = "deadbeef";
  check("a hash mismatch (engine changed) is refused", throws(() => deserialize(saved)));
}

// 6. Validation and purity.
{
  const w = createWorld(SEED);
  const snap = stateHash(w);
  applyIntervention(w, tell);
  check("applyIntervention does not mutate its input", stateHash(w) === snap);
  check("unknown character rejected", throws(() => applyIntervention(w, { kind: "MOVE", charId: "nobody", to: "library" })));
  check("unknown location rejected", throws(() => applyIntervention(w, { kind: "MOVE", charId: "zara", to: "mars" })));
  check("unknown fact rejected", throws(() => applyIntervention(w, { kind: "LEARN", charId: "zara", factId: "nope", confidence: 50 })));
  const tl = createTimeline(SEED, 5);
  check("fork day out of range rejected", throws(() => fork(tl, "main", 99, [])));
  check("duplicate branch id rejected", throws(() => fork(fork(tl, "main", 2, [], "x"), "main", 2, [], "x")));
}

if (failures > 0) {
  console.log(`\n${failures} replay test(s) FAILED`);
  process.exit(1);
}
console.log("\nAll replay tests passed.");
