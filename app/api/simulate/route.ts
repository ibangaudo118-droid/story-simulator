import { NextResponse } from "next";
import Groq from "groq-sdk";

export const runtime = "nodejs";

type Character = {
  name: string;
  personality: string;
  goal: string;
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
You are the simulation engine for an interactive story.

You are NOT a normal AI story writer.

You are simulating a persistent world where characters have their own
goals, personalities, secrets, relationships and knowledge.

WORLD STATE:
${JSON.stringify(world, null, 2)}

USER INTERVENTION:
${
  intervention ||
  "No direct intervention. Let the characters act autonomously."
}

IMPORTANT RULES:

1. Characters are autonomous.
2. Characters should make decisions based on their own goals,
   personalities, secrets and current knowledge.
3. A character cannot know something unless they already knew it
   or discovered it during the simulation.
4. Previous events MUST affect future decisions.
5. Relationships can change gradually.
6. Characters can lie, cooperate, betray each other, investigate,
   make mistakes and change their minds.
7. Characters should not all agree.
8. The user can influence events but does not completely control
   the characters.
9. Advance the world by approximately one day.
10. Preserve continuity.
11. Do not randomly reset or rewrite established facts.
12. New information should have consequences later.
13. Create believable tension that can continue into the next day.
14. Keep the number of major events between 2 and 5.
15. Do not reveal a character's secret to another character unless
    there is a believable way that character discovered it.

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
      "action": "what the character did",
      "reason": "why they did it",
      "new_knowledge": "new information this character learned, or empty string",
      "relationship_change": "how this character's relationship changed, or empty string"
    }
  ],
  "new_situation": "the situation the world is now in",
  "next_tension": "the unresolved conflict that could drive the next day"
}
`;

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      temperature: 0.9,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content:
            "You are a persistent-world simulation engine. Return only valid JSON."
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
          update.relationship_change || character.relationship
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
