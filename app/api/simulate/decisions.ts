import type {
  ActionType,
  Character,
  Relationship,
  StrategyId,
  WorldState,
} from "@/lib/simulation/types";

import {
  buildMindState,
  type MindState,
} from "./mind";

import {
  getUnknownItems,
  INVESTIGATION_POOL,
  SEARCH_POOL,
  locationRisk,
} from "@/lib/simulation/info";

export type Decision = {
  action: ActionType;
  reason: string;
  score: number;
  strategyId: StrategyId;
  targetId?: string;
  destinationId?: string;
};

function clamp(
  value: number,
  min = 0,
  max = 100
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

/**
 * Deterministic tie-break in [0, 1).
 * No Math.random anywhere: identical states
 * produce identical trajectories.
 */
function hash01(
  ...parts: string[]
): number {
  let hash = 5381;
  const input = parts.join("|");

  for (
    let i = 0;
    i < input.length;
    i++
  ) {
    hash =
      ((hash << 5) +
        hash +
        input.charCodeAt(i)) >>>
      0;
  }

  return (
    (hash % 10000) / 10000
  );
}

function getRelationship(
  character: Character,
  targetId: string
): Relationship | undefined {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId ===
      targetId
  );
}

function motiveStrength(
  mind: MindState,
  type:
    | "GOAL"
    | "FEAR"
    | "CURIOSITY"
    | "PROTECTION"
    | "SELF_PRESERVATION"
    | "LOYALTY"
): number {
  return mind.motives
    .filter(
      (motive) =>
        motive.type === type
    )
    .reduce(
      (total, motive) =>
        total +
        motive.strength,
      0
    );
}

function othersAt(
  world: WorldState,
  character: Character
): Character[] {
  return world.characters.filter(
    (other) =>
      other.id !==
        character.id &&
      other.location ===
        character.location
  );
}

/**
 * Actions each strategy prefers, with affinity
 * weights. Strategies are approaches, not actions.
 */
const STRATEGY_ACTIONS: Record<
  StrategyId,
  Partial<Record<ActionType, number>>
> = {
  "direct-investigation": {
    INVESTIGATE: 42,
    SEARCH: 30,
    MOVE: 26,
  },
  "social-contact": {
    TALK: 46,
    MOVE: 22,
  },
  surveillance: {
    FOLLOW: 46,
    OBSERVE: 24,
    MOVE: 20,
  },
  observation: {
    OBSERVE: 40,
    SEARCH: 14,
    MOVE: 16,
  },
  exploration: {
    MOVE: 46,
    OBSERVE: 14,
  },
  "cautious-waiting": {
    WAIT: 42,
    OBSERVE: 18,
    MOVE: 10,
  },
};

const STRATEGY_GOAL_WORDS: Record<
  StrategyId,
  string[]
> = {
  "direct-investigation": [
    "discover",
    "evidence",
    "investigat",
    "proof",
    "find out",
  ],
  "social-contact": [
    "protect",
    "family",
    "contact",
    "without betraying",
  ],
  surveillance: [
    "discover",
    "monitor",
    "follow",
    "watch",
    "investigat",
  ],
  observation: [
    "discover",
    "notice",
    "watch",
    "evidence",
  ],
  exploration: [
    "discover",
    "explore",
    "map",
  ],
  "cautious-waiting": [
    "protect",
    "family",
    "avoid",
    "safe",
    "without betraying",
  ],
};

function strategyFeasible(
  world: WorldState,
  character: Character,
  strategyId: StrategyId
): boolean {
  switch (strategyId) {
    case "direct-investigation":
      return character.capabilities.includes(
        "investigation"
      );

    case "social-contact":
    case "surveillance":
      return (
        othersAt(
          world,
          character
        ).length > 0
      );

    case "observation":
    case "cautious-waiting":
      return true;

    case "exploration": {
      const location =
        world.locations.find(
          (item) =>
            item.id ===
            character.location
        );

      return (
        !!location &&
        location.connectedTo
          .length > 0
      );
    }
  }
}

function strategyGoalFit(
  strategyId: StrategyId,
  text: string,
  effectiveness = 50
): number {
  const normalized =
    text.toLowerCase();

  let fit = 0;

  for (
    const word of
      STRATEGY_GOAL_WORDS[
        strategyId
      ]
  ) {
    if (
      normalized.includes(word)
    ) {
      fit += 22;
    }
  }

  /*
   * Goal fit is scaled by how well the strategy has
   * actually been working, so a goal-matched strategy
   * that keeps failing loses its advantage.
   */
  return (
    Math.min(60, fit) *
    (0.4 + effectiveness / 100)
  );
}

