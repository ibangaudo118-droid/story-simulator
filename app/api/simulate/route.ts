import { NextResponse } from "next";
import Groq from "groq-sdk";

export const runtime = "nodejs";

/*
=========================================================
CORE WORLD TYPES
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

  intervention_action?: {
    actor: string;
    action_type: ActionType;
    target: string;
    description: string;
    reason: string;
  } | null;
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
) {
  return world.characters.find(
    (character) =>
      character.name.toLowerCase() ===
      name.toLowerCase()
  );
}

function findEntity(
  world: WorldState,
  name: string
) {
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
) {
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
  targetCharacter: Character
) {
  return (
    actor.location.toLowerCase() ===
    targetCharacter.location.toLowerCase()
  );
}

function ensureObjects(
  world: WorldState
): WorldObject[] {
  if (!Array.isArray(world.objects)) {
    world.objects = [];
  }

  return world.objects;
}

/*
=========================================================
NORMALIZE LEGACY WORLD
=========================================================
*/

function normalizeWorld(
  input: WorldState
): WorldState {
  const world: WorldState =
    structuredClone(input);

  ensureObjects(world);

  /*
   * Existing character resources are treated
   * as possessions, but NOT as newly invented
   * plot objects.
   *
   * This allows the current app to keep working
   * while we transition to explicit objects.
   */

  for (const character of world.characters) {
    for (const resource of character.resources) {
      const exists = world.objects?.some(
        (object) =>
          object.name.toLowerCase() ===
            resource.toLowerCase() &&
          object.owner?.toLowerCase() ===
            character.name.toLowerCase()
      );

      if (!exists) {
        world.objects!.push({
          id: `${character.id}-${resource
            .toLowerCase()
            .replace(/\s+/g, "-")}`,
          name: resource,
          description: `${resource} belonging to ${character.name}.`,
          location: character.location,
          owner: character.name,
          hidden: false,
          discoverable_by: [character.name],
          known_by: [character.name]
        });
      }
    }
  }

  return world;
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
        "The actor does not exist in the current world."
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

  if (!targetExists) {
    return {
      ...action,
      result: "failure",
      consequence:
        `The target "${action.target}" does not exist in the current world.`
    };
  }

  const capabilities =
    actor.capabilities
      .join(" ")
      .toLowerCase();

  const resources =
    actor.resources
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
    targetCharacter &&
    !sameLocation(
      actor,
      targetCharacter
    )
  ) {
    return {
      ...action,
      result: "failure",
      consequence:
        `${actor.name} cannot interact with ${targetCharacter.name} because they are not at the same location.`
    };
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
          "Movement requires an existing location."
      };
    }
  }

  /*
   * INVESTIGATE
   */

  if (
    action.action_type ===
      "investigate" &&
    !(
      capabilities.includes("investigat") ||
      capabilities.includes("observ") ||
      capabilities.includes("research")
    )
  ) {
    return {
      ...action,
      result: "failure",
      consequence:
        `${actor.name} does not have a suitable investigation capability.`
    };
  }

  /*
   * SEARCH
   */

  if (
    action.action_type ===
      "search" &&
    !(
      capabilities.includes("investigat") ||
      capabilities.includes("observ") ||
      capabilities.includes("search")
    )
  ) {
    return {
      ...action,
      result: "failure",
      consequence:
        `${actor.name} does not have a suitable search capability.`
    };
  }

  /*
   * SEARCH OBJECT LOCATION
   */

  if (
    action.action_type === "search" &&
    targetObject
  ) {
    const objectLocation =
      targetObject.location.toLowerCase();

    if (
      actor.location.toLowerCase() !==
      objectLocation
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} cannot search ${targetObject.name} because it is not at the same location.`
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
          "Following requires an existing character."
      };
    }
  }

  /*
   * CONTACT
   */

  if (
    action.action_type === "contact"
  ) {
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
          `${actor.name} has no known communication resource.`
      };
    }
  }

  /*
   * DESTROY / STEAL
   */

  if (
    (
      action.action_type === "destroy" ||
      action.action_type === "steal"
    ) &&
    !targetObject
  ) {
    return {
      ...action,
      result: "failure",
      consequence:
        "This action requires an existing world object as its target."
    };
  }

  /*
   * STEAL LOCATION CHECK
   */

  if (
    action.action_type === "steal" &&
    targetObject
  ) {
    if (
      actor.location.toLowerCase() !==
      targetObject.location.toLowerCase()
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} cannot steal ${targetObject.name} because it is not at the same location.`
      };
    }
  }

  /*
   * DESTROY LOCATION CHECK
   */

  if (
    action.action_type === "destroy" &&
    targetObject
  ) {
    if (
      actor.location.toLowerCase() !==
      targetObject.location.toLowerCase()
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} cannot destroy ${targetObject.name} because it is not at the same location.`
      };
    }
  }

  return {
    ...action,
    result: "success",
    consequence:
      `${actor.name} successfully performed the action.`
  };
}

/*
=========================================================
STATE TRANSITION HELPERS
=========================================================
*/

function addKnowledge(
  character: Character,
  knowledge: string
) {
  const normalized =
    knowledge.trim().toLowerCase();

  if (!normalized) {
    return;
  }

  const exists =
    character.knowledge.some(
      (item) =>
        item.trim().toLowerCase() ===
        normalized
    );

  if (!exists) {
    character.knowledge.push(
      knowledge.trim()
    );
  }
}

function addEvent(
  world: WorldState,
  event: string
) {
  const clean =
    event.trim();

  if (!clean) {
    return;
  }

  world.events.push(clean);
}

/*
=========================================================
DETERMINISTIC ACTION EXECUTOR
=========================================================
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

    addEvent(
      world,
      `${actor.name} followed ${targetCharacter.name} to ${targetCharacter.location}.`
    );

    addKnowledge(
      actor,
      `${targetCharacter.name} is currently at ${targetCharacter.location}.`
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
      `Observed the current surroundings at ${actor.location}.`
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
    addEvent(
      world,
      `${actor.name} confronted ${targetCharacter.name}.`
    );

    addKnowledge(
      actor,
      `${targetCharacter.name} was directly confronted about the current situation.`
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
      `${actor.name} deliberately misled ${targetCharacter.name}.`
    );

    addKnowledge(
      actor,
      `${actor.name} chose to conceal information from ${targetCharacter.name}.`
    );

    return;
  }

  /*
   * INVESTIGATE
   */

  if (
    action.action_type === "investigate"
  ) {
    const targetName =
      action.target ||
      actor.location;

    addKnowledge(
      actor,
      `Investigated ${targetName}.`
    );

    addEvent(
      world,
      `${actor.name} investigated ${targetName}.`
    );

    return;
  }

  /*
   * SEARCH
   */

  if (
    action.action_type === "search"
  ) {
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
          `${actor.name} searched ${targetObject.name} but did not discover its hidden contents.`
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

    addEvent(
      world,
      `${actor.name} searched the area at ${actor.location}.`
    );

    addKnowledge(
      actor,
      `Searched the area at ${actor.location}.`
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
      `${targetCharacter.name} can be contacted through their known communication resources.`
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
      `${actor.name} took steps to protect ${action.target || "themselves"}.`
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
      `${actor.name} chose to wait rather than take a major action.`
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
      `${targetObject.name} is now in my possession.`
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
NORMALIZE ACTION
=========================================================
*/

function normalizeAction(
  action: ProposedAction,
  candidateId: string,
  source: "character" | "intervention"
): ProposedAction {
  return {
    actor:
      action.actor.trim(),

    action_type:
      action.action_type,

    target:
      action.target?.trim() || "",

    description:
      action.description.trim(),

    reason:
      action.reason.trim(),

    candidate_id:
      candidateId,

    source
  };
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

    const intervention =
      typeof body.intervention ===
      "string"
        ? body.intervention.trim()
        : "";

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
    GENERATE CANDIDATE ACTIONS
    =======================================================
    */

    const candidatePrompt = `
You are the decision-candidate layer of a persistent world simulator.

You DO NOT write the story.

You DO NOT create consequences.

You DO NOT create new world entities.

You only propose possible actions that existing characters could attempt.

CURRENT WORLD:

${JSON.stringify(
  world,
  null,
  2
)}

USER INTERVENTION:

${intervention || "None"}

STRICT CLOSED-WORLD RULES:

1. Only existing characters may act.

2. Only existing entities may be targets.

3. Only existing objects may be targeted.

4. Never create:
- people
- objects
- organizations
- locations
- evidence
- money
- documents
- USB drives
- cameras
- security
- journalists
- professors
- buildings
- meetings
- messages
- files

unless they already exist in the supplied world.

5. A character cannot magically obtain information.

6. A character's secret is NOT automatically known by other characters.

7. A character may only use known capabilities and resources.

8. Ordinary actions are valid.

9. Waiting is valid.

10. Characters do not need to create drama.

For every character produce exactly 3 possible actions.

Candidate 1:
lowest-risk plausible action.

Candidate 2:
goal-directed plausible action.

Candidate 3:
riskier or more aggressive plausible action.

The actions should be based on:

- personality
- goal
- fear
- current priority
- emotional state
- knowledge
- capabilities
- resources
- relationships
- current location

Return ONLY JSON:

{
  "candidates": [
    {
      "actor": "existing character",
      "actions": [
        {
          "action_type": "observe | move | talk | investigate | search | protect | lie | follow | wait | contact | destroy | steal | confront",
          "target": "existing target or empty string",
          "description": "specific attempted action",
          "reason": "why this character would plausibly choose it"
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

        temperature:
          0.55,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",
            content:
              "Generate possible actions only. Never generate world events or consequences."
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
            candidates.push(
              normalizeAction(
                {
                  actor:
                    actor.name,

                  action_type:
                    action.action_type,

                  target:
                    action.target || "",

                  description:
                    action.description,

                  reason:
                    action.reason
                },

                `${actor.id}-candidate-${index + 1}`,

                "character"
              )
            );
          }
        );
    }

    /*
    =======================================================
    STEP 2
    VALIDATE EVERY CANDIDATE
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
    STEP 3
    SELECT ONE ACTION PER CHARACTER
    =======================================================
    */

    const selectionPrompt = `
You are the decision-selection layer.

Select ONE action for each character from the supplied VALIDATED CANDIDATES.

Do not invent actions.

CURRENT WORLD:

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

- Choose only existing candidate_id values.
- Choose one action per character.
- Prefer behavior consistent with the character's actual state.
- Do not select an action simply because it creates drama.
- Waiting is valid.
- Characters can make conflicting decisions.
- Characters can choose low-risk actions.
- The story does not need a major event every day.

Return ONLY JSON:

{
  "selections": [
    {
      "actor": "existing character",
      "candidate_id": "existing candidate id"
    }
  ]
}
`;

    const selectionCompletion =
      await groq.chat.completions.create({
        model:
          "openai/gpt-oss-120b",

        temperature:
          0.45,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",
            content:
              "Select existing candidate actions only."
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
        "Decision selector returned no response."
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

    const selectedByActor =
      new Map<
        string,
        ProposedAction
      >();

    for (
      const selection of
      selectionData.selections || []
    ) {
      const candidate =
        candidateMap.get(
          selection.candidate_id
        );

      if (
        !candidate
      ) {
        continue;
      }

      if (
        !selectedByActor.has(
          candidate.actor
        )
      ) {
        selectedByActor.set(
          candidate.actor,
          candidate
        );
      }
    }

    /*
    =======================================================
    FALLBACK
    =======================================================
    */

    for (
      const character of
      world.characters
    ) {
      if (
        selectedByActor.has(
          character.name
        )
      ) {
        continue;
      }

      const fallback =
        validatedCandidates.find(
          (candidate) =>
            candidate.actor ===
              character.name &&
            candidate.result !==
              "failure"
        );

      if (fallback) {
        selectedByActor.set(
          character.name,
          fallback
        );
      }
    }

    const proposedActions =
      Array.from(
        selectedByActor.values()
      );

    /*
    =======================================================
    STEP 4
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
    STEP 5
    EXECUTE ACTIONS
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
    STEP 6
    DETERMINE CHARACTER STATE CHANGES
    =======================================================
    */

    /*
     * We allow the LLM to suggest interpretation,
     * but NOT to directly mutate the world.
     *
     * The actual knowledge already changed above.
     */

    const statePrompt = `
You are describing the state changes that resulted from
actions that have ALREADY happened.

You cannot create new events.

You cannot create new knowledge.

You cannot create new objects.

You cannot create new people.

You cannot create new locations.

WORLD BEFORE:

${JSON.stringify(
  world,
  null,
  2
)}

VALIDATED ACTIONS:

${JSON.stringify(
  validatedActions,
  null,
  2
)}

WORLD AFTER:

${JSON.stringify(
  updatedWorld,
  null,
  2
)}

Only describe changes supported by WORLD AFTER.

For each character return:

- action
- reason
- new_knowledge
- relationship_change
- emotional_change
- new_priority

If no genuine change occurred, return an empty string.

Return ONLY JSON:

{
  "character_updates": [
    {
      "name": "existing character",
      "action": "",
      "reason": "",
      "new_knowledge": "",
      "relationship_change": "",
      "emotional_change": "",
      "new_priority": ""
    }
  ],
  "new_situation": "",
  "next_tension": ""
}
`;

    const stateCompletion =
      await groq.chat.completions.create({
        model:
          "openai/gpt-oss-120b",

        temperature:
          0.25,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",
            content:
              "Describe existing state only. Never invent consequences."
          },
          {
            role: "user",
            content:
              statePrompt
          }
        ]
      });

    const stateContent =
      stateCompletion
        .choices[0]
        ?.message
        ?.content;

    if (!stateContent) {
      throw new Error(
        "State narration returned no response."
      );
    }

    const stateData =
      JSON.parse(
        stateContent
      ) as {
        character_updates?: CharacterUpdate[];
        new_situation?: string;
        next_tension?: string;
      };

    /*
    =======================================================
    STEP 7
    BUILD EVENTS FROM ACTUAL ACTIONS
    =======================================================
    */

    const actionEvents =
      updatedWorld.events.slice(
        world.events.length
      );

    /*
     * Only events generated by the
     * deterministic executor are added.
     */

    const safeEvents =
      actionEvents.slice(0, 20);

    /*
    =======================================================
    STEP 8
    ADVANCE DAY
    =======================================================
    */

    updatedWorld.day =
      world.day + 1;

    if (
      stateData.new_situation
    ) {
      updatedWorld.situation =
        stateData.new_situation;
    }

    /*
    =======================================================
    FINAL RESULT
    =======================================================
    */

    const characterUpdates =
      (
        stateData.character_updates ||
        []
      ).filter(
        (update) =>
          Boolean(
            findCharacter(
              updatedWorld,
              update.name
            )
          )
      );

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
          safeEvents,

        character_updates:
          characterUpdates,

        new_situation:
          updatedWorld.situation,

        next_tension:
          stateData.next_tension ||
          "The characters continue pursuing their existing goals."
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
