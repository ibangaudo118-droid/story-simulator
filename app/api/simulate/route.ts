import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  normalizeWorld,
  simulateDay,
} from "./engine";

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const world =
      normalizeWorld(
        body?.world
      );

    const intervention =
      typeof body?.intervention ===
      "string"
        ? body.intervention.trim()
        : "";

    const result =
      simulateDay(
        world,
        intervention
      );

    /*
     * The engine internally stores
     * character updates as a Record
     * keyed by character ID.
     *
     * The frontend expects an array,
     * so we transform it here at the
     * API boundary.
     */
    const characterUpdates =
      result.world.characters.map(
        (character) => {
          const update =
            result.characterUpdates[
              character.id
            ];

          return {
            name:
              character.name,

            action:
              update?.action ??
              "WAIT",

            reason:
              update?.reason ??
              "",

            new_knowledge:
              "",

            relationship_change:
              "",

            emotional_change:
              character.emotionalState,

            new_priority:
              character.currentPriority,
          };
        }
      );

    return NextResponse.json(
      {
        success: true,

        world:
          result.world,

        result: {
          day:
            result.world.day,

          situation:
            result.world.situation,

          events:
            result.events,

          character_updates:
            characterUpdates,

          new_situation:
            result.world.situation,

          next_tension:
            result.nextTension,

          /*
           * Interventions are now structured
           * WorldEvents inside the engine.
           *
           * We deliberately do not pretend
           * that the intervention has a direct
           * guaranteed "effect".
           */
          intervention:
            intervention
              ? {
                  accepted:
                    true,

                  text:
                    intervention,
                }
              : null,
        },
      },

      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Simulation API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "The simulation server encountered an unexpected error.",
      },

      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}
