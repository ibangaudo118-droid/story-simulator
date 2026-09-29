import { NextRequest, NextResponse } from "next/server";

type ActionType =
  | "OBSERVE"
  | "FOLLOW"
  | "TALK"
  | "INVESTIGATE"
  | "WAIT";

type Character = {
  id: string;
  name: string;
  role: string;

  goal: string;
  fear: string;
  secret: string;
  knowledge: string[];

  capabilities: string[];
  resources: string[];

  location: string;
  emotionalState: string;
  currentPriority: string;
};

type WorldState = {
  day: number;
  location: string;
  situation: string;

  characters: Character[];

  entities: string[];
  events: string[];
};

type Action = {
  type: ActionType;
  actorId: string;
  targetId?: string;
  description: string;
};

/* ---------------------------------------------------------
   INITIAL WORLD
--------------------------------------------------------- */

function createInitialWorld(): WorldState {
  return {
    day: 1,

    location: "University of Lagos",

    situation:
      "A mysterious technology company has started secretly recruiting students on campus.",

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
          "Zara has already collected evidence about the company.",

        knowledge: [
          "The company has been approaching students privately.",
          "Some students who were recruited have stopped talking to their friends."
        ],

        capabilities: [
          "observation",
          "investigation",
          "smartphone",
          "student contacts"
        ],

        resources: [
          "smartphone",
          "student ID",
          "laptop",
          "student contacts"
        ],

        location: "University of Lagos campus",

        emotionalState:
          "Suspicious but determined",

        currentPriority:
          "Find more evidence"
      },

      {
        id: "daniel",
        name: "Daniel",

        role: "Student and company contact",

        goal:
          "Protect his family while maintaining financial success.",

        fear:
          "The company harms his family if he disobeys them.",

        secret:
          "The company offered Daniel ₦5 million to identify student investigators.",

        knowledge: [
          "The company knows Zara has been investigating.",
          "The company wants Daniel to identify suspicious students."
        ],

        capabilities: [
          "persuasion",
          "hide emotions",
          "student contacts",
          "company communication"
        ],

        resources: [
          "smartphone",
          "student ID",
          "company contact",
          "student contacts"
        ],

        location: "University of Lagos campus",

        emotionalState:
          "Conflicted and afraid",

        currentPriority:
          "Protect his family without betraying Zara"
      }
    ],

    entities: [
      "Mysterious technology company",
      "University of Lagos",
      "Campus Café",
      "Company Liaison Office"
    ],

    events: [
      "Zara notices Daniel leaving a private meeting with the mysterious company."
    ]
  };
}

/* ---------------------------------------------------------
   WORLD NORMALIZATION
--------------------------------------------------------- */

function normalizeWorld(input: unknown): WorldState {
  if (!input || typeof input !== "object") {
    return createInitialWorld();
  }

  const world = input as Partial<WorldState>;

  const initial = createInitialWorld();

  return {
    day:
      typeof world.day === "number"
        ? world.day
        : initial.day,

    location:
      typeof world.location === "string"
        ? world.location
        : initial.location,

    situation:
      typeof world.situation === "string"
        ? world.situation
        : initial.situation,

    characters:
      Array.isArray(world.characters)
        ? world.characters as Character[]
        : initial.characters,

    entities:
      Array.isArray(world.entities)
        ? world.entities.map(String)
        : initial.entities,

    events:
      Array.isArray(world.events)
        ? world.events.map(String)
        : initial.events
  };
}

/* ---------------------------------------------------------
   ACTION GENERATION
--------------------------------------------------------- */

