"use client";

import { useState } from "react";

import {
  createInitialWorld,
} from "@/lib/simulation/world";

import type {
  ActionType,
  Character,
  Relationship,
  WorldState,
} from "@/lib/simulation/types";

/* =========================================================
   TYPES
========================================================= */

type CharacterUpdate = {
  name: string;
  action: string;
  reason: string;
  new_knowledge: string;
  relationship_change: string;
  emotional_change: string;
  new_priority: string;
};

type SimulationResult = {
  day: number;
  situation: string;
  events: string[];
  character_updates: CharacterUpdate[];
  new_situation: string;
  next_tension: string;
  intervention?: {
    accepted: boolean;
    text: string;
    effect: string;
  } | null;
};

/* =========================================================
   VALIDATION
========================================================= */

function isValidWorld(
  value: unknown
): value is WorldState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const world = value as Partial<WorldState>;

  return (
    typeof world.day === "number" &&
    typeof world.location === "string" &&
    typeof world.situation === "string" &&
    Array.isArray(world.characters) &&
    Array.isArray(world.locations) &&
    Array.isArray(world.entities) &&
    Array.isArray(world.objects) &&
    Array.isArray(world.evidence) &&
    Array.isArray(world.events) &&
    Array.isArray(world.eventLog)
  );
}

function isValidResult(
  value: unknown
): value is SimulationResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result =
    value as Partial<SimulationResult>;

  return (
    typeof result.day === "number" &&
    typeof result.situation === "string" &&
    Array.isArray(result.events) &&
    Array.isArray(result.character_updates) &&
    typeof result.next_tension === "string"
  );
}

/* =========================================================
   UI HELPERS
========================================================= */

function getLocationName(
  world: WorldState,
  locationId: string
): string {
  const location = world.locations.find(
    item => item.id === locationId
  );

  return location?.name || locationId;
}

function getRelationshipSummary(
  character: Character
): string {
  if (character.relationships.length === 0) {
    return "No known relationships";
  }

  return character.relationships
    .map(
      (relationship: Relationship) =>
        `Trust ${relationship.trust}% · Suspicion ${relationship.suspicion}%`
    )
    .join(" · ");
}

/* =========================================================
   EVENT LOG RENDERING
========================================================= */

function getEventDescription(
  world: WorldState,
  event: WorldState["eventLog"][number]
): string {
  const actor = event.actorId
    ? world.characters.find(
        character => character.id === event.actorId
      )?.name || event.actorId
    : null;

  const target = event.targetId
    ? world.characters.find(
        character => character.id === event.targetId
      )?.name || event.targetId
    : null;

  const action =
    typeof event.data.action === "string"
      ? event.data.action
      : null;

  switch (event.type) {
    case "INTERVENTION":
      return typeof event.data.instruction === "string"
        ? `User intervention: ${event.data.instruction}`
        : "User intervened in the world.";

    case "ACTION":
      switch (action) {
        case "MOVE": {
          const to =
            typeof event.data.to === "string"
              ? getLocationName(
                  world,
                  event.data.to
                )
              : null;

          return actor && to
            ? `${actor} moves to ${to}.`
            : actor
              ? `${actor} moves.`
              : "A character moves.";
        }

        case "TALK":
          return actor && target
            ? `${actor} talks with ${target}.`
            : actor
              ? `${actor} attempts to talk.`
              : "A character attempts to talk.";

        case "FOLLOW":
          return actor && target
            ? `${actor} follows ${target}.`
            : actor
              ? `${actor} attempts to follow someone.`
              : "A character attempts to follow someone.";

        case "INVESTIGATE":
          return actor
            ? `${actor} investigates the situation.`
            : "A character investigates the situation.";

        case "SEARCH":
          return actor
            ? `${actor} searches the area.`
            : "A character searches the area.";

        case "OBSERVE":
          return actor
            ? `${actor} observes what is happening.`
            : "A character observes what is happening.";

        case "WAIT":
          return actor
            ? `${actor} waits and watches.`
            : "A character waits and watches.";

        case "PRIVATE_MEETING_END":
          return actor
            ? `${actor} leaves a private meeting with the company.`
            : "A private meeting with the company ends.";

        default:
          return actor
            ? `${actor} performs ${action || "an action"}.`
            : "A character takes an action.";
      }

    case "CONSEQUENCE":
      return actor
        ? `A consequence affects ${actor}.`
        : "A consequence occurs.";

    case "PERCEPTION":
      return actor
        ? target
          ? `${actor} perceives something involving ${target}.`
          : `${actor} perceives something in the world.`
        : "A character perceives something.";

    default:
      return "An event occurs in the world.";
  }
}

