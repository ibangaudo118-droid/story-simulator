import type {
  ActionType,
  Character,
  WorldState,
} from "./types";

import {
  MindState,
  buildMindState,
} from "./mind";

export type Decision = {
  action: ActionType;
  reason: string;
  score: number;
};

/* =========================================================
   HELPERS
========================================================= */

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

function getMotiveStrength(
  mind: MindState,
  type: MotiveType
) {
  return mind.motives
    .filter(
      (motive) =>
        motive.type === type
    )
    .reduce(
      (
        strongest,
        motive
      ) =>
        Math.max(
          strongest,
          motive.strength
        ),
      0
    );
}

type MotiveType =
  | "GOAL"
  | "FEAR"
  | "CURIOSITY"
  | "PROTECTION"
  | "SELF_PRESERVATION"
  | "LOYALTY";

/* =========================================================
   LEGAL ACTIONS
========================================================= */

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
        item.id ===
        character.location
    );

  /* -------------------------------------------------------
     Investigation
  ------------------------------------------------------- */

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

  /* -------------------------------------------------------
     Movement
  ------------------------------------------------------- */

  if (
    location?.connectedTo &&
    location.connectedTo.length > 0
  ) {
    actions.push("MOVE");
  }

  /* -------------------------------------------------------
     Character interaction
  ------------------------------------------------------- */

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

/* =========================================================
   SCORE ACTION
========================================================= */

