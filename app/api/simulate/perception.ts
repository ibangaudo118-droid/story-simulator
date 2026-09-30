import type {
  Character,
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
 *
 * Therefore:
 *
 * FOLLOW event #12
 * FOLLOW event #18
 *
 * are two different events and can both affect a character.
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
 * This is intentionally conservative.
 *
 * Current visibility rules:
 *
 * 1. An actor can always process their own event.
 * 2. A character at the same location can potentially
 *    observe an ordinary action.
 * 3. An event with a target can be observed by that target
 *    when they are at the event location.
 * 4. Characters elsewhere cannot observe the event.
 *
 * Later we can add:
 * - private conversations
 * - line of sight
 * - distance
 * - sound
 * - hidden actions
 * - surveillance
 * - information passed by another character
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
   * The actor does not need to "discover"
   * their own action through perception.
   *
   * Their action has already been applied.
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
   *
   * This is the first important actor/observer
   * feedback loop.
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

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        `${actor.name} appears to be following ${observer.name}.`,

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

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        `${actor.name} is speaking with ${target.name}.`,

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

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        `${actor.name} moved from ${String(from)} to ${String(to)}.`,

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
      return {
        characterId:
          observer.id,

        sourceEventId:
          event.id,

        interpretation:
          `${actor.name} investigated the situation but did not uncover new evidence.`,

        knowledgeGained: [],

        emotionalChange:
          observer.emotionalState,

        priorityChange:
          observer.currentPriority,

        relationshipChanges: [],
      };
    }

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        `${actor.name} discovered new evidence while investigating.`,

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

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        `${actor.name} searched the area.`,

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

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        `${actor.name} is carefully observing the surroundings.`,

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

    return {
      characterId:
        observer.id,

      sourceEventId:
        event.id,

      interpretation:
        `${actor.name} chose to wait.`,

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
