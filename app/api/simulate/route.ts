import { NextResponse } from "next";
import Groq from "groq-sdk";

export const runtime = "nodejs";

/*
=========================================================
TYPES
=========================================================
*/

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

type WorldObject = {
  id: string;
  name: string;
  description: string;
  location: string;
  owner?: string;
  hidden?: boolean;
  discoverable_by?: string[];
  known_by?: string[];
  destroyed?: boolean;
};

type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Character[];
  entities: WorldEntity[];
  objects?: WorldObject[];
  events: string[];
};

type ActionType =
  | "observe"
  | "move"
  | "talk"
  | "investigate"
  | "search"
  | "protect"
  | "lie"
  | "follow"
  | "wait"
  | "contact"
  | "destroy"
  | "steal"
  | "confront";

type ProposedAction = {
  actor: string;
  action_type: ActionType;
  target: string;
  description: string;
  reason: string;
  candidate_id?: string;
  source?: "character" | "intervention";
};

type ValidatedAction = ProposedAction & {
  result: "success" | "partial" | "failure";
  consequence: string;
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

type SimulationResult = {
  day: number;
  situation: string;
  proposed_actions: ProposedAction[];
  validated_actions: ValidatedAction[];
  events: string[];
  character_updates: CharacterUpdate[];
  new_situation: string;
  next_tension: string;
};

type CandidateResponse = {
  candidates?: Array<{
    actor: string;
    actions: Array<{
      action_type: ActionType;
      target: string;
      description: string;
      reason: string;
    }>;
  }>;
};

type SelectionResponse = {
  selections?: Array<{
    actor: string;
    candidate_id: string;
  }>;
};

/*
=========================================================
GROQ
=========================================================
*/

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/*
=========================================================
LOOKUPS
=========================================================
*/

function findCharacter(
  world: WorldState,
  name: string
): Character | undefined {
  return world.characters.find(
    (character) =>
      character.name.toLowerCase() ===
      name.toLowerCase()
  );
}

function findEntity(
  world: WorldState,
  name: string
): WorldEntity | undefined {
  return world.entities.find(
    (entity) =>
      entity.name.toLowerCase() ===
        name.toLowerCase() ||
      entity.id.toLowerCase() ===
        name.toLowerCase()
  );
}

function findObject(
  world: WorldState,
  name: string
): WorldObject | undefined {
  return (world.objects || []).find(
    (object) =>
      object.name.toLowerCase() ===
        name.toLowerCase() ||
      object.id.toLowerCase() ===
        name.toLowerCase()
  );
}

function sameLocation(
  actor: Character,
  target: Character
): boolean {
  return (
    actor.location.toLowerCase() ===
    target.location.toLowerCase()
  );
}

/*
=========================================================
OBJECT NORMALIZATION
=========================================================
*/

function normalizeWorld(
  input: WorldState
): WorldState {
  const world = structuredClone(input);

  if (!Array.isArray(world.objects)) {
    world.objects = [];
  }

  /*
   * Convert existing character resources into
   * persistent objects.
   *
   * This does NOT invent new story objects.
   */

  for (const character of world.characters) {
    for (const resource of character.resources || []) {
      const exists = world.objects.some(
        (object) =>
          object.name.toLowerCase() ===
            resource.toLowerCase() &&
          object.owner?.toLowerCase() ===
            character.name.toLowerCase()
      );

      if (!exists) {
        world.objects.push({
          id: `${character.id}-${resource
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`,

          name: resource,

          description:
            `${resource} belonging to ${character.name}.`,

          location: character.location,

          owner: character.name,

          hidden: false,

          discoverable_by: [
            character.name
          ],

          known_by: [
            character.name
          ]
        });
      }
    }
  }

  return world;
}

/*
=========================================================
KNOWLEDGE
=========================================================
*/

function addKnowledge(
  character: Character,
  knowledge: string
) {
  const clean = knowledge.trim();

  if (!clean) {
    return;
  }

  const exists =
    character.knowledge.some(
      (item) =>
        item.toLowerCase() ===
        clean.toLowerCase()
    );

  if (!exists) {
    character.knowledge.push(clean);
  }
}

/*
=========================================================
EVENTS
=========================================================
*/

function addEvent(
  world: WorldState,
  event: string
) {
  const clean = event.trim();

  if (!clean) {
    return;
  }

  world.events.push(clean);
}

/*
=========================================================
ACTION VALIDATION
=========================================================
*/

function validateAction(
  world: WorldState,
  action: ProposedAction
): ValidatedAction {
  const actor = findCharacter(
    world,
    action.actor
  );

  if (!actor) {
    return {
      ...action,
      result: "failure",
      consequence:
        "The actor does not exist."
    };
  }

  const targetCharacter =
    findCharacter(
      world,
      action.target
    );

  const targetEntity =
    findEntity(
      world,
      action.target
    );

  const targetObject =
    findObject(
      world,
      action.target
    );

  const targetExists =
    Boolean(targetCharacter) ||
    Boolean(targetEntity) ||
    Boolean(targetObject) ||
    action.target === "" ||
    action.target.toLowerCase() === "self";

  /*
   * THE MOST IMPORTANT RULE:
   *
   * No unknown target can ever become real.
   */

  if (!targetExists) {
    return {
      ...action,
      result: "failure",
      consequence:
        `The target "${action.target}" does not exist in the world.`
    };
  }

  const capabilities =
    (actor.capabilities || [])
      .join(" ")
      .toLowerCase();

  /*
   * TALK / CONFRONT / LIE
   */

  if (
    (
      action.action_type === "talk" ||
      action.action_type === "confront" ||
      action.action_type === "lie"
    ) &&
    targetCharacter
  ) {
    if (
      !sameLocation(
        actor,
        targetCharacter
      )
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} cannot interact with ${targetCharacter.name} because they are not in the same location.`
      };
    }
  }

  /*
   * MOVE
   */

  if (
    action.action_type === "move"
  ) {
    if (
      !targetEntity ||
      targetEntity.type !== "location"
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          "The destination must be an existing location."
      };
    }
  }

  /*
   * FOLLOW
   */

  if (
    action.action_type === "follow"
  ) {
    if (!targetCharacter) {
      return {
        ...action,
        result: "failure",
        consequence:
          "Follow requires an existing character."
      };
    }
  }

  /*
   * INVESTIGATE
   */

  if (
    action.action_type ===
      "investigate"
  ) {
    const capable =
      capabilities.includes("investigat") ||
      capabilities.includes("observ") ||
      capabilities.includes("research");

    if (!capable) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} does not have the capability to investigate.`
      };
    }
  }

  /*
   * SEARCH
   */

  if (
    action.action_type === "search"
  ) {
    const capable =
      capabilities.includes("investigat") ||
      capabilities.includes("observ") ||
      capabilities.includes("search");

    if (!capable) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} does not have the capability to search.`
      };
    }

    /*
     * If searching an object, it must physically
     * exist at the actor's location.
     */

    if (targetObject) {
      if (
        targetObject.location.toLowerCase() !==
        actor.location.toLowerCase()
      ) {
        return {
          ...action,
          result: "failure",
          consequence:
            `${targetObject.name} is not at ${actor.location}.`
        };
      }
    }
  }

  /*
   * STEAL
   */

  if (
    action.action_type === "steal"
  ) {
    if (!targetObject) {
      return {
        ...action,
        result: "failure",
        consequence:
          "Stealing requires an existing object."
      };
    }

    if (
      targetObject.location.toLowerCase() !==
      actor.location.toLowerCase()
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${targetObject.name} is not at ${actor.location}.`
      };
    }

    if (
      targetObject.destroyed
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${targetObject.name} has already been destroyed.`
      };
    }
  }

  /*
   * DESTROY
   */

  if (
    action.action_type === "destroy"
  ) {
    if (!targetObject) {
      return {
        ...action,
        result: "failure",
        consequence:
          "Destroy requires an existing object."
      };
    }

    if (
      targetObject.location.toLowerCase() !==
      actor.location.toLowerCase()
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${targetObject.name} is not at ${actor.location}.`
      };
    }
  }

  /*
   * CONTACT
   */

  if (
    action.action_type === "contact"
  ) {
    const resources =
      (actor.resources || [])
        .join(" ")
        .toLowerCase();

    if (
      !(
        resources.includes("phone") ||
        resources.includes("smartphone") ||
        resources.includes("laptop")
      )
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} has no known communication device.`
      };
    }

    if (!targetCharacter) {
      return {
        ...action,
        result: "failure",
        consequence:
          "Contact requires an existing character."
      };
    }
  }

  return {
    ...action,
    result: "success",
    consequence:
      `${actor.name} can perform this action.`
  };
}

/*
=========================================================
EXECUTION
=========================================================
*
* IMPORTANT:
*
* This is the actual simulation.
*
* The LLM does not execute anything.
*/

function executeAction(
  world: WorldState,
  action: ValidatedAction
) {
  if (
    action.result === "failure"
  ) {
    return;
  }

  const actor =
    findCharacter(
      world,
      action.actor
    );

  if (!actor) {
    return;
  }

  const targetCharacter =
    findCharacter(
      world,
      action.target
    );

  const targetEntity =
    findEntity(
      world,
      action.target
    );

  const targetObject =
    findObject(
      world,
      action.target
    );

  /*
   * MOVE
   */

  if (
    action.action_type === "move" &&
    targetEntity?.type === "location"
  ) {
    actor.location =
      targetEntity.name;

    addEvent(
      world,
      `${actor.name} moved to ${targetEntity.name}.`
    );

    return;
  }

  /*
   * FOLLOW
   */

  if (
    action.action_type === "follow" &&
    targetCharacter
  ) {
    actor.location =
      targetCharacter.location;

    addKnowledge(
      actor,
      `${targetCharacter.name} is at ${targetCharacter.location}.`
    );

    addEvent(
      world,
      `${actor.name} followed ${targetCharacter.name} to ${targetCharacter.location}.`
    );

    return;
  }

  /*
   * OBSERVE
   */

  if (
    action.action_type === "observe"
  ) {
    addKnowledge(
      actor,
      `Observed ${actor.location}.`
    );

    addEvent(
      world,
      `${actor.name} observed the surroundings at ${actor.location}.`
    );

    return;
  }

  /*
   * TALK
   */

  if (
    action.action_type === "talk" &&
    targetCharacter
  ) {
    addKnowledge(
      actor,
      `${targetCharacter.name} was available to speak with at ${actor.location}.`
    );

    addEvent(
      world,
      `${actor.name} spoke with ${targetCharacter.name}.`
    );

    return;
  }

  /*
   * CONFRONT
   */

  if (
    action.action_type === "confront" &&
    targetCharacter
  ) {
    addKnowledge(
      actor,
      `${targetCharacter.name} was confronted at ${actor.location}.`
    );

    addEvent(
      world,
      `${actor.name} confronted ${targetCharacter.name}.`
    );

    return;
  }

  /*
   * LIE
   */

  if (
    action.action_type === "lie" &&
    targetCharacter
  ) {
    addEvent(
      world,
      `${actor.name} lied to ${targetCharacter.name}.`
    );

    return;
  }

  /*
   * INVESTIGATE
   */

  if (
    action.action_type ===
      "investigate"
  ) {
    const target =
      action.target ||
      actor.location;

    /*
     * Investigation NEVER creates evidence.
     *
     * It only gives information about things
     * that actually exist in the world.
     */

    const entity =
      findEntity(
        world,
        target
      );

    const object =
      findObject(
        world,
        target
      );

    const character =
      findCharacter(
        world,
        target
      );

    if (entity) {
      addKnowledge(
        actor,
        `Investigated ${entity.name}.`
      );
    } else if (object) {
      addKnowledge(
        actor,
        `${object.name} exists at ${object.location}.`
      );
    } else if (character) {
      addKnowledge(
        actor,
        `Investigated ${character.name}.`
      );
    } else {
      addKnowledge(
        actor,
        `Investigated ${actor.location}.`
      );
    }

    addEvent(
      world,
      `${actor.name} investigated ${target}.`
    );

    return;
  }

  /*
   * SEARCH
   */

  if (
    action.action_type === "search"
  ) {
    /*
     * Searching a specific existing object.
     */

    if (targetObject) {
      if (
        targetObject.hidden &&
        !(
          targetObject.discoverable_by ||
          []
        ).some(
          (name) =>
            name.toLowerCase() ===
            actor.name.toLowerCase()
        )
      ) {
        addEvent(
          world,
          `${actor.name} searched ${targetObject.name} but did not discover it.`
        );

        return;
      }

      if (
        !targetObject.destroyed
      ) {
        targetObject.known_by =
          targetObject.known_by || [];

        if (
          !targetObject.known_by.includes(
            actor.name
          )
        ) {
          targetObject.known_by.push(
            actor.name
          );
        }

        addKnowledge(
          actor,
          `${targetObject.name} exists at ${targetObject.location}.`
        );

        addEvent(
          world,
          `${actor.name} searched ${targetObject.name}.`
        );
      }

      return;
    }

    /*
     * Searching an area does NOT create
     * a mysterious object.
     *
     * It only reveals existing objects that
     * are physically there and discoverable.
     */

    const nearbyObjects =
      (world.objects || []).filter(
        (object) =>
          !object.destroyed &&
          object.location.toLowerCase() ===
            actor.location.toLowerCase() &&
          (
            !object.hidden ||
            (
              object.discoverable_by ||
              []
            ).some(
              (name) =>
                name.toLowerCase() ===
                actor.name.toLowerCase()
            )
          )
      );

    for (
      const object of nearbyObjects
    ) {
      object.known_by =
        object.known_by || [];

      if (
        !object.known_by.includes(
          actor.name
        )
      ) {
        object.known_by.push(
          actor.name
        );

        addKnowledge(
          actor,
          `Discovered ${object.name} at ${object.location}.`
        );
      }
    }

    if (
      nearbyObjects.length === 0
    ) {
      addKnowledge(
        actor,
        `No known relevant object was found while searching ${actor.location}.`
      );
    }

    addEvent(
      world,
      `${actor.name} searched ${actor.location}.`
    );

    return;
  }

  /*
   * CONTACT
   */

  if (
    action.action_type === "contact" &&
    targetCharacter
  ) {
    addEvent(
      world,
      `${actor.name} contacted ${targetCharacter.name}.`
    );

    addKnowledge(
      actor,
      `${targetCharacter.name} can be contacted.`
    );

    return;
  }

  /*
   * PROTECT
   */

  if (
    action.action_type === "protect"
  ) {
    addEvent(
      world,
      `${actor.name} attempted to protect ${action.target || actor.name}.`
    );

    return;
  }

  /*
   * WAIT
   */

  if (
    action.action_type === "wait"
  ) {
    addEvent(
      world,
      `${actor.name} waited at ${actor.location}.`
    );

    return;
  }

  /*
   * STEAL
   */

  if (
    action.action_type === "steal" &&
    targetObject
  ) {
    targetObject.owner =
      actor.name;

    targetObject.location =
      actor.location;

    targetObject.known_by =
      targetObject.known_by || [];

    if (
      !targetObject.known_by.includes(
        actor.name
      )
    ) {
      targetObject.known_by.push(
        actor.name
      );
    }

    addKnowledge(
      actor,
      `I possess ${targetObject.name}.`
    );

    addEvent(
      world,
      `${actor.name} took ${targetObject.name}.`
    );

    return;
  }

  /*
   * DESTROY
   */

  if (
    action.action_type === "destroy" &&
    targetObject
  ) {
    targetObject.destroyed = true;

    addEvent(
      world,
      `${actor.name} destroyed ${targetObject.name}.`
    );

    return;
  }
}

/*
=========================================================
DETERMINISTIC DESCRIPTION
=========================================================
*
* No LLM is used here.
*
* This means the model cannot invent:
* - USB drives
* - professors
* - buildings
* - money
* - messages
* - files
* - organizations
* - evidence
* - surveillance
* - etc.
*/

function describeAction(
  action: ValidatedAction
): CharacterUpdate {
  const success =
    action.result !== "failure";

  let knowledge = "";
  let relationship = "";
  let emotion = "";
  let priority = "";

  if (
    action.action_type === "move"
  ) {
    knowledge =
      `Moved to ${action.target}.`;
  }

  if (
    action.action_type === "follow"
  ) {
    knowledge =
      `Followed ${action.target}.`;
  }

  if (
    action.action_type === "observe"
  ) {
    knowledge =
      `Observed the surroundings.`;
  }

  if (
    action.action_type === "search"
  ) {
    knowledge =
      success
        ? "Searched for existing objects in the current location."
        : "The search failed.";
  }

  if (
    action.action_type ===
      "investigate"
  ) {
    knowledge =
      `Investigated ${action.target || "the current location"}.`;
  }

  if (
    action.action_type === "talk"
  ) {
    knowledge =
      `Spoke with ${action.target}.`;
  }

  if (
    action.action_type ===
      "confront"
  ) {
    knowledge =
      `Confronted ${action.target}.`;
  }

  if (
    action.action_type === "lie"
  ) {
    knowledge =
      `Attempted to mislead ${action.target}.`;
  }

  if (
    action.action_type ===
      "contact"
  ) {
    knowledge =
      `Contacted ${action.target}.`;
  }

  if (
    action.action_type ===
      "protect"
  ) {
    knowledge =
      `Attempted to protect ${action.target || "themselves"}.`;
  }

  if (
    action.action_type === "wait"
  ) {
    knowledge =
      "Chose to wait.";
  }

  if (
    action.action_type === "steal"
  ) {
    knowledge =
      `Took ${action.target}.`;
  }

  if (
    action.action_type ===
      "destroy"
  ) {
    knowledge =
      `Destroyed ${action.target}.`;
  }

  if (!success) {
    knowledge =
      action.consequence;
  }

  return {
    name: action.actor,
    action: action.description,
    reason: action.reason,
    new_knowledge: knowledge,
    relationship_change: relationship,
    emotional_change: emotion,
    new_priority: priority
  };
}

/*
=========================================================
SITUATION GENERATOR
=========================================================
*
* IMPORTANT:
*
* This does NOT ask an LLM what happened.
* It summarizes actual world state.
*/

function buildSituation(
  world: WorldState,
  events: string[]
): string {
  const locations =
    world.characters.map(
      (character) =>
        `${character.name} is at ${character.location}`
    );

  if (events.length === 0) {
    return (
      world.situation ||
      locations.join(". ") +
        "."
    );
  }

  return (
    locations.join(". ") +
    ". " +
    events.slice(-3).join(" ")
  );
}

/*
=========================================================
NEXT TENSION
=========================================================
*
* This is deliberately conservative.
* It does not invent future plot events.
*/

function buildNextTension(
  world: WorldState
): string {
  const priorities =
    world.characters
      .map(
        (character) =>
          `${character.name}: ${character.current_priority}`
      )
      .join(" ");

  return `The characters continue pursuing their existing priorities. ${priorities}`;
}

/*
=========================================================
POST
=========================================================
*/

export async function POST(
  request: Request
) {
  try {
    if (
      !process.env.GROQ_API_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "GROQ_API_KEY is not configured."
        },
        {
          status: 500
        }
      );
    }

    const body =
      await request.json();

    if (!body.world) {
      return NextResponse.json(
        {
          error:
            "A world state is required."
        },
        {
          status: 400
        }
      );
    }

    let world =
      normalizeWorld(
        body.world as WorldState
      );

    /*
     * Intervention is intentionally NOT allowed
     * to directly mutate the world.
     *
     * We will wire it into the same legal-action
     * system later.
     */

    if (
      !Array.isArray(
        world.characters
      ) ||
      !Array.isArray(
        world.entities
      ) ||
      !Array.isArray(
        world.events
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid world state."
        },
        {
          status: 400
        }
      );
    }

    /*
    =======================================================
    STEP 1
    ASK LLM FOR POSSIBLE ACTIONS
    =======================================================
    */

    const candidatePrompt = `
You are NOT a storyteller.

You are a decision generator inside a CLOSED WORLD SIMULATOR.

Your only job is to propose actions existing characters might take.

WORLD:

${JSON.stringify(
  world,
  null,
  2
)}

ABSOLUTE RULES:

1. You may ONLY use characters already in WORLD.

2. You may ONLY target:
   - existing characters
   - existing locations
   - existing organizations
   - existing objects

3. You are FORBIDDEN from inventing:
   - people
   - objects
   - locations
   - organizations
   - money
   - evidence
   - documents
   - USB drives
   - files
   - messages
   - professors
   - security
   - cameras
   - buildings
   - meetings
   - companies
   - events

4. Do not describe consequences.

5. Do not create plot twists.

6. Do not make something happen merely because it would make the story interesting.

7. Characters can wait.

8. Characters can fail.

9. A character's secret is NOT automatically known by other characters.

10. Use only the character's existing:
    - goal
    - fear
    - priority
    - personality
    - knowledge
    - capabilities
    - resources
    - relationships
    - location

For EVERY character, generate exactly THREE possible actions.

Return ONLY valid JSON:

{
  "candidates": [
    {
      "actor": "existing character name",
      "actions": [
        {
          "action_type": "observe | move | talk | investigate | search | protect | lie | follow | wait | contact | destroy | steal | confront",
          "target": "existing target or empty string",
          "description": "what the character attempts",
          "reason": "why they attempt it"
        },
        {
          "action_type": "...",
          "target": "...",
          "description": "...",
          "reason": "..."
        },
        {
          "action_type": "...",
          "target": "...",
          "description": "...",
          "reason": "..."
        }
      ]
    }
  ]
}
`;

    const candidateCompletion =
      await groq.chat.completions.create({
        model:
          "openai/gpt-oss-120b",

        temperature: 0.3,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",
            content:
              "Generate legal candidate actions only. Never generate story events."
          },
          {
            role: "user",
            content:
              candidatePrompt
          }
        ]
      });

    const candidateContent =
      candidateCompletion
        .choices[0]
        ?.message
        ?.content;

    if (!candidateContent) {
      throw new Error(
        "Candidate engine returned no response."
      );
    }

    const candidateData =
      JSON.parse(
        candidateContent
      ) as CandidateResponse;

    /*
    =======================================================
    BUILD CANDIDATES
    =======================================================
    */

    const candidates:
      ProposedAction[] = [];

    for (
      const group of
      candidateData.candidates || []
    ) {
      const actor =
        findCharacter(
          world,
          group.actor
        );

      if (
        !actor ||
        !Array.isArray(
          group.actions
        )
      ) {
        continue;
      }

      group.actions
        .slice(0, 3)
        .forEach(
          (
            action,
            index
          ) => {
            candidates.push({
              actor: actor.name,

              action_type:
                action.action_type,

              target:
                action.target?.trim() ||
                "",

              description:
                action.description?.trim() ||
                `${actor.name} chooses to ${action.action_type}.`,

              reason:
                action.reason?.trim() ||
                "Consistent with the character's current state.",

              candidate_id:
                `${actor.id}-candidate-${index + 1}`,

              source:
                "character"
            });
          }
        );
    }

    /*
    =======================================================
    VALIDATE CANDIDATES
    =======================================================
    */

    const validatedCandidates =
      candidates.map(
        (candidate) =>
          validateAction(
            world,
            candidate
          )
      );

    /*
    =======================================================
    SELECT ONE ACTION PER CHARACTER
    =======================================================
    */

    const selectionPrompt = `
You are the ACTION SELECTOR for a closed-world simulator.

Choose exactly ONE VALID action for each character.

You are NOT allowed to invent an action.

WORLD:

${JSON.stringify(
  world,
  null,
  2
)}

VALIDATED CANDIDATES:

${JSON.stringify(
  validatedCandidates,
  null,
  2
)}

Rules:

- Use only candidate_id values provided.
- Never invent candidate IDs.
- Prefer actions consistent with the character's goals and current state.
- Do not select failure actions.
- Do not select an action just to create drama.
- Waiting is completely valid.
- Characters can make conservative choices.
- Characters do not have to create a major event.

Return ONLY:

{
  "selections": [
    {
      "actor": "existing character name",
      "candidate_id": "existing candidate id"
    }
  ]
}
`;

    const selectionCompletion =
      await groq.chat.completions.create({
        model:
          "openai/gpt-oss-120b",

        temperature: 0.15,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",
            content:
              "Select existing valid candidates only."
          },
          {
            role: "user",
            content:
              selectionPrompt
          }
        ]
      });

    const selectionContent =
      selectionCompletion
        .choices[0]
        ?.message
        ?.content;

    if (!selectionContent) {
      throw new Error(
        "Selection engine returned no response."
      );
    }

    const selectionData =
      JSON.parse(
        selectionContent
      ) as SelectionResponse;

    const candidateMap =
      new Map<
        string,
        ProposedAction
      >();

    for (
      const candidate of
      candidates
    ) {
      if (
        candidate.candidate_id
      ) {
        candidateMap.set(
          candidate.candidate_id,
          candidate
        );
      }
    }

    const selected =
      new Map<
        string,
        ProposedAction
      >();

    /*
     * Accept only selections that actually exist.
     */

    for (
      const selection of
      selectionData.selections || []
    ) {
      const candidate =
        candidateMap.get(
          selection.candidate_id
        );

      if (!candidate) {
        continue;
      }

      const actor =
        findCharacter(
          world,
          candidate.actor
        );

      if (!actor) {
        continue;
      }

      if (
        !selected.has(
          actor.name
        )
      ) {
        selected.set(
          actor.name,
          candidate
        );
      }
    }

    /*
    =======================================================
    DETERMINISTIC FALLBACK
    =======================================================
    *
    * If the LLM fails to select an action,
    * the character waits.
    *
    * NOT a new plot event.
    */

    for (
      const character of
      world.characters
    ) {
      if (
        selected.has(
          character.name
        )
      ) {
        continue;
      }

      const validCandidate =
        validatedCandidates.find(
          (candidate) =>
            candidate.actor ===
              character.name &&
            candidate.result ===
              "success"
        );

      if (validCandidate) {
        selected.set(
          character.name,
          validCandidate
        );
      } else {
        selected.set(
          character.name,
          {
            actor:
              character.name,

            action_type:
              "wait",

            target: "",

            description:
              `${character.name} waits at ${character.location}.`,

            reason:
              "No valid selected action was available.",

            candidate_id:
              `${character.id}-fallback-wait`,

            source:
              "character"
          }
        );
      }
    }

    const proposedActions =
      Array.from(
        selected.values()
      );

    /*
    =======================================================
    FINAL VALIDATION
    =======================================================
    */

    const validatedActions =
      proposedActions.map(
        (action) =>
          validateAction(
            world,
            action
          )
      );

    /*
    =======================================================
    EXECUTE ON A COPY
    =======================================================
    */

    const updatedWorld =
      structuredClone(world);

    for (
      const action of
      validatedActions
    ) {
      executeAction(
        updatedWorld,
        action
      );
    }

    /*
    =======================================================
    COLLECT ONLY REAL EVENTS
    =======================================================
    */

    const newEvents =
      updatedWorld.events.slice(
        world.events.length
      );

    /*
    =======================================================
    CHARACTER SUMMARIES
    =======================================================
    */

    const characterUpdates =
      validatedActions.map(
        describeAction
      );

    /*
    =======================================================
    ADVANCE DAY
    =======================================================
    */

    updatedWorld.day =
      world.day + 1;

    /*
    =======================================================
    IMPORTANT:
    DO NOT LET THE LLM REWRITE SITUATION.
    =======================================================
    */

    updatedWorld.situation =
      buildSituation(
        updatedWorld,
        newEvents
      );

    /*
    =======================================================
    NEXT TENSION
    =======================================================
    */

    const nextTension =
      buildNextTension(
        updatedWorld
      );

    /*
    =======================================================
    FINAL RESPONSE
    =======================================================
    */

    const result:
      SimulationResult = {
        day:
          updatedWorld.day,

        situation:
          updatedWorld.situation,

        proposed_actions:
          proposedActions,

        validated_actions:
          validatedActions,

        events:
          newEvents,

        character_updates:
          characterUpdates,

        new_situation:
          updatedWorld.situation,

        next_tension:
          nextTension
      };

    return NextResponse.json({
      result,
      world: updatedWorld
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
            : "Simulation failed."
      },
      {
        status: 500
      }
    );
  }
}