function generateLegalActions(
  actor: Character,
  world: WorldState
): Action[] {
  const actions: Action[] = [];

  /*
   * Every character can always wait.
   */
  actions.push({
    type: "WAIT",
    actorId: actor.id,

    description:
      `${actor.name} waits and continues observing the situation.`
  });

  /*
   * Everyone can observe.
   */
  actions.push({
    type: "OBSERVE",
    actorId: actor.id,

    description:
      `${actor.name} carefully observes the surrounding situation.`
  });

  /*
   * Investigation is only available to characters
   * who actually have that capability.
   */
  const canInvestigate =
    actor.capabilities.some(capability =>
      capability.toLowerCase().includes("investigat")
    );

  if (canInvestigate) {
    actions.push({
      type: "INVESTIGATE",
      actorId: actor.id,

      description:
        `${actor.name} investigates the company and searches for evidence.`
    });
  }

  /*
   * Characters can interact with another character
   * only if they occupy the same location.
   */
  const nearbyCharacters =
    world.characters.filter(
      character =>
        character.id !== actor.id &&
        character.location === actor.location
    );

  for (const target of nearbyCharacters) {
    actions.push({
      type: "TALK",
      actorId: actor.id,
      targetId: target.id,

      description:
        `${actor.name} talks to ${target.name}.`
    });

    actions.push({
      type: "FOLLOW",
      actorId: actor.id,
      targetId: target.id,

      description:
        `${actor.name} follows ${target.name} discreetly.`
    });
  }

  return actions;
}

/* ---------------------------------------------------------
   DETERMINISTIC DECISION ENGINE
--------------------------------------------------------- */

/*
 * This is deliberately NOT AI yet.
 *
 * We want to prove that characters can make decisions
 * based on their internal state before introducing an LLM.
 */

function chooseAction(
  actor: Character,
  legalActions: Action[],
  world: WorldState
): Action {
  const lowerPriority =
    actor.currentPriority.toLowerCase();

  /*
   * Zara is actively investigating.
   */
  if (
    actor.id === "zara" &&
    lowerPriority.includes("evidence")
  ) {
    const investigation =
      legalActions.find(
        action => action.type === "INVESTIGATE"
      );

    if (investigation) {
      return investigation;
    }
  }

  /*
   * Daniel is conflicted about Zara.
   *
   * If Zara is nearby, he talks to her rather than
   * automatically revealing everything.
   */
  if (actor.id === "daniel") {
    const talkAction =
      legalActions.find(
        action =>
          action.type === "TALK" &&
          action.targetId === "zara"
      );

    if (talkAction) {
      return talkAction;
    }
  }

  /*
   * Otherwise observe.
   */
  const observe =
    legalActions.find(
      action => action.type === "OBSERVE"
    );

  if (observe) {
    return observe;
  }

  return legalActions[0];
}

/* ---------------------------------------------------------
   ACTION EXECUTION
--------------------------------------------------------- */

function executeAction(
  action: Action,
  world: WorldState
): {
  event: string;
  characterUpdate: {
    characterId: string;
    action: string;
    reason: string;
    knowledgeGained: string;
    emotionalChange: string;
    newPriority: string;
  };
} {
  const actor =
    world.characters.find(
      character => character.id === action.actorId
    );

  if (!actor) {
    throw new Error("Actor does not exist.");
  }

  const target =
    action.targetId
      ? world.characters.find(
          character =>
            character.id === action.targetId
        )
      : undefined;

  switch (action.type) {
    case "INVESTIGATE": {
      const knowledge =
        "The company appears to be deliberately approaching students privately.";

      if (!actor.knowledge.includes(knowledge)) {
        actor.knowledge.push(knowledge);
      }

      actor.currentPriority =
        "Determine why the company is recruiting students";

      actor.emotionalState =
        "More suspicious but increasingly confident";

      return {
        event:
          `${actor.name} investigates the company's activities and discovers another clue.`,

        characterUpdate: {
          characterId: actor.id,

          action:
            `${actor.name} investigates the company's activities.`,

          reason:
            `${actor.name} wants to ${actor.goal.toLowerCase()}.`,

          knowledgeGained:
            knowledge,

          emotionalChange:
            "Becomes more suspicious and confident.",

          newPriority:
            actor.currentPriority
        }
      };
    }

    case "TALK": {
      if (!target) {
        throw new Error("Talk target does not exist.");
      }

      actor.emotionalState =
        "Carefully watching the conversation";

      return {
        event:
          `${actor.name} talks to ${target.name}, but neither reveals everything they know.`,

        characterUpdate: {
          characterId: actor.id,

          action:
            `${actor.name} talks to ${target.name}.`,

          reason:
            `${actor.name} wants information while protecting their own interests.`,

          knowledgeGained:
            `${actor.name} learns that ${target.name} is unusually cautious.`,

          emotionalChange:
            "Becomes more cautious.",

          newPriority:
            actor.currentPriority
        }
      };
    }

    case "FOLLOW": {
      if (!target) {
        throw new Error("Follow target does not exist.");
      }

      return {
        event:
          `${actor.name} quietly follows ${target.name}.`,

        characterUpdate: {
          characterId: actor.id,

          action:
            `${actor.name} follows ${target.name}.`,

          reason:
            `${actor.name} suspects ${target.name} may know something important.`,

          knowledgeGained:
            "",

          emotionalChange:
            "Becomes more alert.",

          newPriority:
            actor.currentPriority
        }
      };
    }

    case "OBSERVE": {
      return {
        event:
          `${actor.name} observes the surrounding environment without directly intervening.`,

        characterUpdate: {
          characterId: actor.id,

          action:
            `${actor.name} observes the surrounding environment.`,

          reason:
            `${actor.name} wants to understand what is happening before acting.`,

          knowledgeGained:
            "",

          emotionalChange:
            "Remains cautious.",

          newPriority:
            actor.currentPriority
        }
      };
    }

    case "WAIT": {
      return {
        event:
          `${actor.name} decides not to act immediately.`,

        characterUpdate: {
          characterId: actor.id,

          action:
            `${actor.name} waits.`,

          reason:
            `${actor.name} decides that immediate action could create unnecessary risk.`,

          knowledgeGained:
            "",

          emotionalChange:
            "Remains uncertain.",

          newPriority:
            actor.currentPriority
        }
      };
    }
  }
}

