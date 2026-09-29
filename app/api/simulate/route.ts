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
  currentPriority: string;
  emotionalState: string;
  secret: string;
  relationship: string;
  knowledge: string[];
  capabilities: string[];
  resources: string[];
  location: string;
};

type WorldEntity = {
  id: string;
  name: string;
  type: "person" | "organization" | "location";
  description: string;
  location?: string;
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
  location: string;
  situation: string;
  characters: Character[];
  entities: WorldEntity[];
  events: string[];

  /*
   * Internal simulation state.
   * These fields are optional so the existing frontend world
   * can still be accepted without crashing.
   */
  objects?: WorldObject[];
  locations?: Location[];
  internalEvents?: WorldEvent[];
};

type LegalAction = {
  id: string;
  actorId: string;
  type: ActionType;
  targetCharacterId?: string;
  targetLocationId?: string;
};

type ExecutedAction = LegalAction & {
  description: string;
  knowledgeGained: string[];
  relationshipChange: string;
  emotionalChange: string;
  newPriority: string;
};

type CharacterUpdate = {
  name: string;
  action: string;
  reason: string;
  new_knowledge: string;
  relationship_change: string;
  emotional_change: string;
  new_priority: string;
};

const MODEL = "openai/gpt-oss-120b";

function getGroqKey() {
  return process.env.GROQ_API_KEY;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function initialWorld(): WorldState {
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

        personality:
          "Ambitious, observant, suspicious and brave.",

        goal:
          "Discover what the mysterious company is really doing.",

        fear:
          "The company will hurt innocent students and discover her investigation.",

        currentPriority:
          "Find concrete evidence against the company.",

        emotionalState:
          "Suspicious but determined.",

        secret:
          "She has already collected evidence against the company.",

        relationship:
          "She trusts Daniel deeply.",

        knowledge: [
          "The company has been approaching students privately.",
          "Some recruited students have suddenly stopped talking to their friends.",
        ],

        capabilities: [
          "Good at observing people",
          "Good at investigating situations",
          "Comfortable using a smartphone",
          "Knows several students on campus",
        ],

        resources: [
          "smartphone",
          "student ID",
          "personal laptop",
          "student contacts",
        ],

        location: "University of Lagos campus",
      },

      {
        id: "daniel",
        name: "Daniel",
        role: "Student and company contact",

        personality:
          "Charming, ambitious, intelligent and conflicted.",

        goal:
          "Become financially successful while protecting Zara.",

        fear:
          "The company will harm his family if he disobeys.",

        currentPriority:
          "Protect his family without betraying Zara.",

        emotionalState:
          "Conflicted and afraid.",

        secret:
          "The company has offered him ₦5 million to identify students investigating it.",

        relationship:
          "He cares deeply about Zara but is hiding something from her.",

        knowledge: [
          "The company knows Zara is investigating.",
          "The company wants Daniel to identify other suspicious students.",
        ],

        capabilities: [
          "Good at persuasion",
          "Good at hiding his emotions",
          "Knows several students",
          "Can communicate with the company",
        ],

        resources: [
          "smartphone",
          "student ID",
          "company contact",
          "student contacts",
        ],

        location: "University of Lagos campus",
      },
    ],

    entities: [
      {
        id: "company",
        name: "Mysterious Technology Company",
        type: "organization",
        description:
          "A private technology company secretly recruiting students on campus.",
      },

      {
        id: "unilag",
        name: "University of Lagos",
        type: "location",
        description:
          "The university campus where the simulation takes place.",
      },

      {
        id: "campus-cafe",
        name: "Campus Café",
        type: "location",
        description:
          "A public café where students regularly meet.",
      },

      {
        id: "company-office",
        name: "Company Liaison Office",
        type: "location",
        description:
          "A discreet office used by the company's campus representative.",
        location: "University of Lagos campus",
      },
    ],

    events: [
      "Zara notices Daniel leaving a private meeting with the mysterious company.",
    ],

    objects: [],

    locations: [
      {
        id: "unilag",
        name: "University of Lagos campus",
      },
      {
        id: "campus-cafe",
        name: "Campus Café",
      },
      {
        id: "company-office",
        name: "Company Liaison Office",
      },
    ],

    internalEvents: [
      {
        id: "day1_initial",
        day: 1,
        actorId: "zara",
        type: "SYSTEM",
        description:
          "Zara notices Daniel leaving a private meeting with the mysterious company.",
      },
    ],
  };
}

