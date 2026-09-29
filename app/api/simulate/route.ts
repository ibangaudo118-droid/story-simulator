import { NextResponse } from "next";
import Groq from "groq-sdk";

export const runtime = "nodejs";

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

type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Character[];
  entities: WorldEntity[];
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

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

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

function sameLocation(
  actor: Character,
  targetCharacter: Character
) {
  return (
    actor.location.toLowerCase() ===
    targetCharacter.location.toLowerCase()
  );
}

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

  const targetExists =
    Boolean(targetCharacter) ||
    Boolean(targetEntity) ||
    action.target === "" ||
    action.target.toLowerCase() ===
      "self";

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
          "Movement requires an existing location as its target."
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
      capabilities.includes(
        "investigat"
      ) ||
      capabilities.includes(
        "observ"
      ) ||
      capabilities.includes(
        "research"
      )
    )
  ) {
    return {
      ...action,
      result: "failure",
      consequence:
        `${actor.name} lacks a suitable investigation or observation capability.`
    };
  }

  /*
   * SEARCH
   */

  if (
    action.action_type ===
      "search" &&
    !(
      capabilities.includes(
        "investigat"
      ) ||
      capabilities.includes(
        "observ"
      ) ||
      capabilities.includes(
        "search"
      )
    )
  ) {
    return {
      ...action,
      result: "failure",
      consequence:
        `${actor.name} lacks a suitable search capability.`
    };
  }

  /*
   * FOLLOW
   */

  if (
    action.action_type ===
      "follow"
  ) {
    if (!targetCharacter) {
      return {
        ...action,
        result: "failure",
        consequence:
          "Following requires an existing character as the target."
      };
    }
  }

  /*
   * CONTACT
   */

  if (
    action.action_type ===
      "contact"
  ) {
    if (
      !(
        resources.includes(
          "phone"
        ) ||
        resources.includes(
          "smartphone"
        ) ||
        resources.includes(
          "laptop"
        )
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
      action.action_type ===
        "destroy" ||
      action.action_type ===
        "steal"
    ) &&
    !action.target
  ) {
    return {
      ...action,
      result: "failure",
      consequence:
        "The action requires an explicit existing target."
    };
  }

  return {
    ...action,
    result: "success",
    consequence:
      `${actor.name} carried out the proposed action.`
  };
}

