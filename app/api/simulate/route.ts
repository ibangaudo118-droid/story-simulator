import { NextRequest, NextResponse } from "next/server";

type Character = {
  id: string;
  name: string;
  location: string;
};

type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Character[];
  entities: unknown[];
  events: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const previousWorld = body?.world as WorldState | undefined;

    if (!previousWorld) {
      return NextResponse.json({
        success: true,

        world: {
          day: 1,
          location: "University of Lagos",
          situation:
            "A mysterious technology company has started secretly recruiting students on campus.",

          characters: [
            {
              id: "zara",
              name: "Zara",
              location: "University of Lagos campus"
            },
            {
              id: "daniel",
              name: "Daniel",
              location: "University of Lagos campus"
            }
          ],

          entities: [],

          events: [
            "Zara notices Daniel leaving a private meeting with the mysterious company."
          ]
        },

        result: {
          day: 1,

          situation:
            "The simulation has started.",

          events: [
            "Zara notices Daniel leaving a private meeting with the mysterious company."
          ],

          character_updates: [],

          new_situation:
            "The simulation has started.",

          next_tension:
            "Zara is suspicious of Daniel."
        }
      });
    }

    const nextDay =
      typeof previousWorld.day === "number"
        ? previousWorld.day + 1
        : 2;

    const nextEvent =
      `Day ${nextDay}: The characters continue pursuing their own goals.`;

    const nextWorld: WorldState = {
      day: nextDay,

      location:
        typeof previousWorld.location === "string"
          ? previousWorld.location
          : "University of Lagos",

      situation:
        "The characters continue pursuing their own goals while the situation develops.",

      characters:
        Array.isArray(previousWorld.characters)
          ? previousWorld.characters
          : [],

      entities:
        Array.isArray(previousWorld.entities)
          ? previousWorld.entities
          : [],

      events: [
        ...(Array.isArray(previousWorld.events)
          ? previousWorld.events
          : []),

        nextEvent
      ]
    };

    return NextResponse.json({
      success: true,

      world: nextWorld,

      result: {
        day: nextDay,

        situation:
          nextWorld.situation,

        events: [
          nextEvent
        ],

        character_updates:
          nextWorld.characters.map(
            character => ({
              name: character.name,

              action:
                `${character.name} observes the situation and continues pursuing their goals.`,

              reason:
                "Their existing goals and priorities remain active.",

              new_knowledge:
                "",

              relationship_change:
                "",

              emotional_change:
                "",

              new_priority:
                ""
            })
          ),

        new_situation:
          nextWorld.situation,

        next_tension:
          "The world continues to develop as the characters pursue their own goals."
      }
    });

  } catch (error) {
    console.error(
      "Simulation API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "The simulation server encountered an unexpected error."
      },
      {
        status: 500
      }
    );
  }
}
