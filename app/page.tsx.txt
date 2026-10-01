"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { narrateDay, type Chapter } from "@/lib/narrator/narrate";
import { createTimeline, worldAt } from "@/lib/replay/timeline";
import type { Character, LogEntry, World } from "@/lib/world/types";

/* The world is simulated once, in the browser, from a seed. Same seed, same story. */
const HORIZON = 30;
const DEFAULT_SEED = 1;
const MAX_SEED = 999_999;

const SPEEDS = [
  { label: "1x", ms: 2400 },
  { label: "2x", ms: 1200 },
  { label: "4x", ms: 600 },
];

const PALETTE = ["#f2b84b", "#4fd1c5", "#ff8a7a", "#9db7ff", "#c9a7ff", "#a6e07a"];

const LAST_ACTION_TEXT: Record<string, string> = {
  MOVE: "Moved to a new place",
  SEARCH: "Searched for evidence",
  OBSERVE: "Watched what was going on",
  TALK: "Talked with someone",
  CONFRONT: "Confronted someone",
  REPORT: "Passed information to the company",
  PUBLISH: "Published a story",
  LAY_LOW: "Kept a low profile",
};

function colorFor(world: World, id: string): string {
  const index = Object.keys(world.characters).indexOf(id);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Everything the log recorded on one day (belief bookkeeping is hidden to keep this readable). */
function eventsOn(world: World, day: number): LogEntry[] {
  return world.log.filter((entry) => entry.day === day && entry.kind !== "BELIEF");
}

/** The widest any damaging story has spread, 0 to 100. */
function awarenessOf(world: World): number {
  let widest = 0;
  for (const fact of Object.values(world.facts)) {
    if (fact.threatens) widest = Math.max(widest, world.publicAwareness[fact.id] ?? 0);
  }
  return Math.round(widest);
}

function lastActionText(character: Character): string {
  const last = character.lastActions[character.lastActions.length - 1];
  return last ? (LAST_ACTION_TEXT[last] ?? "Did something") : "Hasn't acted yet";
}

function Stage({ world, day }: { world: World; day: number }) {
  const people = Object.values(world.characters);
  const actedToday = new Set<string>();
  for (const entry of world.log) {
    if (entry.day === day && entry.kind === "ACTION" && entry.actorId) actedToday.add(entry.actorId);
  }

  return (
    <div className="ss-stage">
      {Object.values(world.locations).map((location) => {
        const here = people.filter((person) => person.location === location.id);
        return (
          <section
            key={location.id}
            className={location.controlledBy ? "ss-room ss-room-guarded" : "ss-room"}
            aria-label={location.name}
          >
            <h3>{location.name}</h3>
            <ul>
              {here.length === 0 ? (
                <li className="ss-empty">Empty</li>
              ) : (
                here.map((person) => (
                  <li
                    key={person.id}
                    className={actedToday.has(person.id) ? "ss-person ss-person-active" : "ss-person"}
                    style={{ "--ink": colorFor(world, person.id) } as CSSProperties}
                  >
                    <span className="ss-dot" />
                    {person.name}
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [seedInput, setSeedInput] = useState(String(DEFAULT_SEED));
  const [seedError, setSeedError] = useState("");

  const [viewDay, setViewDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [aiChapters, setAiChapters] = useState<Record<string, Chapter>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  const timeline = useMemo(() => createTimeline(seed, HORIZON), [seed]);

  /* viewDay 0 is the starting state; viewDay N is the world after day N has happened. */
  const world = useMemo(() => worldAt(timeline, "main", viewDay + 1), [timeline, viewDay]);

  const events = useMemo(() => eventsOn(world, viewDay), [world, viewDay]);

  /* Playback */
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setViewDay((day) => Math.min(HORIZON, day + 1));
    }, SPEEDS[speedIndex].ms);
    return () => window.clearInterval(timer);
  }, [playing, speedIndex]);

  useEffect(() => {
    if (viewDay >= HORIZON) setPlaying(false);
  }, [viewDay]);

  /* Standard narration runs in the browser and costs nothing. */
  useEffect(() => {
    let cancelled = false;
    if (viewDay < 1) {
      setChapter(null);
      return;
    }
    narrateDay(world, viewDay)
      .then((result) => {
        if (!cancelled) setChapter(result);
      })
      .catch(() => {
        if (!cancelled) setChapter(null);
      });
    return () => {
      cancelled = true;
    };
  }, [world, viewDay]);

  const aiKey = `${seed}:${viewDay}`;
  const shown = aiChapters[aiKey] ?? chapter;

  function loadSeed(next: number) {
    setPlaying(false);
    setViewDay(0);
    setChapter(null);
    setAiChapters({});
    setAiMessage("");
    setSeedError("");
    setSeed(next);
    setSeedInput(String(next));
  }

  function applySeed() {
    const next = Number(seedInput);
    if (!Number.isInteger(next) || next < 1 || next > MAX_SEED) {
      setSeedError(`Enter a whole number from 1 to ${MAX_SEED}.`);
      return;
    }
    loadSeed(next);
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (viewDay >= HORIZON) setViewDay(0);
    setPlaying(true);
  }

  function stepDay(direction: 1 | -1) {
    setPlaying(false);
    setViewDay((day) => Math.max(0, Math.min(HORIZON, day + direction)));
  }

  async function rewriteWithAi() {
    if (viewDay < 1 || aiBusy) return;
    const key = aiKey;
    setAiBusy(true);
    setAiMessage("");
    try {
      const response = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, horizon: HORIZON, day: viewDay }),
      });
      const data = (await response.json().catch(() => null)) as {
        chapter?: Chapter;
        llmEnabled?: boolean;
        note?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.chapter) {
        throw new Error(data?.error ?? `The narrator didn't respond (error ${response.status}).`);
      }
      const written = data.chapter;
      if (data.llmEnabled) {
        setAiChapters((previous) => ({ ...previous, [key]: written }));
      } else {
        setAiMessage(data.note ?? "AI narration isn't available right now.");
      }
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI narration failed. Try again.");
    } finally {
      setAiBusy(false);
    }
  }

  const people = Object.values(world.characters);
  const awareness = awarenessOf(world);

  return (
    <main className="ss-page">
      <header className="ss-head">
        <h1>Story Simulator</h1>
        <p>
          A small world plays out one day at a time. Press play and watch who learns what, and who
          they tell.
        </p>
      </header>

      <div className="ss-layout">
        <div className="ss-left">
          <Stage world={world} day={viewDay} />

          <div className="ss-controls">
            <div className="ss-buttons">
              <button type="button" className="ss-btn ss-btn-main" onClick={togglePlay}>
                {playing ? "Pause" : viewDay >= HORIZON ? "Replay" : "Play"}
              </button>
              <button
                type="button"
                className="ss-btn"
                onClick={() => stepDay(-1)}
                disabled={viewDay <= 0}
              >
                Back a day
              </button>
              <button
                type="button"
                className="ss-btn"
                onClick={() => stepDay(1)}
                disabled={viewDay >= HORIZON}
              >
                Next day
              </button>
              <button
                type="button"
                className="ss-btn"
                onClick={() => setSpeedIndex((index) => (index + 1) % SPEEDS.length)}
                aria-label={`Playback speed ${SPEEDS[speedIndex].label}. Press to change.`}
              >
                {SPEEDS[speedIndex].label}
              </button>
            </div>

            <input
              className="ss-slider"
              type="range"
              min={0}
              max={HORIZON}
              value={viewDay}
              onChange={(event) => {
                setPlaying(false);
                setViewDay(Number(event.target.value));
              }}
              aria-label="Day"
            />

            <p className="ss-status">
              {viewDay === 0 ? "Before day 1" : `Day ${viewDay} of ${HORIZON}`}. Damaging story known
              to {awareness}% of the campus.
            </p>
          </div>
        </div>

        <div className="ss-right">
          <section className="ss-story" aria-live="polite">
            {viewDay === 0 || !shown ? (
              <>
                <h2>{viewDay === 0 ? "The story hasn't started" : `Day ${viewDay}`}</h2>
                <p className="ss-empty">
                  {viewDay === 0
                    ? "Nothing has happened yet. Press Play to start day 1."
                    : "Writing the day…"}
                </p>
              </>
            ) : (
              <>
                <h2>Day {viewDay}</h2>
                {shown.paragraphs.map((paragraph, index) => (
                  <p key={`${viewDay}-${index}`}>{paragraph.text}</p>
                ))}
                <div className="ss-story-meta">
                  <span>
                    {shown.mode === "llm"
                      ? "Written by AI from the day's events"
                      : "Standard narration"}
                  </span>
                  {shown.mode !== "llm" && (
                    <button
                      type="button"
                      className="ss-link"
                      onClick={rewriteWithAi}
                      disabled={aiBusy}
                    >
                      {aiBusy ? "Rewriting…" : "Rewrite with AI"}
                    </button>
                  )}
                </div>
                {aiMessage && <p className="ss-error">{aiMessage}</p>}
              </>
            )}
          </section>

          <details className="ss-fold">
            <summary>
              {viewDay === 0
                ? "Everything that happened"
                : `Everything that happened on day ${viewDay}`}{" "}
              ({events.length})
            </summary>
            <div className="ss-fold-body">
              {events.length === 0 ? (
                <p className="ss-note">No events yet. Press Play or move the day slider.</p>
              ) : (
                <ul className="ss-events">
                  {events.map((entry) => (
                    <li key={entry.id} className={`ss-ev ss-ev-${entry.kind.toLowerCase()}`}>
                      {entry.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <details className="ss-fold">
            <summary>People ({people.length})</summary>
            <div className="ss-fold-body">
              <ul className="ss-people">
                {people.map((person) => (
                  <li key={person.id}>
                    <div className="ss-who">
                      <span
                        className="ss-dot"
                        style={{ "--ink": colorFor(world, person.id) } as CSSProperties}
                      />
                      <strong>{person.name}</strong>
                      <span className="ss-role">{person.role}</span>
                    </div>
                    <div className="ss-meters">
                      <div className="ss-meter">
                        <span>Stress</span>
                        <span
                          className="ss-bar"
                          role="meter"
                          aria-label={`${person.name} stress`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(clampPct(person.stress))}
                        >
                          <span style={{ width: `${clampPct(person.stress)}%` }} />
                        </span>
                      </div>
                      <div className="ss-meter">
                        <span>Alarm</span>
                        <span
                          className="ss-bar"
                          role="meter"
                          aria-label={`${person.name} alarm`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(clampPct(person.alarm))}
                        >
                          <span style={{ width: `${clampPct(person.alarm)}%` }} />
                        </span>
                      </div>
                    </div>
                    <p className="ss-where">
                      {world.locations[person.location]?.name ?? person.location}.{" "}
                      {lastActionText(person)}.
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <details className="ss-fold">
            <summary>Try a different world</summary>
            <div className="ss-fold-body">
              <div className="ss-seed">
                <input
                  className="ss-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SEED}
                  value={seedInput}
                  onChange={(event) => setSeedInput(event.target.value)}
                  aria-label="World number"
                />
                <button type="button" className="ss-btn" onClick={applySeed}>
                  Load world
                </button>
                <button
                  type="button"
                  className="ss-btn"
                  onClick={() => loadSeed(1 + Math.floor(Math.random() * MAX_SEED))}
                >
                  Surprise me
                </button>
              </div>
              {seedError && <p className="ss-error">{seedError}</p>}
              <p className="ss-note">
                Each world number plays out the same way every time, so you can come back to one you
                liked.
              </p>
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