function normalizeWorld(input: unknown): WorldState {
  if (!input || typeof input !== "object") {
    return initialWorld();
  }

  const incoming = input as Partial<WorldState>;

  if (
    !Array.isArray(incoming.characters) ||
    !Array.isArray(incoming.entities)
  ) {
    return initialWorld();
  }

  const base = initialWorld();

  return {
    day:
      typeof incoming.day === "number"
        ? incoming.day
        : 1,

    location:
      typeof incoming.location === "string"
        ? incoming.location
        : base.location,

    situation:
      typeof incoming.situation === "string"
        ? incoming.situation
        : base.situation,

    characters: clone(incoming.characters),

    entities: clone(incoming.entities),

    events: Array.isArray(incoming.events)
      ? clone(incoming.events)
      : [],

    objects: Array.isArray(incoming.objects)
      ? clone(incoming.objects)
      : [],

    locations: Array.isArray(incoming.locations)
      ? clone(incoming.locations)
      : clone(base.locations),

    internalEvents: Array.isArray(incoming.internalEvents)
      ? clone(incoming.internalEvents)
      : [],
  };
}

function locationIdForName(
  world: WorldState,
  name: string
): string | undefined {
  return world.locations?.find(
    (location) => location.name === name
  )?.id;
}

function locationName(
  world: WorldState,
  id: string
): string {
  return (
    world.locations?.find(
      (location) => location.id === id
    )?.name ?? id
  );
}

function findCharacter(
  world: WorldState,
  id: string
): Character | undefined {
  return world.characters.find(
    (character) => character.id === id
  );
}

function findCharacterByName(
  world: WorldState,
  name: string
): Character | undefined {
  return world.characters.find(
    (character) =>
      character.name.toLowerCase() === name.toLowerCase()
  );
}

function nearbyCharacters(
  world: WorldState,
  actor: Character
): Character[] {
  return world.characters.filter(
    (character) =>
      character.id !== actor.id &&
      character.location === actor.location
  );
}

/*
 * CODE creates the legal action list.
 *
 * The LLM never creates actions.
 */
function generateLegalActions(
  world: WorldState,
  actor: Character
): LegalAction[] {
  const actions: LegalAction[] = [];

  actions.push({
    id: `${actor.id}:WAIT`,
    actorId: actor.id,
    type: "WAIT",
  });

  actions.push({
    id: `${actor.id}:OBSERVE`,
    actorId: actor.id,
    type: "OBSERVE",
  });

  const nearby = nearbyCharacters(world, actor);

  for (const target of nearby) {
    actions.push({
      id: `${actor.id}:TALK:${target.id}`,
      actorId: actor.id,
      type: "TALK",
      targetCharacterId: target.id,
    });

    actions.push({
      id: `${actor.id}:CONFRONT:${target.id}`,
      actorId: actor.id,
      type: "CONFRONT",
      targetCharacterId: target.id,
    });

    actions.push({
      id: `${actor.id}:FOLLOW:${target.id}`,
      actorId: actor.id,
      type: "FOLLOW",
      targetCharacterId: target.id,
    });
  }

  /*
   * Only allow movement to locations that actually exist.
   */
  for (const location of world.locations ?? []) {
    if (
      location.name !== actor.location
    ) {
      actions.push({
        id: `${actor.id}:MOVE:${location.id}`,
        actorId: actor.id,
        type: "MOVE",
        targetLocationId: location.id,
      });
    }
  }

  actions.push({
    id: `${actor.id}:SEARCH`,
    actorId: actor.id,
    type: "SEARCH",
  });

  if (
    actor.capabilities.some(
      (capability) =>
        capability.toLowerCase().includes("investigat")
    )
  ) {
    actions.push({
      id: `${actor.id}:INVESTIGATE`,
      actorId: actor.id,
      type: "INVESTIGATE",
    });
  }

  /*
   * Contact is allowed only for Daniel because his
   * existing world state says he can communicate
   * with the company.
   *
   * We still don't create a new entity.
   */
  if (
    actor.id === "daniel" &&
    world.entities.some(
      (entity) => entity.id === "company"
    )
  ) {
    actions.push({
      id: `${actor.id}:CONTACT_COMPANY`,
      actorId: actor.id,
      type: "CONTACT",
    });
  }

  return actions;
}

