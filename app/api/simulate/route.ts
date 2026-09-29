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

type ProposedAction = {
  actor: string;
  action_type:
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
    | "confront"
    | "other";
  target: string;
  description: string;
  reason: string;
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
        `Action failed because actor "${action.actor}" does not exist in the world.`
    };
  }

  const targetCharacter = findCharacter(
    world,
    action.target
  );

  const targetEntity = findEntity(
    world,
    action.target
  );

  const targetExists =
    Boolean(targetCharacter) ||
    Boolean(targetEntity) ||
    action.target === "" ||
    action.target === "self";

  if (!targetExists) {
    return {
      ...action,
      result: "failure",
      consequence:
        `Action failed because target "${action.target}" does not exist in the current world.`
    };
  }

  const capabilities = actor.capabilities
    .join(" ")
    .toLowerCase();

  const resources = actor.resources
    .join(" ")
    .toLowerCase();

  const knowledge = actor.knowledge
    .join(" ")
    .toLowerCase();

  const description =
    `${action.action_type} ${action.description}`.toLowerCase();

  /*
   * LOCATION VALIDATION
   */

  if (
    action.action_type === "talk" ||
    action.action_type === "confront"
  ) {
    if (
      targetCharacter &&
      targetCharacter.location !== actor.location
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
   * CAPABILITY VALIDATION
   */

  if (
    action.action_type === "investigate" &&
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
        `${actor.name} lacks a capability that supports this investigation.`
    };
  }

  /*
   * SEARCH VALIDATION
   */

  if (
    action.action_type === "search"
  ) {
    const canSearch =
      capabilities.includes("investigat") ||
      capabilities.includes("observ") ||
      capabilities.includes("search");

    if (!canSearch) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} does not have the capability required to conduct this search.`
      };
    }

    if (
      !description.includes("locker") &&
      !description.includes("room") &&
      !description.includes("bag") &&
      !description.includes("phone") &&
      !description.includes("device") &&
      !description.includes("location")
    ) {
      return {
        ...action,
        result: "partial",
        consequence:
          `${actor.name} searches the available area but finds nothing conclusive.`
      };
    }
  }

  /*
   * FOLLOW VALIDATION
   */

  if (
    action.action_type === "follow"
  ) {
    if (!targetCharacter) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} cannot follow the specified target because the target is not an existing character.`
      };
    }

    if (
      !capabilities.includes("observ") &&
      !capabilities.includes("investigat")
    ) {
      return {
        ...action,
        result: "partial",
        consequence:
          `${actor.name} attempts to follow ${targetCharacter.name}, but lacks strong surveillance or investigation skills.`
      };
    }
  }

  /*
   * DESTROY VALIDATION
   */

  if (
    action.action_type === "destroy"
  ) {
    const hasRelevantResource =
      resources.includes("phone") ||
      resources.includes("laptop") ||
      resources.includes("device") ||
      resources.includes("paper") ||
      resources.includes("envelope") ||
      knowledge.includes("envelope");

    if (!hasRelevantResource) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} cannot destroy the target because no relevant resource or object is currently known to be available.`
      };
    }
  }

  /*
   * CONTACT VALIDATION
   */

  if (
    action.action_type === "contact"
  ) {
    if (
      !(
        resources.includes("smartphone") ||
        resources.includes("phone") ||
        resources.includes("laptop")
      )
    ) {
      return {
        ...action,
        result: "failure",
        consequence:
          `${actor.name} has no known communication resource available.`
      };
    }
  }

  /*
   * MOVE VALIDATION
   */

  if (
    action.action_type === "move"
  ) {
    const location =
      targetEntity?.type === "location"
        ? targetEntity
        : undefined;

    if (!location) {
      return {
        ...action,
        result: "failure",
        consequence:
          `Movement failed because "${action.target}" is not an existing location.`
      };
    }
  }

  /*
   * OTHERWISE THE ACTION IS PLAUSIBLE
   */

  return {
    ...action,
    result: "success",
    consequence:
      `${actor.name} successfully carried out the action.`
  };
}

export async function POST(
  request: Request
) {
  try {
    if (!process.env.GROQ_API_KEY) {
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

    const body = await request.json();

    const world: WorldState = body.world;

    const intervention =
      typeof body.intervention === "string"
        ? body.intervention.trim()
        : "";

    if (
      !world ||
      !Array.isArray(world.characters) ||
      !Array.isArray(world.entities) ||
      !Array.isArray(world.events)
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
     * STEP 1
     *
     * Ask the model to propose actions.
     *
     * It is NOT allowed to directly modify the world.
     */

    const decisionPrompt = `
