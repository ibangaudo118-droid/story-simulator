import {
  applyConsequence,
  executeAction,
  type ActionConsequence,
} from "./consequence";

import { chooseAction } from "./decisions";

import { processPerceptions } from "./perception";

import type {
  ActionType,
  Character,
  Location,
  WorldEvent,
  WorldState,
} from "./types";

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
  type ActionType,
  type Character,
  type Location,
  type WorldEvent,
  type WorldState,
};

/**
 * Create the single canonical starting world.
 *
 * The frontend should eventually consume this state rather than
 * maintaining its own duplicate version.
 */
export function createInitialWorld(): WorldState {
  const initialEvents: WorldEvent[] = [
    {
      id: "event-day-1-company-meeting",
      type: "ACTION",
      day: 1,
      actorId: "daniel",
      locationId: "company-office",
      data: {
        action: "PRIVATE_MEETING",
        subject: "company",
      },
    },
  ];

  return {
    day: 1,

    location: "campus",

    situation:
      "A mysterious technology company has been quietly approaching students at the university.",

    characters: [
      {
        id: "zara",

        name: "Zara",

        role: "Student investigator",

        goal:
          "Discover what the company is doing and whether students are being harmed.",

        fear:
          "The company discovers that she is investigating them.",

        secret:
          "Zara suspects the company is doing something wrong but has not yet found proof.",

        knowledge: [
          "The company approaches students privately.",
          "Some recruited students have stopped talking to their friends.",
        ],

        capabilities: [
          "observation",
          "investigation",
          "smartphone",
          "student contacts",
        ],

        resources: [
          "smartphone",
          "student ID",
          "laptop",
          "student contacts",
        ],

        location: "campus",

        emotionalState:
          "Suspicious but determined",

        currentPriority:
          "Find evidence about the company",

        relationships: [
          {
            targetId: "daniel",
            trust: 45,
            suspicion: 55,
          },
        ],

        recentActions: [],

        processedEventIds: [],
      },

      {
        id: "daniel",

        name: "Daniel",

        role: "Student and company contact",

        goal:
          "Protect his family while maintaining financial security.",

        fear:
          "The company harms his family if he disobeys.",

        secret:
          "The company offered Daniel ₦5m to identify students investigating them.",

        knowledge: [
          "The company knows Zara is investigating.",
          "The company wants Daniel to identify suspicious students.",
        ],

        capabilities: [
          "persuasion",
          "hide emotions",
          "student contacts",
          "company communication",
        ],

        resources: [
          "smartphone",
          "student ID",
          "company contact",
          "student contacts",
        ],

        location: "campus",

        emotionalState:
          "Conflicted and afraid",

        currentPriority:
          "Protect his family without betraying Zara",

        relationships: [
          {
            targetId: "zara",
            trust: 60,
            suspicion: 40,
          },
        ],

        recentActions: [],

        processedEventIds: [],
      },
    ],

    locations: [
      {
        id: "campus",
        name: "University Campus",
        description:
          "The main university grounds where students move between classes and social spaces.",

        connectedTo: [
          "campus-cafe",
          "company-office",
        ],
      },

      {
        id: "campus-cafe",
        name: "Campus Café",
        description:
          "A busy student café where conversations can happen without attracting much attention.",

        connectedTo: [
          "campus",
          "company-office",
        ],
      },

      {
        id: "company-office",
        name: "Company Office",
        description:
          "A private office used by the mysterious technology company.",

        connectedTo: [
          "campus",
          "campus-cafe",
        ],
      },
    ],

    entities: [
      "Mysterious technology company",
      "University of Lagos",
    ],

    objects: [
      "student smartphones",
      "student identification cards",
      "laptops",
    ],

    evidence: [],

    /*
     * Legacy human-readable timeline.
     *
     * We keep it temporarily because the current frontend still
     * expects it. It will later become a rendered view of eventLog.
     */
    events: [
      "Zara notices Daniel leaving a private meeting with the mysterious company.",
    ],

    /*
     * Canonical machine-readable simulation history.
     */
    eventLog: initialEvents,
  };
}

/**
 * Normalize worlds coming from older frontend state or persisted
 * simulation responses.
 *
 * This lets us evolve the state schema without destroying an
 * existing simulation.
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
 * IMPORTANT:
 * This function intentionally does NOT directly change a
 * character's priorities based on keywords.
 *
 * The intervention is recorded first.
 *
 * Later, interventions will become proper world actions that
 * pass through the same validation/consequence system as
 * character actions.
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

  /*
   * Legacy human-readable events used temporarily
   * by the current frontend/timeline.
   */
  const events: string[] = [];

  /*
   * Canonical structured events generated during
   * this simulation step.
   *
   * Perception MUST use these events rather than
   * parsing human-readable English.
   */
  const simulationEvents: WorldEvent[] = [];

  const consequences: ActionConsequence[] = [];

  /*
   * User intervention is now recorded as a structured event.
   *
   * It does not magically force a character to do something.
   */
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
   * Current turn model:
   *
   * 1. Character decides
   * 2. Character acts
   * 3. Consequence is applied
   * 4. Other characters perceive the resulting events
   *
   * We will later evolve this into:
   *
   * PERCEIVE
   * -> INTERPRET
   * -> MOTIVATE
   * -> DECIDE
   * -> VALIDATE
   * -> EXECUTE
   * -> CONSEQUENCE
   */
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

    /*
     * Keep the structured event separately from
     * the legacy English timeline.
     */
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

  /*
   * Perception now consumes structured WorldEvent objects.
   *
   * It no longer parses the human-readable event strings.
   *
   * This means:
   *
   * WorldEvent
   *      ↓
   * visibility check
   *      ↓
   * interpretation
   *      ↓
   * knowledge / emotion / relationship changes
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
      perception.interpretation
    ) {
      world.events.push(
        perception.interpretation
      );
    }
  }

  /*
   * Keep the legacy timeline temporarily.
   *
   * The timeline will eventually be generated
   * from world.eventLog instead of storing a
   * second independent representation.
   */
  world.events.push(
    ...events
  );

  /*
   * The situation string is presentation state.
   * It is NOT used as the source of truth.
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