/* =========================================================
   PAGE
========================================================= */

export default function Home() {
  /*
   * IMPORTANT:
   *
   * The frontend no longer owns its own initialWorld.
   *
   * The canonical simulation world comes from:
   *
   * lib/simulation/world.ts
   *
   * This prevents the UI and simulation engine
   * from starting from different realities.
   */

  const [world, setWorld] =
    useState<WorldState>(
      () => createInitialWorld()
    );

  const [result, setResult] =
    useState<SimulationResult | null>(null);

  const [intervention, setIntervention] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  /* =======================================================
     SIMULATION
  ======================================================= */

  async function runSimulation(
    interventionValue: string
  ) {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/simulate",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            world,
            intervention: interventionValue,
          }),
        }
      );

      let data: unknown;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "The simulation server returned an invalid response."
        );
      }

      if (!response.ok) {
        const serverData =
          data as {
            error?: string;
          };

        throw new Error(
          serverData?.error ||
            `Simulation failed (${response.status}).`
        );
      }

      const simulationData =
        data as {
          success?: boolean;
          world?: unknown;
          result?: unknown;
        };

      if (
        !isValidWorld(
          simulationData.world
        )
      ) {
        throw new Error(
          "The simulation returned an invalid world state."
        );
      }

      if (
        !isValidResult(
          simulationData.result
        )
      ) {
        throw new Error(
          "The simulation returned an invalid result."
        );
      }

      /*
       * Replace the frontend state with the exact
       * world returned by the simulation engine.
       *
       * This preserves simulation continuity:
       *
       * Day N
       *   ↓
       * Engine changes world
       *   ↓
       * Frontend receives world
       *   ↓
       * Frontend stores world
       *   ↓
       * Day N+1 request sends that state
       */

      setWorld(
        simulationData.world
      );

      setResult(
        simulationData.result
      );

      setIntervention("");

    } catch (err) {
      console.error(
        "Simulation request failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Simulation failed. Please try again."
      );

    } finally {
      setLoading(false);
    }
  }

  async function simulate() {
    await runSimulation(
      intervention.trim()
    );
  }

  async function simulateWithoutIntervention() {
    await runSimulation("");
  }

  function reset() {
    if (loading) {
      return;
    }

    /*
     * Create a completely fresh canonical world.
     *
     * createInitialWorld() returns a new object,
     * so simulation state from the previous run
     * does not leak into the reset state.
     */

    setWorld(
      createInitialWorld()
    );

    setResult(null);
    setIntervention("");
    setError("");
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="page">

      <div className="shell">

        {/* =================================================
            HERO
        ================================================= */}

        <header className="hero">

          <p className="eyebrow">
            STORY SIMULATOR
          </p>

          <h1>
            Let the story live.
          </h1>

          <p className="subtitle">
            Create a world, give its characters
            goals, fears and secrets, then watch
            them make decisions you did not
            explicitly tell them to make.
          </p>

        </header>


        {/* =================================================
            WORLD STATE
        ================================================= */}

        <section className="world-card">

          <div className="world-meta">

            <div>

              <span>
                DAY
              </span>

              <strong>
                {world.day}
              </strong>

            </div>


            <div className="location">

              <span>
                WORLD
              </span>

              <strong>
                {world.location}
              </strong>

            </div>

          </div>


          <div className="situation">

            <span>
              CURRENT SITUATION
            </span>

            <p>
              {world.situation}
            </p>

          </div>

        </section>


        {/* =================================================
            CHARACTER STATE
        ================================================= */}

        <section className="section">

          <div className="section-heading">

            <h2>
              Characters
            </h2>

          </div>


          <div className="characters">

            {world.characters.map(
              character => (

                <article
                  className="character"
                  key={character.id}
                >

                  <h3>
                    {character.name}
                  </h3>

                  <p>
                    {character.role}
                  </p>


                  <small>

                    <strong>
                      Location:
                    </strong>{" "}

                    {getLocationName(
                      world,
                      character.location
                    )}

                  </small>


                  <small>

                    <strong>
                      Priority:
                    </strong>{" "}

                    {character.currentPriority}

                  </small>


                  <small>

                    <strong>
                      Emotion:
                    </strong>{" "}

                    {character.emotionalState}

                  </small>


                  <small>

                    <strong>
                      Relationship:
                    </strong>{" "}

                    {getRelationshipSummary(
                      character
                    )}

                  </small>


                  <small>

                    <strong>
                      Recent actions:
                    </strong>{" "}

                    {character.recentActions.length
                      ? character.recentActions.join(
                          " → "
                        )
                      : "None yet"}

                  </small>

                </article>

              )
            )}

          </div>

        </section>


        {/* =================================================
            EVIDENCE
        ================================================= */}

        <section className="section">

          <div className="section-heading">

            <h2>
              Evidence
            </h2>

          </div>


          <div className="timeline">

            {world.evidence.length === 0 ? (

              <p>
                No evidence has been discovered yet.
              </p>

            ) : (

              world.evidence.map(
                (evidence, index) => (

                  <article
                    className="event"
                    key={`${evidence}-${index}`}
                  >

                    <span className="event-number">
                      {index + 1}
                    </span>

                    <p>
                      {evidence}
                    </p>

                  </article>

                )
              )

            )}

          </div>

        </section>


        {/* =================================================
            TIMELINE
        ================================================= */}

        <section className="section">

          <div className="section-heading">

            <h2>
              Timeline
            </h2>

            <button
              className="reset"
              onClick={reset}
              disabled={loading}
            >
              Reset world
            </button>

          </div>


          <div className="timeline">

            {world.eventLog.length === 0 ? (

              <p>
                No events have occurred yet.
              </p>

            ) : (

              world.eventLog.map(
                (event, index) => (

                  <article
                    className="event"
                    key={event.id}
                  >

                    <span className="event-number">
                      {index + 1}
                    </span>

                    <div>

                      <small>
                        DAY {event.day} · {event.type}
                      </small>

                      <p>
                        {getEventDescription(
                          world,
                          event
                        )}
                      </p>

                    </div>

                  </article>

                )
              )

            )}

          </div>

        </section>


        {/* =================================================
            SIMULATION RESULT
        ================================================= */}

        {result && (

          <section className="result-card">

            <p className="eyebrow">
              SIMULATION RESULT · DAY{" "}
              {result.day}
            </p>


            <h2>
              {result.situation}
            </h2>


            <div className="events">

              {result.events.length === 0 ? (

                <p>
                  No new events occurred.
                </p>

              ) : (

                result.events.map(
                  (event, index) => (

                    <p
                      key={`${event}-${index}`}
                    >
                      • {event}
                    </p>

                  )
                )

              )}

            </div>


            <div className="characters">

              <span className="label">
                CHARACTER ACTIONS
              </span>


              {result.character_updates.length === 0 ? (

                <p>
                  No character actions were recorded.
                </p>

              ) : (

                result.character_updates.map(
                  (character, index) => (

                    <article
                      className="character"
                      key={`${character.name}-${index}`}
                    >

                      <h3>
                        {character.name}
                      </h3>


                      <p>
                        {character.action}
                      </p>


                      {character.reason && (

                        <small>

                          <strong>
                            Reason:
                          </strong>{" "}

                          {character.reason}

                        </small>

                      )}


                      {character.new_knowledge && (

                        <small>

                          <strong>
                            New knowledge:
                          </strong>{" "}

                          {character.new_knowledge}

                        </small>

                      )}


                      {character.relationship_change && (

                        <small>

                          <strong>
                            Relationship:
                          </strong>{" "}

                          {character.relationship_change}

                        </small>

                      )}


                      {character.emotional_change && (

                        <small>

                          <strong>
                            Emotional state:
                          </strong>{" "}

                          {character.emotional_change}

                        </small>

                      )}


                      {character.new_priority && (

                        <small>

                          <strong>
                            New priority:
                          </strong>{" "}

                          {character.new_priority}

                        </small>

                      )}

                    </article>

                  )
                )

              )}

            </div>


            <div className="tension">

              <span>
                NEXT TENSION
              </span>

              <p>
                {result.next_tension}
              </p>

            </div>

          </section>

        )}


        {/* =================================================
            INTERVENTION
        ================================================= */}

        <section className="control-card">

          <label htmlFor="intervention">
            INTERVENE IN THE WORLD
          </label>


          <textarea
            id="intervention"
            value={intervention}
            onChange={event =>
              setIntervention(
                event.target.value
              )
            }
            disabled={loading}
            placeholder="Example: Zara secretly follows Daniel after the meeting."
          />


          {error && (

            <p className="error">
              {error}
            </p>

          )}


          <div className="actions">

            <button
              className="primary"
              onClick={simulate}
              disabled={loading}
            >
              {loading
                ? "Simulating…"
                : "▶ Simulate"}
            </button>


            <button
              className="secondary"
              onClick={
                simulateWithoutIntervention
              }
              disabled={loading}
            >
              {loading
                ? "Simulating…"
                : "Let them act"}
            </button>

          </div>

        </section>

      </div>

    </main>
  );
}
