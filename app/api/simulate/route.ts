import { NextRequest, NextResponse } from "next/server";
import {
  normalizeWorld,
  simulateDay,
} from "./engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const world = normalizeWorld(body?.world);

    const intervention =
      typeof body?.intervention === "string"
        ? body.intervention.trim()
        : "";

    const result = simulateDay(
      world,
      intervention
    );

    return NextResponse.json(
      {
        success: true,
        world: result.world,
        result: {
          day: result.world.day,
          situation: result.world.situation,
          events: result.events,
          character_updates:
            result.characterUpdates,
          new_situation:
            result.world.situation,
          next_tension:
            result.nextTension,
          intervention:
            intervention
              ? {
                  accepted: true,
                  text: intervention,
                  effect:
                    result.interventionEffect,
                }
              : null,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
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
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
