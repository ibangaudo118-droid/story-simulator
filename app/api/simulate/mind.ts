import type {
  Character,
  WorldState,
} from "./types";

export type Belief = {
  subject: string;
  belief: string;
  confidence: number;
};

export type Motive = {
  type:
    | "GOAL"
    | "FEAR"
    | "CURIOSITY"
    | "PROTECTION"
    | "SELF_PRESERVATION"
    | "LOYALTY";

  description: string;
  strength: number;
};

export type MindState = {
  characterId: string;
  beliefs: Belief[];
  motives: Motive[];
};

/* =========================================================
   HELPERS
========================================================= */

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function hasWord(
  value: string,
  words: string[]
) {
  const normalized = value.toLowerCase();

  return words.some((word) =>
    normalized.includes(word)
  );
}

/* =========================================================
   BUILD CHARACTER MIND
========================================================= */

export function buildMindState(
  world: WorldState,
  character: Character
): MindState {
  const beliefs: Belief[] = [];
  const motives: Motive[] = [];

  /* -------------------------------------------------------
     CORE GOAL
  ------------------------------------------------------- */

  if (character.goal.trim()) {
    motives.push({
      type: "GOAL",
      description: character.goal,
      strength: 80,
    });
  }

  /* -------------------------------------------------------
     CORE FEAR
  ------------------------------------------------------- */

  if (character.fear.trim()) {
    motives.push({
      type: "FEAR",
      description: character.fear,
      strength: 70,
    });
  }

  /* -------------------------------------------------------
     CURRENT PRIORITY
  ------------------------------------------------------- */

  if (character.currentPriority.trim()) {
    beliefs.push({
      subject: character.id,
      belief: `Current priority: ${character.currentPriority}`,
      confidence: 90,
    });

    if (
      hasWord(character.currentPriority, [
        "protect",
        "protecting",
        "safe",
        "safety",
        "defend",
        "help",
      ])
    ) {
      motives.push({
        type: "PROTECTION",
        description: character.currentPriority,
        strength: 75,
      });
    }

    if (
      hasWord(character.currentPriority, [
        "hide",
        "escape",
        "avoid",
        "survive",
        "stay safe",
      ])
    ) {
      motives.push({
        type: "SELF_PRESERVATION",
        description: character.currentPriority,
        strength: 75,
      });
    }
  }

  /* -------------------------------------------------------
     KNOWLEDGE → BELIEFS
  ------------------------------------------------------- */

  for (const knowledge of character.knowledge) {
    if (!knowledge.trim()) {
      continue;
    }

    beliefs.push({
      subject: "world",
      belief: knowledge,
      confidence: 75,
    });
  }

  /* -------------------------------------------------------
     RELATIONSHIPS → SOCIAL BELIEFS + MOTIVES
  ------------------------------------------------------- */

  for (const relationship of character.relationships) {
    const target = world.characters.find(
      (candidate) =>
        candidate.id === relationship.targetId
    );

    if (!target) {
      continue;
    }

    if (relationship.trust >= 60) {
      beliefs.push({
        subject: target.name,
        belief: `${target.name} is someone this character trusts.`,
        confidence: clamp(
          relationship.trust
        ),
      });

      motives.push({
        type: "LOYALTY",
        description:
          `Maintain trust with ${target.name}.`,
        strength: clamp(
          relationship.trust * 0.85
        ),
      });
    }

    if (relationship.suspicion >= 50) {
      beliefs.push({
        subject: target.name,
        belief:
          `${target.name} may be hiding something.`,
        confidence: clamp(
          relationship.suspicion
        ),
      });

      motives.push({
        type: "CURIOSITY",
        description:
          `Understand what ${target.name} may be hiding.`,
        strength: clamp(
          relationship.suspicion
        ),
      });
    }
  }

  /* -------------------------------------------------------
     CURIOSITY FROM BEHAVIOUR
  ------------------------------------------------------- */

  if (
    character.recentActions.includes(
      "INVESTIGATE"
    ) ||
    character.recentActions.includes(
      "SEARCH"
    )
  ) {
    motives.push({
      type: "CURIOSITY",
      description:
        "Understand what is happening before making the next decision.",
      strength: 65,
    });
  }

  /* -------------------------------------------------------
     INVESTIGATION CAPABILITY
  ------------------------------------------------------- */

  if (
    character.capabilities.some((capability) =>
      capability
        .toLowerCase()
        .includes("investigation")
    )
  ) {
    motives.push({
      type: "CURIOSITY",
      description:
        "Use available investigative ability to reduce uncertainty.",
      strength: 45,
    });
  }

  /* -------------------------------------------------------
     EMOTIONAL STATE
  ------------------------------------------------------- */

  const emotionalState =
    character.emotionalState.toLowerCase();

  if (
    hasWord(emotionalState, [
      "afraid",
      "fear",
      "nervous",
      "anxious",
      "threatened",
      "unsafe",
      "panicked",
      "worried",
    ])
  ) {
    motives.push({
      type: "SELF_PRESERVATION",
      description:
        "Avoid actions that could expose or endanger the character.",
      strength: 85,
    });
  }

  /* -------------------------------------------------------
     GOAL / FEAR SEMANTICS
  ------------------------------------------------------- */

  if (
    hasWord(character.goal, [
      "protect",
      "save",
      "defend",
      "help",
    ]) ||
    hasWord(character.fear, [
      "hurt",
      "harm",
      "danger",
      "lose",
    ])
  ) {
    motives.push({
      type: "PROTECTION",
      description:
        "Protect something important from harm.",
      strength: 65,
    });
  }

  if (
    hasWord(character.fear, [
      "exposed",
      "discovered",
      "caught",
      "danger",
      "death",
      "lose",
    ])
  ) {
    motives.push({
      type: "SELF_PRESERVATION",
      description:
        "Avoid consequences associated with the character's fears.",
      strength: 70,
    });
  }

  return {
    characterId: character.id,
    beliefs,
    motives,
  };
}

/* =========================================================
   BUILD ALL MIND STATES
========================================================= */

export function buildAllMindStates(
  world: WorldState
): MindState[] {
  return world.characters.map(
    (character) =>
      buildMindState(
        world,
        character
      )
  );
    }
