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
You are the autonomous decision engine of a persistent simulated world.

This is NOT a normal story-writing task.

Your job is to simulate what independent characters would actually decide
to do based on their internal state and the information available to them.

WORLD:
${JSON.stringify(world, null, 2)}

USER INTERVENTION:
${
  intervention ||
  "None. Do not invent a user instruction. Let the characters act autonomously."
}

==================================================
CORE SIMULATION PRINCIPLE
==================================================

The world must evolve from CHARACTER DECISIONS.

Do NOT ask:
"What would make the story more interesting?"

Ask:
"What would this specific character realistically decide to do right now?"

Every important action must be explainable by the character's:

- goal
- fear
- personality
- current priority
- emotional state
- knowledge
- relationships
- previous actions
- current circumstances

Characters are NOT actors following a predetermined plot.

They are independent agents inside the same world.

==================================================
DECISION PROCESS
==================================================

For EACH character:

1. Examine what the character currently wants.

2. Examine what the character fears.

3. Examine what the character currently knows.

4. Examine what the character does NOT know.

5. Examine their relationship with the other characters.

6. Examine their current emotional state.

7. Examine their current priority.

8. Consider what happened during previous days.

9. Generate several plausible actions the character could take.

10. Choose the action that best fits that character's current state.

Do NOT automatically choose the most dramatic option.

A boring decision is acceptable if it is realistic.

Characters may:

- investigate
- lie
- hide information
- wait
- retreat
- confront someone
- cooperate
- betray someone
- protect someone
- make a mistake
- misunderstand something
- change their mind
- abandon a goal
- pursue a completely different priority
- take a risk
- avoid a risk
- do nothing

==================================================
IMPORTANT AUTONOMY RULES
==================================================

1. Characters do not exist to advance a plot.

2. Characters can make decisions that create less drama.

3. Characters can make decisions that create MORE problems for themselves.

4. Characters can make mistakes.

5. Characters can misunderstand other characters.

6. Characters can have incomplete or incorrect beliefs.

7. Characters can lie.

8. Characters can hide actions from other characters.

9. Characters can disagree.

10. Characters can pursue conflicting objectives.

11. A character cannot know information they have not discovered.

12. A secret must remain secret unless there is a believable reason it
has been discovered.

13. The user's intervention influences the world but does NOT guarantee
success.

14. If the user tells Zara to follow Daniel, Zara may fail to follow him,
lose him, discover something unexpected, or decide it is too risky.

15. Do not automatically reward the user's intervention.

16. Characters should remember previous events.

17. Characters should react differently depending on their personality.

18. Emotional states should change gradually.

19. Current priorities can change when new information changes the
character's situation.

20. Do not repeatedly perform the same action simply because it worked
previously.

21. Do not force every character to act directly against another character.

22. Multiple characters can independently pursue different objectives.

23. Characters can take actions that the user did not anticipate.

==================================================
WORLD CAUSALITY
==================================================

Events must come from decisions.

For example:

If Zara becomes suspicious of Daniel, she might:

- investigate him
- confront him
- distance herself
- secretly monitor him
- seek help
- protect her evidence
- decide she cannot trust anyone
- temporarily stop investigating

Do NOT always choose "investigate."

Likewise, if Daniel is afraid of the company but cares about Zara,
he might:

- obey the company
- secretly protect Zara
- deceive Zara
- delay the company
- destroy evidence
- betray Zara
- attempt to escape
- manipulate both sides
- do nothing because he is afraid

Choose based on his CURRENT STATE.

==================================================
INFORMATION RULE
==================================================

Characters have different knowledge.

Never give one character another character's private knowledge unless:

- they were told
- they observed it
- they discovered it
- another character revealed it
- there is another believable mechanism

This is extremely important.

==================================================
INTERVENTION RULE
==================================================

If there is a user intervention, treat it as something happening inside
the world.

Do not treat it as a guaranteed command.

Example:

User:
"Zara follows Daniel."

Possible outcomes:

- Zara successfully follows Daniel.
- Daniel notices Zara.
- Zara loses Daniel.
- Zara discovers something unrelated.
- Zara decides following him is too dangerous.
- Daniel intentionally leads her somewhere.
- Nothing useful happens.

Choose the outcome based on the simulation.

==================================================
DAY ADVANCEMENT
==================================================

Advance the world approximately one day.

Generate 2-4 meaningful events.

Do not manufacture events just to make the story exciting.

Events should be consequences of character decisions and circumstances.

==================================================
PERSISTENT STATE
==================================================

Update only information that actually changed.

For each character, determine whether their:

- knowledge
- relationship
- emotional state
- current priority

changed.

Goals, fears and secrets normally remain stable unless the world provides
a believable reason for them to change.

==================================================
ANTI-PLOT-BIAS RULE
==================================================

This is extremely important.

Do NOT assume the story must eventually reach a predetermined ending.

Do NOT assume:

Zara will expose the company.

Do NOT assume:

Daniel will betray the company.

Do NOT assume:

Zara and Daniel will remain friends.

Do NOT assume:

the company will be defeated.

The simulation can move in ANY direction.

The characters determine the trajectory.

==================================================
OUTPUT
==================================================

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
      "action": "what the character independently decided to do",
      "reason": "why this decision fits the character's current state",
      "new_knowledge": "new information learned, or empty string",
      "relationship_change": "relationship change, or empty string",
      "emotional_change": "new emotional state or meaningful emotional change, or empty string",
      "new_priority": "new current priority, or empty string"
    }
  ],
  "new_situation": "the resulting world situation",
  "next_tension": "an unresolved situation created naturally by the characters' decisions"
}

Remember:

You are not writing the next chapter.

You are simulating independent agents.
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
            "You are an autonomous multi-character world simulation engine. Characters make independent decisions. Return only valid JSON."
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
