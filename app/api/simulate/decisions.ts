import {
  ActionType,
  Character,
  WorldState,
} from "./engine";

import {
  MindState,
  buildMindState,
} from "./mind";

type Decision = {
  action: ActionType;
  reason: string;
  score: number;
};

function hasCapability(
  character: Character,
  capability: string
) {
  return character.capabilities.some(
    (item) =>
      item
        .toLowerCase()
        .includes(
          capability.toLowerCase()
        )
  );
}

function recentlyDid(
  character: Character,
  action: ActionType
) {
  return character.recentActions.includes(
    action
  );
}

function sameLocation(
  first: Character,
  second: Character
) {
  return first.location === second.location;
}

function getRelationship(
  character: Character,
  targetId: string
) {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId === targetId
  );
}

function getLegalActions(
  world: WorldState,
  character: Character
): ActionType[] {
  const actions: ActionType[] = [
    "WAIT",
    "OBSERVE",
  ];

  const location =
    world.locations.find(
      (item) =>
        item.id === character.location
    );

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

  if (
    location?.connectedTo?.length
  ) {
    actions.push("MOVE");
  }

  const nearbyCharacter =
    world.characters.find(
      (other) =>
        other.id !== character.id &&
        sameLocation(
          character,
          other
        )
    );

  if (nearbyCharacter) {
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
  mind: MindState,
  action: ActionType
): Decision {
  let score = 0;

  let reason =
    "The action is currently possible.";

  const zara =
    world.characters.find(
      (item) => item.id === "zara"
    );

  const daniel =
    world.characters.find(
      (item) => item.id === "daniel"
    );

  const relationship =
    character.id === "zara" && daniel
      ? getRelationship(
          character,
          "daniel"
        )
      : character.id === "daniel" &&
        zara
      ? getRelationship(
          character,
          "zara"
        )
      : undefined;

  /*
   * OBSERVE
   *
   * Safe and useful, but rarely advances
   * the main goal dramatically.
   */
  if (action === "OBSERVE") {
    score += 25;

    reason =
      "Observing provides information without creating much risk.";
  }

  /*
   * WAIT
   *
   * Characters may wait when acting is risky.
   */
  if (action === "WAIT") {
    score += 15;

    reason =
      "Waiting allows the character to avoid unnecessary risk.";
  }

  /*
   * INVESTIGATE
   */
  if (action === "INVESTIGATE") {
    if (
      character.id === "zara"
    ) {
      score += 75;

      if (world.evidence.length === 0) {
        score += 25;

        reason =
          "Zara needs concrete evidence to understand what the company is doing.";
      } else {
        score += 10;

        reason =
          "Zara wants to connect the evidence she already has.";
      }

      if (
        mind.motives.some(
          (motive) =>
            motive.type ===
              "CURIOSITY" &&
            motive.strength >= 60
        )
      ) {
        score += 15;
      }
    }
  }

  /*
   * SEARCH
   */
  if (action === "SEARCH") {
    if (
      character.id === "zara"
    ) {
      score += 65;

      reason =
        "Searching may reveal information that supports the investigation.";

      if (
        world.evidence.length > 0
      ) {
        score += 15;
      }
    }
  }

  /*
   * TALK
   */
  if (action === "TALK") {
    score += 35;

    if (
      character.id === "zara" &&
      relationship
    ) {
      score +=
        relationship.suspicion * 0.5;

      if (
        relationship.suspicion >=
        60
      ) {
        score += 20;

        reason =
          "Zara wants to question Daniel because she suspects he is hiding something.";
      } else {
        score += 10;

        reason =
          "Zara wants to understand Daniel's involvement.";
      }
    }

    if (
      character.id === "daniel" &&
      relationship
    ) {
      if (
        relationship.suspicion >=
        55
      ) {
        score -= 30;

        reason =
          "Daniel is becoming afraid that talking to Zara could expose him.";
      } else {
        score += 25;

        reason =
          "Daniel wants to maintain Zara's trust.";
      }
    }
  }

  /*
   * FOLLOW
   */
  if (action === "FOLLOW") {
    if (
      character.id === "zara" &&
      relationship
    ) {
      score +=
        relationship.suspicion * 0.8;

      reason =
        "Zara's suspicion makes following Daniel increasingly attractive.";

      if (
        relationship.suspicion >=
        70
      ) {
        score += 25;
      }
    }

    if (
      character.id === "daniel"
    ) {
      score -= 20;

      reason =
        "Daniel has little reason to follow Zara right now.";
    }
  }

  /*
   * MOVE
   */
  if (action === "MOVE") {
    score += 30;

    if (
      character.id === "daniel"
    ) {
      if (
        relationship &&
        relationship.suspicion >=
          55
      ) {
        score += 35;

        reason =
          "Daniel wants distance from Zara because he fears exposure.";
      }
    }

    if (
      character.id === "zara"
    ) {
      if (
        world.evidence.length > 0
      ) {
        score += 15;

        reason =
          "Zara may need to move to another location to continue investigating.";
      }
    }
  }

  /*
   * Repeating the same action becomes
   * progressively less attractive.
   */
  if (
    recentlyDid(
      character,
      action
    )
  ) {
    score -= 25;

    reason +=
      " The character has just done this, making repetition less attractive.";
  }

  /*
   * Strong fear can override risky actions.
   */
  const selfPreservation =
    mind.motives.find(
      (motive) =>
        motive.type ===
        "SELF_PRESERVATION"
    );

  if (
    selfPreservation &&
    selfPreservation.strength >=
      85
  ) {
    if (
      action === "FOLLOW" ||
      action === "INVESTIGATE"
    ) {
      score -= 15;
    }

    if (
      action === "MOVE" ||
      action === "OBSERVE"
    ) {
      score += 10;
    }
  }

  return {
    action,
    reason,
    score,
  };
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

  const decisions =
    legalActions.map(
      (action) =>
        scoreAction(
          world,
          character,
          mind,
          action
        )
    );

  decisions.sort(
    (a, b) =>
      b.score - a.score
  );

  return decisions[0];
}

export function chooseActions(
  world: WorldState
) {
  const decisions: Record<
    string,
    Decision
  > = {};

  for (const character of world.characters) {
    decisions[character.id] =
      chooseAction(
        world,
        character
      );
  }

  return decisions;
}
