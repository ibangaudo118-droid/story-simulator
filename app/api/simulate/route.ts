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
        emotionalState: "Suspicious but determined",
        currentPriority: "Find more evidence"
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
        emotionalState: "Conflicted and afraid",
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

/*
 * Safely converts whatever the frontend currently sends
 * into the complete character structure required by
 * the simulation engine.
 */
function normalizeCharacter(
  input: unknown,
  fallback: Character
): Character {
  const value =
    input && typeof input === "object"
      ? (input as Partial<Character>)
      : {};

  return {
    id:
      typeof value.id === "string"
        ? value.id
        : fallback.id,

    name:
      typeof value.name === "string"
        ? value.name
        : fallback.name,

    role:
      typeof value.role === "string"
        ? value.role
        : fallback.role,

    goal:
      typeof value.goal === "string"
        ? value.goal
        : fallback.goal,

    fear:
      typeof value.fear === "string"
        ? value.fear
        : fallback.fear,

    secret:
      typeof value.secret === "string"
        ? value.secret
        : fallback.secret,

    knowledge:
      Array.isArray(value.knowledge)
        ? value.knowledge.map(String)
        : [...fallback.knowledge],

    capabilities:
      Array.isArray(value.capabilities)
        ? value.capabilities.map(String)
        : [...fallback.capabilities],

    resources:
      Array.isArray(value.resources)
        ? value.resources.map(String)
        : [...fallback.resources],

    location:
      typeof value.location === "string"
        ? value.location
        : fallback.location,

    emotionalState:
      typeof value.emotionalState === "string"
        ? value.emotionalState
        : fallback.emotionalState,

    currentPriority:
      typeof value.currentPriority === "string"
        ? value.currentPriority
        : fallback.currentPriority
  };
}

function normalizeWorld(input: unknown): WorldState {
  const initial = createInitialWorld();

  if (!input || typeof input !== "object") {
    return initial;
  }

  const value = input as Partial<WorldState>;

  const incomingCharacters =
    Array.isArray(value.characters)
      ? value.characters
      : [];

  const characters =
    incomingCharacters.length > 0
      ? incomingCharacters.map((character, index) => {
          const fallback =
            initial.characters.find(
              item =>
                item.id ===
                (character as Partial<Character>)?.id
            ) ||
            initial.characters[index] ||
            initial.characters[0];

          return normalizeCharacter(
            character,
            fallback
          );
        })
      : initial.characters;

  return {
    day:
      typeof value.day === "number"
        ? value.day
        : initial.day,

    location:
      typeof value.location === "string"
        ? value.location
        : initial.location,

    situation:
      typeof value.situation === "string"
        ? value.situation
        : initial.situation,

    characters,

    entities:
      Array.isArray(value.entities)
        ? value.entities.map(String)
        : [...initial.entities],

    events:
      Array.isArray(value.events)
        ? value.events.map(String)
        : [...initial.events]
  };
}

