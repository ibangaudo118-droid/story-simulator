import {
  ActionType,
  Character,
  WorldState,
} from "./engine";

import {
  MindState,
  buildMindState,
} from "./mind";

export type Decision = {
  action: ActionType;
  reason: string;
  score: number;
};

function clamp(value: number) {
  return Math.max(
    0,
    Math.min(100, value)
  );
}

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

function getRelationship(
  character: Character,
  targetId: string
) {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId === targetId
  );
}

function getCharacter(
  world: WorldState,
  id: string
) {
  return world.characters.find(
    (character) =>
      character.id === id
  );
}

function sameLocation(
  first: Character,
  second: Character
) {
  return (
    first.location ===
    second.location
  );
}

function getNearbyCharacter(
  world: WorldState,
  character: Character
) {
  return world.characters.find(
    (other) =>
      other.id !== character.id &&
      sameLocation(
        character,
        other
      )
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
    location?.connectedTo &&
    location.connectedTo.length > 0
  ) {
    actions.push("MOVE");
  }

  const nearbyCharacter =
    getNearbyCharacter(
      world,
      character
    );

  if (nearbyCharacter) {
    actions.push(
      "TALK",
      "FOLLOW"
    );
  }

  return actions;
}

function getMotiveStrength(
  mind: MindState,
  type: string
) {
  return mind.motives
    .filter(
      (motive) =>
        motive.type === type
    )
    .reduce(
      (total, motive) =>
        Math.max(
          total,
          motive.strength
        ),
      0
    );
}