function chooseStrategy(
  world: WorldState,
  character: Character,
  mind: MindState
): {
  strategyId: StrategyId;
  factors: string[];
} {
  const goalText =
    `${character.goal} ${character.currentPriority}`;

  const curiosity =
    motiveStrength(
      mind,
      "CURIOSITY"
    );

  const selfPreservation =
    motiveStrength(
      mind,
      "SELF_PRESERVATION"
    );

  const protection =
    motiveStrength(
      mind,
      "PROTECTION"
    );

  const fear =
    motiveStrength(
      mind,
      "FEAR"
    );

  const loyalty =
    motiveStrength(
      mind,
      "LOYALTY"
    );

  let best: {
    strategyId: StrategyId;
    value: number;
  } | null = null;

  for (
    const strategy of
      character.strategies
  ) {
    if (
      !strategyFeasible(
        world,
        character,
        strategy.id
      )
    ) {
      continue;
    }

    let value =
      strategy.effectiveness *
        0.5 +
      strategyGoalFit(
        strategy.id,
        goalText,
        strategy.effectiveness
      );

    if (
      strategy.id ===
        "direct-investigation" ||
      strategy.id ===
        "surveillance"
    ) {
      value += curiosity * 0.15;
    }

    if (
      strategy.id ===
      "cautious-waiting"
    ) {
      value +=
        selfPreservation *
          0.2 +
        protection *
          0.1;
    }

    if (
      strategy.id ===
      "social-contact"
    ) {
      value +=
        protection *
          0.15 +
        loyalty *
          0.1;
    }

    if (
      strategy.id ===
      "direct-investigation"
    ) {
      value -= fear * 0.08;
    }

    if (
      strategy.id ===
      "exploration"
    ) {
      value +=
        curiosity * 0.08;
    }

    /*
     * Strategies that have been performing badly lose
     * ground even when motives favour them.
     */
    value -=
      Math.max(
        0,
        50 -
          strategy.effectiveness
      ) * 0.8;

    /*
     * Deterministic tie-break so two strategies
     * with identical values do not lock the
     * simulation into one forever.
     */
    value += hash01(
      character.id,
      String(world.day),
      strategy.id
    );

    if (
      !best ||
      value > best.value
    ) {
      best = {
        strategyId:
          strategy.id,
        value,
      };
    }
  }

  return {
    strategyId:
      best?.strategyId ??
      "observation",

    factors: [],
  };
}

/**
 * Recency-weighted trend of past outcomes for
 * one action. Smooth exponential decay: recent
 * outcomes dominate, old ones fade but keep
 * residual influence (never exactly zero).
 */
export function outcomeTrend(
  character: Character,
  action: ActionType,
  day: number
): {
  component: number;
  note: string;
} {
  let weighted = 0;
  let totalWeight = 0;

  for (
    const outcome of
      character.actionHistory
  ) {
    if (
      outcome.action !==
      action
    ) {
      continue;
    }

    const age =
      day - outcome.day;

    if (
      age < 0 ||
      age > 6
    ) {
      continue;
    }

    const weight =
      Math.pow(
        0.8,
        age
      );

    weighted +=
      weight *
      (outcome.effectiveness -
        50) /
        50;

    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return {
      component: 0,
      note: "",
    };
  }

  const component =
    clamp(
      weighted *
        28,
      -35,
      35
    );

  return {
    component,

    note: `recent outcomes ${
      component >= 0
        ? "support"
        : "undermine"
    } this (${
      component >= 0
        ? "+"
        : ""
    }${Math.round(
      component
    )})`,
  };
}

/**
 * Anti-loop: repeating an action that recently
 * produced WEAK outcomes is penalized in
 * proportion to how weak those outcomes were.
 * Repeating a successful action is cheap.
 * There is no "switch after N failures" rule.
 */
export function staleRepeatPenalty(
  character: Character,
  action: ActionType,
  day: number
): {
  penalty: number;
  note: string;
} {
  let penalty = 0;

  for (
    const outcome of
      character.actionHistory
  ) {
    if (
      outcome.action !==
      action
    ) {
      continue;
    }

    const age =
      day - outcome.day;

    if (
      age < 1 ||
      age > 8
    ) {
      continue;
    }

    const weight =
      Math.pow(
        0.75,
        age
      );

    if (
      outcome.effectiveness <
      45
    ) {
      penalty +=
        weight * 14;
    } else if (
      outcome.effectiveness <
      60
    ) {
      penalty +=
        weight * 6;
    }
  }

  return {
    penalty,

    note:
      penalty > 0
        ? `repeating a weak recent result (-${Math.round(
            penalty
          )})`
        : "",
  };
}

