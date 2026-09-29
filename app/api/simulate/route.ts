import { NextRequest, NextResponse } from "next/server";

type ActionType =
  | "MOVE"
  | "OBSERVE"
  | "TALK"
  | "FOLLOW"
  | "SEARCH"
  | "INVESTIGATE"
  | "CONFRONT"
  | "CONTACT"
  | "WAIT";

type Location = {
  id: string;
  name: string;
};

type WorldObject = {
  id: string;
  name: string;
  locationId: string;
  ownerId?: string;
  visible: boolean;
  destroyed?: boolean;
};

type Character = {
  id: string;
  name: string;
  role: string;
  goal: string;
  fear: string;
  secret: string;
  currentPriority: string;
  emotionalState: string;
  locationId: string;
  knowledge: string[];
  capabilities: string[];
  resources: string[];
  relationships: Record<string, string>;
};

type WorldEvent = {
  id: string;
  day: number;
  actorId?: string;
  type: ActionType | "SYSTEM";
  description: string;
};

type WorldState = {
  day: number;
  locations: Location[];
  characters: Character[];
  objects: WorldObject[];
  events: WorldEvent[];
};

type LegalAction = {
  id: string;
  actorId: string;
  type: ActionType;
  targetCharacterId?: string;
  targetLocationId?: string;
  targetObjectId?: string;
};

type ExecutedAction = LegalAction & {
  description: string;
  knowledgeGained: string[];
};

const MODEL = "openai/gpt-oss-120b";

