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

    characters: (
      world.characters ?? []
    ).map(
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
    id:
      `intervention-${world.day}-${world.eventLog.length + 1}`,

    type:
      "INTERVENTION",

    day:
      world.day,

    data: {
      instruction:
        intervention,
    },
  };

  world.eventLog.push(
    event
  );

  world.events.push(
    `User intervention: ${intervention}`
  );
}

function createPerceptionEvent(
  world: WorldState,
  perception: {
    characterId: string;
    sourceEventId: string;
    interpretation: string;
  },
  observerLocation: string | undefined
): WorldEvent {
  return {
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
      observerLocation,

    data: {
      sourceEventId:
        perception.sourceEventId,

      interpretation:
        perception.interpretation,
    },
  };
}

export function simulateDay(
  inputWorld: WorldState,
  intervention?: string
): SimulationResult {
  /*
   * Work on a cloned normalized world so the caller's
   * input object is not mutated unexpectedly.
   */
  const world =
    normalizeWorld(
      structuredClone(
        inputWorld
      )
    );

  /*
   * A simulation call advances exactly one day.
   */
  world.day += 1;

  const events: string[] = [];

  const simulationEvents: WorldEvent[] =
    [];

  const consequences: ActionConsequence[] =
    [];

  /*
   * =========================================================
   * PHASE 0 — EXISTING WORLD EVENTS
   * =========================================================
   *
   * Events that already existed before this tick are
   * processed before new decisions are made.
   *
   * This is important because the initial world already
   * contains a canonical Day-1 company-meeting event.
   *
   * Without this phase, that event would exist in eventLog
   * but would never enter the perception/memory pipeline.
   */

  const existingEventLocations: Record<
    string,
    string
  > = {};

  for (
    const character of
      world.characters
  ) {
    existingEventLocations[
      character.id
    ] =
      character.location;
  }

  /*
   * Only process events that at least one character
   * has not processed yet.
   *
   * The perception layer itself also checks event identity,
   * giving us a second protection against duplicate memories.
   */
  const priorEvents =
    world.eventLog.filter(
      (event) =>
        world.characters.some(
          (character) =>
            !(
              character.processedEventIds ??
              []
            ).includes(
              event.id
            )
        )
    );

  const priorPerceptions =
    processPerceptions(
      world,
      priorEvents,
      existingEventLocations
    );

  for (
    const perception of
      priorPerceptions
  ) {
    const observer =
      world.characters.find(
        (character) =>
          character.id ===
          perception.characterId
      );

    const observerLocation =
      existingEventLocations[
        perception.characterId
      ] ??
      observer?.location;

    const perceptionEvent =
      createPerceptionEvent(
        world,
        perception,
        observerLocation
      );

    world.eventLog.push(
      perceptionEvent
    );

    world.events.push(
      perception.interpretation
    );
  }

  /*
   * =========================================================
   * PHASE 1 — INTERVENTION
   * =========================================================
   *
   * An intervention is recorded as a world event.
   *
   * It is NOT automatically converted into an action.
   * This keeps the current contract honest.
   */
  if (
    intervention?.trim()
  ) {
    const cleanedIntervention =
      intervention.trim();

    applyIntervention(
      world,
      cleanedIntervention
    );

    events.push(
      `User intervention: ${cleanedIntervention}`
    );
  }

  const characterUpdates: SimulationResult[
    "characterUpdates"
  ] = {};

  /*
   * =========================================================
   * PHASE 2 — SNAPSHOT CHARACTER LOCATIONS
   * =========================================================
   *
   * We capture where every character is BEFORE any
   * action executes.
   *
   * This snapshot is critical for perception.
   *
   * Example:
   *
   * Zara is at the cafe.
   * Daniel moves from the cafe to the office.
   *
   * Daniel's MOVE happened at the cafe.
   *
   * Zara must be able to perceive that event even
   * though Daniel's final location is now the office.
   *
   * Conversely, if Zara herself moved during this tick,
   * her ability to perceive another character's action
   * is evaluated using Zara's location at the time
   * those actions occurred.
   */
  const preActionLocations: Record<
    string,
    string
  > = {};

  for (
    const character of
      world.characters
  ) {
    preActionLocations[
      character.id
    ] =
      character.location;
  }

  /*
   * =========================================================
   * PHASE 3 — DECISION
   * =========================================================
   *
   * Every character decides from the SAME world state.
   *
   * No action has executed yet.
   *
   * Therefore:
   *
   * Zara's action cannot alter Daniel's decision.
   * Daniel's action cannot alter Zara's decision.
   *
   * Both decisions represent the characters'
   * responses to the world at the beginning
   * of this simulation tick.
   */
  const decisions: Record<
    string,
    ReturnType<
      typeof chooseAction
    >
  > = {};

  for (
    const character of
      world.characters
  ) {
    decisions[
      character.id
    ] =
      chooseAction(
        world,
        character
      );
  }

  /*
   * =========================================================
   * PHASE 4 — ACTION
   * =========================================================
   *
   * Execute the decisions that were already made.
   *
   * Consequences may change world state,
   * but they cannot retroactively change another
   * character's decision for this tick.
   */
  for (
    const character of
      world.characters
  ) {
    const decision =
      decisions[
        character.id
      ];

    /*
     * Defensive guard:
     *
     * Every normalized character should have a decision.
     * If one somehow does not, skip execution rather than
     * causing the entire simulation to crash.
     */
    if (!decision) {
      continue;
    }

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
   * PHASE 5 — PERCEPTION
   * =========================================================
   *
   * Characters now perceive the actions that occurred
   * during this tick.
   *
   * IMPORTANT:
   *
   * preActionLocations is supplied to the perception
   * system so perception is evaluated against the
   * event-time location rather than the character's
   * final location after all movement has occurred.
   */
  const perceptionResults =
    processPerceptions(
      world,
      simulationEvents,
      preActionLocations
    );

  /*
   * Perception itself is recorded as a canonical event.
   *
   * These perception events describe what a character
   * believes they perceived. They do NOT replace the
   * original ACTION event.
   *
   * Therefore:
   *
   * ACTION
   *   ↓
   * PERCEPTION
   *
   * remains explicit in the event history.
   */
  for (
    const perception of
      perceptionResults
  ) {
    if (
      !perception.interpretation
    ) {
      continue;
    }

    const observerLocation =
      preActionLocations[
        perception.characterId
      ];

    const perceptionEvent =
      createPerceptionEvent(
        world,
        perception,
        observerLocation
      );

    world.eventLog.push(
      perceptionEvent
    );

    world.events.push(
      perception.interpretation
    );
  }

  /*
   * =========================================================
   * LEGACY PRESENTATION STATE
   * =========================================================
   *
   * eventLog remains the canonical source of truth.
   *
   * events[] is retained temporarily for compatibility
   * with existing frontend/API code.
   */
  world.events.push(
    ...events
  );

  /*
   * situation is also presentation state.
   *
   * It is deliberately derived from the human-readable
   * events generated during this tick rather than being
   * treated as the simulation's canonical history.
   */
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