function targetProfile(
  target: Character
): string {
  return [
    ...target.capabilities,
    ...target.resources,
    ...target.knowledge,
  ]
    .join(" ")
    .toLowerCase();
}

function needFitWith(
  mind: MindState,
  target: Character
): string | null {
  const profile =
    targetProfile(target);

  for (
    const need of
      mind.informationNeeds
  ) {
    if (
      profile.includes(
        need.topic
      )
    ) {
      return need.topic;
    }
  }

  return null;
}

function scoreTalkTarget(
  character: Character,
  target: Character,
  mind: MindState,
  day: number
): {
  score: number;
  factors: string[];
} {
  const factors: string[] =
    [];

  let score = 0;

  const relationship =
    getRelationship(
      character,
      target.id
    );

  if (relationship) {
    score +=
      relationship.trust *
        0.35 -
      relationship.suspicion *
        0.25;

    factors.push(
      `trust ${relationship.trust}, suspicion ${relationship.suspicion}`
    );
  }

  const fit =
    needFitWith(
      mind,
      target
    );

  if (fit) {
    score += 25;
    factors.push(
      `${target.name} may know about ${fit}`
    );
  }

  const recentTalks =
    character.actionHistory.filter(
      (outcome) =>
        outcome.action ===
          "TALK" &&
        outcome.targetId ===
          target.id &&
        day -
          outcome.day <=
          3
    ).length;

  if (recentTalks > 0) {
    score -=
      recentTalks * 14;
    factors.push(
      "talked recently"
    );
  }

  score +=
    motiveStrength(
      mind,
      "LOYALTY"
    ) *
      0.15 +
    motiveStrength(
      mind,
      "PROTECTION"
    ) *
      0.1;

  return {
    score,
    factors,
  };
}

function scoreFollowTarget(
  character: Character,
  target: Character,
  mind: MindState,
  day: number
): {
  score: number;
  factors: string[];
} {
  const factors: string[] =
    [];

  let score = 0;

  const relationship =
    getRelationship(
      character,
      target.id
    );

  if (relationship) {
    score +=
      relationship.suspicion *
        0.5 -
      relationship.trust *
        0.15;

    factors.push(
      `suspicion ${relationship.suspicion}`
    );
  }

  score +=
    motiveStrength(
      mind,
      "CURIOSITY"
    ) * 0.15;

  if (
    needFitWith(
      mind,
      target
    )
  ) {
    score += 15;
    factors.push(
      "may advance an information need"
    );
  }

  const recentFollows =
    character.actionHistory.filter(
      (outcome) =>
        outcome.action ===
          "FOLLOW" &&
        outcome.targetId ===
          target.id &&
        day -
          outcome.day <=
          3
    ).length;

  if (recentFollows > 0) {
    score -=
      recentFollows * 16;
    factors.push(
      "already followed recently"
    );
  }

  return {
    score,
    factors,
  };
}

export function bestTarget(
  world: WorldState,
  character: Character,
  mind: MindState,
  day: number,
  kind: "TALK" | "FOLLOW"
):
  | {
      targetId: string;
      score: number;
      factors: string[];
    }
  | undefined {
  let best:
    | {
        targetId: string;
        score: number;
        factors: string[];
      }
    | undefined;

  for (
    const other of
      othersAt(
        world,
        character
      )
  ) {
    const scored =
      kind === "TALK"
        ? scoreTalkTarget(
            character,
            other,
            mind,
            day
          )
        : scoreFollowTarget(
            character,
            other,
            mind,
            day
          );

    if (
      !best ||
      scored.score >
        best.score
    ) {
      best = {
        targetId:
          other.id,
        score:
          scored.score,
        factors:
          scored.factors,
      };
    }
  }

  return best;
}

