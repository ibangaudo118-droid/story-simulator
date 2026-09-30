import type {
  Character,
  MemoryEntry,
  WorldEvent,
  WorldState,
} from "./types";

export type PerceptionResult = {
  characterId: string;

  sourceEventId: string;

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

function findCharacter(
  world: WorldState,
  id: string
): Character | undefined {
  return world.characters.find(
    (character) =>
      character.id === id
  );
}

function addKnowledge(
  character: Character,
  knowledge: string
): void {
  if (
    !character.knowledge.includes(
      knowledge
    )
  ) {
    character.knowledge.push(
      knowledge
    );
  }
}

function addMemory(
  character: Character,
  event: WorldEvent,
  summary: string,
  importance = 50,
  confidence = 100
): void {
  character.memories ??= [];

  /*
   * A character should not have duplicate memories
   * for the same source event.
   *
   * Event identity is the source of truth.
   */
  const alreadyRemembered =
    character.memories.some(
      (memory) =>
        memory.eventId === event.id
    );

  if (alreadyRemembered) {
    return;
  }

  const memory: MemoryEntry = {
    eventId: event.id,

    day: event.day,

    type: event.type,

    sourceCharacterId:
      event.actorId,

    targetCharacterId:
      event.targetId,

    locationId:
      event.locationId,

    importance: clamp(
      importance
    ),

    confidence: clamp(
      confidence
    ),

    summary,
  };

  character.memories.push(
    memory
  );
}

function updateRelationship(
  character: Character,
  targetId: string,
  trustDelta = 0,
  suspicionDelta = 0
): void {
  const relationship =
    character.relationships.find(
      (relationship) =>
        relationship.targetId ===
        targetId
    );

  if (!relationship) {
    return;
  }

  relationship.trust = clamp(
    relationship.trust +
      trustDelta
  );

  relationship.suspicion = clamp(
    relationship.suspicion +
      suspicionDelta
  );
}

/**
 * Check whether a character has already processed
 * this exact simulation event.
 *
 * IMPORTANT:
 * We use event identity, not the English interpretation.
 */
function alreadyProcessed(
  character: Character,
  eventId: string
): boolean {
  return (
    character.processedEventIds ??
    []
  ).includes(eventId);
}

function rememberEvent(
  character: Character,
  eventId: string
): void {
  character.processedEventIds ??= [];

  if (
    !character.processedEventIds.includes(
      eventId
    )
  ) {
    character.processedEventIds.push(
      eventId
    );
  }
}

/**
 * Determine whether an event can physically
 * reach the observer.
 *
 * Current visibility rules:
 *
 * 1. An actor can always process their own event.
 * 2. A character at the same location can potentially
 *    observe an ordinary action.
 * 3. An event with a target can be observed by that target
 *    when they are at the event location.
 * 4. Characters elsewhere cannot observe the event.
 */
function canObserve(
  world: WorldState,
  observer: Character,
  event: WorldEvent
): boolean {
  if (
    event.actorId ===
    observer.id
  ) {
    return true;
  }

  if (
    !event.locationId
  ) {
    return false;
  }

  if (
    observer.location !==
    event.locationId
  ) {
    return false;
  }

  /*
   * If this event directly targets the observer,
   * they are eligible to notice it.
   */
  if (
    event.targetId ===
    observer.id
  ) {
    return true;
  }

  /*
   * Ordinary actions occurring at the same
   * location are observable for now.
   */
  return true;
}

function getTarget(
  world: WorldState,
  event: WorldEvent
): Character | undefined {
  if (!event.targetId) {
    return undefined;
  }

  return findCharacter(
    world,
    event.targetId
  );
}

function interpretEvent(
  world: WorldState,
  observer: Character,
  event: WorldEvent
): PerceptionResult | null {
  if (
    alreadyProcessed(
      observer,
      event.id
    )
  ) {
    return null;
  }

  /*
   * The actor does not need to discover
   * their own action through perception.
   *
   * Their action has already happened.
   *
   * We still mark the event as processed,
   * but we do not create a perception memory here.
   */
  if (
    event.actorId ===
    observer.id
  ) {
    rememberEvent(
      observer,
      event.id
    );

    return null;
  }

  const actor =
    event.actorId
      ? findCharacter(
          world,
          event.actorId
        )
      : undefined;

  const target =
    getTarget(
      world,
      event
    );

  const action =
    event.data.action;

  if (
    typeof action !==
    "string"
  ) {
    rememberEvent(
      observer,
      event.id
    );

    return null;
  }

  /*
   * FOLLOW
   */
  if (
    action === "FOLLOW" &&
    target?.id === observer.id &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const summary =
      `${actor.name} appears to be following ${observer.name}.`;

    addMemory(
      observer,
      event,
      summary,
      85,
      100
    );

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        summary,

      knowledgeGained: [
        `${actor.name} is actively monitoring ${observer.name}.`,
      ],

      emotionalChange:
        "Alarmed and guarded",

      priorityChange:
        `Work out why ${actor.name} is following me`,

      relationshipChanges: [
        {
          targetId:
            actor.id,

          suspicionDelta: 10,
        },
      ],
    };
  }

  /*
   * TALK
   */
  if (
    action === "TALK" &&
    target &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const summary =
      `${actor.name} is speaking with ${target.name}.`;

    addMemory(
      observer,
      event,
      summary,
      target.id === observer.id
        ? 70
        : 35,
      90
    );

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        summary,

      knowledgeGained: [
        `${actor.name} spoke with ${target.name}.`,
      ],

      emotionalChange:
        observer.emotionalState,

      priorityChange:
        observer.currentPriority,

      relationshipChanges: [],
    };
  }

  /*
   * MOVE
   */
  if (
    action === "MOVE" &&
    actor
  ) {
    const from =
      event.data.from;

    const to =
      event.data.to;

    rememberEvent(
      observer,
      event.id
    );

    const summary =
      `${actor.name} moved from ${String(from)} to ${String(to)}.`;

    addMemory(
      observer,
      event,
      summary,
      40,
      100
    );

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        summary,

      knowledgeGained: [
        `${actor.name} moved to ${String(to)}.`,
      ],

      emotionalChange:
        observer.emotionalState,

      priorityChange:
        observer.currentPriority,

      relationshipChanges: [],
    };
  }

  /*
   * INVESTIGATE
   */
  if (
    action === "INVESTIGATE" &&
    actor
  ) {
    const evidenceFound =
      event.data.evidenceFound ===
      true;

    rememberEvent(
      observer,
      event.id
    );

    if (
      !evidenceFound
    ) {
      const summary =
        `${actor.name} investigated the situation but did not uncover new evidence.`;

      addMemory(
        observer,
        event,
        summary,
        30,
        95
      );

      return {
        characterId:
          observer.id,

        sourceEventId:
          event.id,

        interpretation:
          summary,

        knowledgeGained: [],

        emotionalChange:
          observer.emotionalState,

        priorityChange:
          observer.currentPriority,

        relationshipChanges: [],
      };
    }

    const summary =
      `${actor.name} discovered new evidence while investigating.`;

    addMemory(
      observer,
      event,
      summary,
      75,
      95
    );

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        summary,

      knowledgeGained: [
        `${actor.name} discovered evidence connected to the company.`,
      ],

      emotionalChange:
        "More alert and suspicious",

      priorityChange:
        observer.currentPriority,

      relationshipChanges: [],
    };
  }

  /*
   * SEARCH
   */
  if (
    action === "SEARCH" &&
    actor
  ) {
    const knowledge =
      event.data
        .knowledgeFound;

    rememberEvent(
      observer,
      event.id
    );

    const summary =
      `${actor.name} searched the area.`;

    addMemory(
      observer,
      event,
      summary,
      45,
      90
    );

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        summary,

      knowledgeGained:
        typeof knowledge ===
        "string"
          ? [
              `${actor.name} discovered: ${knowledge}`,
            ]
          : [],

      emotionalChange:
        observer.emotionalState,

      priorityChange:
        observer.currentPriority,

      relationshipChanges: [],
    };
  }

  /*
   * OBSERVE
   */
  if (
    action === "OBSERVE" &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const summary =
      `${actor.name} is carefully observing the surroundings.`;

    addMemory(
      observer,
      event,
      summary,
      25,
      90
    );

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        summary,

      knowledgeGained: [],

      emotionalChange:
        observer.emotionalState,

      priorityChange:
        observer.currentPriority,

      relationshipChanges: [],
    };
  }

  /*
   * WAIT
   */
  if (
    action === "WAIT" &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const summary =
      `${actor.name} chose to wait.`;

    addMemory(
      observer,
      event,
      summary,
      15,
      95
    );

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        summary,

      knowledgeGained: [],

      emotionalChange:
        observer.emotionalState,

      priorityChange:
        observer.currentPriority,

      relationshipChanges: [],
    };
  }

  /*
   * Unknown event/action.
   *
   * Mark it processed so the observer does not
   * repeatedly reconsider the same event.
   *
   * We intentionally do not create a memory because
   * the engine does not yet know what the event means.
   */
  rememberEvent(
    observer,
    event.id
  );

  return null;
}