function validateAction(
  world: WorldState,
  action: LegalAction
): boolean {
  const actor = findCharacter(
    world,
    action.actorId
  );

  if (!actor) return false;

  if (action.targetCharacterId) {
    const target = findCharacter(
      world,
      action.targetCharacterId
    );

    if (!target) return false;
  }

  if (action.targetLocationId) {
    const locationExists =
      world.locations?.some(
        (location) =>
          location.id === action.targetLocationId
      );

    if (!locationExists) return false;
  }

  if (
    action.type === "TALK" ||
    action.type === "CONFRONT"
  ) {
    if (!action.targetCharacterId) return false;

    const target = findCharacter(
      world,
      action.targetCharacterId
    );

    if (!target) return false;

    if (target.location !== actor.location) {
      return false;
    }
  }

  if (action.type === "FOLLOW") {
    if (!action.targetCharacterId) return false;

    const target = findCharacter(
      world,
      action.targetCharacterId
    );

    if (!target) return false;
  }

  if (action.type === "MOVE") {
    if (!action.targetLocationId) return false;

    const targetLocation =
      world.locations?.find(
        (location) =>
          location.id === action.targetLocationId
      );

    if (!targetLocation) return false;

    if (targetLocation.name === actor.location) {
      return false;
    }
  }

  return true;
}

async function chooseAction(
  world: WorldState,
  actor: Character,
  legalActions: LegalAction[]
): Promise<LegalAction> {
  if (legalActions.length === 0) {
    throw new Error("No legal actions.");
  }

  const apiKey = getGroqKey();

  /*
   * If Groq isn't configured, deterministic fallback.
   */
  if (!apiKey) {
    return legalActions[0];
  }

  const simplifiedActions = legalActions.map(
    (action) => ({
      id: action.id,
      type: action.type,
      targetCharacter:
        action.targetCharacterId
          ? findCharacter(
              world,
              action.targetCharacterId
            )?.name
          : null,
      targetLocation:
        action.targetLocationId
          ? locationName(
              world,
              action.targetLocationId
            )
          : null,
    })
  );

  const prompt = `
You are a decision engine inside a persistent world simulation.

You are NOT a storyteller.

You cannot create anything.

You cannot invent:
- people
- objects
- locations
- organizations
- evidence
- messages
- events
- discoveries
- consequences

You can ONLY select one action from LEGAL_ACTIONS.

CHARACTER:
${JSON.stringify(
  {
    id: actor.id,
    name: actor.name,
    role: actor.role,
    goal: actor.goal,
    fear: actor.fear,
    currentPriority: actor.currentPriority,
    emotionalState: actor.emotionalState,
    secret: actor.secret,
    relationship: actor.relationship,
    knowledge: actor.knowledge,
    location: actor.location,
  },
  null,
  2
)}

WORLD:
${JSON.stringify(
  {
    day: world.day,
    locations: world.locations,
    characters: world.characters.map(
      (character) => ({
        id: character.id,
        name: character.name,
        location: character.location,
        goal: character.goal,
        fear: character.fear,
        currentPriority:
          character.currentPriority,
        emotionalState:
          character.emotionalState,
        knowledge: character.knowledge,
        relationship:
          character.relationship,
      })
    ),
    entities: world.entities,
    objects: world.objects ?? [],
  },
  null,
  2
)}

LEGAL_ACTIONS:
${JSON.stringify(
  simplifiedActions,
  null,
  2
)}

Choose exactly ONE.

Return ONLY:

{
  "actionId": "exact-action-id"
}
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
          temperature: 0.1,

          messages: [
            {
              role: "system",
              content:
                "You select actions. You never create or describe new world facts.",
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
      throw new Error(
        `Groq returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "The decision model returned no content."
      );
    }

    const parsed = JSON.parse(content);

    const selected = legalActions.find(
      (action) =>
        action.id === parsed.actionId
    );

    if (
      selected &&
      validateAction(world, selected)
    ) {
      return selected;
    }
  } catch (error) {
    console.error(
      "Decision engine error:",
      error
    );
  }

  /*
   * Safe deterministic fallback.
   */
  return legalActions[0];
}

