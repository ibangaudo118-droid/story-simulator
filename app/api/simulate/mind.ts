import type {
  Character,
  MemoryEntry,
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

function hasWord(
  text: string,
  words: string[]
): boolean {
  const normalized =
    text.toLowerCase();

  return words.some((word) =>
    normalized.includes(word)
  );
}

function addBelief(
  beliefs: Belief[],
  subject: string,
  belief: string,
  confidence: number
): void {
  const existing =
    beliefs.find(
      (item) =>
        item.subject === subject &&
        item.belief === belief
    );

  if (existing) {
    existing.confidence =
      Math.max(
        existing.confidence,
        confidence
      );

    return;
  }

  beliefs.push({
    subject,
    belief,
    confidence: clamp(
      confidence
    ),
  });
}

function addMotive(
  motives: Motive[],
  type: Motive["type"],
  description: string,
  strength: number
): void {
  const existing =
    motives.find(
      (motive) =>
        motive.type === type &&
        motive.description ===
          description
    );

  if (existing) {
    existing.strength =
      Math.max(
        existing.strength,
        strength
      );

    return;
  }

  motives.push({
    type,
    description,
    strength: clamp(
      strength
    ),
  });
}

/**
 * Convert a structured memory into
 * something the character can believe.
 *
 * The memory remains the historical record.
 * The belief is the character's interpretation
 * of that retained experience.
 */
function memoryToBelief(
  memory: MemoryEntry,
  world: WorldState
): Belief {
  const source =
    memory.sourceCharacterId
      ? world.characters.find(
          (character) =>
            character.id ===
            memory.sourceCharacterId
        )
      : undefined;

  const subject =
    source?.name ??
    memory.sourceCharacterId ??
    "the world";

  return {
    subject,
    belief: memory.summary,
    confidence: memory.confidence,
  };
}

function buildMemoryBeliefs(
  world: WorldState,
  character: Character
): Belief[] {
  const beliefs: Belief[] = [];

  /*
   * Structured memory is now the primary
   * source of character knowledge.
   */
  for (
    const memory of
      character.memories ?? []
  ) {
    const belief =
      memoryToBelief(
        memory,
        world
      );

    addBelief(
      beliefs,
      belief.subject,
      belief.belief,
      belief.confidence
    );
  }

  /*
   * Temporary compatibility fallback.
   *
   * This allows existing characters/worlds
   * that still contain knowledge[] to work.
   *
   * New simulation information should come
   * through memories instead.
   */
  if (
    (character.memories ?? [])
      .length === 0
  ) {
    for (
      const knowledge of
        character.knowledge
    ) {
      addBelief(
        beliefs,
        "known information",
        knowledge,
        75
      );
    }
  }

  return beliefs;
}

function buildMemoryMotives(
  world: WorldState,
  character: Character,
  motives: Motive[]
): void {
  const memories =
    character.memories ?? [];

  /*
   * Suspicious or threatening memories
   * strengthen curiosity/self-preservation.
   */
  for (
    const memory of memories
  ) {
    const summary =
      memory.summary.toLowerCase();

    if (
      hasWord(summary, [
        "following",
        "monitoring",
        "suspicious",
        "investigated",
        "evidence",
        "searched",
        "discovered",
        "threat",
        "danger",
      ])
    ) {
      addMotive(
        motives,
        "CURIOSITY",
        `Understand what happened: ${memory.summary}`,
        Math.min(
          90,
          35 +
            memory.importance *
              0.55
        )
      );
    }

    if (
      hasWord(summary, [
        "following",
        "monitoring",
        "danger",
        "threat",
        "caught",
        "exposed",
      ])
    ) {
      addMotive(
        motives,
        "SELF_PRESERVATION",
        `Protect myself from what I observed: ${memory.summary}`,
        Math.min(
          95,
          40 +
            memory.importance *
              0.6
        )
      );
    }

    /*
     * High-importance memories involving
     * another character can influence loyalty
     * or protection.
     */
    if (
      memory.importance >= 70 &&
      memory.sourceCharacterId &&
      memory.sourceCharacterId !==
        character.id
    ) {
      const relationship =
        character.relationships.find(
          (item) =>
            item.targetId ===
            memory.sourceCharacterId
        );

      if (
        relationship &&
        relationship.trust >= 60
      ) {
        addMotive(
          motives,
          "LOYALTY",
          `Respond to what happened involving someone I trust: ${memory.summary}`,
          relationship.trust *
            0.85
        );
      }
    }
  }

  /*
   * Recent investigation/search memories
   * indicate unresolved curiosity.
   */
  const recentlyInvestigated =
    memories.some(
      (memory) =>
        memory.day >=
          world.day - 1 &&
        hasWord(
          memory.summary,
          [
            "investigated",
            "evidence",
            "searched",
            "discovered",
          ]
        )
    );

  if (
    recentlyInvestigated
  ) {
    addMotive(
      motives,
      "CURIOSITY",
      "Continue investigating what I have started to uncover",
      65
    );
  }
}

export function buildMindState(
  world: WorldState,
  character: Character
): MindState {
  const beliefs: Belief[] = [];
  const motives: Motive[] = [];

  /*
   * Stable character drives.
   *
   * These come from the character definition,
   * not from the event history.
   */
  addMotive(
    motives,
    "GOAL",
    character.goal,
    80
  );

  addMotive(
    motives,
    "SELF_PRESERVATION",
    character.fear,
    70
  );

  /*
   * Current priority represents the character's
   * immediate focus and is allowed to change
   * as perceptions affect them.
   */
  if (
    character.currentPriority
  ) {
    addBelief(
      beliefs,
      character.id,
      `My current priority is: ${character.currentPriority}`,
      90
    );

    if (
      hasWord(
        character.currentPriority,
        [
          "protect",
          "defend",
          "help",
          "save",
        ]
      )
    ) {
      addMotive(
        motives,
        "PROTECTION",
        character.currentPriority,
        75
      );
    }

    if (
      hasWord(
        character.currentPriority,
        [
          "hide",
          "escape",
          "avoid",
          "survive",
          "stay safe",
        ]
      )
    ) {
      addMotive(
        motives,
        "SELF_PRESERVATION",
        character.currentPriority,
        75
      );
    }
  }

  /*
   * Structured memories become beliefs.
   */
  const memoryBeliefs =
    buildMemoryBeliefs(
      world,
      character
    );

  for (
    const belief of
      memoryBeliefs
  ) {
    addBelief(
      beliefs,
      belief.subject,
      belief.belief,
      belief.confidence
    );
  }

  /*
   * Relationship state becomes part of
   * the character's current mental model.
   */
  for (
    const relationship of
      character.relationships
  ) {
    const target =
      world.characters.find(
        (item) =>
          item.id ===
          relationship.targetId
      );

    if (!target) {
      continue;
    }

    if (
      relationship.trust >= 60
    ) {
      addBelief(
        beliefs,
        target.name,
        `${target.name} is someone I can trust.`,
        relationship.trust
      );

      addMotive(
        motives,
        "LOYALTY",
        `Maintain my relationship with ${target.name}`,
        relationship.trust *
          0.85
      );
    }

    if (
      relationship.suspicion >=
      50
    ) {
      addBelief(
        beliefs,
        target.name,
        `${target.name} may be hiding something from me.`,
        relationship.suspicion
      );

      addMotive(
        motives,
        "CURIOSITY",
        `Find out what ${target.name} is hiding`,
        relationship.suspicion
      );
    }
  }

  /*
   * Memories can create new motives.
   *
   * This is the important transition:
   *
   * EVENT
   *   ↓
   * PERCEPTION
   *   ↓
   * MEMORY
   *   ↓
   * BELIEF
   *   ↓
   * MOTIVE
   *   ↓
   * DECISION
   */
  buildMemoryMotives(
    world,
    character,
    motives
  );

  /*
   * Emotional state can intensify motives.
   */
  if (
    hasWord(
      character.emotionalState,
      [
        "afraid",
        "fear",
        "nervous",
        "anxious",
        "threatened",
        "unsafe",
        "panicked",
        "worried",
        "alarmed",
        "guarded",
      ]
    )
  ) {
    addMotive(
      motives,
      "SELF_PRESERVATION",
      "I feel unsafe and need to protect myself",
      85
    );
  }

  if (
    hasWord(
      character.emotionalState,
      [
        "protect",
        "caring",
        "concerned",
        "loyal",
      ]
    )
  ) {
    addMotive(
      motives,
      "PROTECTION",
      "Protect someone important to me",
      65
    );
  }

  /*
   * Character goal/fear semantics can still
   * strengthen appropriate motives.
   */
  if (
    hasWord(
      character.goal,
      [
        "protect",
        "save",
        "defend",
        "help",
      ]
    )
  ) {
    addMotive(
      motives,
      "PROTECTION",
      character.goal,
      65
    );
  }

  if (
    hasWord(
      character.fear,
      [
        "hurt",
        "harm",
        "danger",
        "lose",
      ]
    )
  ) {
    addMotive(
      motives,
      "SELF_PRESERVATION",
      character.fear,
      65
    );
  }

  return {
    characterId:
      character.id,

    beliefs,

    motives,
  };
}

export function buildAllMindStates(
  world: WorldState
): Record<
  string,
  MindState
> {
  const states: Record<
    string,
    MindState
  > = {};

  for (
    const character of
      world.characters
  ) {
    states[character.id] =
      buildMindState(
        world,
        character
      );
  }

  return states;
}