function applyAction(
  world: WorldState,
  action: ValidatedAction
) {
  if (
    action.result !==
    "success"
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

  /*
   * MOVE
   */

  if (
    action.action_type ===
    "move"
  ) {
    const destination =
      findEntity(
        world,
        action.target
      );

    if (
      destination?.type ===
      "location"
    ) {
      actor.location =
        destination.name;
    }
  }

  /*
   * FOLLOW
   */

  if (
    action.action_type ===
    "follow"
  ) {
    const target =
      findCharacter(
        world,
        action.target
      );

    if (target) {
      actor.location =
        target.location;
    }
  }
}

function normalizeAction(
  action: ProposedAction,
  candidateId: string,
  source:
    | "character"
    | "intervention"
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

    const world: WorldState =
      body.world;

    const intervention =
      typeof body.intervention ===
      "string"
        ? body.intervention.trim()
        : "";

    if (
      !world ||
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
            "A valid world state is required."
        },
        {
          status: 400
        }
      );
    }

    /*
     * =========================================================
     * STEP 1
     *
     * GENERATE MULTIPLE POSSIBLE ACTIONS
     * =========================================================
     */

    const candidatePrompt = `
You are the candidate-action layer of a persistent world simulator.

Your job is to generate 3 plausible actions for EACH existing character.

You are NOT the narrator.

You are NOT allowed to create world facts.

You are NOT allowed to decide what ultimately happens.

==================================================
CURRENT WORLD
==================================================

${JSON.stringify(
  world,
  null,
  2
)}

==================================================
USER INTERVENTION
==================================================

${
  intervention ||
  "None"
}

==================================================
CLOSED-WORLD RULES
==================================================

Use ONLY characters and entities already present.

Never create:

- new people
- new organizations
- new locations
- new objects
- new devices
- new evidence
- journalists
- police officers
- professors
- students
- security guards
- cameras
- newspapers
- buildings
- company representatives

unless they already exist in the world.

Do not assume an unnamed person exists.

A target must be an existing character/entity or empty string.

Do not give a character knowledge they do not already have.

Do not use another character's secret as public knowledge.

Do not make every option dramatic.

Ordinary actions are valid.

Examples:

- wait
- observe
- stay where they are
- continue working
- avoid someone
- think
- move somewhere already known
- talk to an existing character
- investigate something already known
- protect someone
- change plans

The character must act according to:

- goal
- fear
- current priority
- emotional state
- personality
- knowledge
- capabilities
- resources
- relationships

==================================================
CANDIDATE STRUCTURE
==================================================

For every character produce exactly 3 candidates.

Candidate 1:
The safest / lowest-risk plausible action.

Candidate 2:
The goal-directed plausible action.

Candidate 3:
The more aggressive, uncertain or risky plausible action.

Do NOT choose between them.

If a USER INTERVENTION exists, translate it into ONE proposed action using only existing characters/entities.

If it cannot be represented safely, return null.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON:

{
  "candidates": [
    {
      "actor": "existing character",
      "actions": [
        {
          "action_type": "observe | move | talk | investigate | search | protect | lie | follow | wait | contact | destroy | steal | confront",
          "target": "existing character/entity or empty string",
          "description": "what the character attempts",
          "reason": "why this is plausible from their current state"
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
  ],
  "intervention_action": null
}

Never invent entities.
`;

    const candidateCompletion =
      await groq.chat.completions.create(
        {
          model:
            "openai/gpt-oss-120b",

          temperature:
            0.65,

          response_format: {
            type: "json_object"
          },

          messages: [
            {
              role:
                "system",

              content:
                "Generate constrained candidate actions only. The world state is the source of truth."
            },

            {
              role:
                "user",

              content:
                candidatePrompt
            }
          ]
        }
      );

    const candidateContent =
      candidateCompletion
        .choices[0]
        ?.message
        ?.content;

    if (
      !candidateContent
    ) {
      throw new Error(
        "Candidate engine returned an empty response."
      );
    }

    const candidateData =
      JSON.parse(
        candidateContent
      ) as CandidateResponse;

    const candidates:
      ProposedAction[] = [];

    for (
      const group
      of candidateData.candidates ||
      []
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
                    group.actor,

                  action_type:
                    action.action_type,

                  target:
                    action.target ||
                    "",

                  description:
                    action.description,

                  reason:
                    action.reason
                },

                `${actor.id}-candidate-${
                  index + 1
                }`,

                "character"
              )
            );
          }
        );
    }

    /*
     * =========================================================
     * STEP 2
     *
     * VALIDATE EVERY CANDIDATE
     * =========================================================
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
     * =========================================================
     * STEP 3
     *
     * INDEPENDENT DECISION
     * =========================================================
     */

    const selectionPrompt = `
You are the decision-selection layer of a persistent world simulator.

Choose ONE VALID candidate for each character.

==================================================
CURRENT WORLD
==================================================

${JSON.stringify(
  world,
  null,
  2
)}

==================================================
VALIDATED CANDIDATES
==================================================

${JSON.stringify(
  validatedCandidates,
  null,
  2
)}

==================================================
RULES
==================================================

Select ONLY candidate_id values that actually appear.

Select exactly ONE candidate for each character when possible.

Never invent an action.

Base the decision on:

- goal
- fear
- current priority
- emotional state
- personality
- knowledge
- capabilities
- resources
- relationships
- recent events

Characters make decisions independently.

Do not choose the most dramatic option simply because it creates a better story.

Different characters can make conflicting decisions.

Characters can choose ordinary actions.

A character may choose to wait.

A character may choose to do nothing.

A character may choose a low-risk action.

The simulation does not need a dramatic event every day.

==================================================
OUTPUT
==================================================

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
      await groq.chat.completions.create(
        {
          model:
            "openai/gpt-oss-120b",

          temperature:
            0.55,

          response_format: {
            type: "json_object"
          },

          messages: [
            {
              role:
                "system",

              content:
                "Select from existing candidates only. Never invent actions."
            },

            {
              role:
                "user",

              content:
                selectionPrompt
            }
          ]
        }
      );

    const selectionContent =
      selectionCompletion
        .choices[0]
        ?.message
        ?.content;

    if (
      !selectionContent
    ) {
      throw new Error(
        "Decision selector returned an empty response."
      );
    }

    const selectionData =
      JSON.parse(
        selectionContent
      ) as SelectionResponse;

    const selectedIds =
      new Set(
        (
          selectionData
            .selections || []
        ).map(
          (
            selection
          ) =>
            selection.candidate_id
        )
      );

    const selectedActions =
      candidates.filter(
        (candidate) =>
          candidate.candidate_id &&
          selectedIds.has(
            candidate.candidate_id
          )
      );

    /*
     * Guarantee at most one action
     * per character.
     */

    const selectedByActor =
      new Map<
        string,
        ProposedAction
      >();

    for (
      const action
      of selectedActions
    ) {
      if (
        !selectedByActor.has(
          action.actor
        )
      ) {
        selectedByActor.set(
          action.actor,
          action
        );
      }
    }

    /*
     * Deterministic fallback.
     *
     * If the LLM failed to choose an
     * action, take the first valid
     * candidate.
     */

    for (
      const character
      of world.characters
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
     * =========================================================
     * STEP 4
     *
     * RE-VALIDATE SELECTED ACTIONS
     * =========================================================
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
     * =========================================================
     * STEP 5
     *
     * EXECUTE WORLD CHANGES IN CODE
     * =========================================================
     *
     * The LLM cannot mutate the world.
     */

    const updatedWorld:
      WorldState =
      structuredClone(world);

    for (
      const action
      of validatedActions
    ) {
      applyAction(
        updatedWorld,
        action
      );
    }

    /*
     * =========================================================
     * STEP 6
     *
     * NARRATION ONLY
     * =========================================================
     *
     * The model is now only describing
     * what already happened.
     */

    const narrationPrompt = `
