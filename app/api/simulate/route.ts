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
  personality: string;
  goal: string;
  fear: string;
  current_priority: string;
  emotional_state: string;
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
  objects: WorldObject[];
  locations: Location[];
  internalEvents: WorldEvent[];
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
        personality: "Ambitious, observant, suspicious and brave.",
        goal: "Discover what the mysterious company is really doing.",
        fear:
          "The company will hurt innocent students and discover her investigation.",
        current_priority:
          "Find concrete evidence against the company.",
        emotional_state: "Suspicious but determined.",
        secret: "She has already collected evidence against the company.",
        relationship: "She trusts Daniel deeply.",

        knowledge: [
          "The company has been approaching students privately.",
          "Some recruited students have suddenly stopped talking to their friends."
        ],

        capabilities: [
          "Good at observing people",
          "Good at investigating situations",
          "Comfortable using a smartphone",
          "Knows several students on campus"
        ],

        resources: [
          "smartphone",
          "student ID",
          "personal laptop",
          "student contacts"
        ],

        location: "University of Lagos campus"
      },

      {
        id: "daniel",
        name: "Daniel",
        role: "Student and company contact",
        personality: "Charming, ambitious, intelligent and conflicted.",
        goal:
          "Become financially successful while protecting Zara.",
        fear:
          "The company will harm his family if he disobeys.",
        current_priority:
          "Protect his family without betraying Zara.",
        emotional_state: "Conflicted and afraid.",
        secret:
          "The company has offered him ₦5 million to identify students investigating it.",
        relationship:
          "He cares deeply about Zara but is hiding something from her.",

        knowledge: [
          "The company knows Zara is investigating.",
          "The company wants Daniel to identify other suspicious students."
        ],

        capabilities: [
          "Good at persuasion",
          "Good at hiding his emotions",
          "Knows several students",
          "Can communicate with the company"
        ],

        resources: [
          "smartphone",
          "student ID",
          "company contact",
          "student contacts"
        ],

        location: "University of Lagos campus"
      }
    ],

    entities: [
      {
        id: "company",
        name: "Mysterious Technology Company",
        type: "organization",
        description:
          "A private technology company secretly recruiting students on campus."
      },

      {
        id: "unilag",
        name: "University of Lagos",
        type: "location",
        description:
          "The university campus where the simulation takes place."
      },

      {
        id: "campus-cafe",
        name: "Campus Café",
        type: "location",
        description:
          "A public café where students regularly meet."
      },

      {
        id: "company-office",
        name: "Company Liaison Office",
        type: "location",
        description:
          "A discreet office used by the company's campus representative.",
        location: "University of Lagos campus"
      }
    ],

    events: [
      "Zara notices Daniel leaving a private meeting with the mysterious company."
    ],

    objects: [],

    locations: [
      {
        id: "unilag",
        name: "University of Lagos campus"
      },

      {
        id: "campus-cafe",
        name: "Campus Café"
      },

      {
        id: "company-office",
        name: "Company Liaison Office"
      }
    ],

    internalEvents: [
      {
        id: "day1-initial",
        day: 1,
        actorId: "zara",
        type: "SYSTEM",
        description:
          "Zara notices Daniel leaving a private meeting with the mysterious company."
      }
    ]
  };
}

