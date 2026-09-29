import { NextRequest, NextResponse } from "next/server";

type ActionType =
  | "OBSERVE"
  | "MOVE"
  | "FOLLOW"
  | "TALK"
  | "INVESTIGATE"
  | "SEARCH"
  | "WAIT";

type Relationship = {
  targetId: string;
  trust: number;
  suspicion: number;
};

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

  relationships: Relationship[];
};

type Location = {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
};

type WorldState = {
  day: number;
  location: string;
  situation: string;

  characters: Character[];

  locations: Location[];
  entities: string[];
  objects: string[];

  evidence: string[];

  events: string[];
};

type Action = {
  type: ActionType;
  actorId: string;
  targetId?: string;
  destinationId?: string;
  description: string;
};

/* =========================================================
   INITIAL WORLD
========================================================= */

function createInitialWorld(): WorldState {
  return {
    day: 1,

    location: "University of Lagos",

    situation:
      "A mysterious technology company has started secretly recruiting students on campus.",

    locations: [
      {
        id: "campus",
        name: "University of Lagos Campus",
        description:
          "The main university grounds where students move between classes and social spaces.",
        connectedTo: [
          "campus-cafe",
          "company-office"
        ]
      },

      {
        id: "campus-cafe",
        name: "Campus Café",
        description:
          "A busy café where students meet, talk and study.",
        connectedTo: [
          "campus",
          "company-office"
        ]
      },

      {
        id: "company-office",
        name: "Company Liaison Office",
        description:
          "A small private office where company representatives meet selected students.",
        connectedTo: [
          "campus",
          "campus-cafe"
        ]
      }
    ],

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

        location: "campus",

        emotionalState:
          "Suspicious but determined",

        currentPriority:
          "Find more evidence",

        relationships: [
          {
            targetId: "daniel",
            trust: 45,
            suspicion: 55
          }
        ]
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

        location: "campus",

        emotionalState:
          "Conflicted and afraid",

        currentPriority:
          "Protect his family without betraying Zara",

        relationships: [
          {
            targetId: "zara",
            trust: 60,
            suspicion: 40
          }
        ]
      }
    ],

    entities: [
      "Mysterious technology company",
      "University of Lagos"
    ],

    objects: [
      "student smartphones",
      "student identification cards",
      "laptops"
    ],

    evidence: [],

    events: [
      "Zara notices Daniel leaving a private meeting with the mysterious company."
    ]
  };
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeCharacter(
  input: unknown,
  fallback: Character
): Character {
  const value =
    input && typeof input === "object"
      ? (input as Partial<Character>)
      : {};

  const incomingRelationships =
    Array.isArray(value.relationships)
      ? value.relationships
      : fallback.relationships;

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
        : fallback.currentPriority,

    relationships:
      incomingRelationships.map((relationship) => ({
        targetId:
          typeof relationship?.targetId === "string"
            ? relationship.targetId
            : "",

        trust:
          typeof relationship?.trust === "number"
            ? relationship.trust
            : 50,

        suspicion:
          typeof relationship?.suspicion === "number"
            ? relationship.suspicion
            : 50
      }))
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
          const raw =
            character as Partial<Character>;

          const fallback =
            initial.characters.find(
              item => item.id === raw.id
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

    locations:
      Array.isArray(value.locations)
        ? value.locations as Location[]
        : initial.locations,

    entities:
      Array.isArray(value.entities)
        ? value.entities.map(String)
        : initial.entities,

    objects:
      Array.isArray(value.objects)
        ? value.objects.map(String)
        : initial.objects,

    evidence:
      Array.isArray(value.evidence)
        ? value.evidence.map(String)
        : initial.evidence,

    events:
      Array.isArray(value.events)
        ? value.events.map(String)
        : initial.events
  };
}

/* =========================================================
   HELPERS
========================================================= */

function hasCapability(
  character: Character,
  keyword: string
): boolean {
  return character.capabilities.some(
    capability =>
      capability
        .toLowerCase()
        .includes(keyword.toLowerCase())
  );
}

function getRelationship(
  actor: Character,
  targetId: string
): Relationship {
  let relationship =
    actor.relationships.find(
      item => item.targetId === targetId
    );

  if (!relationship) {
    relationship = {
      targetId,
      trust: 50,
      suspicion: 50
    };

    actor.relationships.push(
      relationship
    );
  }

  return relationship;
}

