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
  const alreadyRemembered =
    character.memories.some(
      (memory) =>
        memory.eventId ===
        event.id
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
    importance:
      clamp(importance),
    confidence:
      clamp(confidence),
    summary,
  };

  character.memories.push(
    memory
  );

  /*
   * Bounded growth: keep the most important
   * recent memories, drop the weakest oldest.
   */
  if (
    character.memories.length >
    250
  ) {
    character.memories.sort(
      (a, b) =>
        a.importance -
          b.importance ||
        a.day -
          b.day
    );

    character.memories.splice(
      0,
      character.memories
        .length - 250
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
      (item) =>
        item.targetId ===
        targetId
    );

  if (!relationship) {
    return;
  }

  relationship.trust = clamp(
    relationship.trust +
      trustDelta
  );

  relationship.suspicion =
    clamp(
      relationship.suspicion +
        suspicionDelta
    );
}

function alreadyProcessed(
  character: Character,
  eventId: string
): boolean {
  return character.processedEventIds.includes(
    eventId
  );
}

function rememberEvent(
  character: Character,
  eventId: string
): void {
  if (
    !character.processedEventIds.includes(
      eventId
    )
  ) {
    character.processedEventIds.push(
      eventId
    );
  }

  if (
    character.processedEventIds
      .length > 600
  ) {
    character.processedEventIds =
      character.processedEventIds.slice(
        -400
      );
  }
}

