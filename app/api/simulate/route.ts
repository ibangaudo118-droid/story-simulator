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

  /*
   * Memory prevents characters from choosing
   * the exact same action forever.
   */
  recentActions: ActionType[];
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

type ActionResult = {
  event: string;
  action: string;
  reason: string;
  knowledge: string;
  emotionalChange: string;
  priority: string;
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
        connectedTo: ["campus-cafe", "company-office"]
      },

      {
        id: "campus-cafe",
        name: "Campus Café",
        description:
          "A busy café where students meet, talk and study.",
        connectedTo: ["campus", "company-office"]
      },

      {
        id: "company-office",
        name: "Company Liaison Office",
        description:
          "A small private office where company representatives meet selected students.",
        connectedTo: ["campus", "campus-cafe"]
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
        ],

        recentActions: []
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
        ],

        recentActions: []
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

  const recentActions =
    Array.isArray(value.recentActions)
      ? value.recentActions.filter(
          (action): action is ActionType =>
            typeof action === "string"
        )
      : fallback.recentActions;

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
      })),

    recentActions: recentActions.slice(-4)
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

function rememberAction(
  character: Character,
  action: ActionType
) {
  character.recentActions = [
    ...(character.recentActions || []),
    action
  ].slice(-4);
}

function recentlyDid(
  character: Character,
  action: ActionType
): boolean {
  return (character.recentActions || [])
    .slice(-2)
    .includes(action);
}

/* =========================================================
   LEGAL ACTIONS
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

    actions.push({
      type: "SEARCH",
      actorId: actor.id,
      description:
        `${actor.name} searches the current location for useful information.`
    });
  }

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

  const lastAction =
    actor.recentActions[
      actor.recentActions.length - 1
    ];

  function findAction(
    type: ActionType,
    targetId?: string
  ): Action | undefined {
    return legalActions.find(action => {
      if (action.type !== type) {
        return false;
      }

      if (
        targetId &&
        action.targetId !== targetId
      ) {
        return false;
      }

      return true;
    });
  }

  function chooseDifferent(
    types: ActionType[]
  ): Action | undefined {
    for (const type of types) {
      const action = findAction(type);

      if (
        action &&
        type !== lastAction
      ) {
        return action;
      }
    }

    return undefined;
  }

  /* =======================================================
     ZARA
  ======================================================= */

  if (actor.id === "zara") {
    const daniel =
      world.characters.find(
        character =>
          character.id === "daniel"
      );

    const relationship =
      daniel
        ? getRelationship(
            actor,
            "daniel"
          )
        : undefined;

    /*
     * First objective:
     * get actual evidence.
     */
    if (
      world.evidence.length === 0 &&
      !recentlyDid(
        actor,
        "INVESTIGATE"
      )
    ) {
      const investigate =
        findAction(
          "INVESTIGATE"
        );

      if (investigate) {
        return investigate;
      }
    }

    /*
     * Once evidence exists, Zara's behavior
     * becomes more investigative and interpersonal.
     */
    if (
      world.evidence.length > 0 &&
      relationship
    ) {
      /*
       * High suspicion + Daniel nearby:
       * follow him.
       */
      if (
        relationship.suspicion >= 60
      ) {
        const follow =
          findAction(
            "FOLLOW",
            "daniel"
          );

        if (
          follow &&
          !recentlyDid(
            actor,
            "FOLLOW"
          )
        ) {
          return follow;
        }
      }

      /*
       * After following, don't endlessly follow.
       * Search for information instead.
       */
      if (
        lastAction === "FOLLOW"
      ) {
        const search =
          chooseDifferent([
            "SEARCH",
            "INVESTIGATE",
            "OBSERVE",
            "MOVE"
          ]);

        if (search) {
          return search;
        }
      }

      /*
       * Search gives Zara new local knowledge.
       */
      const search =
        chooseDifferent([
          "SEARCH"
        ]);

      if (search) {
        return search;
      }

      /*
       * If Daniel is nearby, sometimes talk.
       */
      if (
        relationship.suspicion < 75
      ) {
        const talk =
          chooseDifferent([
            "TALK"
          ]);

        if (talk) {
          talk.targetId = "daniel";
          return talk;
        }
      }
    }

    /*
     * Zara can relocate when the current
     * location stops producing useful information.
     */
    const move =
      chooseDifferent([
        "MOVE",
        "OBSERVE",
        "WAIT"
      ]);

    if (move) {
      return move;
    }
  }

  /* =======================================================
     DANIEL
  ======================================================= */

  if (actor.id === "daniel") {
    const zara =
      world.characters.find(
        character =>
          character.id === "zara"
      );

    const relationship =
      zara
        ? getRelationship(
            actor,
            "zara"
          )
        : undefined;

    /*
     * If Daniel suspects Zara strongly,
     * he starts creating distance.
     */
    if (
      relationship &&
      relationship.suspicion >= 55
    ) {
      const move =
        chooseDifferent([
          "MOVE",
          "OBSERVE",
          "WAIT"
        ]);

      if (move) {
        return move;
      }
    }

    /*
     * Daniel should not repeat TALK every day.
     */
    if (
      lastAction === "TALK"
    ) {
      const move =
        chooseDifferent([
          "MOVE",
          "OBSERVE",
          "WAIT"
        ]);

      if (move) {
        return move;
      }
    }

    /*
     * Normally Daniel tries to manage Zara
     * while keeping his secret.
     */
    const talk =
      findAction(
        "TALK",
        "zara"
      );

    if (
      talk &&
      !recentlyDid(
        actor,
        "TALK"
      )
    ) {
      return talk;
    }

    const alternative =
      chooseDifferent([
        "MOVE",
        "OBSERVE",
        "WAIT"
      ]);

    if (alternative) {
      return alternative;
    }
  }

  /*
   * Generic fallback.
   * Never repeat the previous action if
   * another legal action exists.
   */
  const nonRepeating =
    legalActions.find(
      action =>
        action.type !== lastAction
    );

  return (
    nonRepeating ||
    legalActions[0]
  );
}

