import {
  applyConsequence,
  executeAction,
  type ActionConsequence,
} from "./consequence";

import { chooseAction } from "./decisions";

import { processPerceptions } from "./perception";

import { createInitialWorld } from "@/lib/simulation/world";

import type {
  ActionType,
  Character,
  Location,
  WorldEvent,
  WorldState,
} from "@/lib/simulation/types";

export type SimulationResult = {
  world: WorldState;

  characterUpdates: Record<
    string,
    {
      action: ActionType;
      reason: string;
    }
  >;

  events: string[];

  nextTension: string;

  consequences: ActionConsequence[];
};

export {
  createInitialWorld,
  type ActionType,
  type Character,
  type Location,
  type WorldEvent,
  type WorldState,
};

export function normalizeWorld(
  world: WorldState
): WorldState {
  return {
    ...world,

    characters: (world.characters ?? []).map(
      (character) => ({
        ...character,

        knowledge:
          character.knowledge ?? [],

        capabilities:
          character.capabilities ?? [],

        resources:
          character.resources ?? [],

        relationships:
          character.relationships ?? [],

        recentActions:
          character.recentActions ?? [],

        processedEventIds:
          character.processedEventIds ?? [],

        memories:
          character.memories ?? [],
      })
    ),

    locations:
      world.locations ?? [],

    entities:
      world.entities ?? [],

    objects:
      world.objects ?? [],

    evidence:
      world.evidence ?? [],

    events:
      world.events ?? [],

    eventLog:
      world.eventLog ?? [],
  };
}

function rememberAction(
  character: Character,
  action: ActionType
): void {
  character.recentActions = [
    ...(character.recentActions ?? []),
    action,
  ].slice(-5);
}

export function applyIntervention(
  world: WorldState,
  intervention: string
): void {
  const event: WorldEvent = {
    id: `intervention-${world.day}-${world.eventLog.length + 1}`,

    type: "INTERVENTION",

    day: world.day,

    data: {
      instruction: intervention,
    },
  };

  world.eventLog.push(event);

  world.events.push(
    `User intervention: ${intervention}`
  );
}

export function simulateDay(
  inputWorld: WorldState,
  intervention?: string
): SimulationResult {
  const world = normalizeWorld(
    structuredClone(inputWorld)
  );

  world.day += 1;

  const events: string[] = [];

  const simulationEvents: WorldEvent[] = [];

  const consequences: ActionConsequence[] = [];

  if (intervention?.trim()) {
    applyIntervention(
      world,
      intervention.trim()
    );

    events.push(
      `User intervention: ${intervention.trim()}`
    );
  }

  const characterUpdates: SimulationResult[
    "characterUpdates"
  ] = {};

  /*
   * =========================================================
   * PHASE 1 — DECISION
   * =========================================================
   *
   * Every character decides from the SAME world state.
   *
   * No character's action has executed yet.
   * Therefore Zara cannot accidentally influence
   * Daniel's decision simply because Zara appears first
   * in the characters array.
   */
  const decisions: Record<
    string,
    ReturnType<typeof chooseAction>
  > = {};

  for (
    const character of
      world.characters
  ) {
    decisions[character.id] =
      chooseAction(
        world,
        character
      );
  }

  /*
   * =========================================================
   * PHASE 2 — ACTION
   * =========================================================
   *
   * Execute the decisions that were already made.
   *
   * Consequences can change the world, but they cannot
   * change another character's decision for this tick.
   */
  for (
    const character of
      world.characters
  ) {
    const decision =
      decisions[character.id];

    const consequence =
      executeAction(
        world,
        character,
        decision.action
      );

    applyConsequence(
      world,
      consequence
    );

    simulationEvents.push(
      consequence.worldEvent
    );

    rememberAction(
      character,
      decision.action
    );

    consequences.push(
      consequence
    );

    events.push(
      consequence.event
    );

    characterUpdates[
      character.id
    ] = {
      action:
        decision.action,

      reason:
        decision.reason,
    };
  }

  /*
   * =========================================================
   * PHASE 3 — PERCEPTION
   * =========================================================
   *
   * Characters now process what happened.
   *
   * Perceptions are recorded as canonical WorldEvents.
   * This keeps the eventLog as the causal history of the
   * simulation instead of hiding perception in events[].
   */
  const perceptionResults =
    processPerceptions(
      world,
      simulationEvents
    );

  for (
    const perception of
      perceptionResults
  ) {
    if (
      !perception.interpretation
    ) {
      continue;
    }

    const observer =
      world.characters.find(
        (character) =>
          character.id ===
          perception.characterId
      );

    const perceptionEvent:
      WorldEvent = {
        id:
          "perception-" +
          world.day +
          "-" +
          (world.eventLog.length + 1),

        type:
          "PERCEPTION",

        day:
          world.day,

        actorId:
          perception.characterId,

        locationId:
          observer?.location,

        data: {
          sourceEventId:
            perception.sourceEventId,

          interpretation:
            perception.interpretation,
        },
      };

    world.eventLog.push(
      perceptionEvent
    );

    world.events.push(
      perception.interpretation
    );
  }

  /*
   * Legacy human-readable event list.
   *
   * The canonical source remains eventLog.
   */
  world.events.push(
    ...events
  );

  world.situation =
    events.join(" ");

  const nextTension =
    world.characters
      .map(
        (character) =>
          `${character.name} is focused on: ${character.currentPriority}`
      )
      .join(" ");

  return {
    world,

    characterUpdates,

    events,

    nextTension,

    consequences,
  };
}
