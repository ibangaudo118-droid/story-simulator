import { simulateDay } from "../app/api/simulate/engine";
import {
  bestTarget,
  outcomeTrend,
  staleRepeatPenalty,
  chooseActions,
} from "../app/api/simulate/decisions";
import { buildMindState } from "../app/api/simulate/mind";
import { updateStrategies } from "../app/api/simulate/adaptation";
import { processPerceptions } from "../app/api/simulate/perception";
import { createInitialWorld } from "../lib/simulation/world";
import type {
  ActionOutcome,
  ActionType,
  Character,
  StrategyId,
  WorldEvent,
  WorldState,
} from "../lib/simulation/types";

let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function outcome(
  actorId: string,
  action: ActionType,
  day: number,
  over: Partial<ActionOutcome> = {}
): ActionOutcome {
  return {
    id: `o-${actorId}-${action}-${day}`,
    eventId: `e-${actorId}-${action}-${day}`,
    day,
    actorId,
    action,
    locationId: "campus",
    success: true,
    progress: 10,
    effectiveness: 10,
    risk: 10,
    newInformation: false,
    targetReacted: false,
    targetNoticed: false,
    summary: "test",
    ...over,
  };
}

function zaraOf(w: WorldState): Character {
  return w.characters.find((c) => c.id === "zara")!;
}

const base = createInitialWorld();

/* Invariant 4: repeated failed actions reduce future attractiveness. */
{
  const fresh = clone(zaraOf(base));
  fresh.actionHistory = [];
  const failed = clone(zaraOf(base));
  failed.actionHistory = [1, 2, 3, 4].map((d) =>
    outcome("zara", "INVESTIGATE", d)
  );
  const day = 5;
  const tFresh = outcomeTrend(fresh, "INVESTIGATE", day).component;
  const tFailed = outcomeTrend(failed, "INVESTIGATE", day).component;
  const pFresh = staleRepeatPenalty(fresh, "INVESTIGATE", day).penalty;
  const pFailed = staleRepeatPenalty(failed, "INVESTIGATE", day).penalty;
  check(
    "Invariant 4: failures lower outcome trend",
    tFailed < tFresh,
    `trend ${tFresh.toFixed(1)} -> ${tFailed.toFixed(1)}`
  );
  check(
    "Invariant 4: failures add a repeat penalty",
    pFailed > pFresh,
    `penalty ${pFresh.toFixed(1)} -> ${pFailed.toFixed(1)}`
  );
  const more = clone(failed);
  more.actionHistory.push(outcome("zara", "INVESTIGATE", 5));
  const net = (c: Character, d: number) =>
    outcomeTrend(c, "INVESTIGATE", d).component -
    staleRepeatPenalty(c, "INVESTIGATE", d).penalty;
  const two = clone(zaraOf(base));
  two.actionHistory = [3, 4].map((d) => outcome("zara", "INVESTIGATE", d));
  const four = clone(zaraOf(base));
  four.actionHistory = [1, 2, 3, 4].map((d) => outcome("zara", "INVESTIGATE", d));
  check(
    "Invariant 4: more failures lower net attractiveness further",
    net(four, 5) < net(two, 5),
    `${net(two, 5).toFixed(1)} -> ${net(four, 5).toFixed(1)}`
  );
}

/* Invariant 5: successful actions can raise strategy effectiveness. */
{
  const z = clone(zaraOf(base));
  const sid: StrategyId = z.strategies[0].id;
  const before = z.strategies[0].effectiveness;
  updateStrategies(
    z,
    [
      outcome("zara", "INVESTIGATE", 1, {
        strategyId: sid,
        progress: 80,
        effectiveness: 85,
        risk: 5,
        newInformation: true,
      }),
    ],
    1
  );
  const after = z.strategies[0].effectiveness;
  check(
    "Invariant 5: success raises effectiveness",
    after > before,
    `${before.toFixed(1)} -> ${after.toFixed(1)}`
  );

  const z2 = clone(zaraOf(base));
  updateStrategies(
    z2,
    [
      outcome("zara", "INVESTIGATE", 1, {
        strategyId: sid,
        progress: 5,
        effectiveness: 5,
        risk: 40,
      }),
    ],
    1
  );
  check(
    "Invariant 5: failure lowers effectiveness",
    z2.strategies[0].effectiveness < before,
    `${before.toFixed(1)} -> ${z2.strategies[0].effectiveness.toFixed(1)}`
  );
}