/* ---------------------------------------------------------
   MAIN API
--------------------------------------------------------- */

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    let world =
      body?.world
        ? normalizeWorld(body.world)
        : createInitialWorld();

    const intervention =
      typeof body?.intervention === "string"
        ? body.intervention.trim()
        : "";

    /*
     * Advance exactly one day.
     */
    world.day += 1;

    const dayEvents: string[] = [];

    const characterUpdates: {
      name: string;
      action: string;
      reason: string;
      new_knowledge: string;
      relationship_change: string;
      emotional_change: string;
      new_priority: string;
    }[] = [];

    /*
     * User intervention is treated as an event in the world.
     *
     * It does NOT automatically force the outcome.
     */
    if (intervention) {
      dayEvents.push(
        `The user intervenes: ${intervention}`
      );
    }

    /*
     * Every character gets exactly one decision.
     */
    for (const character of world.characters) {
      const legalActions =
        generateLegalActions(
          character,
          world
        );

      if (legalActions.length === 0) {
        continue;
      }

      const chosenAction =
        chooseAction(
          character,
          legalActions,
          world
        );

      const outcome =
        executeAction(
          chosenAction,
          world
        );

      dayEvents.push(
        outcome.event
      );

      characterUpdates.push({
        name: character.name,

        action:
          outcome.characterUpdate.action,

        reason:
          outcome.characterUpdate.reason,

        new_knowledge:
          outcome.characterUpdate.knowledgeGained,

        relationship_change:
          "",

        emotional_change:
          outcome.characterUpdate.emotionalChange,

        new_priority:
          outcome.characterUpdate.newPriority
      });
    }

    /*
     * Preserve the timeline.
     */
    world.events = [
      ...world.events,
      ...dayEvents
    ];

    world.situation =
      dayEvents.length > 0
        ? dayEvents.join(" ")
        : "The day passes without a major development.";

    const nextTension =
      "Zara now has more reason to investigate the company, while Daniel must balance his loyalty to the company with his relationship with Zara.";

    return NextResponse.json(
      {
        success: true,

        world,

        result: {
          day: world.day,

          situation:
            world.situation,

          events:
            dayEvents,

          character_updates:
            characterUpdates,

          new_situation:
            world.situation,

          next_tension:
            nextTension
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error(
      "Simulation API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "The simulation server encountered an unexpected error."
      },
      {
        status: 500,

        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