function scoreDestination(
  world: WorldState,
  character: Character,
  destinationId: string,
  mind: MindState,
  strategyId: StrategyId,
  day: number
): {
  score: number;
  factors: string[];
} {
  const factors: string[] =
    [];

  let score = 0;

  if (
    strategyId ===
      "direct-investigation" &&
    destinationId ===
      "company-office"
  ) {
    score += 30;
    factors.push(
      "relevant to investigation"
    );
  }

  if (
    strategyId ===
    "exploration"
  ) {
    score += 18;
  }

  if (
    strategyId ===
      "social-contact" &&
    destinationId ===
      "campus-cafe"
  ) {
    score += 22;
    factors.push(
      "good place to talk"
    );
  }

  for (
    const other of
      world.characters
  ) {
    if (
      other.id ===
        character.id ||
      other.location !==
        destinationId
    ) {
      continue;
    }

    const relationship =
      getRelationship(
        character,
        other.id
      );

    score +=
      8 +
      (relationship
        ? relationship.trust *
            0.25 -
          relationship.suspicion *
            0.1
        : 0);

    factors.push(
      `${other.name} is there`
    );
  }

  const unknownLeads =
    getUnknownItems(
      INVESTIGATION_POOL,
      destinationId,
      character
    ).length +
    getUnknownItems(
      SEARCH_POOL,
      destinationId,
      character
    ).length;

  if (
    mind.informationNeeds
      .length > 0 &&
    unknownLeads > 0
  ) {
    score += Math.min(
      25,
      unknownLeads * 6
    );

    factors.push(
      `${unknownLeads} unknown lead(s) there`
    );
  }

  const lastVisit =
    [
      ...character.actionHistory,
    ]
      .reverse()
      .find(
        (outcome) =>
          outcome.action ===
            "MOVE" &&
          outcome.locationId ===
            destinationId
      );

  const daysSince = lastVisit
    ? day - lastVisit.day
    : 99;

  /*
   * Novelty: places this character has never moved to
   * pull harder than places already seen.
   */
  if (!lastVisit) {
    score += 26;
    factors.push("never been there");
  }

  score +=
    12 *
    Math.pow(
      0.8,
      Math.min(
        daysSince,
        10
      )
    );

  /*
   * Bounce guard: mechanically hopping back to
   * the place just left is heavily penalized.
   */
  if (
    lastVisit &&
    daysSince <= 1
  ) {
    score -= 22;
    factors.push(
      "just came from there"
    );
  }

  const fear =
    motiveStrength(
      mind,
      "FEAR"
    );

  score -=
    locationRisk(
      destinationId
    ) *
    (fear / 100) *
    0.35;

  if (
    locationRisk(
      destinationId
    ) >= 40 &&
    motiveStrength(
      mind,
      "SELF_PRESERVATION"
    ) > 65
  ) {
    score -= 12;
    factors.push(
      "feels dangerous"
    );
  }

  return {
    score,
    factors,
  };
}

function bestDestination(
  world: WorldState,
  character: Character,
  mind: MindState,
  strategyId: StrategyId,
  day: number
):
  | {
      destinationId: string;
      score: number;
      factors: string[];
    }
  | undefined {
  const current =
    world.locations.find(
      (location) =>
        location.id ===
        character.location
    );

  if (!current) {
    return undefined;
  }

  let best:
    | {
        destinationId: string;
        score: number;
        factors: string[];
      }
    | undefined;

  for (
    const destinationId of
      current.connectedTo
  ) {
    const scored =
      scoreDestination(
        world,
        character,
        destinationId,
        mind,
        strategyId,
        day
      );

    if (
      !best ||
      scored.score >
        best.score
    ) {
      best = {
        destinationId,
        score:
          scored.score,
        factors:
          scored.factors,
      };
    }
  }

  /*
   * If no destination is actually attractive,
   * staying put is a legitimate decision —
   * MOVE is not chosen mechanically.
   */
  if (
    best &&
    best.score < 8
  ) {
    return undefined;
  }

  return best;
}

type Candidate = {
  action: ActionType;
  score: number;
  targetId?: string;
  destinationId?: string;
  factors: string[];
};