function normalizeWorld(input: unknown): WorldState {
  if (!input || typeof input !== "object") {
    return initialWorld();
  }

  const incoming = input as Partial<WorldState> & {
    characters?: Array<
      Partial<Character> & {
        currentPriority?: string;
        emotionalState?: string;
      }
    >;
  };

  if (
    !Array.isArray(incoming.characters) ||
    !Array.isArray(incoming.entities)
  ) {
    return initialWorld();
  }

  const base = initialWorld();

  const characters: Character[] = incoming.characters.map(
    (raw, index) => {
      const fallback =
        base.characters[index] ?? base.characters[0];

      return {
        id: raw.id ?? fallback.id,
        name: raw.name ?? fallback.name,
        role: raw.role ?? fallback.role,

        personality:
          raw.personality ?? fallback.personality,

        goal:
          raw.goal ?? fallback.goal,

        fear:
          raw.fear ?? fallback.fear,

        current_priority:
          raw.current_priority ??
          raw.currentPriority ??
          fallback.current_priority,

        emotional_state:
          raw.emotional_state ??
          raw.emotionalState ??
          fallback.emotional_state,

        secret:
          raw.secret ?? fallback.secret,

        relationship:
          raw.relationship ?? fallback.relationship,

        knowledge:
          Array.isArray(raw.knowledge)
            ? raw.knowledge
            : fallback.knowledge,

        capabilities:
          Array.isArray(raw.capabilities)
            ? raw.capabilities
            : fallback.capabilities,

        resources:
          Array.isArray(raw.resources)
            ? raw.resources
            : fallback.resources,

        location:
          raw.location ?? fallback.location
      };
    }
  );

  return {
    day:
      typeof incoming.day === "number"
        ? incoming.day
        : base.day,

    location:
      incoming.location ?? base.location,

    situation:
      incoming.situation ?? base.situation,

    characters,

    entities:
      incoming.entities as WorldEntity[],

    events:
      Array.isArray(incoming.events)
        ? incoming.events
        : [],

    objects:
      Array.isArray(incoming.objects)
        ? incoming.objects
        : [],

    locations:
      Array.isArray(incoming.locations)
        ? incoming.locations
        : base.locations,

    internalEvents:
      Array.isArray(incoming.internalEvents)
        ? incoming.internalEvents
        : base.internalEvents
  };
}

function findCharacter(
  world: WorldState,
  id: string
) {
  return world.characters.find(
    character => character.id === id
  );
}

function nearbyCharacters(
  world: WorldState,
  actor: Character
) {
  return world.characters.filter(
    character =>
      character.id !== actor.id &&
      character.location === actor.location
  );
}

function locationName(
  world: WorldState,
  id: string
) {
  return (
    world.locations.find(
      location => location.id === id
    )?.name ?? id
  );
}

/*
 * The code defines what actions are actually possible.
 * The AI can only choose from this list.
 */
function generateLegalActions(
  world: WorldState,
  actor: Character
): LegalAction[] {
  const actions: LegalAction[] = [
    {
      id: `${actor.id}:WAIT`,
      actorId: actor.id,
      type: "WAIT"
    },

    {
      id: `${actor.id}:OBSERVE`,
      actorId: actor.id,
      type: "OBSERVE"
    },

    {
      id: `${actor.id}:SEARCH`,
      actorId: actor.id,
      type: "SEARCH"
    }
  ];

  if (
    actor.capabilities.some(
      capability =>
        capability
          .toLowerCase()
          .includes("investigat")
    )
  ) {
    actions.push({
      id: `${actor.id}:INVESTIGATE`,
      actorId: actor.id,
      type: "INVESTIGATE"
    });
  }

  for (
    const target of nearbyCharacters(world, actor)
  ) {
    actions.push(
      {
        id: `${actor.id}:TALK:${target.id}`,
        actorId: actor.id,
        type: "TALK",
        targetCharacterId: target.id
      },

      {
        id: `${actor.id}:CONFRONT:${target.id}`,
        actorId: actor.id,
        type: "CONFRONT",
        targetCharacterId: target.id
      },

      {
        id: `${actor.id}:FOLLOW:${target.id}`,
        actorId: actor.id,
        type: "FOLLOW",
        targetCharacterId: target.id
      }
    );
  }

  for (
    const location of world.locations
  ) {
    if (location.name !== actor.location) {
      actions.push({
        id:
          `${actor.id}:MOVE:${location.id}`,

        actorId: actor.id,

        type: "MOVE",

        targetLocationId: location.id
      });
    }
  }

  if (actor.id === "daniel") {
    actions.push({
      id: `${actor.id}:CONTACT_COMPANY`,
      actorId: actor.id,
      type: "CONTACT"
    });
  }

  return actions;
}