function generateLegalActions(
  actor: Character,
  world: WorldState
): Action[] {
  const actions: Action[] = [];

  actions.push({
    type: "WAIT",
    actorId: actor.id,
    description:
      `${actor.name} waits and continues observing the situation.`
  });

  actions.push({
    type: "OBSERVE",
    actorId: actor.id,
    description:
      `${actor.name} carefully observes the surrounding situation.`
  });

  const canInvestigate =
    actor.capabilities.some(capability =>
      capability
        .toLowerCase()
        .includes("investigat")
    );

  if (canInvestigate) {
    actions.push({
      type: "INVESTIGATE",
      actorId: actor.id,
      description:
        `${actor.name} investigates the company and searches for evidence.`
    });
  }

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

function chooseAction(
  actor: Character,
  legalActions: Action[]
): Action {
  if (legalActions.length === 0) {
    throw new Error(
      `No legal actions available for ${actor.name}.`
    );
  }

  if (
    actor.id === "zara" &&
    actor.currentPriority
      .toLowerCase()
      .includes("evidence")
  ) {
    const investigation =
      legalActions.find(
        action =>
          action.type === "INVESTIGATE"
      );

    if (investigation) {
      return investigation;
    }
  }

  if (actor.id === "daniel") {
    const talk =
      legalActions.find(
        action =>
          action.type === "TALK" &&
          action.targetId === "zara"
      );

    if (talk) {
      return talk;
    }
  }

  const observe =
    legalActions.find(
      action =>
        action.type === "OBSERVE"
    );

  return observe || legalActions[0];
}

function executeAction(
  action: Action,
  world: WorldState
) {
  const actor =
    world.characters.find(
      character =>
        character.id === action.actorId
    );

  if (!actor) {
    throw new Error(
      `Actor ${action.actorId} does not exist.`
    );
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

        action:
          `${actor.name} investigates the company's activities.`,

        reason:
          `${actor.name} wants to ${actor.goal.toLowerCase()}.`,

        knowledge:
          knowledge,

        emotionalChange:
          "Becomes more suspicious and confident.",

        priority:
          actor.currentPriority
      };
    }

    case "TALK": {
      if (!target) {
        throw new Error(
          "Talk target does not exist."
        );
      }

      actor.emotionalState =
        "Carefully watching the conversation";

      return {
        event:
          `${actor.name} talks to ${target.name}, but neither reveals everything they know.`,

        action:
          `${actor.name} talks to ${target.name}.`,

        reason:
          `${actor.name} wants information while protecting their own interests.`,

        knowledge:
          `${actor.name} realizes that ${target.name} is unusually cautious.`,

        emotionalChange:
          "Becomes more cautious.",

        priority:
          actor.currentPriority
      };
    }

    case "FOLLOW": {
      if (!target) {
        throw new Error(
          "Follow target does not exist."
        );
      }

      return {
        event:
          `${actor.name} quietly follows ${target.name}.`,

        action:
          `${actor.name} follows ${target.name}.`,

        reason:
          `${actor.name} suspects ${target.name} may know something important.`,

        knowledge:
          "",

        emotionalChange:
          "Becomes more alert.",

        priority:
          actor.currentPriority
      };
    }

    case "OBSERVE": {
      return {
        event:
          `${actor.name} observes the surrounding environment without directly intervening.`,

        action:
          `${actor.name} observes the surrounding environment.`,

        reason:
          `${actor.name} wants to understand what is happening before acting.`,

        knowledge:
          "",

        emotionalChange:
          "Remains cautious.",

        priority:
          actor.currentPriority
      };
    }

    case "WAIT": {
      return {
        event:
          `${actor.name} decides not to act immediately.`,

        action:
          `${actor.name} waits.`,

        reason:
          `${actor.name} decides immediate action could create unnecessary risk.`,

        knowledge:
          "",

        emotionalChange:
          "Remains uncertain.",

        priority:
          actor.currentPriority
      };
    }
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    let world = normalizeWorld(
      body?.world
    );

    const intervention =
      typeof body?.intervention === "string"
        ? body.intervention.trim()
        : "";

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

    if (intervention) {
      dayEvents.push(
        `The user intervenes in the world: ${intervention}`
      );
    }

    for (const character of world.characters) {
      const legalActions =
        generateLegalActions(
          character,
          world
        );

      const chosenAction =
        chooseAction(
          character,
          legalActions
        );

      const result =
        executeAction(
          chosenAction,
          world
        );

      dayEvents.push(
        result.event
      );

      characterUpdates.push({
        name: character.name,
        action: result.action,
        reason: result.reason,
        new_knowledge: result.knowledge,
        relationship_change: "",
        emotional_change:
          result.emotionalChange,
        new_priority: result.priority
      });
    }

    world.events = [
      ...world.events,
      ...dayEvents
    ];

    world.situation =
      dayEvents.join(" ");

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
            "Zara is becoming more suspicious of the company, while Daniel is trying to protect himself and his relationship with Zara."
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