function buildCandidates(
  world: WorldState,
  character: Character,
  mind: MindState,
  strategyId: StrategyId
): Candidate[] {
  const day = world.day;

  const candidates: Candidate[] =
    [];

  const curiosity =
    motiveStrength(
      mind,
      "CURIOSITY"
    );

  const goal =
    motiveStrength(
      mind,
      "GOAL"
    );

  const selfPreservation =
    motiveStrength(
      mind,
      "SELF_PRESERVATION"
    );

  const fear =
    motiveStrength(
      mind,
      "FEAR"
    );

  const topNeed =
    mind.informationNeeds[0];

  const unknownAtLocation = (
    pool: typeof INVESTIGATION_POOL
  ) =>
    getUnknownItems(
      pool,
      character.location,
      character
    ).length;

  for (
    const [
      action,
      affinity,
    ] of Object.entries(
      STRATEGY_ACTIONS[
        strategyId
      ]
    ) as [
      ActionType,
      number
    ][]
  ) {
    const strategy =
      character.strategies.find(
        (item) =>
          item.id ===
          strategyId
      );

    let score =
      affinity +
      (strategy?.effectiveness ??
        50) *
        0.25;

    const factors: string[] =
      [];

    const trend =
      outcomeTrend(
        character,
        action,
        day
      );

    /*
     * Recent outcomes of this action directly shift its
     * attractiveness (recency-weighted, see outcomeTrend).
     */
    score += trend.component;

    if (
      trend.note
    ) {
      factors.push(
        trend.note
      );
    }

    const stale =
      staleRepeatPenalty(
        character,
        action,
        day
      );

    score -=
      stale.penalty;

    if (
      stale.note
    ) {
      factors.push(
        stale.note
      );
    }

    switch (action) {
      case "INVESTIGATE": {
        if (
          !character.capabilities.includes(
            "investigation"
          )
        ) {
          continue;
        }

        score +=
          curiosity *
            0.4 +
          goal *
            0.2;

        const unknown =
          unknownAtLocation(
            INVESTIGATION_POOL
          );

        if (
          unknown === 0
        ) {
          score -= 35;
          factors.push(
            "no fresh leads here"
          );
        } else {
          score +=
            Math.min(
              20,
              unknown * 8
            );

          factors.push(
            `${unknown} lead(s) not yet pursued`
          );
        }

        if (
          topNeed
        ) {
          score +=
            topNeed.strength *
            0.15;
        }

        break;
      }

      case "SEARCH": {
        if (
          !character.capabilities.includes(
            "investigation"
          )
        ) {
          continue;
        }

        score +=
          curiosity *
          0.3;

        const unknown =
          unknownAtLocation(
            SEARCH_POOL
          );

        if (
          unknown === 0
        ) {
          score -= 30;
          factors.push(
            "nothing new to find here"
          );
        } else {
          score +=
            Math.min(
              16,
              unknown * 7
            );
        }

        break;
      }

      case "OBSERVE": {
        score +=
          curiosity *
            0.2 +
          selfPreservation *
            0.15;

        const unknown =
          unknownAtLocation(
            SEARCH_POOL
          );

        if (
          unknown > 0
        ) {
          score +=
            Math.min(
              12,
              unknown * 5
            );

          factors.push(
            "something to notice here"
          );
        }

        break;
      }

      case "TALK": {
        const target =
          bestTarget(
            world,
            character,
            mind,
            day,
            "TALK"
          );

        if (
          !target
        ) {
          continue;
        }

        score +=
          target.score;

        factors.push(
          ...target.factors
        );

        candidates.push({
          action,
          score,
          targetId:
            target.targetId,
          factors,
        });

        continue;
      }

      case "FOLLOW": {
        const target =
          bestTarget(
            world,
            character,
            mind,
            day,
            "FOLLOW"
          );

        if (
          !target
        ) {
          continue;
        }

        score +=
          target.score;

        if (
          fear > 60
        ) {
          score -= 10;
        }

        /*
         * Exposure: if recent follows of this target were
         * noticed or provoked a reaction, following again
         * is riskier. Driven by outcomes, not a counter.
         */
        for (
          const past of
            character.actionHistory
        ) {
          if (
            past.action !==
              "FOLLOW" ||
            past.targetId !==
              target.targetId
          ) {
            continue;
          }

          const age =
            day - past.day;

          if (
            age < 1 ||
            age > 8 ||
            !past.targetNoticed
          ) {
            continue;
          }

          const exposure =
            Math.pow(0.8, age) *
            (8 +
              past.risk * 0.15 +
              (past.targetReacted
                ? 6
                : 0));

          score -= exposure;
          factors.push(
            "was noticed following recently"
          );
        }

        factors.push(
          ...target.factors
        );

        candidates.push({
          action,
          score,
          targetId:
            target.targetId,
          factors,
        });

        continue;
      }

      case "MOVE": {
        const destination =
          bestDestination(
            world,
            character,
            mind,
            strategyId,
            day
          );

        if (
          !destination
        ) {
          continue;
        }

        /*
         * Restlessness: the longer recent outcomes have
         * yielded nothing new, the more a change of
         * place is worth. Driven purely by outcomes.
         */
        let noNewStreak = 0;

        for (
          let i =
            character.actionHistory
              .length - 1;
          i >= 0;
          i--
        ) {
          if (
            character.actionHistory[i]
              .newInformation
          ) {
            break;
          }

          noNewStreak++;
        }

        if (noNewStreak >= 2) {
          score += Math.min(
            32,
            noNewStreak * 5
          );

          factors.push(
            "nothing new lately, wants a change of place"
          );
        }

        score +=
          destination.score;

        factors.push(
          ...destination.factors
        );

        candidates.push({
          action,
          score,
          destinationId:
            destination.destinationId,
          factors,
        });

        continue;
      }

      case "WAIT": {
        score +=
          selfPreservation *
            0.25 +
          fear *
            0.15;

        factors.push(
          "low exposure"
        );

        break;
      }
    }

    candidates.push({
      action,
      score,
      factors,
    });
  }

  /*
   * Fallbacks under every strategy so a character
   * with nothing better to do still does something
   * sensible instead of freezing.
   */
  const observeTrend =
    outcomeTrend(
      character,
      "OBSERVE",
      day
    );

  candidates.push({
    action: "OBSERVE",
    score:
      20 +
      curiosity *
        0.15 +
      observeTrend.component,
    factors: [
      "fallback",
    ],
  });

  candidates.push({
    action: "WAIT",
    score:
      12 +
      selfPreservation *
        0.2,
    factors: [
      "fallback",
    ],
  });

  return candidates;
}