/*
 * This is where reality changes.
 *
 * There is NO LLM here.
 */
function executeAction(
  world: WorldState,
  action: LegalAction
): ExecutedAction {
  const actor = findCharacter(
    world,
    action.actorId
  );

  if (!actor) {
    throw new Error(
      "Cannot execute action: actor does not exist."
    );
  }

  let description = "";
  let knowledgeGained: string[] = [];
  let relationshipChange = "";
  let emotionalChange =
    actor.emotionalState;
  let newPriority =
    actor.currentPriority;

  switch (action.type) {
    case "WAIT": {
      description =
        `${actor.name} waits and continues observing the situation.`;

      break;
    }

    case "OBSERVE": {
      const nearby =
        nearbyCharacters(
          world,
          actor
        );

      if (nearby.length > 0) {
        description =
          `${actor.name} observes the people nearby.`;
      } else {
        description =
          `${actor.name} observes the surroundings.`;
      }

      break;
    }

    case "MOVE": {
      const destination =
        world.locations?.find(
          (location) =>
            location.id ===
            action.targetLocationId
        );

      if (!destination) {
        throw new Error(
          "Destination does not exist."
        );
      }

      actor.location =
        destination.name;

      description =
        `${actor.name} moves to ${destination.name}.`;

      break;
    }

    case "FOLLOW": {
      const target =
        action.targetCharacterId
          ? findCharacter(
              world,
              action.targetCharacterId
            )
          : undefined;

      if (!target) {
        throw new Error(
          "Follow target does not exist."
        );
      }

      actor.location =
        target.location;

      description =
        `${actor.name} follows ${target.name}.`;

      break;
    }

    case "TALK": {
      const target =
        action.targetCharacterId
          ? findCharacter(
              world,
              action.targetCharacterId
            )
          : undefined;

      if (!target) {
        throw new Error(
          "Talk target does not exist."
        );
      }

      if (
        target.location !==
        actor.location
      ) {
        throw new Error(
          "Characters are not together."
        );
      }

      description =
        `${actor.name} talks with ${target.name}.`;

      break;
    }

    case "CONFRONT": {
      const target =
        action.targetCharacterId
          ? findCharacter(
              world,
              action.targetCharacterId
            )
          : undefined;

      if (!target) {
        throw new Error(
          "Confront target does not exist."
        );
      }

      if (
        target.location !==
        actor.location
      ) {
        throw new Error(
          "Characters are not together."
        );
      }

      description =
        `${actor.name} confronts ${target.name}.`;

      if (actor.id === "zara") {
        relationshipChange =
          "Her trust in Daniel becomes more cautious after the confrontation.";

        emotionalChange =
          "More suspicious and alert.";
      }

      break;
    }

    case "SEARCH": {
      const objects =
        (world.objects ?? []).filter(
          (object) =>
            object.locationId ===
              locationIdForName(
                world,
                actor.location
              ) &&
            object.visible &&
            !object.destroyed
        );

      if (objects.length === 0) {
        description =
          `${actor.name} searches ${actor.location} but finds nothing relevant.`;
      } else {
        description =
          `${actor.name} searches ${actor.location} and notices ${objects
            .map((object) => object.name)
            .join(", ")}.`;

        knowledgeGained =
          objects.map(
            (object) =>
              `${object.name} is located at ${actor.location}.`
          );
      }

      break;
    }

    case "INVESTIGATE": {
      description =
        `${actor.name} investigates the ${actor.location}.`;

      break;
    }

    case "CONTACT": {
      if (actor.id !== "daniel") {
        throw new Error(
          "This character cannot contact the company."
        );
      }

      description =
        "Daniel contacts his existing company contact.";

      actor.emotionalState =
        "More conflicted after communicating with the company.";

      emotionalChange =
        actor.emotionalState;

      break;
    }

    default:
      throw new Error(
        "Unsupported action."
      );
  }

  return {
    ...action,
    description,
    knowledgeGained,
    relationshipChange,
    emotionalChange,
    newPriority,
  };
}

