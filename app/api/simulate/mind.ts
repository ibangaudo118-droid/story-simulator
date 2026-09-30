import type {
  Character,
  MemoryEntry,
  WorldState,
} from "@/lib/simulation/types";

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

export type InformationNeed = {
  topic: string;
  strength: number;
};

export type MindState = {
  characterId: string;

  beliefs: Belief[];

  motives: Motive[];

  /**
   * Topics the character's goal/fear/priority
   * care about but whose knowledge coverage is
   * low. Derived from the character's OWN
   * knowledge and memories — not a crude
   * world-evidence minus knowledge count.
   */
  informationNeeds: InformationNeed[];
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

const TOPIC_KEYWORDS = [
  "company",
  "student",
  "evidence",
  "proof",
  "family",
  "investigat",
  "harm",
  "meeting",
  "recruit",
  "protect",
];

function addBelief(
  beliefs: Belief[],
  subject: string,
  belief: string,
  confidence: number
): void {
  const existing = beliefs.find(
    (item) =>
      item.subject === subject &&
      item.belief === belief
  );

  if (existing) {
    existing.confidence = Math.max(
      existing.confidence,
      confidence
    );
    return;
  }

  beliefs.push({
    subject,
    belief,
    confidence: clamp(confidence),
  });
}

function addMotive(
  motives: Motive[],
  type: Motive["type"],
  description: string,
  strength: number
): void {
  const existing = motives.find(
    (motive) =>
      motive.type === type &&
      motive.description ===
        description
  );

  if (existing) {
    existing.strength = Math.max(
      existing.strength,
      strength
    );
    return;
  }

  motives.push({
    type,
    description,
    strength: clamp(strength),
  });
}

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

function characterTopics(
  character: Character
): string[] {
  const text =
    `${character.goal} ${character.fear} ${character.currentPriority}`.toLowerCase();

  return TOPIC_KEYWORDS.filter(
    (topic) => text.includes(topic)
  );
}

function topicCoverage(
  character: Character,
  topic: string
): number {
  const items = [
    ...character.knowledge,
    ...character.memories.map(
      (memory) => memory.summary
    ),
  ];

  if (items.length === 0) {
    return 0;
  }

  const covered = items.filter(
    (item) =>
      item
        .toLowerCase()
        .includes(topic)
  ).length;

  return covered / items.length;
}

function buildInformationNeeds(
  character: Character,
  motives: Motive[]
): InformationNeed[] {
  const goalStrength =
    motives
      .filter(
        (motive) =>
          motive.type === "GOAL"
      )
      .reduce(
        (total, motive) =>
          total +
          motive.strength,
        0
      ) || 80;

  const fearText =
    character.fear.toLowerCase();

  const needs: InformationNeed[] =
    [];

  for (
    const topic of
      characterTopics(character)
  ) {
    const coverage =
      topicCoverage(
        character,
        topic
      );

    const base =
      fearText.includes(topic)
        ? 70
        : goalStrength;

    const strength = Math.round(
      base * (1 - coverage)
    );

    if (strength >= 15) {
      needs.push({
        topic,
        strength,
      });
    }
  }

  needs.sort(
    (a, b) =>
      b.strength - a.strength
  );

  return needs.slice(0, 4);
}

export function buildMindState(
  world: WorldState,
  character: Character
): MindState {
  const beliefs: Belief[] = [];
  const motives: Motive[] = [];

  /*
   * Knowledge is always belief material,
   * regardless of whether memories exist.
   */
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

  for (
    const memory of
      character.memories
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

  addBelief(
    beliefs,
    character.id,
    `I am hiding: ${character.secret}`,
    100
  );

  if (character.currentPriority) {
    addBelief(
      beliefs,
      character.id,
      `My current priority is: ${character.currentPriority}`,
      90
    );
  }

  addMotive(
    motives,
    "GOAL",
    character.goal,
    80
  );

  addMotive(
    motives,
    "FEAR",
    character.fear,
    70
  );

  addMotive(
    motives,
    "SELF_PRESERVATION",
    character.fear,
    70
  );

  const protectionWords = [
    "protect",
    "defend",
    "help",
    "save",
  ];

  const goalAndPriority =
    `${character.goal} ${character.currentPriority}`.toLowerCase();

  if (
    protectionWords.some(
      (word) =>
        goalAndPriority.includes(
          word
        )
    )
  ) {
    addMotive(
      motives,
      "PROTECTION",
      character.currentPriority ||
        character.goal,
      65
    );
  }

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

    if (relationship.trust >= 60) {
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
        relationship.trust * 0.85
      );
    }

    if (relationship.suspicion >= 50) {
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

  const informationNeeds =
    buildInformationNeeds(
      character,
      motives
    );

  for (
    const need of
      informationNeeds
  ) {
    addMotive(
      motives,
      "CURIOSITY",
      `Learn more about: ${need.topic}`,
      need.strength * 0.6
    );
  }

  const emotional =
    character.emotionalState.toLowerCase();

  if (
    [
      "afraid",
      "fear",
      "nervous",
      "anxious",
      "alarmed",
      "uneasy",
      "guarded",
      "threatened",
      "unsafe",
    ].some(
      (word) =>
        emotional.includes(word)
    )
  ) {
    addMotive(
      motives,
      "SELF_PRESERVATION",
      "I feel unsafe and need to protect myself",
      85
    );
  }

  return {
    characterId: character.id,
    beliefs,
    motives,
    informationNeeds,
  };
}

export function buildAllMindStates(
  world: WorldState
): Record<string, MindState> {
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
