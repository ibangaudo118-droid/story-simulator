import {
  simulateDay,
} from "../app/api/simulate/engine";

import {
  createInitialWorld,
} from "../lib/simulation/world";

import type {
  WorldState,
} from "../lib/simulation/types";

const DAYS =
  Number(
    process.argv[2] ?? 10
  );

type Trajectory = {
  actions: string[];
  strategies: string[];
  locations: string[];
  effectiveness: number[][];
  productive: boolean[];
};

function run(
  days: number
): {
  world: WorldState;
  trajectories: Record<
    string,
    Trajectory
  >;
} {
  let world =
    createInitialWorld();

  const trajectories: Record<
    string,
    Trajectory
  > = {};

  for (
    let i = 0;
    i < days;
    i++
  ) {
    const result =
      simulateDay(
        world,
        ""
      );

    world =
      result.world;

    for (
      const character of
        world.characters
    ) {
      const entry =
        (trajectories[
          character.id
        ] ??= {
          productive: [],
          actions:
            [],
          strategies:
            [],
          locations:
            [],
          effectiveness:
            [],
        });

      entry.actions.push(
        result
          .characterUpdates[
          character.id
        ]?.action ??
          "?"
      );

      entry.strategies.push(
        character.currentStrategyId ??
          "?"
      );

      entry.locations.push(
        character.location
      );

      const latest =
        character.actionHistory[
          character.actionHistory
            .length - 1
        ];

      entry.productive.push(
        !!latest &&
          latest.day >= world.day - 1 &&
          latest.newInformation ===
            true
      );

      entry.effectiveness.push(
        character.strategies.map(
          (strategy) =>
            Math.round(
              strategy.effectiveness
            )
        )
      );
    }
  }

  return {
    world,
    trajectories,
  };
}

function findCycle(
  seq: string[],
  minPeriod = 2,
  maxPeriod = 6,
  minDistinct = 1
): {
  start: number;
  period: number;
} | null {
  for (
    let period = minPeriod;
    period <= maxPeriod;
    period++
  ) {
    for (
      let i = 0;
      i +
        period * 3 <=
      seq.length;
      i++
    ) {
      const window =
        seq
          .slice(
            i,
            i + period
          )
          .join("|");

      let ok = true;

      for (
        let k = 1;
        k < 3;
        k++
      ) {
        if (
          seq
            .slice(
              i +
                period *
                  k,
              i +
                period *
                  (k + 1)
            )
            .join("|") !==
          window
        ) {
          ok = false;
          break;
        }
      }

      if (
        ok &&
        minDistinct > 1 &&
        new Set(
          seq.slice(i, i + period)
        ).size < minDistinct
      ) {
        ok = false;
      }

      if (ok) {
        return {
          start: i,
          period,
        };
      }
    }
  }

  return null;
}

const {
  world,
  trajectories,
} = run(DAYS);

let failures = 0;

function check(
  label: string,
  ok: boolean,
  detail = ""
): void {
  console.log(
    `  [${
      ok
        ? "PASS"
        : "FAIL"
    }] ${label}${
      detail
        ? ` — ${detail}`
        : ""
    }`
  );

  if (!ok) {
    failures += 1;
  }
}

console.log(
  `\n=== TRAJECTORY (${DAYS} days) ===`
);

for (
  let day = 0;
  day < DAYS;
  day++
) {
  const zara =
    trajectories["zara"];
  const daniel =
    trajectories["daniel"];

  console.log(
    `D${String(
      day + 2
    ).padStart(2)} ` +
      `zara: ${zara.actions[day]} (${zara.strategies[day]}) @ ${zara.locations[day]}  |  ` +
      `daniel: ${daniel.actions[day]} (${daniel.strategies[day]}) @ ${daniel.locations[day]}`
  );
}

console.log(
  `\n=== INVARIANTS ===`
);

/*
 * Invariant 1 & 2: movement respects the
 * location graph (no teleports).
 */
let moveGraphOk = true;
let moveContractOk = true;