export function getLegalActions(
  world: WorldState,
  character: Character
): ActionType[] {
  const legal: ActionType[] = [
    "WAIT",
    "OBSERVE",
  ];

  if (
    character.capabilities.includes(
      "investigation"
    )
  ) {
    legal.push(
      "INVESTIGATE",
      "SEARCH"
    );
  }

  const location =
    world.locations.find(
      (item) =>
        item.id ===
        character.location
    );

  if (
    location &&
    location.connectedTo
      .length > 0
  ) {
    legal.push("MOVE");
  }

  if (
    othersAt(
      world,
      character
    ).length > 0
  ) {
    legal.push(
      "TALK",
      "FOLLOW"
    );
  }

  return legal;
}

export function chooseAction(
  world: WorldState,
  character: Character
): Decision {
  const mind =
    buildMindState(
      world,
      character
    );

  const {
    strategyId,
  } =
    chooseStrategy(
      world,
      character,
      mind
    );

  const strategy =
    character.strategies.find(
      (item) =>
        item.id ===
        strategyId
    );

  const candidates =
    buildCandidates(
      world,
      character,
      mind,
      strategyId
    );

  let best: Candidate | null =
    null;

  for (
    const candidate of
      candidates
  ) {
    const tied =
      best &&
      candidate.score ===
        best.score;

    if (
      !best ||
      candidate.score >
        best.score ||
      (tied &&
        hash01(
          character.id,
          String(world.day),
          candidate.action,
          candidate.targetId ??
            "",
          candidate.destinationId ??
            ""
        ) >
          hash01(
            character.id,
            String(world.day),
            best.action,
            best.targetId ??
              "",
            best.destinationId ??
              ""
          ))
    ) {
      best =
        candidate;
    }
  }

  if (
    !best ||
    best.score <= 4
  ) {
    const threatHigh =
      motiveStrength(
        mind,
        "SELF_PRESERVATION"
      ) > 60;

    best = {
      action: threatHigh
        ? "WAIT"
        : "OBSERVE",

      score: 5,

      factors: [
        "nothing compelling",
      ],
    };
  }

  const reason =
    `${character.name} chose ${
      best.action
    } (strategy: ${
      strategy?.label ??
      strategyId
    }). ${
      best.factors
        .filter(Boolean)
        .slice(
          0,
          3
        )
        .join(
          "; "
        ) ||
      "weighing goals against circumstances"
    }.`;

  return {
    action:
      best.action,

    reason,

    score:
      Math.round(
        best.score
      ),

    strategyId,

    targetId:
      best.targetId,

    destinationId:
      best.destinationId,
  };
}

export function chooseActions(
  world: WorldState
): Record<string, Decision> {
  const decisions: Record<
    string,
    Decision
  > = {};

  for (
    const character of
      world.characters
  ) {
    decisions[
      character.id
    ] =
      chooseAction(
        world,
        character
      );
  }

  return decisions;
}
