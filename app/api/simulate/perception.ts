import type {
  Character,
  MemoryEntry,
  WorldEvent,
  WorldState,
} from "@/lib/simulation/types";

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
   * A character can only have one memory
   * originating from the same world event.
   *
   * WorldEvent.id is the identity of the
   * underlying occurrence.
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
 * Check whether this exact world event has
 * already been processed by the observer.
 *
 * Event identity is used instead of natural-language
 * descriptions so two different events with similar
 * wording are never accidentally treated as duplicates.
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
 * Determine whether an observer could have
 * physically perceived an event.
 *
 * observerLocation represents the observer's
 * location at the moment the event occurred.
 *
 * This is deliberately passed into the function
 * rather than always reading observer.location,
 * because a character may have moved later in
 * the same simulation tick.
 */
function canObserve(
  world: WorldState,
  observer: Character,
  event: WorldEvent,
  observerLocation?: string
): boolean {
  /*
   * The actor always knows that they performed
   * their own action. However, the actor is handled
   * separately by interpretEvent().
   */
  if (
    event.actorId ===
    observer.id
  ) {
    return true;
  }

  /*
   * Events without a physical location cannot
   * currently be observed through ordinary
   * location-based perception.
   */
  if (!event.locationId) {
    return false;
  }

  /*
   * Use the observer's location at event time.
   *
   * Falling back to the current location keeps
   * the function safe for callers that do not
   * provide historical location information.
   */
  const locationAtEvent =
    observerLocation ??
    observer.location;

  if (
    locationAtEvent !==
    event.locationId
  ) {
    return false;
  }

  /*
   * A directly targeted observer can perceive
   * the event when they are physically present.
   */
  if (
    event.targetId ===
    observer.id
  ) {
    return true;
  }

  /*
   * Current prototype rule:
   * ordinary actions at the same location
   * are potentially observable.
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
  event: WorldEvent,
  observerLocation?: string
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
   * The actor does not need to rediscover
   * their own action through perception.
   *
   * The action already happened directly.
   *
   * We still mark the event as processed so
   * it cannot be reconsidered repeatedly.
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

  /*
   * Do not allow an observer to process an event
   * unless the observer could physically perceive it.
   *
   * This check is kept here as a second defensive
   * boundary even though processPerceptions() also
   * checks canObserve().
   */
  if (
    !canObserve(
      world,
      observer,
      event,
      observerLocation
    )
  ) {
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

  /*
   * Events that do not represent a known
   * action are marked processed but are not
   * converted into invented memories.
   */
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
   * Unknown action:
   *
   * Mark the event as processed so it does
   * not remain permanently pending, but do not
   * invent an interpretation.
   */
  rememberEvent(
    observer,
    event.id
  );

  return null;
}

export function processPerceptions(
  world: WorldState,
  events: WorldEvent[],
  observerLocations: Record<
    string,
    string
  > = {}
): PerceptionResult[] {
  const results: PerceptionResult[] =
    [];

  for (
    const event of
      events
  ) {
    for (
      const observer of
        world.characters
    ) {
      const observerLocation =
        observerLocations[
          observer.id
        ];

      if (
        !canObserve(
          world,
          observer,
          event,
          observerLocation
        )
      ) {
        continue;
      }

      const perception =
        interpretEvent(
          world,
          observer,
          event,
          observerLocation
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
       * synchronized while the architecture transitions
       * toward structured memories and beliefs.
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
