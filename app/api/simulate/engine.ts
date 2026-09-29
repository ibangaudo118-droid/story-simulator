import {
  applyConsequence,
  executeAction,
  type ActionConsequence,
} from "./consequences";
import { chooseAction, getLegalActions } from "./decisions";
import { processPerceptions } from "./perception";
import type {
  ActionType,
  Character,
  Location,
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

export { type ActionType, type Character, type Location, type WorldState };

export function createInitialWorld(): WorldState {
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
        goal: "Discover what the company is doing and whether students are being harmed.",
        fear: "The company discovers that she is investigating them.",
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
        emotionalState: "Suspicious but determined",
        currentPriority: "Find evidence about the company",
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
        goal: "Protect his family while maintaining financial security.",
        fear: "The company harms his family if he disobeys.",
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
        emotionalState: "Conflicted and afraid",
        currentPriority: "Protect his family without betraying Zara",
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
    locations: [
      {
        id: "campus",
        name: "University Campus",
        description:
          "The main university grounds where students move between classes and social spaces.",
        connectedTo: ["campus-cafe", "company-office"],
      },
      {
        id: "campus-cafe",
        name: "Campus Café",
        description:
          "A busy student café where conversations can happen without attracting much attention.",
        connectedTo: ["campus", "company-office"],
      },
      {
        id: "company-office",
        name: "Company Office",
        description:
          "A private office used by the mysterious technology company.",
        connectedTo: ["campus", "campus-cafe"],
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

export function normalizeWorld(world: WorldState): WorldState {
  return {
    ...world,
    characters: (world.characters ?? []).map((character) => ({
      ...character,
      knowledge: character.knowledge ?? [],
      capabilities: character.capabilities ?? [],
      resources: character.resources ?? [],
      relationships: character.relationships ?? [],
      recentActions: character.recentActions ?? [],
    })),
    locations: world.locations ?? [],
    entities: world.entities ?? [],
    objects: world.objects ?? [],
    evidence: world.evidence ?? [],
    events: world.events ?? [],
  };
}

function rememberAction(character: Character, action: ActionType): void {
  character.recentActions = [
    ...(character.recentActions ?? []),
    action,
  ].slice(-5);
}

export function applyIntervention(
  world: WorldState,
  intervention: string
): void {
  const normalized = intervention.toLowerCase();

  world.events.push(`User intervention: ${intervention}`);

  if (normalized.includes("zara") && normalized.includes("daniel")) {
    const zara = world.characters.find(
      (character) => character.id === "zara"
    );

    if (zara) {
      zara.currentPriority =
        "Understand what Daniel knows about the company";
    }
  }

  if (normalized.includes("company")) {
    const zara = world.characters.find(
      (character) => character.id === "zara"
    );

    if (zara) {
      zara.currentPriority =
        "Find evidence connecting the company to student activity";
    }
  }
}

export function simulateDay(
  inputWorld: WorldState,
  intervention?: string
): SimulationResult {
  const world = normalizeWorld(
    structuredClone(inputWorld)
  );

  world.day += 1;

  const events: string[] = [];
  const consequences: ActionConsequence[] = [];

  if (intervention?.trim()) {
    applyIntervention(world, intervention.trim());

    events.push(`User intervention: ${intervention.trim()}`);
  }

  const characterUpdates: SimulationResult["characterUpdates"] = {};

  /*
   * We intentionally keep the current sequential turn system for now.
   *
   * Later we can move to:
   *
   * 1. Perceive
   * 2. Decide
   * 3. Execute simultaneously
   * 4. Resolve consequences
   *
   * But first we want to prove that the consequence layer works.
   */

  for (const character of world.characters) {
    const legalActions = getLegalActions(world, character);

    const decision = chooseAction(
      world,
      character,
      legalActions
    );

    const action = decision.action;

    const consequence = executeAction(
      world,
      character,
      action
    );

    applyConsequence(world, consequence);

    rememberAction(character, action);

    consequences.push(consequence);
    events.push(consequence.event);

    characterUpdates[character.id] = {
      action,
      reason: decision.reason,
    };
  }

  /*
   * Perception happens after the actions have produced
   * real world consequences.
   */
  const perceptionResults = processPerceptions(
    world,
    events
  );

  for (const perception of perceptionResults) {
    if (perception.interpretation) {
      world.events.push(perception.interpretation);
    }
  }

  world.events.push(...events);

  world.situation = events.join(" ");

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
