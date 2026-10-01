import { createWorld } from "../lib/world/content";
import { run } from "../lib/world/engine";
import { outcomeMetrics } from "../lib/world/metrics";

const seed = Number(process.argv[2] ?? 1);
const days = Number(process.argv[3] ?? 40);
const verbose = process.argv[4] === "all";

const w = run(createWorld(seed), days);
let lastDay = 0;
for (const e of w.log) {
  if (!verbose && e.kind === "ACTION" && (e.data as any)?.action === "MOVE") continue;
  if (e.day !== lastDay) {
    console.log(`\n--- Day ${e.day} ---`);
    lastDay = e.day;
  }
  const tag = e.kind === "WORLD_EVENT" ? "★ EVENT" : e.kind === "ORG_ACTION" ? "■ ORG" : e.kind === "BELIEF" ? "· belief" : e.kind === "CONSEQUENCE" ? "  →" : "";
  console.log(`${tag} ${e.text}`.trim());
}
console.log("\n=== Outcome ===");
console.log(outcomeMetrics(w));