function scoreAction(
  world: WorldState,
  character: Character,
  mind: MindState,
  action: ActionType
): Decision {
  let score = 0;

  let reasons: string[] = [];

  const nearbyCharacter =
    getNearbyCharacter(
      world,
      character
    );

  const zara =
    getCharacter(
      world,
      "zara"
    );

  const daniel =
    getCharacter(
      world,
      "daniel"
    );

  /*
   * BASE BEHAVIOUR
   */

  if (action === "WAIT") {
    score += 10;

    reasons.push(
      "Waiting avoids unnecessary risk."
    );
  }

  if (action === "OBSERVE") {
    score += 25;

    reasons.push(
      "Observing can reveal information without creating much risk."
    );
  }

  /*
   * INVESTIGATION
   */

  if (action === "INVESTIGATE") {
    if (
      hasCapability(
        character,
        "investigation"
      )
    ) {
      score += 55;

      reasons.push(
        "Investigation directly supports the character's ability to understand the situation."
      );
    }

    const goalStrength =
      getMotiveStrength(
        mind,
        "GOAL"
      );

    const curiosityStrength =
      getMotiveStrength(
        mind,
        "CURIOSITY"
      );

    score +=
      goalStrength * 0.45;

    score +=
      curiosityStrength * 0.25;

    if (
      world.evidence.length === 0
    ) {
      score += 20;

      reasons.push(
        "There is still no concrete evidence."
      );
    } else {
      score += 10;

      reasons.push(
        "Existing evidence gives the investigation something to build on."
      );
    }

    if (
      character.id === "zara"
    ) {
      score += 20;

      reasons.push(
        "Zara's main objective is to uncover what the company is doing."
      );
    }
  }

  /*
   * SEARCH
   */

  if (action === "SEARCH") {
    if (
      hasCapability(
        character,
        "investigation"
      )
    ) {
      score += 45;
    }

    const goalStrength =
      getMotiveStrength(
        mind,
        "GOAL"
      );

    score +=
      goalStrength * 0.3;

    if (
      world.evidence.length === 0
    ) {
      score += 20;

      reasons.push(
        "Searching could produce the first useful clue."
      );
    } else {
      score += 15;

      reasons.push(
        "Searching could connect existing evidence to something new."
      );
    }

    if (
      character.id === "zara"
    ) {
      score += 15;

      reasons.push(
        "Zara is actively looking for evidence."
      );
    }
  }

  /*
   * TALK
   */

  if (action === "TALK") {
    score += 30;

    if (!nearbyCharacter) {
      score = -Infinity;

      reasons.push(
        "There is nobody nearby to talk to."
      );
    } else {
      const relationship =
        getRelationship(
          character,
          nearbyCharacter.id
        );

      const suspicion =
        relationship?.suspicion ?? 0;

      const trust =
        relationship?.trust ?? 0;

      /*
       * Zara becomes more interested
       * in talking when suspicion rises.
       */

      if (
        character.id === "zara"
      ) {
        score +=
          suspicion * 0.65;

        score +=
          trust * 0.15;

        if (
          suspicion >= 70
        ) {
          score += 20;

          reasons.push(
            `${nearbyCharacter.name}'s behaviour has become suspicious enough to justify questioning them.`
          );
        } else if (
          suspicion >= 50
        ) {
          score += 10;

          reasons.push(
            `${nearbyCharacter.name} may know something useful.`
          );
        } else {
          score += 5;

          reasons.push(
            "Maintaining the relationship may reveal information later."
          );
        }
      }

      /*
       * Daniel's willingness to talk
       * decreases as exposure risk rises.
       */

      if (
        character.id === "daniel"
      ) {
        score +=
          trust * 0.25;

        score -=
          suspicion * 0.55;

        const selfPreservation =
          getMotiveStrength(
            mind,
            "SELF_PRESERVATION"
          );

        score -=
          selfPreservation * 0.2;

        if (
          suspicion >= 70
        ) {
          score -= 25;

          reasons.push(
            "Daniel fears that talking could expose what he knows."
          );
        } else if (
          trust >= 60
        ) {
          score += 15;

          reasons.push(
            "Daniel still has enough trust to maintain the relationship."
          );
        }
      }
    }
  }

  /*
   * FOLLOW
   */

  if (action === "FOLLOW") {
    if (!nearbyCharacter) {
      score = -Infinity;

      reasons.push(
        "There is nobody nearby to follow."
      );
    } else {
      const relationship =
        getRelationship(
          character,
          nearbyCharacter.id
        );

      const suspicion =
        relationship?.suspicion ?? 0;

      if (
        character.id === "zara"
      ) {
        score += 20;

        score +=
          suspicion * 0.85;

        if (
          suspicion >= 70
        ) {
          score += 30;

          reasons.push(
            "Zara's high suspicion makes following increasingly attractive."
          );
        } else if (
          suspicion >= 50
        ) {
          score += 15;

          reasons.push(
            "Zara has enough suspicion to consider following."
          );
        } else {
          score -= 15;

          reasons.push(
            "Zara has little reason to follow without stronger suspicion."
          );
        }
      }

      if (
        character.id === "daniel"
      ) {
        score -= 25;

        reasons.push(
          "Daniel has little reason to follow Zara right now."
        );
      }
    }
  }

  /*
   * MOVE
   */

  if (action === "MOVE") {
    score += 25;

    reasons.push(
      "Moving creates access to different people and information."
    );

    if (
      character.id === "zara"
    ) {
      const goalStrength =
        getMotiveStrength(
          mind,
          "GOAL"
        );

      score +=
        goalStrength * 0.15;

      if (
        world.evidence.length > 0
      ) {
        score += 15;

        reasons.push(
          "New evidence may require Zara to investigate another location."
        );
      }
    }

    if (
      character.id === "daniel"
    ) {
      const relationship =
        zara
          ? getRelationship(
              character,
              zara.id
            )
          : undefined;

      const suspicion =
        relationship?.suspicion ?? 0;

      if (
        suspicion >= 55
      ) {
        score +=
          suspicion * 0.45;

        reasons.push(
          "Daniel wants distance when he feels Zara is becoming suspicious."
        );
      }

      const selfPreservation =
        getMotiveStrength(
          mind,
          "SELF_PRESERVATION"
        );

      score +=
        selfPreservation * 0.15;
    }
  }

  /*
   * RECENT REPETITION
   */

  if (
    recentlyDid(
      character,
      action
    )
  ) {
    score -= 30;

    reasons.push(
      "The character recently performed this action, making repetition less attractive."
    );
  }

  /*
   * REPEATED ACTION PATTERNS
   */

  const recentCount =
    character.recentActions.filter(
      (recentAction) =>
        recentAction === action
    ).length;

  if (
    recentCount >= 2
  ) {
    score -=
      recentCount * 10;

    reasons.push(
      "Repeated behaviour is becoming less attractive."
    );
  }

  /*
   * SELF-PRESERVATION
   */

  const selfPreservation =
    getMotiveStrength(
      mind,
      "SELF_PRESERVATION"
    );

  if (
    selfPreservation >= 80
  ) {
    if (
      action === "FOLLOW" ||
      action === "INVESTIGATE"
    ) {
      score -= 15;

      reasons.push(
        "Self-preservation makes risky actions less attractive."
      );
    }

    if (
      action === "OBSERVE" ||
      action === "MOVE"
    ) {
      score += 10;

      reasons.push(
        "The character prefers actions that preserve safety."
      );
    }
  }

  /*
   * PROTECTION
   */

  const protection =
    getMotiveStrength(
      mind,
      "PROTECTION"
    );

  if (
    protection >= 80
  ) {
    if (
      action === "WAIT" ||
      action === "OBSERVE"
    ) {
      score += 8;

      reasons.push(
        "Protection makes cautious actions more attractive."
      );
    }
  }

  /*
   * CURIOSITY
   */

  const curiosity =
    getMotiveStrength(
      mind,
      "CURIOSITY"
    );

  if (
    curiosity >= 70
  ) {
    if (
      action === "INVESTIGATE" ||
      action === "SEARCH" ||
      action === "OBSERVE"
    ) {
      score += 10;

      reasons.push(
        "Curiosity increases the value of gathering information."
      );
    }
  }

  /*
   * LOYALTY
   */

  const loyalty =
    getMotiveStrength(
      mind,
      "LOYALTY"
    );

  if (
    loyalty >= 70 &&
    action === "TALK"
  ) {
    score += 5;

    reasons.push(
      "Loyalty encourages maintaining important relationships."
    );
  }

  /*
   * FEAR
   */

  const fear =
    getMotiveStrength(
      mind,
      "FEAR"
    );

  if (
    fear >= 80
  ) {
    if (
      action === "FOLLOW" ||
      action === "INVESTIGATE"
    ) {
      score -= 10;

      reasons.push(
        "Fear discourages actions that could expose the character."
      );
    }

    if (
      action === "WAIT"
    ) {
      score += 5;
    }
  }

  /*
   * MAKE SURE THE SCORE
   * IS ALWAYS USABLE.
   */

  if (
    score !== -Infinity
  ) {
    score = Math.round(
      score
    );
  }

  /*
   * FALLBACK REASON
   */

  if (
    reasons.length === 0
  ) {
    reasons.push(
      "The action is currently the most useful legal option."
    );
  }

  return {
    action,
    reason:
      reasons.join(" "),
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