You are the narration layer of a persistent world simulator.

The simulation has ALREADY happened.

Your job is ONLY to describe what happened.

==================================================
WORLD BEFORE
==================================================

${JSON.stringify(
  world,
  null,
  2
)}

==================================================
VALIDATED ACTIONS
==================================================

${JSON.stringify(
  validatedActions,
  null,
  2
)}

==================================================
WORLD AFTER
==================================================

${JSON.stringify(
  updatedWorld,
  null,
  2
)}

==================================================
STRICT CLOSED-WORLD RULES
==================================================

The validated actions are the ONLY actions that happened.

The WORLD AFTER state is authoritative.

DO NOT invent:

- people
- organizations
- locations
- objects
- devices
- evidence
- journalists
- newspapers
- police
- security guards
- professors
- cameras
- USB drives
- documents
- company representatives
- anonymous tips
- buildings
- conversations with unknown people

unless they already exist in the world.

Do not introduce new plot devices.

Do not invent an event simply because it would make the story more exciting.

Do not turn a failed action into a successful action.

Do not give characters information they did not obtain.

Do not create knowledge from nowhere.

It is completely acceptable for very little to happen.

The simulation should feel like a real world, not a screenplay.

Maximum 3 events.

==================================================
OUTPUT
==================================================

Return ONLY JSON:

{
  "situation": "short resulting situation",

  "events": [
    "concrete event that actually happened"
  ],

  "character_updates": [
    {
      "name": "existing character",
      "action": "what they actually did",
      "reason": "why they did it",
      "new_knowledge": "",
      "relationship_change": "",
      "emotional_change": "",
      "new_priority": ""
    }
  ],

  "new_situation": "short description of the world after the actions",

  "next_tension": "an unresolved tension already supported by the world"
}

Never invent anything.
`;

    const narrationCompletion =
      await groq.chat.completions.create(
        {
          model:
            "openai/gpt-oss-120b",

          temperature:
            0.35,

          response_format: {
            type: "json_object"
          },

          messages: [
            {
              role:
                "system",

              content:
                "Narrate only established simulation state. Never invent plot elements."
            },

            {
              role:
                "user",

              content:
                narrationPrompt
            }
          ]
        }
      );

    const narrationContent =
      narrationCompletion
        .choices[0]
        ?.message
        ?.content;

    if (
      !narrationContent
    ) {
      throw new Error(
        "Narration engine returned an empty response."
      );
    }

    const narration =
      JSON.parse(
        narrationContent
      ) as {
        situation?: string;
        events?: string[];
        character_updates?: CharacterUpdate[];
        new_situation?: string;
        next_tension?: string;
      };

    const events =
      Array.isArray(
        narration.events
      )
        ? narration.events
            .filter(
              (event) =>
                typeof event ===
                  "string" &&
                event.trim()
                  .length > 0
            )
            .slice(0, 3)
        : [];

    const characterUpdates =
      Array.isArray(
        narration.character_updates
      )
        ? narration.character_updates.filter(
            (update) =>
              Boolean(
                findCharacter(
                  world,
                  update.name
                )
              )
          )
        : [];

    /*
     * IMPORTANT:
     *
     * We do NOT apply the LLM's
     * knowledge/emotion/relationship
     * changes yet.
     *
     * They are presentation only.
     *
     * Later we will build explicit
     * state-transition rules for them.
     */

    const newSituation =
      narration.new_situation ||
      world.situation;

    updatedWorld.day =
      world.day + 1;

    updatedWorld.situation =
      newSituation;

    updatedWorld.events = [
      ...world.events,
      ...events
    ];

    const result:
      SimulationResult = {
        day:
          updatedWorld.day,

        situation:
          narration.situation ||
          newSituation,

        proposed_actions:
          proposedActions,

        validated_actions:
          validatedActions,

        events,

        character_updates:
          characterUpdates,

        new_situation:
          newSituation,

        next_tension:
          narration.next_tension ||
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
