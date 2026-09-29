"use client";

import { useState } from "react";

type CharacterUpdate = {
  name: string;
  action: string;
  reason: string;
  new_knowledge: string;
  relationship_change: string;
};

type SimulationResult = {
  day: number;
  situation: string;
  events: string[];
  character_updates: CharacterUpdate[];
  new_situation: string;
  next_tension: string;
};

type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Array<{
    name: string;
    personality: string;
    goal: string;
    secret: string;
    relationship: string;
    knowledge: string[];
  }>;
  events: string[];
};

const initialWorld: WorldState = {
  day: 1,
  location: "University of Lagos",
  situation:
    "A mysterious technology company has started secretly recruiting students on campus.",
  characters: [
    {
      name: "Zara",
      personality: "Ambitious, observant, suspicious and brave.",
      goal: "Discover what the mysterious company is really doing.",
      secret: "She has already collected evidence against the company.",
      relationship: "She trusts Daniel deeply.",
      knowledge: [
        "The company has been approaching students privately.",
        "Some recruited students have suddenly stopped talking to their friends."
      ]
    },
    {
      name: "Daniel",
      personality: "Charming, ambitious, intelligent and conflicted.",
      goal: "Become financially successful while protecting Zara.",
      secret:
        "The company has offered him ₦5 million to identify students investigating it.",
      relationship:
        "He cares deeply about Zara but is hiding something from her.",
      knowledge: [
        "The company knows Zara is investigating.",
        "The company wants Daniel to identify other suspicious students."
      ]
    }
  ],
  events: [
    "Zara notices Daniel leaving a private meeting with the mysterious company."
  ]
};

export default function Home() {
  const [world, setWorld] = useState(initialWorld);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [intervention, setIntervention] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function simulate() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          world,
          intervention
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Simulation failed");
      }

      setWorld(data.world);
      setResult(data.result);
      setIntervention("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Simulation failed"
      );
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setWorld(initialWorld);
    setResult(null);
    setIntervention("");
    setError("");
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="hero">
          <p className="eyebrow">STORY SIMULATOR</p>

          <h1>Let the story live.</h1>

          <p className="subtitle">
            Create a world, give its characters goals and secrets, then watch
            them make decisions you did not explicitly tell them to make.
          </p>
        </header>

        <section className="world-card">
          <div className="world-meta">
            <div>
              <span>DAY</span>
              <strong>{world.day}</strong>
            </div>

            <div className="location">
              <span>LOCATION</span>
              <strong>{world.location}</strong>
            </div>
          </div>

          <div className="situation">
            <span>CURRENT SITUATION</span>
            <p>{world.situation}</p>
          </div>
        </section>

        <section className="section">
          <div className="section-heading">
            <h2>Timeline</h2>

            <button
              className="reset"
              onClick={reset}
              disabled={loading}
            >
              Reset world
            </button>
          </div>

          <div className="timeline">
            {world.events.map((event, index) => (
              <article className="event" key={index}>
                <span className="event-number">{index + 1}</span>
                <p>{event}</p>
              </article>
            ))}
          </div>
        </section>

        {result && (
          <section className="result-card">
            <p className="eyebrow">
              SIMULATION RESULT · DAY {result.day}
            </p>

            <h2>{result.situation}</h2>

            <div className="events">
              {result.events.map((event, index) => (
                <p key={index}>• {event}</p>
              ))}
            </div>

            <div className="characters">
              <span className="label">CHARACTER ACTIONS</span>

              {result.character_updates.map((character) => (
                <article
                  className="character"
                  key={character.name}
                >
                  <h3>{character.name}</h3>

                  <p>{character.action}</p>

                  <small>
                    Reason: {character.reason}
                  </small>

                  {character.new_knowledge && (
                    <small>
                      New knowledge: {character.new_knowledge}
                    </small>
                  )}

                  {character.relationship_change && (
                    <small>
                      Relationship: {character.relationship_change}
                    </small>
                  )}
                </article>
              ))}
            </div>

            <div className="tension">
              <span>NEXT TENSION</span>
              <p>{result.next_tension}</p>
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
              setIntervention(event.target.value)
            }
            placeholder="Example: Zara secretly follows Daniel after the meeting."
          />

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button
              className="primary"
              onClick={simulate}
              disabled={loading}
            >
              {loading ? "Simulating…" : "▶ Simulate"}
            </button>

            <button
              className="secondary"
              onClick={() => {
                setIntervention("");
                void simulate();
              }}
              disabled={loading}
            >
              Let them act
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