function validateAction(
  world: WorldState,
  action: LegalAction
) {
  const actor = findCharacter(
    world,
    action.actorId
  );

  if (!actor) {
    return false;
  }

  if (action.targetCharacterId) {
    const target = findCharacter(
      world,
      action.targetCharacterId
    );

    if (!target) {
      return false;
    }

    if (
      (
        action.type === "TALK" ||
        action.type === "CONFRONT"
      ) &&
      target.location !== actor.location
    ) {
      return false;
    }
  }

  if (action.targetLocationId) {
    const destination =
      world.locations.find(
        location =>
          location.id ===
          action.targetLocationId
      );

    if (!destination) {
      return false;
    }

    if (
      destination.name === actor.location
    ) {
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
    throw new Error(
      "No legal actions available."
    );
  }

  const apiKey =
    process.env.GROQ_API_KEY;

  /*
   * If Groq isn't configured, the simulation
   * still works using the deterministic fallback.
   */
  if (!apiKey) {
    return legalActions[0];
  }

  const simplifiedActions =
    legalActions.map(action => ({
      id: action.id,

      type: action.type,

      targetCharacter:
        action.targetCharacterId
          ? findCharacter(
              world,
              action.targetCharacterId
            )?.name ?? null
          : null,

      targetLocation:
        action.targetLocationId
          ? locationName(
              world,
              action.targetLocationId
            )
          : null
    }));

  const prompt = `
You are the decision engine of a persistent world simulation.

You are NOT a storyteller.

Do NOT invent:
- people
- objects
- locations
- organizations
- evidence
- messages
- discoveries
- events
- consequences

You may ONLY select exactly one action from LEGAL_ACTIONS.

CHARACTER:
${JSON.stringify(
  {
    id: actor.id,
    name: actor.name,
    role: actor.role,
    personality: actor.personality,
    goal: actor.goal,
    fear: actor.fear,
    current_priority:
      actor.current_priority,
    emotional_state:
      actor.emotional_state,
    secret: actor.secret,
    relationship:
      actor.relationship,
    knowledge: actor.knowledge,
    capabilities:
      actor.capabilities,
    resources:
      actor.resources,
    location:
      actor.location
  },
  null,
  2
)}

WORLD:
${JSON.stringify(
  {
    day: world.day,
    situation:
      world.situation,

    locations:
      world.locations,

    characters:
      world.characters.map(
        character => ({
          id: character.id,
          name: character.name,
          location:
            character.location,
          goal:
            character.goal,
          fear:
            character.fear,
          current_priority:
            character.current_priority,
          emotional_state:
            character.emotional_state,
          relationship:
            character.relationship,
          knowledge:
            character.knowledge
        })
      ),

    entities:
      world.entities,

    objects:
      world.objects
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

Return ONLY JSON:

{
  "actionId": "exact-action-id-from-LEGAL_ACTIONS"
}
`;

  try {
    const response =
      await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            model: MODEL,

            temperature: 0.1,

            messages: [
              {
                role: "system",

                content:
                  "Select one legal action. Never invent world facts."
              },

              {
                role: "user",

                content: prompt
              }
            ],

            response_format: {
              type: "json_object"
            }
          })
        }
      );

    if (!response.ok) {
      throw new Error(
        `Groq returned HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    const content =
      data?.choices?.[0]?.message
        ?.content;

    if (!content) {
      throw new Error(
        "Decision model returned no content."
      );
    }

    const parsed =
      JSON.parse(content);

    const selected =
      legalActions.find(
        action =>
          action.id ===
          parsed.actionId
      );

    if (
      selected &&
      validateAction(
        world,
        selected
      )
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
 * The LLM never directly modifies the world.
 * This function performs all state changes.
 */
function executeAction(
  world: WorldState,
  action: LegalAction
): ExecutedAction {
  const actor =
    findCharacter(
      world,
      action.actorId
    );

  if (!actor) {
    throw new Error(
      "Actor does not exist."
    );
  }

  let description = "";

  let knowledgeGained: string[] =
    [];

  let relationshipChange = "";

  let emotionalChange =
    actor.emotional_state;

  let newPriority =
    actor.current_priority;

  switch (action.type) {
    case "WAIT":

      description =
        `${actor.name} waits and continues pursuing their current priority.`;

      break;

    case "OBSERVE":

      if (
        nearbyCharacters(
          world,
          actor
        ).length > 0
      ) {
        description =
          `${actor.name} observes the people nearby.`;
      } else {
        description =
          `${actor.name} observes the surroundings.`;
      }

      break;

    case "MOVE": {
      const destination =
        world.locations.find(
          location =>
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

      if (
        !target ||
        target.location !==
          actor.location
      ) {
        throw new Error(
          "Talk target is not available."
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

      if (
        !target ||
        target.location !==
          actor.location
      ) {
        throw new Error(
          "Confront target is not available."
        );
      }

      description =
        `${actor.name} confronts ${target.name}.`;

      if (
        actor.id === "zara"
      ) {
        relationshipChange =
          "Zara becomes more cautious about trusting Daniel.";

        emotionalChange =
          "More suspicious and alert.";
      }

      break;
    }

    case "SEARCH": {
      const objects =
        world.objects.filter(
          object =>
            object.locationId ===
              (
                world.locations.find(
                  location =>
                    location.name ===
                    actor.location
                )?.id ??
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
            .map(
              object =>
                object.name
            )
            .join(", ")}.`;

        knowledgeGained =
          objects.map(
            object =>
              `${object.name} is located at ${actor.location}.`
          );
      }

      break;
    }

    case "INVESTIGATE":

      description =
        `${actor.name} investigates the ${actor.location}.`;

      break;

    case "CONTACT":

      if (actor.id !== "daniel") {
        throw new Error(
          "This character cannot contact the company."
        );
      }

      description =
        "Daniel contacts his existing company contact.";

      emotionalChange =
        "More conflicted after communicating with the company.";

      break;

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

    newPriority
  };
}

