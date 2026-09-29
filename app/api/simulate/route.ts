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

type CharacterUpdate = {
  name: string;
  action: string;
  reason: string;
  new_knowledge: string;
  relationship_change: string;
  emotional_change: string;
  new_priority: string;
};

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error: "GROQ_API_KEY is not configured."
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
      !Array.isArray(world.entities)
    ) {
      return NextResponse.json(
        {
          error: "A valid world state is required."
        },
        {
          status: 400
        }
      );
    }

    const prompt = `
You are the autonomous simulation engine of a persistent world.

You are NOT a novelist.

You are NOT supposed to invent whatever would make the story exciting.

You are simulating a world containing persistent people, organizations
and locations.

==================================================
WORLD STATE
==================================================

${JSON.stringify(world, null, 2)}

==================================================
USER INTERVENTION
==================================================

${
  intervention ||
  "None. No direct intervention was made. Characters must decide for themselves."
}

==================================================
PERSISTENT WORLD RULE
==================================================

The entities listed in WORLD STATE are the current known entities.

Do NOT casually create new people, organizations or locations.

Do NOT introduce:

- random professors
- random police officers
- random hackers
- random journalists
- random friends
- random company employees
- random buildings
- random devices

unless such an entity already exists in the world state or its appearance
is absolutely necessary and logically unavoidable.

If an existing character needs another person, use an existing entity
when possible.

The world should remain small and understandable.

==================================================
CHARACTER RULE
==================================================

Every character has:

- personality
- goal
- fear
- current priority
- emotional state
- secret
- relationships
- knowledge
- capabilities
- resources
- location

These are constraints.

A character cannot simply do something because it would be useful for
the plot.

==================================================
CAPABILITY RULE
==================================================

Characters can only perform actions consistent with their capabilities
and resources.

Examples:

If Zara has no hacking capability, she cannot hack a secure server.

If Daniel has no access to a restricted location, he cannot simply enter it.

If someone needs transportation, equipment, money or another resource,
that constraint matters.

Never give a character a new capability just because an action would be
dramatically useful.

==================================================
KNOWLEDGE RULE
==================================================

Each character has separate knowledge.

A character only knows information contained in their knowledge or
information they could realistically observe during the simulation.

Do not transfer private knowledge between characters.

A character may have false beliefs.

Belief is not automatically fact.

==================================================
DECISION PROCESS
==================================================

For each character independently:

1. Determine what they currently want.

2. Determine what they fear.

3. Determine what they currently know.

4. Determine what they do not know.

5. Examine their current emotional state.

6. Examine their current priority.

7. Examine their capabilities.

8. Examine their resources.

9. Examine their relationships.

10. Examine recent events.

11. Generate several plausible actions.

12. Evaluate those actions against the character's internal state.

13. Select the action that this particular character would most likely
take.

Do not automatically select the most dramatic action.

Do not automatically select the action that advances the central conflict.

Characters may choose to:

- wait
- investigate
- lie
- tell the truth
- avoid someone
- confront someone
- protect someone
- betray someone
- gather information
- ask for help
- change plans
- abandon an objective
- make a mistake
- do nothing

==================================================
AUTONOMY
==================================================

Characters are independent.

They do not know what the narrator knows.

They do not know what other characters secretly know.

They do not exist to create a satisfying story.

They can make bad decisions.

They can make boring decisions.

They can misunderstand events.

They can become frightened.

They can lose motivation.

They can change priorities.

They can act against their own previous plans.

They can fail.

They can unexpectedly succeed.

==================================================
USER INTERVENTION
==================================================

The user intervention is an event introduced into the world.

It is NOT guaranteed to succeed.

For example:

"Zara follows Daniel."

Possible outcomes:

- Zara successfully follows Daniel.
- Daniel notices Zara.
- Zara loses Daniel.
- Zara decides the risk is too high.
- Zara discovers something unexpected.
- Daniel deliberately misleads her.

Choose according to the world state.

==================================================
WORLD CONSEQUENCES
==================================================

After deciding what characters do, determine what actually happens.

Actions can:

- succeed
- partially succeed
- fail
- create unintended consequences

Consequences must be consistent with the world.

Do not create convenient evidence, characters or locations merely to
advance the plot.

==================================================
PERSISTENCE
==================================================

Existing characters and entities continue to exist.

If an entity changes location, track the new location.

If a relationship changes, preserve it.

If knowledge changes, preserve it.

If an emotional state changes, preserve it.

If a priority changes, preserve it.

Do not reset character state between days.

==================================================
ANTI-PLOT RULE
==================================================

There is NO predetermined ending.

Do not assume:

- Zara will expose the company.
- Daniel will betray the company.
- Daniel will protect Zara.
- The company will lose.
- Zara and Daniel will remain friends.
- The investigation will escalate.

The simulation may develop in any direction.

==================================================
DAY ADVANCEMENT
==================================================

Advance the world approximately one day.

Generate 2-4 meaningful events.

Events must result from character decisions and consequences.

==================================================
IMPORTANT OUTPUT RULE
==================================================

Do not create new characters or entities in the output.

Use only existing character names and existing world entities.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Use exactly this structure:

{
  "day": number,
  "situation": "short description of the resulting world situation",
  "events": [
    "event 1",
    "event 2",
    "event 3"
  ],
  "character_updates": [
    {
      "name": "existing character name",
      "action": "what the character actually decided and did",
      "reason": "why this decision fits the character's current state",
      "new_knowledge": "new information actually learned, or empty string",
      "relationship_change": "meaningful relationship change, or empty string",
      "emotional_change": "meaningful emotional change, or empty string",
      "new_priority": "new current priority, or empty string"
    }
  ],
  "new_situation": "the resulting situation",
  "next_tension": "an unresolved situation created naturally by the simulation"
}

Do not output your internal reasoning.

Remember:

You are simulating a persistent world.

You are not writing a predetermined story.
`;

    const completion =
      await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",

        temperature: 0.9,

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "system",
            content:
              "You are a persistent autonomous world simulation engine. Follow world constraints strictly. Do not invent convenient plot devices. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });

    const content =
      completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Groq returned an empty response."
      );
    }

    const result = JSON.parse(content) as {
      day: number;
      situation: string;
      events: string[];
      character_updates: CharacterUpdate[];
      new_situation: string;
      next_tension: string;
    };

    const updatedCharacters =
      world.characters.map((character) => {
        const update =
          result.character_updates?.find(
            (item) =>
              item.name === character.name
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
      });

    const updatedWorld: WorldState = {
      ...world,

      day:
        Number(result.day) ||
        world.day + 1,

      situation:
        result.new_situation ||
        world.situation,

      characters:
        updatedCharacters,

      entities:
        world.entities,

      events: [
        ...world.events,

        ...(Array.isArray(result.events)
          ? result.events
          : [])
      ]
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