You are the decision layer of an autonomous world simulator.

You are NOT the narrator.

You are NOT allowed to directly create events.

You are NOT allowed to modify the world.

Your only job is to propose plausible actions for existing characters.

==================================================
CURRENT WORLD
==================================================

${JSON.stringify(world, null, 2)}

==================================================
USER INTERVENTION
==================================================

${
  intervention ||
  "None. Characters must make their own decisions."
}

==================================================
STRICT RULES
==================================================

Only use characters that already exist.

Only use entities that already exist.

Do NOT create:

- new people
- new organizations
- new locations
- journalists
- police officers
- professors
- students
- hackers
- security guards
- devices
- evidence
- buildings

unless they already exist in the world state.

Each character has separate:

- knowledge
- capabilities
- resources
- emotions
- goals
- fears
- relationships
- priorities

Respect these constraints.

A character cannot know another character's secret unless there is a plausible way they learned it.

A character cannot perform an action simply because it would make the story more interesting.

The user intervention is only a proposed event.

It can fail.

==================================================
DECISION PROCESS
==================================================

For every character:

1. Examine their goals.
2. Examine their fears.
3. Examine their current priority.
4. Examine their knowledge.
5. Examine their emotional state.
6. Examine their capabilities.
7. Examine their resources.
8. Examine their relationships.
9. Examine recent events.
10. Decide what they would realistically attempt next.

Characters can:

- wait
- investigate
- observe
- talk
- lie
- follow
- confront
- protect
- contact someone
- move
- search
- abandon a plan
- make mistakes
- do nothing

Do NOT make every character take dramatic action.

==================================================
IMPORTANT
==================================================

You are proposing actions.

The server will decide whether those actions are actually possible.

Do not assume an action succeeds.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Use exactly:

{
  "proposed_actions": [
    {
      "actor": "existing character name",
      "action_type": "observe | move | talk | investigate | search | protect | lie | follow | wait | contact | destroy | steal | confront | other",
      "target": "existing character/entity name, or empty string",
      "description": "specific action the character proposes",
      "reason": "why the character would attempt it"
    }
  ]
}

Generate at most one primary action per character.

Do not create anything that does not already exist.
`;

    const decisionCompletion =
      await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        temperature: 0.7,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content:
              "You are an autonomous decision engine. Propose constrained actions only. Never invent entities."
          },
          {
            role: "user",
            content: decisionPrompt
          }
        ]
      });

    const decisionContent =
      decisionCompletion.choices[0]?.message
        ?.content;

    if (!decisionContent) {
      throw new Error(
        "Decision engine returned an empty response."
      );
    }

    const decisionData = JSON.parse(
      decisionContent
    ) as {
      proposed_actions?: ProposedAction[];
    };

    const proposedActions =
      Array.isArray(
        decisionData.proposed_actions
      )
        ? decisionData.proposed_actions
        : [];

    /*
     * STEP 2
     *
     * Validate every proposed action using code.
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
     * STEP 3
     *
     * Give the validated actions back to the model.
     *
     * The model can now describe consequences,
     * but only from actions that the engine accepted.
     */

    const consequencePrompt = `
You are the consequence layer of a persistent world simulator.

You have been given:

1. The existing world.
2. Character actions proposed by the decision engine.
3. Server validation results.

You must now determine what happens.

==================================================
WORLD
==================================================

${JSON.stringify(world, null, 2)}

==================================================
VALIDATED ACTIONS
==================================================

${JSON.stringify(
  validatedActions,
  null,
  2
)}

==================================================
RULES
==================================================

The validated action results are authoritative.

If an action is:

SUCCESS:
The character actually performed it.

PARTIAL:
The character attempted it but only part of the intended outcome happened.

FAILURE:
The action did not happen.

