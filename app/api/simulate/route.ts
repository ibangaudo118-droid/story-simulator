import { NextResponse } from "next/server";
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

Your job is NOT to write a normal story.

You simulate autonomous characters inside a persistent world.

WORLD:
${JSON.stringify(world, null, 2)}

USER INTERVENTION:
${
  intervention ||
  "No direct intervention. Let the characters act according to their goals, personalities, secrets and knowledge."
}

RULES:

1. Characters have their own goals and make decisions autonomously.
2. Characters can lie, discover secrets, form alliances, become suspicious,
   change relationships and make mistakes.
3. A character cannot magically know information they have not discovered.
4. Previous events must affect future decisions.
5. The world must change over time.
6. Characters should not all agree.
7. Unexpected but believable events are encouraged.
8. The user can influence events but cannot directly control every character.
9. Advance the world by approximately one day.
10. Preserve continuity. Do not contradict established facts without a reason.
11. Every character action should have a believable reason.
12. Create tension that gives the user a reason to simulate again.

Return ONLY valid JSON with this exact shape:

{
  "day": number,
  "situation": "short description of the current situation",
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
      "new_knowledge": "anything newly discovered or learned",
      "relationship_change": "how a relationship changed"
    }
  ],
  "new_situation": "the situation the world is now in",
  "next_tension": "the unresolved tension that could drive the next simulation"
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

    const result = JSON.parse(content);

    const updatedWorld: WorldState = {
      ...world,
      day: Number(result.day) || world.day + 1,
      situation:
        result.new_situation || world.situation,
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
          "Simulation failed. Check your Groq API key and server logs."
      },
      { status: 500 }
    );
  }
}
