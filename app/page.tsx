"use client";

import { useState } from "react";

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
};

type Character = {
  id: string;
  name: string;
  role: string;
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
  location: string;
};

type WorldEntity = {
  id: string;
  name: string;
  type: "person" | "organization" | "location";
  description: string;
  location?: string;
};

type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Character[];
  entities: WorldEntity[];
  events: string[];

  // These are maintained by the backend.
  objects?: unknown[];
  locations?: unknown[];
  internalEvents?: unknown[];
};

const initialWorld: WorldState = {
  day: 1,

  location: "University of Lagos",

  situation:
    "A mysterious technology company has started secretly recruiting students on campus.",

  characters: [
    {
      id: "zara",
      name: "Zara",
      role: "Student investigator",

      personality:
        "Ambitious, observant, suspicious and brave.",

      goal:
        "Discover what the mysterious company is really doing.",

      fear:
        "The company will hurt innocent students and discover her investigation.",

      current_priority:
        "Find concrete evidence against the company.",

      emotional_state:
        "Suspicious but determined.",

      secret:
        "She has already collected evidence against the company.",

      relationship:
        "She trusts Daniel deeply.",

      knowledge: [
        "The company has been approaching students privately.",
        "Some recruited students have suddenly stopped talking to their friends."
      ],

      capabilities: [
        "Good at observing people",
        "Good at investigating situations",
        "Comfortable using a smartphone",
        "Knows several students on campus"
      ],

      resources: [
        "smartphone",
        "student ID",
        "personal laptop",
        "student contacts"
      ],

      location: "University of Lagos campus"
    },

    {
      id: "daniel",
      name: "Daniel",
      role: "Student and company contact",

      personality:
        "Charming, ambitious, intelligent and conflicted.",

      goal:
        "Become financially successful while protecting Zara.",

      fear:
        "The company will harm his family if he disobeys.",

      current_priority:
        "Protect his family without betraying Zara.",

      emotional_state:
        "Conflicted and afraid.",

      secret:
        "The company has offered him ₦5 million to identify students investigating it.",

      relationship:
        "He cares deeply about Zara but is hiding something from her.",

      knowledge: [
        "The company knows Zara is investigating.",
        "The company wants Daniel to identify other suspicious students."
      ],

      capabilities: [
        "Good at persuasion",
        "Good at hiding his emotions",
        "Knows several students",
        "Can communicate with the company"
      ],

      resources: [
        "smartphone",
        "student ID",
        "company contact",
        "student contacts"
      ],

      location: "University of Lagos campus"
    }
  ],

  entities: [
    {
      id: "company",
      name: "Mysterious Technology Company",
      type: "organization",
      description:
        "A private technology company secretly recruiting students on campus."
    },

    {
      id: "unilag",
      name: "University of Lagos",
      type: "location",
      description:
        "The university campus where the simulation takes place."
    },

    {
      id: "campus-cafe",
      name: "Campus Café",
      type: "location",
      description:
        "A public café where students regularly meet."
    },

    {
      id: "company-office",
      name: "Company Liaison Office",
      type: "location",
      description:
        "A discreet office used by the company's campus representative.",
      location: "University of Lagos campus"
    }
  ],

  events: [
    "Zara notices Daniel leaving a private meeting with the mysterious company."
  ]
};

function isValidWorld(value: unknown): value is WorldState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const world = value as Partial<WorldState>;

  return (
    typeof world.day === "number" &&
    typeof world.location === "string" &&
    typeof world.situation === "string" &&
    Array.isArray(world.characters) &&
    Array.isArray(world.entities) &&
    Array.isArray(world.events)
  );
}

function isValidResult(value: unknown): value is SimulationResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Partial<SimulationResult>;

  return (
    typeof result.day === "number" &&
    typeof result.situation === "string" &&
    Array.isArray(result.events) &&
    Array.isArray(result.character_updates) &&
    typeof result.next_tension === "string"
  );
}

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

    setWorld(initialWorld);
    setResult(null);
    setIntervention("");
    setError("");
  }

  return (
    <main className="page">
      <div className="shell">

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
                LOCATION
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


        <section className="control-card">

          <label htmlFor="intervention">
            INTERVENE IN THE WORLD
          </label>


          <textarea
            id="intervention"
            value={intervention}
            onChange={(event) =>
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
