import { processPerceptions } from "./perception";
import { chooseAction } from "./decisions";

export type ActionType =
  | "OBSERVE"
  | "MOVE"
  | "FOLLOW"
  | "TALK"
  | "INVESTIGATE"
  | "SEARCH"
  | "WAIT";

export type Relationship = {
  targetId: string;
  trust: number;
  suspicion: number;
};

export type Character = {
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
  recentActions: ActionType[];
};

export type Location = {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
};

export type WorldState = {
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

type SimulationResult = {
  world: WorldState;
  events: string[];
  characterUpdates: Record<
    string,
    {
      action: ActionType;
      reason: string;
    }
  >;
  nextTension: string;
  interventionEffect: string;
};

const MAX_RECENT_ACTIONS = 5;

function hasCapability(
  character: Character,
  capability: string
) {
  return character.capabilities.some((item) =>
    item
      .toLowerCase()
      .includes(capability.toLowerCase())
  );
}

function rememberAction(
  character: Character,
  action: ActionType
) {
  character.recentActions = [
    ...character.recentActions,
    action,
  ].slice(-MAX_RECENT_ACTIONS);
}

function findCharacter(
  world: WorldState,
  id: string
) {
  return world.characters.find(
    (character) => character.id === id
  );
}

function findLocation(
  world: WorldState,
  id: string
) {
  return world.locations.find(
    (location) => location.id === id
  );
}

function getRelationship(
  character: Character,
  targetId: string
) {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId === targetId
  );
}

