import type {
  ActionType,
  Character,
  WorldState,
} from "@/lib/simulation/types";

import {
  buildMindState,
  type MindState,
  type Motive,
} from "./mind";

export type Decision = {
  action: ActionType;
  reason: string;
  score: number;
};

function hasCapability(
  character: Character,
  capability: string
): boolean {
  return character.capabilities.some(
    (item) =>
      item.toLowerCase() ===
      capability.toLowerCase()
  );
}

function recentlyDid(
  character: Character,
  action: ActionType
): boolean {
  return character.recentActions
    .slice(-3)
    .includes(action);
}

function getRelationship(
  character: Character,
  targetId: string
) {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId ===
      targetId
  );
}

function sameLocation(
  first: Character,
  second: Character
): boolean {
  return (
    first.location ===
    second.location
  );
}

function getNearbyCharacter(
  world: WorldState,
  character: Character
): Character | undefined {
  return world.characters.find(
    (other) =>
      other.id !== character.id &&
      sameLocation(
        character,
        other
      )
  );
}

function getMotiveStrength(
  mind: MindState,
  type: Motive["type"]
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

function getMemorySignal(
  world: WorldState,
  character: Character,
  keywords: string[]
): number {
  const memories =
    character.memories ?? [];

  let signal = 0;

  for (
    const memory of memories
  ) {
    const summary =
      memory.summary.toLowerCase();

    const matches =
      keywords.filter(
        (keyword) =>
          summary.includes(
            keyword
          )
      ).length;

    if (matches === 0) {
      continue;
    }

    const age = Math.max(
      0,
      world.day - memory.day
    );

    const recencyMultiplier =
      age === 0
        ? 1
        : age === 1
          ? 0.85
          : age <= 3
            ? 0.65
            : 0.4;

    signal +=
      memory.importance *
      (memory.confidence / 100) *
      matches *
      recencyMultiplier;
  }

  return Math.min(
    100,
    signal
  );
}

/**
 * Determine which actions are physically
 * possible for the character.
 *
 * This function does not decide what the
 * character wants to do.
 */
export function getLegalActions(
  world: WorldState,
  character: Character
): ActionType[] {
  const actions: ActionType[] = [
    "WAIT",
    "OBSERVE",
  ];

  if (
    hasCapability(
      character,
      "investigation"
    )
  ) {
    actions.push(
      "INVESTIGATE",
      "SEARCH"
    );
  }

  const hasConnectedLocation =
    world.locations.some(
      (location) =>
        location.id ===
          character.location &&
        location.connectedTo
          .length > 0
    );

  if (
    hasConnectedLocation
  ) {
    actions.push("MOVE");
  }

  const nearby =
    getNearbyCharacter(
      world,
      character
    );

  if (nearby) {
    actions.push(
      "TALK",
      "FOLLOW"
    );
  }

  return actions;
}

function scoreAction(
  world: WorldState,
  character: Character,
  action: ActionType,
  mind: MindState
): number {
  const nearby =
    getNearbyCharacter(
      world,
      character
    );

  const relationship =
    nearby
      ? getRelationship(
          character,
          nearby.id
        )
      : undefined;

  const curiosity =
    getMotiveStrength(
      mind,
      "CURIOSITY"
    );

  const selfPreservation =
    getMotiveStrength(
      mind,
      "SELF_PRESERVATION"
    );

  const protection =
    getMotiveStrength(
      mind,
      "PROTECTION"
    );

  const loyalty =
    getMotiveStrength(
      mind,
      "LOYALTY"
    );

  const goal =
    getMotiveStrength(
      mind,
      "GOAL"
    );

  const fear =
    getMotiveStrength(
      mind,
      "FEAR"
    );

  let score = 0;

  switch (action) {
    case "WAIT":
      score += 10;

      score +=
        selfPreservation *
        0.12;

      break;

    case "OBSERVE":
      score += 15;

      score +=
        curiosity *
        0.35;

      score +=
        selfPreservation *
        0.2;

      break;

    case "INVESTIGATE":
      score += 20;

      score +=
        curiosity *
        0.75;

      score +=
        goal *
        0.15;

      score +=
        getMemorySignal(
          world,
          character,
          [
            "evidence",
            "investigated",
            "discovered",
            "searched",
          ]
        ) *
        0.35;

      break;

    case "SEARCH":
      score += 15;

      score +=
        curiosity *
        0.55;

      score +=
        getMemorySignal(
          world,
          character,
          [
            "evidence",
            "searched",
            "discovered",
          ]
        ) *
        0.3;

      break;

    case "TALK":
      score += 25;

      score +=
        loyalty *
        0.35;

      score +=
        protection *
        0.25;

      if (relationship) {
        score +=
          relationship.trust *
          0.3;

        score -=
          relationship.suspicion *
          0.15;
      }

      score -=
        getMemorySignal(
          world,
          character,
          [
            "following",
            "monitoring",
            "threat",
            "danger",
          ]
        ) *
        0.2;

      break;

    case "FOLLOW":
      score += 10;

      score +=
        curiosity *
        0.45;

      score +=
        goal *
        0.15;

      if (relationship) {
        score +=
          relationship.suspicion *
          0.7;

        score -=
          relationship.trust *
          0.15;
      }

      score +=
        getMemorySignal(
          world,
          character,
          [
            "following",
            "monitoring",
            "hiding",
            "suspicious",
            "discovered",
          ]
        ) *
        0.35;

      break;

    case "MOVE":
      score += 15;

      score +=
        selfPreservation *
        0.3;

      score +=
        fear *
        0.15;

      score -=
        curiosity *
        0.15;

      break;
  }

  if (
    recentlyDid(
      character,
      action
    )
  ) {
    score -= 18;
  }

  const threatSignal =
    getMemorySignal(
      world,
      character,
      [
        "following",
        "monitoring",
        "danger",
        "threat",
        "caught",
        "exposed",
      ]
    );

  if (
    threatSignal >= 50
  ) {
    if (
      action === "WAIT"
    ) {
      score -= 20;
    }

    if (
      action === "OBSERVE"
    ) {
      score += 10;
    }

    if (
      action === "MOVE"
    ) {
      score +=
        selfPreservation *
        0.2;
    }
  }

  return score;
}

function getReason(
  character: Character,
  action: ActionType,
  mind: MindState
): string {
  const strongestMotive =
    [...mind.motives].sort(
      (a, b) =>
        b.strength -
        a.strength
    )[0];

  if (!strongestMotive) {
    return `${character.name} chose ${action}.`;
  }

  return `${character.name} chose ${action} because of ${strongestMotive.type.toLowerCase()}: ${strongestMotive.description}`;
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

  const legalActions =
    getLegalActions(
      world,
      character
    );

  const scored =
    legalActions.map(
      (action) => ({
        action,
        score: scoreAction(
          world,
          character,
          action,
          mind
        ),
      })
    );

  scored.sort(
    (a, b) =>
      b.score -
      a.score
  );

  const selected =
    scored[0];

  return {
    action:
      selected.action,

    reason:
      getReason(
        character,
        selected.action,
        mind
      ),

    score:
      Math.round(
        selected.score
      ),
  };
}

export function chooseActions(
  world: WorldState
): Record<
  string,
  Decision
> {
  const decisions: Record<
    string,
    Decision
  > = {};

  for (
    const character of
      world.characters
  ) {
    decisions[character.id] =
      chooseAction(
        world,
        character
      );
  }

  return decisions;
}
