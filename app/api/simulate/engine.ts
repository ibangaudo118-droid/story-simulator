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

/**
 * Normalize worlds coming from older frontend state
 * or persisted simulation responses.
 */
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

/**
 * Record a structured intervention event.
 *
 * The intervention is recorded as an event.
 * It does not directly force a character to act.
 */
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

  for (const character of world.characters) {
    const decision = chooseAction(
      world,
      character
    );

    const action = decision.action;

    const consequence = executeAction(
      world,
      character,
      action
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
      action
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
      action,
      reason: decision.reason,
    };
  }

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
      perception.interpretation
    ) {
      world.events.push(
        perception.interpretation
      );
    }
  }

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
