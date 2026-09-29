import type { Character, WorldState } from "./types";

export type PerceptionResult = {
  characterId: string;
  sourceEvent: string;
  interpretation: string;
  knowledgeGained: string[];
  emotionalChange?: string;
  priorityChange?: string;
  relationshipChanges: {
    targetId: string;
    trustDelta?: number;
    suspicionDelta?: number;
  }[];
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function findCharacter(
  world: WorldState,
  id: string
): Character | undefined {
  return world.characters.find(
    (character) => character.id === id
  );
}

function addKnowledge(
  character: Character,
  knowledge: string
): boolean {
  if (character.knowledge.includes(knowledge)) {
    return false;
  }

  character.knowledge.push(knowledge);
  return true;
}

function updateRelationship(
  character: Character,
  targetId: string,
  trustDelta = 0,
  suspicionDelta = 0
): void {
  const relationship = character.relationships.find(
    (relationship) => relationship.targetId === targetId
  );

  if (!relationship) {
    return;
  }

  relationship.trust = clamp(
    relationship.trust + trustDelta
  );

  relationship.suspicion = clamp(
    relationship.suspicion + suspicionDelta
  );
}

function alreadyProcessed(
  character: Character,
  interpretation: string
): boolean {
  return character.knowledge.includes(
    `INTERPRETATION:${interpretation}`
  );
}

function rememberInterpretation(
  character: Character,
  interpretation: string
): void {
  character.knowledge.push(
    `INTERPRETATION:${interpretation}`
  );
}

function canObserve(
  observer: Character,
  event: string
): boolean {
  const lower = event.toLowerCase();

  /*
   * Events involving a character can normally be observed
   * when both characters are in the same location.
   */
  const mentionsObserver =
    lower.includes(observer.name.toLowerCase());

  if (mentionsObserver) {
    return true;
  }

  return true;
}

function interpretEvent(
  world: WorldState,
  observer: Character,
  event: string
): PerceptionResult | null {
  const lower = event.toLowerCase();

  /*
   * Prevent the same character from processing the same
   * meaningful event twice.
   */
  let target: Character | undefined;

  for (const character of world.characters) {
    if (
      character.id !== observer.id &&
      lower.includes(character.name.toLowerCase())
    ) {
      target = character;
      break;
    }
  }

  /*
   * Zara notices Daniel moving.
   */
  if (
    observer.id === "zara" &&
    target?.id === "daniel" &&
    lower.includes("moves to")
  ) {
    const interpretation =
      "Daniel's movement may reveal what he is trying to do.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [
        "Daniel has changed location while Zara is investigating the company.",
      ],
      emotionalChange: "More suspicious and alert",
      priorityChange:
        "Determine why Daniel is moving and whether he is avoiding scrutiny",
      relationshipChanges: [
        {
          targetId: "daniel",
          suspicionDelta: 5,
        },
      ],
    };
  }

  /*
   * Daniel notices Zara investigating.
   */
  if (
    observer.id === "daniel" &&
    lower.includes("zara") &&
    lower.includes("investigat")
  ) {
    const interpretation =
      "Zara has discovered something that could put Daniel at risk.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [
        "Zara has discovered evidence connected to the company.",
      ],
      emotionalChange: "Nervous and guarded",
      priorityChange:
        "Find out how much Zara knows about the company",
      relationshipChanges: [
        {
          targetId: "zara",
          suspicionDelta: 5,
        },
      ],
    };
  }

  /*
   * Zara questions Daniel.
   */
  if (
    observer.id === "zara" &&
    target?.id === "daniel" &&
    lower.includes("questions daniel")
  ) {
    const interpretation =
      "Daniel's behaviour gives Zara another reason to suspect he is hiding information.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [
        "Daniel may know more about the company than he admits.",
      ],
      emotionalChange: "Alert and questioning",
      priorityChange:
        "Determine how much Daniel knows about the company",
      relationshipChanges: [
        {
          targetId: "daniel",
          suspicionDelta: 6,
        },
      ],
    };
  }

  /*
   * Daniel talks while deliberately hiding information.
   */
  if (
    observer.id === "zara" &&
    target?.id === "daniel" &&
    lower.includes("avoids revealing")
  ) {
    const interpretation =
      "Daniel is deliberately withholding information from Zara.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [
        "Daniel deliberately avoided answering questions about the company.",
      ],
      emotionalChange: "Suspicious and focused",
      priorityChange:
        "Determine what Daniel is hiding",
      relationshipChanges: [
        {
          targetId: "daniel",
          suspicionDelta: 8,
          trustDelta: -2,
        },
      ],
    };
  }

  /*
   * Daniel realizes Zara is following him.
   */
  if (
    observer.id === "daniel" &&
    target?.id === "zara" &&
    lower.includes("follows")
  ) {
    const interpretation =
      "Zara is actively monitoring Daniel.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [
        "Zara is actively following Daniel.",
      ],
      emotionalChange: "Alarmed and guarded",
      priorityChange:
        "Find out how much Zara knows before revealing anything",
      relationshipChanges: [
        {
          targetId: "zara",
          suspicionDelta: 8,
        },
      ],
    };
  }

  /*
   * Zara discovers evidence.
   */
  if (
    observer.id === "zara" &&
    lower.includes("discovers useful evidence")
  ) {
    const interpretation =
      "The investigation produced evidence that may explain the company's activity.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [
        "The company's private recruitment of students may be part of a larger operation.",
      ],
      emotionalChange: "More suspicious but increasingly confident",
      priorityChange:
        "Determine where the company's student meetings are taking place",
      relationshipChanges: [],
    };
  }

  /*
   * Searching produces a clue.
   */
  if (
    observer.id === "zara" &&
    lower.includes("searches the area")
  ) {
    const interpretation =
      "The location may contain clues about the company's student meetings.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [
        "The current area may be connected to the company's student meetings.",
      ],
      emotionalChange: "Focused and suspicious",
      priorityChange:
        "Determine where the company's student meetings are taking place",
      relationshipChanges: [],
    };
  }

  /*
   * Generic investigation perception.
   *
   * Only generate it once. This prevents the repeated
   * "event is noticeable..." spam from previous versions.
   */
  if (
    observer.id === "zara" &&
    lower.includes("investigates")
  ) {
    const interpretation =
      "Zara's investigation confirms that the company remains worth investigating.";

    if (alreadyProcessed(observer, interpretation)) {
      return null;
    }

    rememberInterpretation(observer, interpretation);

    return {
      characterId: observer.id,
      sourceEvent: event,
      interpretation,
      knowledgeGained: [],
      emotionalChange: observer.emotionalState,
      priorityChange: observer.currentPriority,
      relationshipChanges: [],
    };
  }

  return null;
}

export function processPerceptions(
  world: WorldState,
  events: string[]
): PerceptionResult[] {
  const results: PerceptionResult[] = [];

  /*
   * Each event is processed once.
   *
   * A character can perceive an event, interpret it,
   * and update their internal state.
   */
  for (const event of events) {
    for (const observer of world.characters) {
      if (!canObserve(observer, event)) {
        continue;
      }

      const perception = interpretEvent(
        world,
        observer,
        event
      );

      if (!perception) {
        continue;
      }

      const character = findCharacter(
        world,
        perception.characterId
      );

      if (!character) {
        continue;
      }

      for (const knowledge of perception.knowledgeGained) {
        addKnowledge(character, knowledge);
      }

      if (perception.emotionalChange) {
        character.emotionalState =
          perception.emotionalChange;
      }

      if (perception.priorityChange) {
        character.currentPriority =
          perception.priorityChange;
      }

      for (const relationship of perception.relationshipChanges) {
        updateRelationship(
          character,
          relationship.targetId,
          relationship.trustDelta ?? 0,
          relationship.suspicionDelta ?? 0
        );
      }

      results.push(perception);
    }
  }

  return results;
}