Do NOT turn a failed action into a success.

Do NOT introduce new characters.

Do NOT introduce new organizations.

Do NOT introduce new locations.

Do NOT invent evidence.

Do NOT invent resources.

Do NOT invent capabilities.

Do NOT invent secret information.

Do NOT give characters knowledge they could not have obtained.

Only describe consequences that logically follow from the validated actions and existing world.

The world should evolve gradually.

Not every day needs a major revelation.

==================================================
USER INTERVENTION
==================================================

If an intervention exists in the world context, treat it as another proposed action.

It may succeed, partially succeed or fail.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Use:

{
  "situation": "short description of the resulting situation",
  "events": [
    "2-4 concrete events that actually happened"
  ],
  "character_updates": [
    {
      "name": "existing character",
      "action": "what they actually did",
      "reason": "why they did it",
      "new_knowledge": "information they actually learned, or empty string",
      "relationship_change": "meaningful change, or empty string",
      "emotional_change": "meaningful change, or empty string",
      "new_priority": "new priority, or empty string"
    }
  ],
  "new_situation": "resulting world situation",
  "next_tension": "unresolved tension that naturally follows"
}

Do not output internal reasoning.
`;

    const consequenceCompletion =
      await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        temperature: 0.75,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content:
              "You are a constrained consequence engine. Validated actions are authoritative. Never invent entities."
          },
          {
            role: "user",
            content:
              consequencePrompt
          }
        ]
      });

    const consequenceContent =
      consequenceCompletion.choices[0]?.message
        ?.content;

    if (!consequenceContent) {
      throw new Error(
        "Consequence engine returned an empty response."
      );
    }

    const consequenceData =
      JSON.parse(
        consequenceContent
      ) as {
        situation: string;
        events: string[];
        character_updates: CharacterUpdate[];
        new_situation: string;
        next_tension: string;
      };

    /*
     * STEP 4
     *
     * Apply only validated consequences to the world.
     */

    const updatedCharacters =
      world.characters.map(
        (character) => {
          const update =
            consequenceData.character_updates?.find(
              (item) =>
                item.name ===
                character.name
            );

          if (!update) {
            return character;
          }

          const updatedKnowledge = [
            ...character.knowledge
          ];

          if (
            update.new_knowledge &&
            !updatedKnowledge.includes(
              update.new_knowledge
            )
          ) {
            updatedKnowledge.push(
              update.new_knowledge
            );
          }

          return {
            ...character,
            knowledge:
              updatedKnowledge,
            relationship:
              update.relationship_change ||
              character.relationship,
            emotional_state:
              update.emotional_change ||
              character.emotional_state,
            current_priority:
              update.new_priority ||
              character.current_priority
          };
        }
      );

    /*
     * Update locations only when a validated
     * movement action succeeded.
     */

    for (const action of validatedActions) {
      if (
        action.result !== "success" ||
        action.action_type !== "move"
      ) {
        continue;
      }

      const actor =
        updatedCharacters.find(
          (character) =>
            character.name ===
            action.actor
        );

      const destination =
        findEntity(
          world,
          action.target
        );

      if (
        actor &&
        destination &&
        destination.type ===
          "location"
      ) {
        actor.location =
          destination.name;
      }
    }

    const events = Array.isArray(
      consequenceData.events
    )
      ? consequenceData.events.filter(
          (event) =>
            typeof event ===
              "string" &&
            event.trim().length > 0
        )
      : [];

    const updatedWorld: WorldState = {
      ...world,
      day: world.day + 1,
      situation:
        consequenceData.new_situation ||
        consequenceData.situation ||
        world.situation,
      characters:
        updatedCharacters,
      entities:
        world.entities,
      events: [
        ...world.events,
        ...events
      ]
    };

    const result: SimulationResult = {
      day: updatedWorld.day,
      situation:
        consequenceData.situation ||
        updatedWorld.situation,
      proposed_actions:
        proposedActions,
      validated_actions:
        validatedActions,
      events,
      character_updates:
        consequenceData.character_updates ||
        [],
      new_situation:
        consequenceData.new_situation ||
        updatedWorld.situation,
      next_tension:
        consequenceData.next_tension ||
        ""
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