for (
  const event of
    world.eventLog
) {
  if (
    event.type !==
      "ACTION" ||
    event.data.action !==
      "MOVE"
  ) {
    continue;
  }

  const from =
    event.data.from;
  const to =
    event.data.to;

  if (
    typeof to !==
    "string"
  ) {
    moveContractOk = false;
    continue;
  }

  if (
    event.data.success ===
    true
  ) {
    const fromLocation =
      world.locations.find(
        (location) =>
          location.id ===
          from
      );

    if (
      !fromLocation?.connectedTo.includes(
        to
      )
    ) {
      moveGraphOk = false;
    }
  }
}

check(
  "Invariant 1+2: no teleport; MOVE only on connected locations",
  moveGraphOk
);

check(
  "Invariant 10a: MOVE events expose event.data.to",
  moveContractOk
);

/*
 * Invariant 3: no duplicate knowledge entries.
 */
for (
  const character of
    world.characters
) {
  check(
    `Invariant 3: no duplicate knowledge for ${character.id}`,
    new Set(
      character.knowledge
    ).size ===
      character.knowledge
        .length,
    `${character.knowledge.length} entries`
  );
}

/*
 * Invariant 9 (structural): relationships bounded.
 */
for (
  const character of
    world.characters
) {
  for (
    const relationship of
      character.relationships
  ) {
    check(
      `Relationships bounded for ${character.id} -> ${relationship.targetId}`,
      relationship.trust >=
        0 &&
        relationship.trust <=
          100 &&
        relationship.suspicion >=
          0 &&
        relationship.suspicion <=
          100,
      `trust ${relationship.trust}, suspicion ${relationship.suspicion}`
    );
  }
}

/*
 * Invariant 7: no permanent static action loops.
 */
for (
  const id of
    Object.keys(
      trajectories
    )
) {
  let cycle =
    findCycle(
      trajectories[id]
        .actions
    );

  /*
   * A repeated action that keeps producing new
   * information is learning, not a static loop.
   * Only flag cycles whose repeated stretch is
   * mostly unproductive.
   */
  if (cycle) {
    const stretch =
      trajectories[id].productive.slice(
        cycle.start,
        cycle.start +
          cycle.period * 3
      );
    const productiveShare =
      stretch.filter(Boolean)
        .length /
      Math.max(1, stretch.length);

    if (productiveShare >= 0.5) {
      cycle = null;
    }
  }

  check(
    `Invariant 7: no repeated action cycle for ${id}`,
    cycle === null,
    cycle
      ? `cycle of period ${cycle.period} at day ${cycle.start + 2}`
      : ""
  );

  const locationCycle =
    findCycle(
      trajectories[id]
        .locations,
      2,
      6,
      2
    );

  check(
    `Movement oscillation check for ${id}`,
    locationCycle ===
      null,
    locationCycle
      ? `location cycle of period ${locationCycle.period} at day ${locationCycle.start + 2}`
      : ""
  );
}

/*
 * Invariant 11: determinism.
 */
const runA =
  run(
    Math.min(
      DAYS,
      15
    )
  );
const runB =
  run(
    Math.min(
      DAYS,
      15
    )
  );

check(
  "Invariant 11: deterministic for identical inputs",
  JSON.stringify(
    runA.world
  ) ===
    JSON.stringify(
      runB.world
    )
);

/*
 * Strategy adaptation report (Invariant 4/5/6).
 */
console.log(
  `\n=== STRATEGY ADAPTATION ===`
);

for (
  const character of
    world.characters
) {
  console.log(
    `\n${character.name}:`
  );

  for (
    const strategy of
      character.strategies
  ) {
    console.log(
      `  ${strategy.id}: effectiveness ${Math.round(strategy.effectiveness)} (attempts ${strategy.attempts}, successes ${strategy.successes}, failures ${strategy.failures})`
    );
  }

  const evidenceCount =
    character.actionHistory.filter(
      (outcome) =>
        outcome.newInformation
    ).length;

  console.log(
    `  recent outcomes with new information: ${evidenceCount} (last ${character.actionHistory.length} actions)`
  );
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`
);

process.exit(
  failures === 0
    ? 0
    : 1
);