function addEvent(
  world: WorldState,
  executed: ExecutedAction
) {
  const eventText =
    executed.description;

  world.events.push(eventText);

  world.internalEvents =
    world.internalEvents ?? [];

  world.internalEvents.push({
    id:
      `day-${world.day}-${world.internalEvents.length}`,
    day: world.day,
    actorId: executed.actorId,
    type: executed.type,
    description: eventText,
  });
}

function createCharacterUpdate(
  world: WorldState,
  executed: ExecutedAction
): CharacterUpdate {
  const actor =
    findCharacter(
      world,
      executed.actorId
    );

  if (!actor) {
    throw new Error(
      "Character disappeared from world."
    );
  }

  return {
    name: actor.name,

    action:
      executed.description,

    reason:
      actor.currentPriority,

    new_knowledge:
      executed.knowledgeGained.length > 0
        ? executed.knowledgeGained.join(" ")
        : "",

    relationship_change:
      executed.relationshipChange,

    emotional_change:
      executed.emotionalChange,

    new_priority:
      executed.newPriority,
  };
}

function buildSituation(
  world: WorldState
): string {
  const todayEvents =
    world.internalEvents?.filter(
      (event) =>
        event.day === world.day
    ) ?? [];

  if (todayEvents.length === 0) {
    return world.situation;
  }

  return todayEvents
    .map(
      (event) =>
        event.description
    )
    .join(" ");
}

function buildNextTension(
  world: WorldState
): string {
  return world.characters
    .map(
      (character) =>
        `${character.name} continues to pursue: ${character.currentPriority}`
    )
    .join(" ");
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const suppliedWorld =
      body?.world;

    const world =
      clone(
        normalizeWorld(
          suppliedWorld
        )
      );

    /*
     * No supplied world means the client
     * is requesting the initial state.
     */
    if (!suppliedWorld) {
      const fresh =
        initialWorld();

      return NextResponse.json({
        success: true,

        world: fresh,

        result: {
          day: fresh.day,

          situation:
            fresh.situation,

          events:
            fresh.events,

          character_updates: [],

          new_situation:
            fresh.situation,

          next_tension:
            buildNextTension(
              fresh
            ),
        },
      });
    }

    /*
     * Advance exactly ONE day.
     */
    world.day += 1;

    const executedActions:
      ExecutedAction[] = [];

    /*
     * Characters act sequentially.
     *
     * The second character sees
     * the state produced by the first.
     */
    for (
      const actor of world.characters
    ) {
      const legalActions =
        generateLegalActions(
          world,
          actor
        ).filter(
          (action) =>
            validateAction(
              world,
              action
            )
        );

      if (
        legalActions.length === 0
      ) {
        continue;
      }

      const selected =
        await chooseAction(
          world,
          actor,
          legalActions
        );

      /*
       * Revalidate after the AI decision.
       */
      if (
        !validateAction(
          world,
          selected
        )
      ) {
        continue;
      }

      const executed =
        executeAction(
          world,
          selected
        );

      addEvent(
        world,
        executed
      );

      executedActions.push(
        executed
      );
    }

    /*
     * The frontend expects this exact shape.
     */
    const characterUpdates =
      executedActions.map(
        (executed) =>
          createCharacterUpdate(
            world,
            executed
          )
      );

    const todayEvents =
      world.internalEvents?.filter(
        (event) =>
          event.day === world.day
      ) ?? [];

    const events =
      todayEvents.map(
        (event) =>
          event.description
      );

    const situation =
      events.length > 0
        ? events.join(" ")
        : "The characters continue pursuing their goals.";

    world.situation =
      situation;

    /*
     * Return EXACTLY what page.tsx expects.
     */
    return NextResponse.json({
      success: true,

      world,

      result: {
        day: world.day,

        situation,

        events,

        character_updates:
          characterUpdates,

        new_situation:
          situation,

        next_tension:
          buildNextTension(
            world
          ),
      },
    });
  } catch (error) {
    console.error(
      "Simulation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Simulation failed.",
      },
      {
        status: 500,
      }
    );
  }
}