/* =========================================================
   ACTION EXECUTION
========================================================= */

function executeAction(
  action: Action,
  world: WorldState
): ActionResult {
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
            character.id ===
            action.targetId
        )
      : undefined;

  switch (action.type) {
    /* =====================================================
       WAIT
    ===================================================== */

    case "WAIT":
      return {
        event:
          `${actor.name} decides not to act immediately.`,

        action:
          `${actor.name} waits.`,

        reason:
          `${actor.name} believes immediate action could create unnecessary risk.`,

        knowledge: "",

        emotionalChange:
          "Remains cautious.",

        priority:
          actor.currentPriority
      };

    /* =====================================================
       OBSERVE
    ===================================================== */

    case "OBSERVE":
      return {
        event:
          `${actor.name} observes the surroundings carefully.`,

        action:
          `${actor.name} observes the surrounding environment.`,

        reason:
          `${actor.name} wants more information before committing to an action.`,

        knowledge: "",

        emotionalChange:
          "Becomes slightly more alert.",

        priority:
          actor.currentPriority
      };

    /* =====================================================
       MOVE
    ===================================================== */

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

          knowledge: "",

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

      /*
       * Moving toward the company office
       * increases risk for Daniel.
       */
      if (
        actor.id === "daniel" &&
        destination.id ===
          "company-office"
      ) {
        actor.currentPriority =
          "Maintain contact with the company without exposing his secret";

        actor.emotionalState =
          "More anxious but focused";
      }

      return {
        event:
          `${actor.name} moves to ${destination.name}.`,

        action:
          `${actor.name} moves to ${destination.name}.`,

        reason:
          `${actor.name} decides the new location may help with their current priority.`,

        knowledge: "",

        emotionalChange:
          "More alert to the new surroundings.",

        priority:
          actor.currentPriority
      };
    }

    /* =====================================================
       TALK
    ===================================================== */

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

          knowledge: "",

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

      /*
       * Talking changes the relationship.
       */
      relationship.suspicion =
        Math.min(
          100,
          relationship.suspicion + 5
        );

      /*
       * Daniel protects his secret.
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

      /*
       * Zara notices Daniel's unusual behavior.
       */
      if (
        actor.id === "zara" &&
        target.id === "daniel"
      ) {
        actor.currentPriority =
          "Determine whether Daniel is hiding something";

        return {
          event:
            "Zara talks with Daniel and notices that he is unusually careful.",

          action:
            "Zara talks to Daniel and studies his behavior.",

          reason:
            "Zara wants to understand whether Daniel is connected to the company.",

          knowledge:
            "Daniel appears to be withholding information.",

          emotionalChange:
            "More suspicious.",

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

    /* =====================================================
       FOLLOW
    ===================================================== */

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

          knowledge: "",

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

    /* =====================================================
       INVESTIGATE
    ===================================================== */

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

          knowledge: "",

          emotionalChange:
            "Slightly frustrated.",

          priority:
            actor.currentPriority
        };
      }

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

      /*
       * Repeated investigation should not
       * magically create infinite evidence.
       */
      return {
        event:
          `${actor.name} investigates again but finds no new evidence.`,

        action:
          `${actor.name} investigates without discovering anything new.`,

        reason:
          "The available evidence has not changed.",

        knowledge: "",

        emotionalChange:
          "Becomes slightly impatient.",

        priority:
          actor.currentPriority
      };
    }

    /* =====================================================
       SEARCH
    ===================================================== */

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

          knowledge: "",

          emotionalChange:
            "Uncertain.",

          priority:
            actor.currentPriority
        };
      }

      const discovery =
        `Something about the current location suggests the company has been using the area to meet students.`;

      if (
        !actor.knowledge.includes(
          discovery
        )
      ) {
        actor.knowledge.push(
          discovery
        );
      }

      actor.currentPriority =
        "Determine why the company is recruiting students";

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
   INTERVENTION
