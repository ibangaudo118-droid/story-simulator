import { NextResponse } from "next";
import Groq from "groq-sdk";

export const runtime = "nodejs";

type Character = {
  name: string;
  personality: string;
  goal: string;
  fear: string;
  current_priority: string;
  emotional_state: string;
  secret: string;
  relationship: string;
  knowledge: string[];
};

type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Character[];
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
        { error: "GROQ_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const world: WorldState = body.world;

    const intervention =
      typeof body.intervention === "string"
        ? body.intervention.trim()
        : "";

    if (!world?.characters?.length) {
      return NextResponse.json(
        { error: "A valid world state is required." },
        { status: 400 }
      );
    }

    const prompt = `
You are the decision engine of a persistent interactive world.

You are NOT writing a normal story.

You are simulating characters who have their own motivations,
fears, knowledge, relationships and priorities.

WORLD:
${JSON.stringify(world, null, 2)}

USER INTERVENTION:
${
  intervention ||
  "No intervention. Let every character decide what they would realistically do."
}

CHARACTER DECISION RULES:

1. Every character is autonomous.
2. Characters must make decisions based on their own goals,
   fears, personality, knowledge, relationships and current priority.
3. Do not make characters act simply because it creates a dramatic story.
4. Characters can make mistakes.
5. Characters can misunderstand situations.
6. Characters can lie.
7. Characters can hide information.
8. Characters can change their plans.
9. Characters can disagree with each other.
10. Characters can pursue different objectives simultaneously.
11. A character cannot know information they have not discovered.
12. Secrets remain secret unless there is a believable way they are exposed.
13. Previous events must influence future decisions.
14. Emotional states should change gradually based on events.
15. Current priorities can change when circumstances change.
16. The user can influence the world but does not directly control every character.
17. Do not force the user intervention to succeed automatically.
18. Advance the world approximately one day.
19. Generate 2-4 meaningful events.
20. Prefer believable consequences over dramatic ones.
21. Avoid repeating the exact same action from the previous day unless
    the character has a strong reason to repeat it.

IMPORTANT:

Before deciding what each character does, reason internally about:

- What does this character want?
- What are they afraid of?
- What do they currently know?
- What do they believe about the other characters?
- What is their current priority?
- What would a person with this personality realistically do?

Do not output this internal reasoning.

Return ONLY valid JSON.

Use exactly this structure:

{
  "day": number,
  "situation": "short description of the new situation",
  "events": [
    "event 1",
    "event 2",
    "event 3"
  ],
  "character_updates": [
    {
      "name": "character name",
      "action": "what the character decided to do",
      "reason": "short explanation of the motivation",
      "new_knowledge": "new information learned, or empty string",
      "relationship_change": "relationship change, or empty string",
      "emotional_change": "change in emotional state, or empty string",
      "new_priority": "new current priority, or empty string"
    }
  ],
  "new_situation": "the resulting situation",
  "next_tension": "the unresolved tension that could drive the next simulation"
}
`;

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      temperature: 0.85,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content:
            "You are an autonomous character decision engine. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Groq returned an empty response.");
    }

    const result = JSON.parse(content) as {
      day: number;
      situation: string;
      events: string[];
      character_updates: CharacterUpdate[];
      new_situation: string;
      next_tension: string;
    };

    const updatedCharacters = world.characters.map((character) => {
      const update = result.character_updates?.find(
        (item) => item.name === character.name
      );

      if (!update) {
        return character;
      }

      const updatedKnowledge = [...character.knowledge];

      if (
        update.new_knowledge &&
        !updatedKnowledge.includes(update.new_knowledge)
      ) {
        updatedKnowledge.push(update.new_knowledge);
      }

      return {
        ...character,

        knowledge: updatedKnowledge,

        relationship:
          update.relationship_change || character.relationship,

        emotional_state:
          update.emotional_change || character.emotional_state,

        current_priority:
          update.new_priority || character.current_priority
      };
    });

    const updatedWorld: WorldState = {
      ...world,

      day: Number(result.day) || world.day + 1,

      situation:
        result.new_situation || world.situation,

      characters: updatedCharacters,

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
    console.error("Simulation error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Simulation failed."
      },
      { status: 500 }
    );
  }
}
