import { createWorld } from "../world/content";
import { step } from "../world/engine";
import { daySignatures, stateHash } from "../world/metrics";
import type { World } from "../world/types";
import { applyIntervention, type Intervention } from "./interventions";

/**
 * Timeline = a tree of branches over one seed.
 *   snapshots[d] is the world at the START of day d (before day d is simulated).
 * Because the engine is pure and its randomness is keyed by (seed, day, ...), a branch is
 * fully determined by (parent, forkDay, interventions). Snapshots are a cache, not the source of truth.
 */
export interface BranchSpec {
  id: string;
  parentId: string | null;
  /** Interventions are applied at the start of this day, before it is simulated. */
  forkDay: number;
  interventions: Intervention[];
}

export interface Branch extends BranchSpec {
  /** Own snapshots for days >= forkDay (root: from day 1). Earlier days come from the parent. */
  snapshots: Record<number, World>;
}

export interface Timeline {
  seed: number;
  /** Last simulated day; snapshots go up to horizon + 1 (the state after that day). */
  horizon: number;
  branches: Record<string, Branch>;
}

function simulate(start: World, fromDay: number, horizon: number): Record<number, World> {
  const snapshots: Record<number, World> = { [fromDay]: start };
  let cur = start;
  for (let d = fromDay; d <= horizon; d++) {
    cur = step(cur);
    snapshots[d + 1] = cur;
  }
  return snapshots;
}

export function createTimeline(seed: number, horizon: number): Timeline {
  const root: Branch = {
    id: "main",
    parentId: null,
    forkDay: 1,
    interventions: [],
    snapshots: simulate(createWorld(seed), 1, horizon),
  };
  return { seed, horizon, branches: { main: root } };
}

function branchOf(tl: Timeline, id: string): Branch {
  const b = tl.branches[id];
  if (!b) throw new Error(`Unknown branch "${id}"`);
  return b;
}

/** World at the start of `day` on `branchId` (falls back to ancestors before the fork). */
export function worldAt(tl: Timeline, branchId: string, day: number): World {
  let b = branchOf(tl, branchId);
  if (day < 1 || day > tl.horizon + 1) throw new Error(`Day ${day} is outside 1..${tl.horizon + 1}`);
  while (day < b.forkDay) b = branchOf(tl, b.parentId as string);
  return b.snapshots[day];
}

export function finalWorld(tl: Timeline, branchId: string): World {
  return worldAt(tl, branchId, tl.horizon + 1);
}

/**
 * Fork `parentId` at the start of `day`: apply the interventions, then simulate to the horizon.
 * The parent is never modified. With no interventions the fork is identical to its parent.
 */
export function fork(
  tl: Timeline,
  parentId: string,
  day: number,
  interventions: Intervention[],
  id?: string
): Timeline {
  branchOf(tl, parentId);
  if (day < 1 || day > tl.horizon) throw new Error(`Fork day must be in 1..${tl.horizon}`);
  const newId = id ?? `b${Object.keys(tl.branches).length}`;
  if (tl.branches[newId]) throw new Error(`Branch "${newId}" already exists`);

  let start = structuredClone(worldAt(tl, parentId, day));
  for (const iv of interventions) start = applyIntervention(start, iv);

  const branch: Branch = {
    id: newId,
    parentId,
    forkDay: day,
    interventions,
    snapshots: simulate(start, day, tl.horizon),
  };
  return { ...tl, branches: { ...tl.branches, [newId]: branch } };
}

/** First day at which two branches differ, plus which days' actions changed. */
export function compareBranches(
  tl: Timeline,
  a: string,
  b: string
): { firstDivergence: number | null; changedDays: number[] } {
  let first: number | null = null;
  for (let d = 1; d <= tl.horizon + 1; d++) {
    if (stateHash(worldAt(tl, a, d)) !== stateHash(worldAt(tl, b, d))) {
      first = d;
      break;
    }
  }
  // The intervention itself is logged as an event; ignore it so only real behavioural change counts.
  const strip = (w: World): World => ({ ...w, log: w.log.filter((e) => !(e.data as { intervention?: boolean } | undefined)?.intervention) });
  const sa = daySignatures(strip(finalWorld(tl, a)));
  const sb = daySignatures(strip(finalWorld(tl, b)));
  const changed: number[] = [];
  for (let d = 1; d <= tl.horizon; d++) if (sa[d] !== sb[d]) changed.push(d);
  return { firstDivergence: first, changedDays: changed };
}

/* ---------------- persistence ---------------- */

export interface SavedTimeline {
  version: 1;
  seed: number;
  horizon: number;
  branches: (BranchSpec & { finalHash: string })[];
}

/** Compact save: specs + one hash per branch. Snapshots are rebuilt by replay on load. */
export function serialize(tl: Timeline): SavedTimeline {
  return {
    version: 1,
    seed: tl.seed,
    horizon: tl.horizon,
    branches: Object.values(tl.branches).map((b) => ({
      id: b.id,
      parentId: b.parentId,
      forkDay: b.forkDay,
      interventions: b.interventions,
      finalHash: stateHash(finalWorld(tl, b.id)),
    })),
  };
}

/**
 * Rebuild by replaying. Throws if any replayed branch hash differs from the saved one, which means
 * the engine changed since the save (old saves are not silently reinterpreted).
 */
export function deserialize(saved: SavedTimeline): Timeline {
  if (saved.version !== 1) throw new Error(`Unsupported save version ${saved.version}`);
  let tl = createTimeline(saved.seed, saved.horizon);
  const root = saved.branches.find((b) => b.parentId === null);
  if (!root || stateHash(finalWorld(tl, "main")) !== root.finalHash) {
    throw new Error("Replay mismatch on branch \"main\": the engine has changed since this was saved");
  }
  const pending = saved.branches.filter((b) => b.parentId !== null);
  while (pending.length) {
    const i = pending.findIndex((b) => tl.branches[b.parentId as string]);
    if (i < 0) throw new Error("Saved timeline has a branch with a missing parent");
    const [b] = pending.splice(i, 1);
    tl = fork(tl, b.parentId as string, b.forkDay, b.interventions, b.id);
    if (stateHash(finalWorld(tl, b.id)) !== b.finalHash) {
      throw new Error(`Replay mismatch on branch "${b.id}": the engine has changed since this was saved`);
    }
  }
  return tl;
}
