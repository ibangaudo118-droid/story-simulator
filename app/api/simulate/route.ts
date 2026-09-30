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

    const characterUpdates =
      result.world.characters.map(
        (character) => {
          const update =
            result
              .characterUpdates[
              character.id
            ];

          const consequence =
            result.consequences.find(
              (item) =>
                item.actorId ===
                character.id
            );

          const relationshipChanges =
            consequence
              ?.relationshipChanges ??
            [];

          const relationshipChangeText =
            relationshipChanges.length >
            0
              ? relationshipChanges
                  .map(
                    (
                      change
                    ) => {
                      const target =
                        result.world.characters.find(
                          (
                            targetCharacter
                          ) =>
                            targetCharacter.id ===
                            change.targetId
                        );

                      const targetName =
                        target?.name ??
                        change.targetId;

                      const parts: string[] =
                        [];

                      if (
                        typeof change.trustDelta ===
                          "number" &&
                        change.trustDelta !==
                          0
                      ) {
                        parts.push(
                          `trust ${
                            change.trustDelta >
                            0
                              ? "+"
                              : ""
                          }${change.trustDelta}`
                        );
                      }

                      if (
                        typeof change.suspicionDelta ===
                          "number" &&
                        change.suspicionDelta !==
                          0
                      ) {
                        parts.push(
                          `suspicion ${
                            change.suspicionDelta >
                            0
                              ? "+"
                              : ""
                          }${change.suspicionDelta}`
                        );
                      }

                      if (
                        parts.length ===
                        0
                      ) {
                        return `${targetName}: relationship changed`;
                      }

                      return `${targetName}: ${parts.join(
                        ", "
                      )}`;
                    }
                  )
                  .join("; ")
              : "";

          return {
            name:
              character.name,

            action:
              update?.action ??
              "WAIT",

            reason:
              update?.reason ??
              "",

            strategy:
              consequence
                ?.outcome
                ?.strategyId ??
              "",

            outcome:
              consequence
                ?.outcome
                ?.summary ??
              "",

            new_knowledge:
              consequence?.knowledgeGained
                ?.filter(
                  Boolean
                )
                .join(
                  "; "
                ) ?? "",

            relationship_change:
              relationshipChangeText,

            emotional_change:
              consequence?.emotionalChange ??
              "",

            new_priority:
              consequence?.priorityChange ??
              "",
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
            result.world
              .situation,

          events:
            result.events,

          character_updates:
            characterUpdates,

          new_situation:
            result.world
              .situation,

          next_tension:
            result.nextTension,

          intervention:
            intervention
              ? {
                  accepted:
                    true,

                  text:
                    intervention,

                  effect:
                    "Recorded as a world event. Characters were not directly forced to execute it.",
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