function addEvent(
  world: WorldState,
  executed: ExecutedAction
) {
  world.events.push(
    executed.description
  );

  world.internalEvents.push({
    id:
      `day-${world.day}-${world.internalEvents.length}`,

    day: world.day,

    actorId:
      executed.actorId,

    type:
      executed.type,

    description:
      executed.description
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
      "Character no longer exists."
    );
  }

  return {
    name: actor.name,

    action:
      executed.description,

    reason:
      actor.current_priority,

    new_knowledge:
      executed.knowledgeGained.join(
        " "
      ),

    relationship_change:
      executed.relationshipChange,

    emotional_change:
      executed.emotionalChange,

    new_priority:
      executed.newPriority
  };
}

function buildNextTension(
  world: WorldState
) {
  return world.characters
    .map(
      character =>
        `${character.name} continues to pursue: ${character.current_priority}`
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

    /*
     * First request: create the initial world.
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
            )
        }
      });
    }

    const world =
      clone(
        normalizeWorld(
          suppliedWorld
        )
      );

    /*
     * Advance exactly one day.
     */
    world.day += 1;

    const executedActions:
      ExecutedAction[] = [];

    /*
     * Characters act sequentially.
     * Later characters therefore see
     * changes made earlier in the day.
     */
    for (
      const actor of world.characters
    ) {
      const legalActions =
        generateLegalActions(
          world,
          actor
        ).filter(
          action =>
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

    const characterUpdates =
      executedActions.map(
        executed =>
          createCharacterUpdate(
            world,
            executed
          )
      );

    const todayEvents =
      world.internalEvents
        .filter(
          event =>
            event.day ===
            world.day
        )
        .map(
          event =>
            event.description
        );

    const situation =
      todayEvents.length > 0
        ? todayEvents.join(" ")
        : "The characters continue pursuing their goals.";

    world.situation =
      situation;

    /*
     * IMPORTANT:
     * This response shape matches
     * the existing page.tsx contract.
     */
    return NextResponse.json({
      success: true,

      world,

      result: {
        day: world.day,

        situation,

        events:
          todayEvents,

        character_updates:
          characterUpdates,

        new_situation:
          situation,

        next_tension:
          buildNextTension(
            world
          )
      }
    });
  } catch (error) {
    console.error(
      "Simulation error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Simulation failed."
      },
      {
        status: 500
      }
    );
  }
}
