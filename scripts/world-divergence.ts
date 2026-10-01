/**
 * Divergence harness.
 *
 *   npx tsx scripts/world-divergence.ts [days=100] [seeds=20]
 *
 * Same seeds, same world, ONE changed variable: Daniel's trust in Zara (default 60 vs 40).
 * Optional args: days seeds hiTrust loTrust   e.g.  tsx scripts/world-divergence.ts 100 20 80 20
 * Because randomness is keyed (see rng.ts) and world events are exogenous, any
 * difference in history is caused by the variable, not by RNG desync.
 */
import { createWorld } from "../lib/world/content";
import { run } from "../lib/world/engine";
import { daySignatures, outcomeMetrics, stateHash } from "../lib/world/metrics";
import type { World } from "../lib/world/types";

const DAYS = Number(process.argv[2] ?? 100);
const SEEDS = Number(process.argv[3] ?? 20);
const HI = Number(process.argv[4] ?? 60);
const LO = Number(process.argv[5] ?? 40);

const variant = (trust: number) => (w: World) => {
  w.characters.daniel.relationships.zara.trust = trust;
};

function firstDivergenceDay(a: World, b: World): number | null {
  const sa = daySignatures(a);
  const sb = daySignatures(b);
  for (let d = 1; d <= DAYS; d++) {
    if ((sa[d] ?? "") !== (sb[d] ?? "")) return d;
  }
  return null;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

// 1. Determinism
const d1 = stateHash(run(createWorld(1, variant(HI)), DAYS));
const d2 = stateHash(run(createWorld(1, variant(HI)), DAYS));
console.log(`Determinism (same seed, same variable, ${DAYS} days): ${d1 === d2 ? "PASS" : "FAIL"}  [${d1}]`);

// 2. Paired runs
const metricsA: Record<string, number>[] = [];
const metricsB: Record<string, number>[] = [];
const divergeDays: number[] = [];
let differentHistories = 0;
const finalHashesA = new Set<string>();
const finalHashesB = new Set<string>();

for (let seed = 1; seed <= SEEDS; seed++) {
  const a = run(createWorld(seed, variant(HI)), DAYS);
  const b = run(createWorld(seed, variant(LO)), DAYS);
  metricsA.push(outcomeMetrics(a));
  metricsB.push(outcomeMetrics(b));
  finalHashesA.add(stateHash(a));
  finalHashesB.add(stateHash(b));
  const dd = firstDivergenceDay(a, b);
  if (dd !== null) {
    differentHistories++;
    divergeDays.push(dd);
  }
}

console.log(`\nPaired seeds: ${SEEDS}, days: ${DAYS}`);
console.log(`Histories that diverge (A: trust ${HI} vs B: trust ${LO}): ${differentHistories}/${SEEDS}`);
if (divergeDays.length) {
  console.log(`First day of divergence: mean ${mean(divergeDays).toFixed(1)}, min ${Math.min(...divergeDays)}, max ${Math.max(...divergeDays)}`);
}
console.log(`Distinct final states: A=${finalHashesA.size}/${SEEDS}, B=${finalHashesB.size}/${SEEDS}`);

console.log(`\nOutcome distributions (mean ± sd)   |  A (trust ${HI})        |  B (trust ${LO})        |  effect (d, B-A)`);
for (const key of Object.keys(metricsA[0])) {
  const xa = metricsA.map((m) => m[key]);
  const xb = metricsB.map((m) => m[key]);
  const pooled = Math.sqrt((sd(xa) ** 2 + sd(xb) ** 2) / 2) || 1;
  const d = (mean(xb) - mean(xa)) / pooled;
  console.log(
    `${key.padEnd(34)}|  ${mean(xa).toFixed(1).padStart(6)} ± ${sd(xa).toFixed(1).padEnd(6)}  |  ${mean(xb).toFixed(1).padStart(6)} ± ${sd(xb).toFixed(1).padEnd(6)}  |  ${d >= 0 ? "+" : ""}${d.toFixed(2)}`
  );
}
console.log("\nNote: with small SEEDS, treat effect sizes as indicative, not conclusive.");