========================================================= */

function applyIntervention(
  world: WorldState,
  intervention: string
): string {
  const text =
    intervention.toLowerCase();

  /*
   * Intervention is an event, not a cheat code.
   * It can influence priorities but characters
   * still have to choose a legal action.
   */

  if (
    text.includes("zara") &&
    text.includes("follow")
  ) {
    const zara =
      world.characters.find(
        character =>
          character.id === "zara"
      );

    if (zara) {
      zara.currentPriority =
        "Track Daniel and discover where he goes";

      return "Zara's attention shifts toward tracking Daniel.";
    }
  }

  if (
    text.includes("zara") &&
    text.includes("investigate")
  ) {
    const zara =
      world.characters.find(
        character =>
          character.id === "zara"
      );

    if (zara) {
      zara.currentPriority =
        "Investigate the company's activities";

      return "Zara's priority shifts toward investigating the company.";
    }
  }

  if (
    text.includes("daniel") &&
    text.includes("company")
  ) {
    const daniel =
      world.characters.find(
        character =>
          character.id === "daniel"
      );

    if (daniel) {
      daniel.currentPriority =
        "Protect his relationship with the company";

      return "Daniel becomes more focused on protecting his connection to the company.";
    }
  }

  return "The intervention becomes part of the world's events, but its exact consequences remain uncertain.";
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

    let interventionEffect = "";

    /*
     * User intervention enters the world first.
     */
    if (intervention) {
      dayEvents.push(
        `The user intervenes in the world: ${intervention}`
      );

      interventionEffect =
        applyIntervention(
          world,
          intervention
        );

      dayEvents.push(
        interventionEffect
      );
    }

    /*
     * Characters act independently.
     *
     * Important:
     * each character sees the world after
     * previous characters' consequences.
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

      rememberAction(
        character,
        chosenAction.type
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
     * Persist timeline.
     */
    world.events = [
      ...world.events,
      ...dayEvents
    ];

    /*
     * Current situation reflects the
     * actual events rather than generic text.
     */
    world.situation =
      dayEvents.length > 0
        ? dayEvents.join(" ")
        : "The day passes without a major development.";

    /* =====================================================
       RELATIONSHIP / TENSION
    ===================================================== */

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
      zara &&
      daniel
    ) {
      const zaraRelationship =
        getRelationship(
          zara,
          "daniel"
        );

      const danielRelationship =
        getRelationship(
          daniel,
          "zara"
        );

      /*
       * Suspicion gradually affects trust.
       */
      if (
        zaraRelationship.suspicion >= 60
      ) {
        zaraRelationship.trust =
          Math.max(
            0,
            zaraRelationship.trust - 5
          );
      }

      if (
        danielRelationship.suspicion >= 55
      ) {
        danielRelationship.trust =
          Math.max(
            0,
            danielRelationship.trust - 5
          );
      }

      if (
        world.evidence.length > 0
      ) {
        nextTension =
          `Zara has ${world.evidence.length} piece${
            world.evidence.length === 1
              ? ""
              : "s"
          } of evidence about the company. Her suspicion of Daniel is ${Math.round(
            zaraRelationship.suspicion
          )}%, while Daniel is keeping information from her.`;
      }

      if (
        zara.location !==
        daniel.location
      ) {
        nextTension +=
          ` Zara and Daniel are now in different locations.`;
      }
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
            nextTension,

          intervention:
            intervention
              ? {
                  accepted: true,
                  text: intervention,
                  effect:
                    interventionEffect
                }
              : null
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