/* Invariant 6: recent outcomes matter more than old, but old never vanish. */
{
  const good = (d: number) =>
    outcome("zara", "INVESTIGATE", d, {
      progress: 80,
      effectiveness: 85,
      risk: 5,
      newInformation: true,
    });
  const bad = (d: number) =>
    outcome("zara", "INVESTIGATE", d, {
      progress: 5,
      effectiveness: 5,
      risk: 40,
    });

  const run = (seq: ActionOutcome[]) => {
    const z = clone(zaraOf(base));
    const sid = z.strategies[0].id;
    z.strategies[0].effectiveness = 50;
    seq.forEach((o, i) => {
      updateStrategies(z, [{ ...o, strategyId: sid }], i + 1);
    });
    return z.strategies[0].effectiveness;
  };

  const oldBadRecentGood = run([bad(1), good(2), good(3), good(4)]);
  const oldGoodRecentBad = run([good(1), bad(2), bad(3), bad(4)]);
  check(
    "Invariant 6: recent outcomes dominate",
    oldBadRecentGood > oldGoodRecentBad,
    `${oldBadRecentGood.toFixed(1)} vs ${oldGoodRecentBad.toFixed(1)}`
  );

  const withOldBad = run([bad(1), ...Array.from({ length: 12 }, (_, i) => good(i + 2))]);
  const withoutOldBad = run(Array.from({ length: 12 }, (_, i) => good(i + 2)));
  check(
    "Invariant 6: old outcomes fade but never vanish",
    withOldBad < withoutOldBad && withOldBad > 0,
    `${withOldBad.toFixed(2)} < ${withoutOldBad.toFixed(2)}`
  );

  const young = clone(zaraOf(base));
  young.actionHistory = [outcome("zara", "INVESTIGATE", 4)];
  const older = clone(zaraOf(base));
  older.actionHistory = [outcome("zara", "INVESTIGATE", 1)];
  const cy = outcomeTrend(young, "INVESTIGATE", 5).component;
  const co = outcomeTrend(older, "INVESTIGATE", 5).component;
  check(
    "Invariant 6: trend weights recent failure more than old failure",
    cy < co && co < 0,
    `recent ${cy.toFixed(1)}, old ${co.toFixed(1)}`
  );
}

/* Invariant 8: FOLLOW/TALK target selection is contextual. */
{
  const pick = (kind: "TALK" | "FOLLOW", trustDaniel: number, trustMara: number) => {
    const w = clone(base);
    const daniel = w.characters.find((c) => c.id === "daniel")!;
    const mara = clone(daniel);
    mara.id = "mara";
    mara.name = "Mara";
    daniel.location = "campus";
    mara.location = "campus";
    const z = zaraOf(w);
    z.location = "campus";
    z.relationships = [
      { targetId: "daniel", trust: trustDaniel, suspicion: trustDaniel > 50 ? 10 : 80 },
      { targetId: "mara", trust: trustMara, suspicion: trustMara > 50 ? 10 : 80 },
    ];
    w.characters.push(mara);
    const mind = buildMindState(w, z);
    return bestTarget(w, z, mind, w.day + 1, kind)?.targetId;
  };

  for (const kind of ["TALK", "FOLLOW"] as const) {
    const a = pick(kind, 90, 10);
    const b = pick(kind, 10, 90);
    check(
      `Invariant 8: ${kind} target changes with relationships`,
      a !== undefined && b !== undefined && a !== b,
      `${a} vs ${b}`
    );
  }
}

/* Invariant 9: perception uses event-time locations. */
{
  const w = clone(base);
  const zara = zaraOf(w);
  const daniel = w.characters.find((c) => c.id === "daniel")!;
  zara.location = "company-office"; // where she is NOW
  zara.processedEventIds = [];
  daniel.processedEventIds = [];

  const ev: WorldEvent = {
    id: "test-ev-1",
    type: "ACTION",
    day: 1,
    actorId: "daniel",
    locationId: "campus-cafe",
    data: { action: "TALK", success: true },
  };

  const inCafe = processPerceptions(w, [ev], { zara: "campus-cafe", daniel: "campus-cafe" });
  const elsewhere = processPerceptions(w, [ev], { zara: "campus", daniel: "campus-cafe" });
  const sawFromCafe = inCafe.some((r) => r.characterId === "zara");
  const sawFromCampus = elsewhere.some((r) => r.characterId === "zara");
  check(
    "Invariant 9: observer present at event time perceives it",
    sawFromCafe
  );
  check(
    "Invariant 9: observer elsewhere at event time does not, regardless of current location",
    !sawFromCampus
  );
}

/* Invariant 12: decisions come from a pre-action snapshot. */
{
  let w = createInitialWorld();
  for (let i = 0; i < 12; i++) w = simulateDay(w, "").world;

  const input = clone(w);
  const reversed = clone(w);
  reversed.characters.reverse();

  const a = simulateDay(input, "");
  const b = simulateDay(reversed, "");

  const acts = (r: ReturnType<typeof simulateDay>) =>
    Object.fromEntries(
      Object.entries(r.characterUpdates).map(([id, u]) => [id, u.action])
    );
  check(
    "Invariant 12: character order does not change same-day decisions",
    JSON.stringify(acts(a), Object.keys(acts(a)).sort()) ===
      JSON.stringify(acts(b), Object.keys(acts(b)).sort()),
    `${JSON.stringify(acts(a))} vs ${JSON.stringify(acts(b))}`
  );

  check(
    "Invariant 12: input world is not mutated by simulateDay",
    JSON.stringify(input) === JSON.stringify(w)
  );

  const planned = chooseActions(
    Object.assign(clone(w), { day: w.day + 1 })
  );
  void planned;
}

console.log(
  failures === 0
    ? "\nALL INVARIANT TESTS PASSED"
    : `\n${failures} INVARIANT TEST(S) FAILED`
);