function getGroqKey() {
  return process.env.GROQ_API_KEY;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function findCharacter(world: WorldState, id: string) {
  return world.characters.find((c) => c.id === id);
}

function findLocation(world: WorldState, id: string) {
  return world.locations.find((l) => l.id === id);
}

function findObject(world: WorldState, id: string) {
  return world.objects.find((o) => o.id === id);
}

function nearbyCharacters(world: WorldState, actor: Character) {
  return world.characters.filter(
    (c) => c.id !== actor.id && c.locationId === actor.locationId
  );
}

/**
 * IMPORTANT:
 * The world below is the source of truth.
 *
 * The AI is NOT allowed to add anything to it.
 */
function createInitialWorld(): WorldState {
  return {
    day: 1,

    locations: [
      {
        id: "unilag_campus",
        name: "University of Lagos campus",
      },
      {
        id: "campus_cafe",
        name: "Campus Café",
      },
      {
        id: "company_office",
        name: "Company Liaison Office",
      },
    ],

    characters: [
      {
        id: "zara",
        name: "Zara",
        role: "Student investigator",
        goal: "Discover what the mysterious technology company is doing on campus.",
        fear: "The company will harm innocent students or discover her investigation.",
        secret: "She has already collected evidence against the company.",
        currentPriority: "Find concrete evidence.",
        emotionalState: "Suspicious but determined.",
        locationId: "unilag_campus",

        knowledge: [
          "The company has been approaching students privately.",
          "Some students who were recruited have stopped talking openly about the company.",
        ],

        capabilities: [
          "observe",
          "investigate",
          "follow",
          "search",
          "confront",
          "talk",
        ],

        resources: [
          "smartphone",
          "student ID",
          "personal laptop",
          "student contacts",
        ],

        relationships: {
          daniel:
            "She trusts Daniel deeply, but she does not know that he is hiding something.",
        },
      },

      {
        id: "daniel",
        name: "Daniel",
        role: "Student and company contact",
        goal: "Secure his financial future while protecting Zara.",
        fear: "The company will harm his family if he disobeys.",
        secret:
          "The company offered him ₦5m to identify students investigating it.",
        currentPriority: "Protect his family without betraying Zara.",
        emotionalState: "Conflicted and afraid.",
        locationId: "unilag_campus",

        knowledge: [
          "The company knows Zara is investigating.",
          "The company wants him to identify suspicious students.",
        ],

        capabilities: [
          "persuasion",
          "observe",
          "talk",
          "contact",
          "lie",
          "move",
        ],

        resources: [
          "smartphone",
          "student ID",
          "company contact",
          "student contacts",
        ],

        relationships: {
          zara: "He cares deeply about Zara but is hiding the company's offer.",
        },
      },
    ],

    objects: [],

    events: [
      {
        id: "event_day1_meeting",
        day: 1,
        actorId: "zara",
        type: "SYSTEM",
        description:
          "Zara notices Daniel leaving a private meeting with the mysterious company.",
      },
    ],
  };
}

/**
 * Generates ONLY actions that are physically/logically available.
 * The LLM never generates the action list.
 */
function generateLegalActions(
  world: WorldState,
  actor: Character
): LegalAction[] {
  const actions: LegalAction[] = [];

  const nearby = nearbyCharacters(world, actor);

  actions.push({
    id: `${actor.id}_wait`,
    actorId: actor.id,
    type: "WAIT",
  });

  actions.push({
    id: `${actor.id}_observe`,
    actorId: actor.id,
    type: "OBSERVE",
  });

  for (const character of nearby) {
    actions.push({
      id: `${actor.id}_talk_${character.id}`,
      actorId: actor.id,
      type: "TALK",
      targetCharacterId: character.id,
    });

    actions.push({
      id: `${actor.id}_confront_${character.id}`,
      actorId: actor.id,
      type: "CONFRONT",
      targetCharacterId: character.id,
    });
  }

  for (const location of world.locations) {
    if (location.id !== actor.locationId) {
      actions.push({
        id: `${actor.id}_move_${location.id}`,
        actorId: actor.id,
        type: "MOVE",
        targetLocationId: location.id,
      });
    }
  }

  for (const character of nearby) {
    actions.push({
      id: `${actor.id}_follow_${character.id}`,
      actorId: actor.id,
      type: "FOLLOW",
      targetCharacterId: character.id,
    });
  }

  actions.push({
    id: `${actor.id}_search_${actor.locationId}`,
    actorId: actor.id,
    type: "SEARCH",
    targetLocationId: actor.locationId,
  });

  for (const character of world.characters) {
    if (character.id !== actor.id && actor.capabilities.includes("contact")) {
      actions.push({
        id: `${actor.id}_contact_${character.id}`,
        actorId: actor.id,
        type: "CONTACT",
        targetCharacterId: character.id,
      });
    }
  }

  if (actor.capabilities.includes("investigate")) {
    for (const location of world.locations) {
      actions.push({
        id: `${actor.id}_investigate_${location.id}`,
        actorId: actor.id,
        type: "INVESTIGATE",
        targetLocationId: location.id,
      });
    }
  }

  return actions;
}

/**
 * Removes impossible actions and duplicates.
 */
function validateActions(
  world: WorldState,
  actions: LegalAction[],
  actor: Character
): LegalAction[] {
  const valid: LegalAction[] = [];

  for (const action of actions) {
    if (action.actorId !== actor.id) continue;

    if (action.targetCharacterId) {
      if (!findCharacter(world, action.targetCharacterId)) continue;
    }

    if (action.targetLocationId) {
      if (!findLocation(world, action.targetLocationId)) continue;
    }

    if (action.targetObjectId) {
      if (!findObject(world, action.targetObjectId)) continue;
    }

    if (
      ["TALK", "CONFRONT", "FOLLOW"].includes(action.type) &&
      action.targetCharacterId
    ) {
      const target = findCharacter(world, action.targetCharacterId);

      if (!target) continue;

      if (
        action.type !== "FOLLOW" &&
        target.locationId !== actor.locationId
      ) {
        continue;
      }
    }

    if (action.type === "MOVE") {
      if (!action.targetLocationId) continue;

      if (action.targetLocationId === actor.locationId) {
        continue;
      }
    }

    if (action.type === "SEARCH") {
      if (action.targetLocationId !== actor.locationId) {
        continue;
      }
    }

    valid.push(action);
  }

  const seen = new Set<string>();

  return valid.filter((action) => {
    if (seen.has(action.id)) return false;

    seen.add(action.id);
    return true;
  });
}

/**
 * The LLM is ONLY allowed to select one action
 * from the already-generated legal list.
 */
async function chooseAction(
  world: WorldState,
  actor: Character,
  legalActions: LegalAction[]
): Promise<LegalAction> {
  const apiKey = getGroqKey();

  if (!apiKey || legalActions.length === 0) {
    return legalActions[0];
  }

  const actionDescriptions = legalActions.map((action) => {
    const targetCharacter = action.targetCharacterId
      ? findCharacter(world, action.targetCharacterId)?.name
      : undefined;

    const targetLocation = action.targetLocationId
      ? findLocation(world, action.targetLocationId)?.name
      : undefined;

    return {
      id: action.id,
      type: action.type,
      targetCharacter,
      targetLocation,
    };
  });

  const prompt = `
You are the decision-making component of a persistent world simulation.

You are NOT a storyteller.

You MUST NOT invent:
- people
- objects
- locations
- organizations
- events
- evidence
- messages
- discoveries
- consequences

You may ONLY choose ONE action from the supplied legal action list.

Character:
${JSON.stringify(actor, null, 2)}

Current world:
${JSON.stringify(
  {
    day: world.day,
    locations: world.locations,
    characters: world.characters.map((c) => ({
      id: c.id,
      name: c.name,
      locationId: c.locationId,
      goal: c.goal,
      fear: c.fear,
      currentPriority: c.currentPriority,
      emotionalState: c.emotionalState,
      knowledge: c.knowledge,
      relationships: c.relationships,
    })),
    objects: world.objects,
  },
  null,
  2
)}

LEGAL ACTIONS:
${JSON.stringify(actionDescriptions, null, 2)}

Choose exactly ONE action.

Return ONLY valid JSON:

{
  "actionId": "exact-id-from-the-list"
}

Do not return explanations.
Do not create another action.
`;

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a constrained simulation decision engine. Never invent actions.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: {
            type: "json_object",
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Groq returned ${response.status}`);
    }

    const data = await response.json();

    const raw = data?.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("No decision returned");
    }

    const parsed = JSON.parse(raw);

    const selected = legalActions.find(
      (action) => action.id === parsed.actionId
    );

    if (selected) {
      return selected;
    }
  } catch (error) {
    console.error("Decision engine error:", error);
  }

  // Deterministic fallback.
  return legalActions[0];
}

/**
 * THIS is the actual simulation.
 *
 * No LLM is called here.
 * No new world entities can be created here.
 */
function executeAction(
  world: WorldState,
  action: LegalAction
): ExecutedAction {
  const actor = findCharacter(world, action.actorId);

  if (!actor) {
    throw new Error("Actor does not exist.");
  }

  const knowledgeGained: string[] = [];
  let description = "";

  switch (action.type) {
    case "WAIT": {
      description = `${actor.name} waits and observes what happens around them.`;
      break;
    }

    case "OBSERVE": {
      const nearby = nearbyCharacters(world, actor);

      if (nearby.length > 0) {
        description = `${actor.name} observes the people nearby.`;
      } else {
        description = `${actor.name} observes the surroundings.`;
      }

      break;
    }

    case "MOVE": {
      const destination = action.targetLocationId
        ? findLocation(world, action.targetLocationId)
        : undefined;

      if (!destination) {
        throw new Error("Invalid destination.");
      }

      actor.locationId = destination.id;

      description = `${actor.name} moves to ${destination.name}.`;

      break;
    }

    case "FOLLOW": {
      const target = action.targetCharacterId
        ? findCharacter(world, action.targetCharacterId)
        : undefined;

      if (!target) {
        throw new Error("Follow target does not exist.");
      }

      actor.locationId = target.locationId;

      description = `${actor.name} follows ${target.name}.`;

      break;
    }

    case "TALK": {
      const target = action.targetCharacterId
        ? findCharacter(world, action.targetCharacterId)
        : undefined;

      if (!target) {
        throw new Error("Talk target does not exist.");
      }

      if (target.locationId !== actor.locationId) {
        throw new Error("Characters are not in the same location.");
      }

      description = `${actor.name} talks with ${target.name}.`;

      break;
    }

    case "CONFRONT": {
      const target = action.targetCharacterId
        ? findCharacter(world, action.targetCharacterId)
        : undefined;

      if (!target) {
        throw new Error("Confront target does not exist.");
      }

      if (target.locationId !== actor.locationId) {
        throw new Error("Characters are not in the same location.");
      }

      description = `${actor.name} confronts ${target.name}.`;

      break;
    }

    case "SEARCH": {
      const location = action.targetLocationId
        ? findLocation(world, action.targetLocationId)
        : undefined;

      if (!location || location.id !== actor.locationId) {
        throw new Error("Invalid search location.");
      }

      const objects = world.objects.filter(
        (object) =>
          object.locationId === location.id &&
          object.visible &&
          !object.destroyed
      );

      if (objects.length === 0) {
        description = `${actor.name} searches ${location.name} but finds nothing relevant.`;
      } else {
        const names = objects.map((object) => object.name);

        description = `${actor.name} searches ${location.name} and notices ${names.join(
          ", "
        )}.`;

        for (const object of objects) {
          knowledgeGained.push(
            `${object.name} is located at ${location.name}.`
          );
        }
      }

      break;
    }

    case "INVESTIGATE": {
      const location = action.targetLocationId
        ? findLocation(world, action.targetLocationId)
        : undefined;

      if (!location) {
        throw new Error("Investigation target does not exist.");
      }

      description = `${actor.name} investigates ${location.name}.`;

      break;
    }

    case "CONTACT": {
      const target = action.targetCharacterId
        ? findCharacter(world, action.targetCharacterId)
        : undefined;

      if (!target) {
        throw new Error("Contact target does not exist.");
      }

      description = `${actor.name} contacts ${target.name}.`;

      break;
    }

    default:
      throw new Error("Unsupported action.");
  }

  const event: WorldEvent = {
    id: `day_${world.day}_${actor.id}_${world.events.length}`,
    day: world.day,
    actorId: actor.id,
    type: action.type,
    description,
  };

  world.events.push(event);

  for (const knowledge of knowledgeGained) {
    if (!actor.knowledge.includes(knowledge)) {
      actor.knowledge.push(knowledge);
    }
  }

  return {
    ...action,
    description,
    knowledgeGained,
  };
}

function summarizeAction(
  world: WorldState,
  executed: ExecutedAction
): string {
  return executed.description;
}

function buildSituation(world: WorldState): string {
  const recentEvents = world.events
    .filter((event) => event.day === world.day)
    .slice(-6);

  if (recentEvents.length === 0) {
    return "The world is quiet. The characters continue pursuing their goals.";
  }

  return recentEvents.map((event) => event.description).join(" ");
}

function buildNextTension(world: WorldState): string {
  const priorities = world.characters
    .map((character) => `${character.name}: ${character.currentPriority}`)
    .join(" ");

  return `The characters continue pursuing their own priorities. ${priorities}`;
}

function buildCharacterUpdate(
  world: WorldState,
  actor: Character,
  executed: ExecutedAction
) {
  return {
    name: actor.name,
    action: summarizeAction(world, executed),
    reason: actor.currentPriority,
    newKnowledge: executed.knowledgeGained,
    relationship: Object.values(actor.relationships)[0] ?? "",
  };
}

function normalizeIncomingWorld(input: unknown): WorldState {
  if (!input || typeof input !== "object") {
    return createInitialWorld();
  }

  const candidate = input as Partial<WorldState>;

  if (
    !Array.isArray(candidate.characters) ||
    !Array.isArray(candidate.locations)
  ) {
    return createInitialWorld();
  }

  return {
    day: Number(candidate.day) || 1,
    locations: candidate.locations,
    characters: candidate.characters,
    objects: Array.isArray(candidate.objects) ? candidate.objects : [],
    events: Array.isArray(candidate.events) ? candidate.events : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const incomingWorld = body?.world;

    const world = clone(normalizeIncomingWorld(incomingWorld));

    /*
     * If no world was supplied, start from Day 1.
     */
    if (!incomingWorld) {
      const initialWorld = createInitialWorld();

      return NextResponse.json({
        success: true,
        world: initialWorld,
        day: initialWorld.day,
        situation: buildSituation(initialWorld),
        timeline: initialWorld.events,
        character_updates: [],
        next_tension: buildNextTension(initialWorld),
      });
    }

    /*
     * Advance exactly ONE day.
     */
    world.day += 1;

    const executedActions: ExecutedAction[] = [];

    /*
     * Each character acts once.
     *
     * Their choices are independent.
     * The second character sees the world after the first
     * character's action.
     */
    for (const actor of world.characters) {
      const legal = validateActions(
        world,
        generateLegalActions(world, actor),
        actor
      );

      if (legal.length === 0) {
        continue;
      }

      const selected = await chooseAction(world, actor, legal);

      /*
       * Revalidate immediately before execution.
       */
      const stillLegal = validateActions(
        world,
        [selected],
        actor
      );

      if (stillLegal.length === 0) {
        continue;
      }

      const executed = executeAction(world, stillLegal[0]);

      executedActions.push(executed);
    }

    const characterUpdates = executedActions.map((executed) => {
      const actor = findCharacter(world, executed.actorId);

      if (!actor) {
        return null;
      }

      return buildCharacterUpdate(world, actor, executed);
    }).filter(Boolean);

    return NextResponse.json({
      success: true,

      day: world.day,

      world,

      situation: buildSituation(world),

      timeline: world.events,

      simulation_result:
        executedActions.length > 0
          ? executedActions.map((action) => action.description).join(" ")
          : "No character action was executed.",

      character_updates: characterUpdates,

      next_tension: buildNextTension(world),
    });
  } catch (error) {
    console.error("Simulation error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Simulation failed.",
      },
      { status: 500 }
    );
  }
}