export function createInitialWorld(): WorldState {
  return {
    day: 1,

    location: "University of Lagos",

    situation:
      "Zara suspects that a mysterious technology company is privately recruiting students.",

    locations: [
      {
        id: "campus",
        name: "University of Lagos Campus",
        description:
          "A busy university campus where students move between lectures, meetings and social spaces.",
        connectedTo: [
          "campus-cafe",
          "company-office",
        ],
      },

      {
        id: "campus-cafe",
        name: "Campus Café",
        description:
          "A crowded café where students regularly meet and talk.",
        connectedTo: ["campus"],
      },

      {
        id: "company-office",
        name: "Company Office",
        description:
          "A private office used by the mysterious technology company.",
        connectedTo: ["campus"],
      },
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
          "Zara suspects the company is doing something wrong but has not yet found proof.",

        knowledge: [
          "The company approaches students privately.",
          "Some students recruited by the company stopped talking to their friends.",
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
      },

      {
        id: "daniel",
        name: "Daniel",
        role: "Student and company contact",

        goal:
          "Protect his family while maintaining his financial opportunity.",

        fear:
          "The company harms his family if he disobeys them.",

        secret:
          "The company offered Daniel ₦5 million to identify students investigating them.",

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

    events: [
      "Zara notices Daniel leaving a private meeting with the mysterious company.",
    ],
  };
}

export function normalizeWorld(
  input: any
): WorldState {
  if (
    !input?.characters ||
    !input?.locations
  ) {
    return createInitialWorld();
  }

  return {
    day:
      typeof input.day === "number"
        ? input.day
        : 1,

    location:
      typeof input.location === "string"
        ? input.location
        : "University of Lagos",

    situation:
      typeof input.situation === "string"
        ? input.situation
        : "",

    characters: input.characters.map(
      (character: any) => ({
        ...character,

        knowledge: Array.isArray(
          character.knowledge
        )
          ? character.knowledge
          : [],

        capabilities: Array.isArray(
          character.capabilities
        )
          ? character.capabilities
          : [],

        resources: Array.isArray(
          character.resources
        )
          ? character.resources
          : [],

        relationships: Array.isArray(
          character.relationships
        )
          ? character.relationships
          : [],

        recentActions: Array.isArray(
          character.recentActions
        )
          ? character.recentActions
          : [],
      })
    ),

    locations: input.locations,

    entities: Array.isArray(input.entities)
      ? input.entities
      : [],

    objects: Array.isArray(input.objects)
      ? input.objects
      : [],

    evidence: Array.isArray(input.evidence)
      ? input.evidence
      : [],

    events: Array.isArray(input.events)
      ? input.events
      : [],
  };
}

function executeAction(
  world: WorldState,
  character: Character,
  action: ActionType
): string {
  switch (action) {
    case "WAIT":
      return `${character.name} waits and watches the situation develop.`;

    case "OBSERVE":
      character.emotionalState =
        "Alert and observant";

      return `${character.name} observes the surroundings carefully.`;

    case "MOVE": {
      const location =
        findLocation(
          world,
          character.location
        );

      if (
        !location ||
        location.connectedTo.length === 0
      ) {
        return `${character.name} stays where they are because there is nowhere useful to move.`;
      }

      const nextLocation =
        location.connectedTo[
          character.recentActions.length %
            location.connectedTo.length
        ];

      character.location =
        nextLocation;

      const destination =
        findLocation(
          world,
          nextLocation
        );

      if (
        character.id === "daniel" &&
        nextLocation ===
          "company-office"
      ) {
        character.currentPriority =
          "Maintain contact with the company without attracting attention.";

        character.emotionalState =
          "Nervous and cautious";
      }

      return `${character.name} moves to ${
        destination?.name ??
        nextLocation
      }.`;
    }

    case "TALK": {
      const target =
        world.characters.find(
          (other) =>
            other.id !== character.id &&
            other.location ===
              character.location
        );

      if (!target) {
        return `${character.name} wants to talk but nobody is nearby.`;
      }

      if (character.id === "daniel") {
        const relationship =
          getRelationship(
            character,
            target.id
          );

        if (relationship) {
          relationship.suspicion =
            Math.min(
              100,
              relationship.suspicion + 5
            );
        }

        return `${character.name} talks with ${target.name} but carefully avoids revealing his agreement with the company.`;
      }

      if (character.id === "zara") {
        const relationship =
          getRelationship(
            character,
            target.id
          );

        if (relationship) {
          relationship.suspicion =
            Math.min(
              100,
              relationship.suspicion + 5
            );
        }

        return `${character.name} questions ${target.name} about the company's activities.`;
      }

      return `${character.name} talks with ${target.name}.`;
    }

    case "FOLLOW": {
      const target =
        world.characters.find(
          (other) =>
            other.id !== character.id &&
            other.location ===
              character.location
        );

      if (!target) {
        return `${character.name} cannot follow anyone right now.`;
      }

      const relationship =
        getRelationship(
          character,
          target.id
        );

      if (relationship) {
        relationship.suspicion =
          Math.min(
            100,
            relationship.suspicion + 10
          );
      }

      return `${character.name} quietly follows ${target.name}.`;
    }

    case "INVESTIGATE": {
      if (
        !hasCapability(
          character,
          "investigation"
        )
      ) {
        return `${character.name} tries to investigate but lacks the necessary ability.`;
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
          !character.knowledge.includes(
            newEvidence
          )
        ) {
          character.knowledge.push(
            newEvidence
          );
        }

        character.currentPriority =
          "Determine why the company is recruiting students";

        character.emotionalState =
          "More suspicious but increasingly confident";

        return `${character.name} investigates the company's activities and discovers new evidence.`;
      }

      return `${character.name} investigates further but finds no new evidence.`;
    }

    case "SEARCH": {
      const newKnowledge =
        "Something about the current location suggests the company has been using the area to meet students.";

      if (
        !character.knowledge.includes(
          newKnowledge
        )
      ) {
        character.knowledge.push(
          newKnowledge
        );
      }

      character.currentPriority =
        "Determine where the company's student meetings are taking place";

      return `${character.name} searches the area and notices something potentially important.`;
    }
  }
}

function applyIntervention(
  world: WorldState,
  intervention: string
): string {
  if (!intervention) {
    return "";
  }

  const text =
    intervention.toLowerCase();

  if (
    text.includes("zara") &&
    text.includes("daniel")
  ) {
    const zara =
      findCharacter(
        world,
        "zara"
      );

    if (zara) {
      zara.currentPriority =
        "Pay closer attention to Daniel's behaviour.";
    }

    return "The intervention makes Zara pay closer attention to Daniel.";
  }

  if (
    text.includes("company")
  ) {
    const zara =
      findCharacter(
        world,
        "zara"
      );

    if (zara) {
      zara.currentPriority =
        "Find out what the company is hiding.";
    }

    return "The intervention increases Zara's focus on the company.";
  }

  return "The intervention becomes part of the characters' circumstances without directly controlling their actions.";
}

export function simulateDay(
  world: WorldState,
  intervention: string
): SimulationResult {
  const events: string[] = [];

  world.day += 1;

  if (intervention) {
    world.events.push(
      `Intervention: ${intervention}`
    );
  }

  const interventionEffect =
    applyIntervention(
      world,
      intervention
    );

  const characterUpdates: Record<
    string,
    {
      action: ActionType;
      reason: string;
    }
  > = {};

  /*
   * PHASE 1
   *
   * Each character evaluates the current
   * world using their own mind state.
   */
  for (const character of world.characters) {
    const decision =
      chooseAction(
        world,
        character
      );

    characterUpdates[
      character.id
    ] = {
      action: decision.action,
      reason: decision.reason,
    };

    const event =
      executeAction(
        world,
        character,
        decision.action
      );

    rememberAction(
      character,
      decision.action
    );

    events.push(event);

    world.events.push(
      `Day ${world.day}: ${event}`
    );
  }

  /*
   * PHASE 2
   *
   * Characters perceive the consequences
   * of what happened.
   */
  const perceptions =
    processPerceptions(
      world,
      events
    );

  /*
   * PHASE 3
   *
   * Store those interpretations in the
   * persistent world history.
   */
  for (const perception of perceptions) {
    world.events.push(
      `Day ${world.day}: ${perception.characterId} perceives: ${perception.interpretation}`
    );
  }

  /*
   * The public situation describes
   * what actually happened.
   */
  world.situation =
    events.join(" ");

  const zara =
    findCharacter(
      world,
      "zara"
    );

  const daniel =
    findCharacter(
      world,
      "daniel"
    );

  let nextTension =
    "The characters continue pursuing their own goals.";

  if (zara && daniel) {
    const relationship =
      getRelationship(
        zara,
        "daniel"
      );

    if (
      relationship &&
      relationship.suspicion >= 70
    ) {
      nextTension =
        "Zara's suspicion of Daniel is becoming difficult to hide.";
    } else if (
      world.evidence.length > 0 &&
      zara.location ===
        daniel.location
    ) {
      nextTension =
        "Zara has evidence, Daniel is hiding information, and they are now in the same place.";
    } else if (
      world.evidence.length > 0
    ) {
      nextTension =
        "Zara has evidence but Daniel is no longer nearby.";
    }
  }

  return {
    world,
    events,
    characterUpdates,
    nextTension,
    interventionEffect,
  };
}