function canObserve(
  world: WorldState,
  observer: Character,
  event: WorldEvent,
  observerLocation?: string
): boolean {
  if (
    event.actorId ===
    observer.id
  ) {
    return true;
  }

  if (!event.locationId) {
    return false;
  }

  const locationAtEvent =
    observerLocation ??
    observer.location;

  if (
    locationAtEvent !==
    event.locationId
  ) {
    return false;
  }

  if (
    event.targetId ===
    observer.id
  ) {
    return true;
  }

  return true;
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

  if (
    !canObserve(
      world,
      observer,
      event,
      observerLocation
    )
  ) {
    /*
     * The observer was not present when this happened.
     * Mark it handled so it is never re-evaluated later
     * against a different (current) location, which would
     * let a character "perceive" old events retroactively.
     */
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
    event.targetId
      ? findCharacter(
          world,
          event.targetId
        )
      : undefined;

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
   * Initial-situation semantics: the meaningful
   * day-1 event is understood, not dropped.
   */
  if (
    action ===
      "PRIVATE_MEETING_END" &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const summary = `${actor.name} left a private meeting with the mysterious company.`;

    addMemory(
      observer,
      event,
      summary,
      80,
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
        `${actor.name} has met privately with the mysterious company.`,
      ],
      emotionalChange:
        "Deeply suspicious",
      priorityChange:
        observer.currentPriority,
      relationshipChanges:
        actor.id !==
          observer.id &&
          observer.relationships.some(
            (item) =>
              item.targetId ===
              actor.id
          )
          ? [
              {
                targetId:
                  actor.id,
                suspicionDelta: 5,
              },
            ]
          : [],
    };
  }

  if (
    action === "FOLLOW" &&
    actor
  ) {
    const noticed =
      event.data.noticed ===
      true;

    rememberEvent(
      observer,
      event.id
    );

    if (
      target?.id ===
      observer.id
    ) {
      if (noticed) {
        const summary = `${actor.name} appears to be following ${observer.name}.`;

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
          priorityChange: `Work out why ${actor.name} is following me`,
          relationshipChanges: [
            {
              targetId:
                actor.id,
              suspicionDelta: 10,
            },
          ],
        };
      }

      const summary = `I keep noticing ${actor.name} nearby.`;

      addMemory(
        observer,
        event,
        summary,
        40,
        85
      );

      return {
        characterId:
          observer.id,
        sourceEventId:
          event.id,
        interpretation:
          summary,
        knowledgeGained:
          [],
        emotionalChange:
          "Uneasy",
        priorityChange:
          observer.currentPriority,
        relationshipChanges: [
          {
            targetId:
              actor.id,
            suspicionDelta: 3,
          },
        ],
      };
    }

    const summary = `${actor.name} was following ${target?.name ?? "someone"}.`;

    addMemory(
      observer,
      event,
      summary,
      50,
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
        [],
      emotionalChange:
        observer.emotionalState,
      priorityChange:
        observer.currentPriority,
      relationshipChanges:
        [],
    };
  }

  if (
    action === "TALK" &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const involvesObserver =
      target?.id ===
      observer.id;

    const summary = `${actor.name} is speaking with ${target?.name ?? "someone"}.`;

    addMemory(
      observer,
      event,
      summary,
      involvesObserver
        ? 70
        : 35,
      90
    );

    /*
     * Being spoken to shifts the listener's view of the
     * speaker. Warmth builds with diminishing returns when
     * the listener is not already wary; if suspicion is
     * already high, the approach reads as pressure instead.
     */
    const talkRelationship: {
      targetId: string;
      trustDelta?: number;
      suspicionDelta?: number;
    }[] = [];

    if (involvesObserver) {
      const existing =
        observer.relationships.find(
          (item) =>
            item.targetId ===
            actor.id
        );

      if (existing) {
        const recentApproaches =
          observer.memories.filter(
            (memory) =>
              memory.eventId !==
                event.id &&
              memory.summary ===
                summary &&
              event.day -
                memory.day <=
                6
          ).length;

        if (
          existing.suspicion >=
          65
        ) {
          talkRelationship.push({
            targetId:
              actor.id,
            suspicionDelta: 1,
          });
        } else {
          const gain =
            Math.round(
              2 *
                Math.pow(
                  0.6,
                  recentApproaches
                )
            );

          if (gain > 0) {
            talkRelationship.push({
              targetId:
                actor.id,
              trustDelta: gain,
            });
          }
        }
      }
    }

    return {
      characterId:
        observer.id,
      sourceEventId:
        event.id,
      interpretation:
        summary,
      knowledgeGained: [
        `${actor.name} spoke with ${target?.name ?? "someone"}.`,
      ],
      emotionalChange:
        observer.emotionalState,
      priorityChange:
        observer.currentPriority,
      relationshipChanges:
        talkRelationship,
    };
  }

  if (
    action === "MOVE" &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const from =
      event.data.from;

    const to =
      event.data.to;

    const summary = `${actor.name} moved from ${String(from)} to ${String(to)}.`;

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
      relationshipChanges:
        [],
    };
  }

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

    if (!evidenceFound) {
      const summary = `${actor.name} investigated the situation but did not uncover new evidence.`;

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
        knowledgeGained:
          [],
        emotionalChange:
          observer.emotionalState,
        priorityChange:
          observer.currentPriority,
        relationshipChanges:
          [],
      };
    }

    const summary = `${actor.name} discovered new evidence while investigating.`;

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
      relationshipChanges:
        [],
    };
  }

  if (
    action === "SEARCH" &&
    actor
  ) {
    const knowledge =
      event.data.knowledgeFound;

    rememberEvent(
      observer,
      event.id
    );

    const summary = `${actor.name} searched the area.`;

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
      relationshipChanges:
        [],
    };
  }

  if (
    action === "OBSERVE" &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const summary = `${actor.name} is carefully observing the surroundings.`;

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
      knowledgeGained:
        [],
      emotionalChange:
        observer.emotionalState,
      priorityChange:
        observer.currentPriority,
      relationshipChanges:
        [],
    };
  }

  if (
    action === "WAIT" &&
    actor
  ) {
    rememberEvent(
      observer,
      event.id
    );

    const summary = `${actor.name} chose to wait.`;

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
      knowledgeGained:
        [],
      emotionalChange:
        observer.emotionalState,
      priorityChange:
        observer.currentPriority,
      relationshipChanges:
        [],
    };
  }

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