function getLocation(
  world: WorldState,
  id: string
): Location | undefined {
  return world.locations.find(
    location => location.id === id
  );
}

function canMove(
  world: WorldState,
  actor: Character,
  destinationId: string
): boolean {
  const current =
    getLocation(world, actor.location);

  if (!current) {
    return false;
  }

  return current.connectedTo.includes(
    destinationId
  );
}

/* =========================================================
   LEGAL ACTION GENERATION
========================================================= */

function generateLegalActions(
  actor: Character,
  world: WorldState
): Action[] {
  const actions: Action[] = [];

  actions.push({
    type: "WAIT",
    actorId: actor.id,
    description:
      `${actor.name} waits and does not immediately intervene.`
  });

  actions.push({
    type: "OBSERVE",
    actorId: actor.id,
    description:
      `${actor.name} observes the current surroundings.`
  });

  /*
   * Investigation requires the actual capability.
   */
  if (
    hasCapability(
      actor,
      "investigation"
    )
  ) {
    actions.push({
      type: "INVESTIGATE",
      actorId: actor.id,
      description:
        `${actor.name} investigates for evidence.`
    });
  }

  /*
   * Search is also available to investigators.
   */
  if (
    hasCapability(
      actor,
      "investigation"
    )
  ) {
    actions.push({
      type: "SEARCH",
      actorId: actor.id,
      description:
        `${actor.name} searches the current location for useful information.`
    });
  }

  /*
   * Nearby characters.
   */
  const nearby =
    world.characters.filter(
      character =>
        character.id !== actor.id &&
        character.location === actor.location
    );

  for (const target of nearby) {
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
        `${actor.name} follows ${target.name}.`
    });
  }

  /*
   * Movement is limited to connected locations.
   */
  const current =
    getLocation(
      world,
      actor.location
    );

  if (current) {
    for (const destinationId of current.connectedTo) {
      const destination =
        getLocation(
          world,
          destinationId
        );

      if (!destination) {
        continue;
      }

      actions.push({
        type: "MOVE",
        actorId: actor.id,
        destinationId,
        description:
          `${actor.name} moves to ${destination.name}.`
      });
    }
  }

  return actions;
}

/* =========================================================
   DECISION ENGINE
========================================================= */

function chooseAction(
  actor: Character,
  legalActions: Action[],
  world: WorldState
): Action {
  if (legalActions.length === 0) {
    throw new Error(
      `No legal actions available for ${actor.name}.`
    );
  }

  /*
   * Zara prioritizes investigation while she
   * still lacks enough evidence.
   */
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

  /*
   * If Zara has already investigated, she becomes
   * more interested in Daniel.
   */
  if (
    actor.id === "zara" &&
    world.evidence.length > 0
  ) {
    const follow =
      legalActions.find(
        action =>
          action.type === "FOLLOW" &&
          action.targetId === "daniel"
      );

    if (follow) {
      return follow;
    }
  }

  /*
   * Daniel tends to talk to Zara because he is
   * trying to protect her without revealing everything.
   */
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

  /*
   * Otherwise investigate if possible.
   */
  const investigation =
    legalActions.find(
      action =>
        action.type === "INVESTIGATE"
    );

  if (investigation) {
    return investigation;
  }

  /*
   * Otherwise observe.
   */
  const observe =
    legalActions.find(
      action =>
        action.type === "OBSERVE"
    );

  return observe || legalActions[0];
}