export function processPerceptions(
  world: WorldState,
  events: WorldEvent[]
): PerceptionResult[] {
  const results: PerceptionResult[] =
    [];

  for (
    const event of events
  ) {
    for (
      const observer of
        world.characters
    ) {
      if (
        !canObserve(
          world,
          observer,
          event
        )
      ) {
        continue;
      }

      const perception =
        interpretEvent(
          world,
          observer,
          event
        );

      if (!perception) {
        continue;
      }

      const character =
        findCharacter(
          world,
          perception.characterId
        );

      if (!character) {
        continue;
      }

      /*
       * Keep the legacy knowledge representation
       * synchronized for compatibility.
       *
       * This is temporary.
       *
       * Later, knowledge will become a derived view
       * of structured memories/beliefs.
       */
      for (
        const knowledge of
          perception.knowledgeGained
      ) {
        addKnowledge(
          character,
          knowledge
        );
      }

      if (
        perception.emotionalChange
      ) {
        character.emotionalState =
          perception.emotionalChange;
      }

      if (
        perception.priorityChange
      ) {
        character.currentPriority =
          perception.priorityChange;
      }

      for (
        const relationship of
          perception.relationshipChanges
      ) {
        updateRelationship(
          character,
          relationship.targetId,
          relationship.trustDelta ??
            0,
          relationship.suspicionDelta ??
            0
        );
      }

      results.push(
        perception
      );
    }
  }

  return results;
  }