function scoreAction(
  world: WorldState,
  character: Character,
  mind: MindState,
  action: ActionType
): Decision {
  let score = 0;

  const reasons: string[] = [];

  const nearbyCharacter =
    getNearbyCharacter(
      world,
      character
    );

  const nearbyRelationship =
    nearbyCharacter
      ? getRelationship(
          character,
          nearbyCharacter.id
        )
      : undefined;

  const suspicion =
    nearbyRelationship?.suspicion ??
    0;

  const trust =
    nearbyRelationship?.trust ??
    0;

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

  const curiosity =
    getMotiveStrength(
      mind,
      "CURIOSITY"
    );

  const protection =
    getMotiveStrength(
      mind,
      "PROTECTION"
    );

  const selfPreservation =
    getMotiveStrength(
      mind,
      "SELF_PRESERVATION"
    );

  const loyalty =
    getMotiveStrength(
      mind,
      "LOYALTY"
    );

  /* =======================================================
     WAIT
  ======================================================= */

  if (action === "WAIT") {
    score += 10;

    reasons.push(
      "Waiting avoids unnecessary risk."
    );

    score +=
      selfPreservation * 0.08;

    score +=
      protection * 0.05;

    score +=
      fear * 0.05;
  }

  /* =======================================================
     OBSERVE
  ======================================================= */

  if (action === "OBSERVE") {
    score += 25;

    reasons.push(
      "Observing can reveal information without directly creating much risk."
    );

    score +=
      curiosity * 0.25;

    score +=
      selfPreservation * 0.1;
  }

  /* =======================================================
     INVESTIGATE
  ======================================================= */

  if (action === "INVESTIGATE") {
    if (
      hasCapability(
        character,
        "investigation"
      )
    ) {
      score += 45;

      reasons.push(
        "The character has the capability to investigate."
      );
    }

    score +=
      goal * 0.45;

    score +=
      curiosity * 0.4;

    if (
      world.evidence.length === 0
    ) {
      score += 15;

      reasons.push(
        "There is little concrete evidence, increasing the value of investigation."
      );
    } else {
      score += 10;

      reasons.push(
        "Existing evidence gives the investigation something to build on."
      );
    }

    score -=
      selfPreservation * 0.15;

    score -=
      fear * 0.1;
  }

  /* =======================================================
     SEARCH
  ======================================================= */

  if (action === "SEARCH") {
    if (
      hasCapability(
        character,
        "investigation"
      )
    ) {
      score += 35;
    }

    score +=
      goal * 0.3;

    score +=
      curiosity * 0.4;

    if (
      world.evidence.length === 0
    ) {
      score += 20;

      reasons.push(
        "Searching could produce the first useful clue."
      );
    } else {
      score += 10;

      reasons.push(
        "Searching could connect existing evidence to something new."
      );
    }

    score -=
      selfPreservation * 0.1;
  }

  /* =======================================================
     TALK
  ======================================================= */

  if (action === "TALK") {
    if (!nearbyCharacter) {
      score = -Infinity;

      reasons.push(
        "There is nobody nearby to talk to."
      );
    } else {
      score += 25;

      score +=
        curiosity * 0.25;

      score +=
        trust * 0.25;

      score +=
        loyalty * 0.2;

      /*
       * Suspicion can make conversation more
       * valuable because the character wants
       * information or clarification.
       */
      score +=
        suspicion * 0.35;

      /*
       * But high self-preservation can make
       * direct conversation dangerous.
       */
      score -=
        selfPreservation * 0.15;

      if (suspicion >= 70) {
        reasons.push(
          `${nearbyCharacter.name}'s behaviour creates a strong reason to question them.`
        );
      } else if (trust >= 60) {
        reasons.push(
          `${nearbyCharacter.name} is trusted enough for conversation to be useful.`
        );
      } else {
        reasons.push(
          "Conversation may reveal information or change the relationship."
        );
      }
    }
  }

  /* =======================================================
     FOLLOW
  ======================================================= */

  if (action === "FOLLOW") {
    if (!nearbyCharacter) {
      score = -Infinity;

      reasons.push(
        "There is nobody nearby to follow."
      );
    } else {
      score += 10;

      /*
       * Following becomes more attractive when
       * suspicion or curiosity is high.
       */
      score +=
        suspicion * 0.75;

      score +=
        curiosity * 0.35;

      /*
       * Trust reduces the need to secretly follow.
       */
      score -=
        trust * 0.2;

      /*
       * Fear and self-preservation discourage
       * risky pursuit.
       */
      score -=
        selfPreservation * 0.3;

      score -=
        fear * 0.15;

      if (suspicion >= 70) {
        reasons.push(
          `${nearbyCharacter.name}'s behaviour gives the character a strong reason to keep watching them.`
        );
      } else if (suspicion >= 40) {
        reasons.push(
          `Following ${nearbyCharacter.name} could reduce uncertainty.`
        );
      } else {
        reasons.push(
          "There is not yet a strong reason to follow someone."
        );
      }
    }
  }

  /* =======================================================
     MOVE
  ======================================================= */

  if (action === "MOVE") {
    score += 20;

    reasons.push(
      "Moving creates access to different people and information."
    );

    score +=
      goal * 0.15;

    score +=
      curiosity * 0.15;

    /*
     * Movement can also become attractive when
     * staying put feels unsafe.
     */
    score +=
      selfPreservation * 0.15;

    /*
     * But fear can make movement less attractive
     * when the destination is unknown.
     */
    score -=
      fear * 0.1;
  }

  /* =======================================================
     REPETITION PENALTY
  ======================================================= */

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

  const recentCount =
    character.recentActions.filter(
      (recentAction) =>
        recentAction === action
    ).length;

  if (recentCount >= 2) {
    score -=
      recentCount * 10;

    reasons.push(
      "Repeated behaviour is becoming less attractive."
    );
  }

  /* =======================================================
     MOTIVE EFFECTS
  ======================================================= */

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
      action === "WAIT"
    ) {
      score += 10;

      reasons.push(
        "The character prefers safer ways of gathering information."
      );
    }
  }

  if (
    protection >= 80
  ) {
    if (
      action === "WAIT" ||
      action === "OBSERVE"
    ) {
      score += 8;

      reasons.push(
        "Protection encourages cautious behaviour."
      );
    }

    if (action === "TALK") {
      score += 5;

      reasons.push(
        "Protective motives can make direct communication useful."
      );
    }
  }

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

  if (
    loyalty >= 70 &&
    action === "TALK"
  ) {
    score += 5;

    reasons.push(
      "Loyalty encourages maintaining important relationships."
    );
  }

  if (fear >= 80) {
    if (
      action === "FOLLOW" ||
      action === "INVESTIGATE"
    ) {
      score -= 10;

      reasons.push(
        "Fear discourages actions that could expose the character to danger."
      );
    }

    if (
      action === "WAIT" ||
      action === "OBSERVE"
    ) {
      score += 5;
    }
  }

  /* =======================================================
     FINAL SCORE
  ======================================================= */

  if (score !== -Infinity) {
    score = Math.round(score);
  }

  if (reasons.length === 0) {
    reasons.push(
      "The action is currently the most useful legal option."
    );
  }

  return {
    action,
    reason: reasons.join(" "),
    score,
  };
}

/* =========================================================
   CHOOSE ONE ACTION
========================================================= */

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

/* =========================================================
   CHOOSE ACTIONS FOR ALL CHARACTERS
========================================================= */

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
