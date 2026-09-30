import {
  applyConsequence,
  executeAction,
  type ActionConsequence,
} from "./consequence";

import {
  chooseAction,
  type Decision,
} from "./decisions";

import {
  updateStrategies,
} from "./adaptation";

import {
  processPerceptions,
} from "./perception";

import {
  createDefaultStrategies,
  createInitialWorld,
} from "@/lib/simulation/world";

import type {
  ActionOutcome,
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

  outcomes: ActionOutcome[];
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
          character.knowledge ??
          [],

        memories:
          character.memories ??
          [],

        capabilities:
          character.capabilities ??
          [],

        resources:
          character.resources ??
          [],

        relationships:
          character.relationships ??
          [],

        actionHistory:
          character.actionHistory ??
          [],

        strategies:
          character.strategies &&
          character.strategies
            .length > 0
            ? character.strategies
            : createDefaultStrategies(),

        recentActions:
          character.recentActions ??
          [],

        processedEventIds:
          character.processedEventIds ??
          [],
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
    ...character.recentActions,
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
      instruction:
        intervention,
    },
  };

  world.eventLog.push(event);

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

    type: "PERCEPTION",

    day: world.day,

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
   * Work on a cloned normalized world so the
   * caller's input object is never mutated.
   */
  const world = normalizeWorld(
    structuredClone(
      inputWorld
    )
  );

  world.day += 1;

  const events: string[] = [];

  const simulationEvents: WorldEvent[] =
    [];

  const consequences: ActionConsequence[] =
    [];

  const outcomes: ActionOutcome[] =
    [];

  /*
   * =====================================================
   * PHASE 1 — PROCESS PREVIOUS UNPERCEIVED EVENTS
   * =====================================================
   *
   * Only world ACTIONS can be perceived. Meta events
   * (PERCEPTION, INTERVENTION) are excluded so they
   * never linger as permanently "pending".
   */
  const priorLocations: Record<
    string,
    string
  > = {};

  for (
    const character of
      world.characters
  ) {
    priorLocations[
      character.id
    ] =
      character.location;
  }

  const pendingEvents =
    world.eventLog.filter(
      (event) =>
        event.type ===
          "ACTION" &&
        event.day >=
          world.day - 1 &&
        world.characters.some(
          (character) =>
            !character.processedEventIds.includes(
              event.id
            )
        )
    );

  const priorPerceptions =
    processPerceptions(
      world,
      pendingEvents,
      priorLocations
    );

  for (
    const perception of
      priorPerceptions
  ) {
    const perceptionEvent =
      createPerceptionEvent(
        world,
        perception,
        priorLocations[
          perception.characterId
        ]
      );

    world.eventLog.push(
      perceptionEvent
    );

    world.events.push(
      perception.interpretation
    );
  }

  /*
   * =====================================================
   * PHASE 2 — USER INTERVENTION
   * =====================================================
   */
  if (intervention?.trim()) {
    const cleaned =
      intervention.trim();

    applyIntervention(
      world,
      cleaned
    );

    events.push(
      `User intervention: ${cleaned}`
    );
  }

  const characterUpdates: SimulationResult[
    "characterUpdates"
  ] = {};

  /*
   * =====================================================
   * PHASE 3 — IMMUTABLE PRE-ACTION SNAPSHOT
   * =====================================================
   *
   * A real, materialized snapshot. Every decision
   * in Phase 4 is made against THIS state, and
   * Phase 7 perception uses the snapshot's
   * event-time locations. Nothing in Phases 5-6
   * can retroactively alter what was decided or
   * what could be perceived.
   */
  const snapshot =
    structuredClone(world);

  const preActionLocations: Record<
    string,
    string
  > = {};

  for (
    const character of
      snapshot.characters
  ) {
    preActionLocations[
      character.id
    ] =
      character.location;
  }

  /*
   * =====================================================
   * PHASE 4 — DECISIONS FROM THE SAME SNAPSHOT
   * =====================================================
   */
  const decisions: Record<
    string,
    Decision
  > = {};

  for (
    const character of
      snapshot.characters
  ) {
    decisions[
      character.id
    ] =
      chooseAction(
        snapshot,
        character
      );
  }

  /*
   * =====================================================
   * PHASE 5 — EXECUTION
   * =====================================================
   *
   * MOVE actions resolve first (stable, deterministic
   * ordering) so that FOLLOW can trail a target who
   * is leaving, instead of targeting stale positions.
   */
  const executionQueue = world.characters
    .map(
      (character) => ({
        character,
        decision:
          decisions[
            character.id
          ],
      })
    )
    .filter(
      (entry) =>
        !!entry.decision
    )
    .sort(
      (a, b) =>
        (
          a.decision
            .action ===
          "MOVE"
            ? 0
            : 1
        ) -
        (
          b.decision
            .action ===
          "MOVE"
            ? 0
            : 1
        )
    );

  for (
    const entry of
      executionQueue
  ) {
    const consequence =
      executeAction(
        world,
        entry.character,
        entry.decision
          .action,
        entry.decision
      );

    applyConsequence(
      world,
      consequence
    );

    entry.character.currentStrategyId =
      entry.decision.strategyId;

    rememberAction(
      entry.character,
      entry.decision
        .action
    );

    simulationEvents.push(
      consequence.worldEvent
    );

    consequences.push(
      consequence
    );

    outcomes.push(
      consequence.outcome
    );

    events.push(
      consequence.event
    );

    characterUpdates[
      entry.character.id
    ] = {
      action:
        entry.decision
          .action,

      reason:
        entry.decision
          .reason,
    };
  }

  /*
   * =====================================================
   * PHASE 6 — CONSEQUENCES / OUTCOMES
   * =====================================================
   *
   * ActionOutcome objects were generated inside
   * executeAction and applied in applyConsequence
   * (knowledge, relationships, emotion, priority,
   * action history, canonical event log).
   */

  /*
   * =====================================================
   * PHASE 7 — PERCEPTION OF TODAY'S EVENTS
   * =====================================================
   *
   * Perception is evaluated against event-time
   * locations from the pre-action snapshot, never
   * against post-action locations.
   */
  const perceptionResults =
    processPerceptions(
      world,
      simulationEvents,
      preActionLocations
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

    const perceptionEvent =
      createPerceptionEvent(
        world,
        perception,
        preActionLocations[
          perception.characterId
        ]
      );

    world.eventLog.push(
      perceptionEvent
    );

    world.events.push(
      perception.interpretation
    );
  }

  /*
   * =====================================================
   * PHASE 8 — STRATEGY ADAPTATION
   * =====================================================
   */
  for (
    const character of
      world.characters
  ) {
    updateStrategies(
      character,
      outcomes.filter(
        (outcome) =>
          outcome.actorId ===
          character.id
      ),
      world.day
    );
  }

  /*
   * =====================================================
   * PHASE 9 — PERSISTENCE
   * =====================================================
   *
   * The returned `world` is the persisted state;
   * the frontend replaces its state with it.
   */

  /*
   * =====================================================
   * PHASE 10 — SITUATION / TENSION SUMMARY
   * =====================================================
   */
  world.events.push(
    ...events
  );

  if (events.length > 0) {
    world.situation =
      events.join(" ");
  }

  const focusNotes =
    world.characters.map(
      (character) =>
        `${character.name} is focused on: ${character.currentPriority}`
    );

  /*
   * One line per pair. Trust and suspicion are directional
   * internally, but the tension between two people is shown
   * once, using the stronger of the two suspicions.
   */
  const tensionNotes: string[] =
    [];

  const seenPairs =
    new Set<string>();

  for (
    const character of
      world.characters
  ) {
    for (
      const relationship of
        character.relationships
    ) {
      const pair = [
        character.id,
        relationship.targetId,
      ]
        .sort()
        .join(":");

      if (
        seenPairs.has(pair)
      ) {
        continue;
      }

      const other =
        world.characters.find(
          (item) =>
            item.id ===
            relationship.targetId
        );

      const reverse =
        other?.relationships.find(
          (item) =>
            item.targetId ===
            character.id
        );

      const strongest = Math.max(
        relationship.suspicion,
        reverse?.suspicion ?? 0
      );

      if (strongest >= 70) {
        seenPairs.add(pair);

        tensionNotes.push(
          `Tension between ${character.name} and ${other?.name ?? relationship.targetId} is escalating.`
        );
      }
    }
  }

  const nextTension =
    [
      ...focusNotes,
      ...tensionNotes,
    ].join(" ");

  return {
    world,
    characterUpdates,
    events,
    nextTension,
    consequences,
    outcomes,
  };
}