/* =========================================================
   ACTION EXECUTION
========================================================= */

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
    /* -----------------------------------------------
       WAIT
    ----------------------------------------------- */

    case "WAIT":
      return {
        event:
          `${actor.name} decides not to act immediately.`,

        action:
          `${actor.name} waits.`,

        reason:
          `${actor.name} believes immediate action could create unnecessary risk.`,

        knowledge:
          "",

        emotionalChange:
          "Remains cautious.",

        priority:
          actor.currentPriority
      };

    /* -----------------------------------------------
       OBSERVE
    ----------------------------------------------- */

    case "OBSERVE":
      return {
        event:
          `${actor.name} observes the surroundings carefully.`,

        action:
          `${actor.name} observes the surrounding environment.`,

        reason:
          `${actor.name} wants more information before committing to an action.`,

        knowledge:
          "",

        emotionalChange:
          "Becomes slightly more alert.",

        priority:
          actor.currentPriority
      };

    /* -----------------------------------------------
       MOVE
    ----------------------------------------------- */

    case "MOVE": {
      if (!action.destinationId) {
        throw new Error(
          "Move action has no destination."
        );
      }

      if (
        !canMove(
          world,
          actor,
          action.destinationId
        )
      ) {
        return {
          event:
            `${actor.name} attempts to move but cannot reach that location.`,

          action:
            `${actor.name} fails to move.`,

          reason:
            "The destination is not directly accessible from the current location.",

          knowledge:
            "",

          emotionalChange:
            "Becomes slightly frustrated.",

          priority:
            actor.currentPriority
        };
      }

      const destination =
        getLocation(
          world,
          action.destinationId
        );

      if (!destination) {
        throw new Error(
          "Destination does not exist."
        );
      }

      actor.location =
        destination.id;

      return {
        event:
          `${actor.name} moves to ${destination.name}.`,

        action:
          `${actor.name} moves to ${destination.name}.`,

        reason:
          `${actor.name} decides the new location may help with their current priority.`,

        knowledge:
          "",

        emotionalChange:
          "More alert to the new surroundings.",

        priority:
          actor.currentPriority
      };
    }

    /* -----------------------------------------------
       TALK
    ----------------------------------------------- */

    case "TALK": {
      if (!target) {
        throw new Error(
          "Talk target does not exist."
        );
      }

      if (
        actor.location !==
        target.location
      ) {
        return {
          event:
            `${actor.name} wants to talk to ${target.name}, but ${target.name} is not nearby.`,

          action:
            `${actor.name} fails to talk to ${target.name}.`,

          reason:
            "The target is not at the same location.",

          knowledge:
            "",

          emotionalChange:
            "Becomes slightly frustrated.",

          priority:
            actor.currentPriority
        };
      }

      const relationship =
        getRelationship(
          actor,
          target.id
        );

      relationship.suspicion =
        Math.min(
          100,
          relationship.suspicion + 5
        );

      /*
       * Daniel does not reveal his secret.
       */
      if (
        actor.id === "daniel" &&
        target.id === "zara"
      ) {
        return {
          event:
            "Daniel talks with Zara but carefully avoids revealing his agreement with the company.",

          action:
            "Daniel talks to Zara without revealing his secret.",

          reason:
            "Daniel wants to protect Zara while also protecting himself.",

          knowledge:
            "Daniel appears unusually careful about what he says.",

          emotionalChange:
            "More conflicted.",

          priority:
            actor.currentPriority
        };
      }

      return {
        event:
          `${actor.name} talks with ${target.name}, but neither reveals everything they know.`,

        action:
          `${actor.name} talks with ${target.name}.`,

        reason:
          `${actor.name} wants information while protecting their own interests.`,

        knowledge:
          `${actor.name} notices that ${target.name} is unusually cautious.`,

        emotionalChange:
          "More cautious.",

        priority:
          actor.currentPriority
      };
    }

    /* -----------------------------------------------
       FOLLOW
    ----------------------------------------------- */

    case "FOLLOW": {
      if (!target) {
        throw new Error(
          "Follow target does not exist."
        );
      }

      if (
        actor.location !==
        target.location
      ) {
        return {
          event:
            `${actor.name} considers following ${target.name}, but loses sight of them.`,

          action:
            `${actor.name} fails to follow ${target.name}.`,

          reason:
            "The target is no longer nearby.",

          knowledge:
            "",

          emotionalChange:
            "Becomes frustrated.",

          priority:
            actor.currentPriority
        };
      }

      const relationship =
        getRelationship(
          actor,
          target.id
        );

      relationship.suspicion =
        Math.min(
          100,
          relationship.suspicion + 10
        );

      return {
        event:
          `${actor.name} quietly follows ${target.name}.`,

        action:
          `${actor.name} follows ${target.name}.`,

        reason:
          `${actor.name} suspects ${target.name} may know something important.`,

        knowledge:
          `${actor.name} becomes more suspicious of ${target.name}.`,

        emotionalChange:
          "More alert and suspicious.",

        priority:
          actor.currentPriority
      };
    }

    /* -----------------------------------------------
       INVESTIGATE
    ----------------------------------------------- */

    case "INVESTIGATE": {
      if (
        !hasCapability(
          actor,
          "investigation"
        )
      ) {
        return {
          event:
            `${actor.name} attempts to investigate but lacks the necessary capability.`,

          action:
            `${actor.name} fails to investigate.`,

          reason:
            "The character does not have the required capability.",

          knowledge:
            "",

          emotionalChange:
            "Slightly frustrated.",

          priority:
            actor.currentPriority
        };
      }

      /*
       * Deterministic consequence:
       * Zara discovers evidence the first time.
       */
      const newEvidence =
        "The company is deliberately approaching students privately.";

      if (
        !world.evidence.includes(
          newEvidence
        )
      ) {
        world.evidence.push(
          newEvidence
        );

        if (
          !actor.knowledge.includes(
            newEvidence
          )
        ) {
          actor.knowledge.push(
            newEvidence
          );
        }

        actor.currentPriority =
          "Determine why the company is recruiting students";

        actor.emotionalState =
          "More suspicious but increasingly confident";

        return {
          event:
            `${actor.name} investigates the company's activities and discovers new evidence.`,

          action:
            `${actor.name} investigates the company.`,

          reason:
            `${actor.name} is pursuing their goal of discovering what the company is doing.`,

          knowledge:
            newEvidence,

          emotionalChange:
            "More suspicious and confident.",

          priority:
            actor.currentPriority
        };
      }

      return {
        event:
          `${actor.name} investigates again but finds no new evidence.`,

        action:
          `${actor.name} investigates without discovering anything new.`,

        reason:
          "The available evidence has not changed.",

        knowledge:
          "",

        emotionalChange:
          "Becomes slightly impatient.",

        priority:
          actor.currentPriority
      };
    }

    /* -----------------------------------------------
       SEARCH
    ----------------------------------------------- */

    case "SEARCH": {
      if (
        !hasCapability(
          actor,
          "investigation"
        )
      ) {
        return {
          event:
            `${actor.name} searches the area but does not find anything useful.`,

          action:
            `${actor.name} searches unsuccessfully.`,

          reason:
            "The character lacks the expertise needed to identify useful evidence.",

          knowledge:
            "",

          emotionalChange:
            "Uncertain.",

          priority:
            actor.currentPriority
        };
      }

      const discovery =
        `Something about the ${actor.location} suggests the company has been using the area to meet students.`;

      if (
        !actor.knowledge.includes(
          discovery
        )
      ) {
        actor.knowledge.push(
          discovery
        );
      }

      return {
        event:
          `${actor.name} searches the area and notices something potentially important.`,

        action:
          `${actor.name} searches the current location.`,

        reason:
          `${actor.name} is looking for information that could support the investigation.`,

        knowledge:
          discovery,

        emotionalChange:
          "More curious.",

        priority:
          actor.currentPriority
      };
    }
  }
}

