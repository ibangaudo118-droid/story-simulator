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
  capabilities: string[];
  resources: string[];
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
You are the decision engine for a persistent autonomous world.

You are NOT writing a predetermined story.

You are simulating independent people who exist inside the same world.

==================================================
CURRENT WORLD
==================================================

${JSON.stringify(world, null, 2)}

==================================================
USER INTERVENTION
==================================================

${
  intervention ||
  "No intervention. Let every character make their own decision."
}

==================================================
YOUR JOB
==================================================

Advance the world approximately one day.

However, you MUST simulate decisions before describing events.

For every character, independently perform the following process:

STEP 1 — UNDERSTAND THE CHARACTER

Determine internally:

- What does this character ultimately want?
- What are they afraid of?
- What is their current priority?
- What do they know?
- What do they NOT know?
- What do they believe about other characters?
- What is their emotional state?
- What capabilities do they possess?
- What resources do they possess?
- What happened to them recently?

STEP 2 — GENERATE POSSIBLE ACTIONS

Generate several plausible actions.

The actions can include:

- investigate
- confront
- lie
- tell the truth
- wait
- retreat
- hide
- protect someone
- betray someone
- gather information
- ask for help
- abandon an objective
- change priorities
- take a risk
- avoid a risk
- do nothing

Do NOT automatically choose the most dramatic action.

Do NOT automatically choose the action that advances the main conflict.

STEP 3 — EVALUATE THE ACTIONS

Evaluate each possible action against:

- goal alignment
- fear/risk
- personality
- current emotional state
- current priority
- available knowledge
- available capabilities
- available resources
- relationships
- likely consequences

STEP 4 — CHOOSE ONE

Choose the action that this particular character would most plausibly
take.

Different characters should make different kinds of decisions.

==================================================
AUTONOMY
==================================================

Characters are NOT controlled by the narrative.

They can:

- make bad decisions
- make irrational decisions
- misunderstand people
- become scared
- lose motivation
- become suspicious
- trust the wrong person
- abandon their previous plan
- pursue a new priority
- lie
- protect someone
- betray someone
- refuse to act
- make decisions that create no immediate drama

The simulation does NOT have a predetermined ending.

Zara does not have to expose the company.

Daniel does not have to betray the company.

They may move closer together or further apart.

They may stop caring about the original conflict.

The company may succeed.

The company may fail.

Unexpected outcomes are allowed.

==================================================
CAPABILITY CONSTRAINT
==================================================

A character can ONLY perform actions that are consistent with their
capabilities, resources, knowledge and circumstances.

Do NOT give characters abilities they do not possess.

For example:

If Zara is not described as a hacker, she cannot suddenly hack a
company server.

If Daniel does not have access to confidential information, he cannot
suddenly obtain it.

If a character needs money, transportation, equipment, contacts or
permission to perform an action, those constraints matter.

==================================================
KNOWLEDGE CONSTRAINT
==================================================

Characters have separate knowledge.

Never transfer private information between characters unless there is a
believable mechanism.

A character may believe something that is false.

Beliefs are not automatically facts.

==================================================
RELATIONSHIP CONSTRAINT
==================================================

Relationships affect decisions.

But relationships should not completely control behavior.

Someone can care about another person and still lie to them.

Someone can distrust another person and still cooperate with them.

==================================================
USER INTERVENTION
==================================================

The user's intervention is an event entering the world.

It is NOT an omnipotent command.

Example:

User:
"Zara follows Daniel."

Possible outcomes include:

- Zara successfully follows him.
- Daniel notices her.
- Zara loses him.
- Zara decides it is too dangerous.
- Zara discovers something unexpected.
- Daniel intentionally misleads her.
- Nothing useful happens.

Choose based on the world state.

==================================================
CONSEQUENCES
==================================================

After choosing character actions, determine what actually happens.

Consequences must follow from:

- the selected actions
- the characters' capabilities
- the environment
- previous events
- information available to the characters

Do not invent convenient events simply to make the story exciting.

Some actions may fail.

Some actions may partially succeed.

Some actions may have unintended consequences.

==================================================
PERSISTENT STATE
==================================================

Update only information that genuinely changed.

Possible changes:

- knowledge
- relationships
- emotional state
- current priority

Goals, fears, secrets, capabilities and resources should normally remain
stable unless the world gives a believable reason for them to change.

==================================================
ANTI-PLOT RULE
==================================================

This rule is critical.

DO NOT think:

"What should happen next in this story?"

Think:

"What would these people independently do given their current states?"

Do not force escalation.

Do not force confrontation.

Do not force discovery.

Do not force betrayal.

Do not force romance.

Do not force a dramatic ending.

If the most realistic outcome is boring, choose the realistic outcome.

==================================================
EVENT GENERATION
==================================================

Generate 2-4 meaningful events resulting from the decisions.

Events should describe what actually happened.

Do not simply restate the character's intentions.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Use exactly:

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
      "name": "character name",
      "action": "what the character actually decided and did",
      "reason": "why this decision fits this character",
      "new_knowledge": "new information actually learned, or empty string",
      "relationship_change": "meaningful relationship change, or empty string",
      "emotional_change": "new emotional state, or empty string",
      "new_priority": "new current priority, or empty string"
    }
  ],
  "new_situation": "resulting situation after the decisions and consequences",
  "next_tension": "an unresolved situation created naturally by the simulation"
}

Do not include your internal reasoning in the response.

Remember:

You are simulating autonomous people.

You are not writing a chapter of a novel.
`;

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      temperature: 0.95,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content:
            "You are an autonomous multi-agent world simulation engine. Simulate decisions and consequences rather than writing predetermined plots. Return only valid JSON."
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
