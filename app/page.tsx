"use client";

import { useState } from "react";

/* =========================================================
   TYPES
========================================================= */

type ActionType =
  | "OBSERVE"
  | "MOVE"
  | "FOLLOW"
  | "TALK"
  | "INVESTIGATE"
  | "SEARCH"
  | "WAIT";

type Relationship = {
  targetId: string;
  trust: number;
  suspicion: number;
};

type Character = {
  id: string;
  name: string;
  role: string;
  goal: string;
  fear: string;
  secret: string;
  knowledge: string[];
  capabilities: string[];
  resources: string[];
  location: string;
  emotionalState: string;
  currentPriority: string;
  relationships: Relationship[];
  recentActions: ActionType[];
};

type Location = {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
};

type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Character[];
  locations: Location[];
  entities: string[];
  objects: string[];
  evidence: string[];
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
   CANONICAL INITIAL WORLD
========================================================= */

const initialWorld: WorldState = {
  day: 1,

  location: "University of Lagos",

  situation:
    "A mysterious technology company has started secretly recruiting students on campus.",

  locations: [
    {
      id: "campus",
      name: "University of Lagos Campus",
      description:
        "The main university grounds where students move between classes and social spaces.",
      connectedTo: ["campus-cafe", "company-office"]
    },

    {
      id: "campus-cafe",
      name: "Campus Café",
      description:
        "A busy café where students meet, talk and study.",
      connectedTo: ["campus", "company-office"]
    },

    {
      id: "company-office",
      name: "Company Liaison Office",
      description:
        "A small private office where company representatives meet selected students.",
      connectedTo: ["campus", "campus-cafe"]
    }
  ],

  characters: [
    {
      id: "zara",
      name: "Zara",
      role: "Student investigator",

      goal:
        "Discover what the company is doing and whether students are being harmed.",

      fear:
        "The company discovers that she is investigating them.",

      secret:
        "Zara has already collected evidence about the company.",

      knowledge: [
        "The company has been approaching students privately.",
        "Some students who were recruited have stopped talking to their friends."
      ],

      /*
       * IMPORTANT:
       * These are the exact machine-readable capabilities
       * expected by the backend decision engine.
       */
      capabilities: [
        "observation",
        "investigation",
        "smartphone",
        "student contacts"
      ],

      resources: [
        "smartphone",
        "student ID",
        "laptop",
        "student contacts"
      ],

      location: "campus",

      emotionalState:
        "Suspicious but determined",

      currentPriority:
        "Find more evidence",

      relationships: [
        {
          targetId: "daniel",
          trust: 45,
          suspicion: 55
        }
      ],

      /*
       * This is what prevents the engine from
       * forgetting what Zara did yesterday.
       */
      recentActions: []
    },

    {
      id: "daniel",
      name: "Daniel",
      role: "Student and company contact",

      goal:
        "Protect his family while maintaining financial success.",

      fear:
        "The company harms his family if he disobeys them.",

      secret:
        "The company offered Daniel ₦5 million to identify student investigators.",

      knowledge: [
        "The company knows Zara has been investigating.",
        "The company wants Daniel to identify suspicious students."
      ],

      capabilities: [
        "persuasion",
        "hide emotions",
        "student contacts",
        "company communication"
      ],

      resources: [
        "smartphone",
        "student ID",
        "company contact",
        "student contacts"
      ],

      location: "campus",

      emotionalState:
        "Conflicted and afraid",

      currentPriority:
        "Protect his family without betraying Zara",

      relationships: [
        {
          targetId: "zara",
          trust: 60,
          suspicion: 40
        }
      ],

      recentActions: []
    }
  ],

  entities: [
    "Mysterious technology company",
    "University of Lagos"
  ],

  objects: [
    "student smartphones",
    "student identification cards",
    "laptops"
  ],

  evidence: [],

  events: [
    "Zara notices Daniel leaving a private meeting with the mysterious company."
  ]
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
    Array.isArray(world.events)
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
      relationship =>
        `Trust ${relationship.trust}% · Suspicion ${relationship.suspicion}%`
    )
    .join(" · ");
}

/* =========================================================
   PAGE
========================================================= */

export default function Home() {
  const [world, setWorld] =
    useState<WorldState>(initialWorld);

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
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            world,
            intervention: interventionValue
          })
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
       * This is critical.
       *
       * We replace the frontend's world with the
       * backend's updated canonical world.
       *
       * Therefore:
       *
       * Day 1
       *   ↓
       * Backend changes world
       *   ↓
       * Frontend stores new world
       *   ↓
       * Day 2 request sends that exact world
       *   ↓
       * Backend sees recentActions/evidence/etc.
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
     * Fresh copy so future state changes never
     * accidentally mutate the initial object.
     */
    setWorld(
      structuredClone(initialWorld)
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

            {world.events.length === 0 ? (

              <p>
                No events have occurred yet.
              </p>

            ) : (

              world.events.map(
                (event, index) => (

                  <article
                    className="event"
                    key={`${event}-${index}`}
                  >

                    <span className="event-number">
                      {index + 1}
                    </span>

                    <p>
                      {event}
                    </p>

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