/* =========================================================
   MAIN API
========================================================= */

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const world =
      normalizeWorld(
        body?.world
      );

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
     * User intervention enters the simulation
     * as an event. It does not automatically
     * determine what characters do.
     */
    if (intervention) {
      dayEvents.push(
        `The user intervenes in the world: ${intervention}`
      );
    }

    /*
     * Each character independently chooses
     * one legal action.
     */
    for (
      const character of world.characters
    ) {
      const legalActions =
        generateLegalActions(
          character,
          world
        );

      const chosenAction =
        chooseAction(
          character,
          legalActions,
          world
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
        name:
          character.name,

        action:
          result.action,

        reason:
          result.reason,

        new_knowledge:
          result.knowledge,

        relationship_change:
          "",

        emotional_change:
          result.emotionalChange,

        new_priority:
          result.priority
      });
    }

    /*
     * Persist everything.
     */
    world.events = [
      ...world.events,
      ...dayEvents
    ];

    world.situation =
      dayEvents.length > 0
        ? dayEvents.join(" ")
        : "The day passes without a major development.";

    /*
     * Calculate a tension that actually
     * reflects the current state.
     */
    const zara =
      world.characters.find(
        character =>
          character.id === "zara"
      );

    const daniel =
      world.characters.find(
        character =>
          character.id === "daniel"
      );

    let nextTension =
      "The characters continue pursuing their own goals.";

    if (
      world.evidence.length > 0 &&
      zara &&
      daniel
    ) {
      const relationship =
        getRelationship(
          zara,
          "daniel"
        );

      nextTension =
        `Zara has evidence about the company, while her suspicion of Daniel is ${Math.round(
          relationship.suspicion
        )}%. Daniel still has information he has not revealed.`;
    }

    return NextResponse.json(
      {
        success: true,

        world,

        result: {
          day:
            world.day,

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
          "Cache-Control":
            "no-store"
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
          "Cache-Control":
            "no-store"
        }
      }
    );
  }
}
