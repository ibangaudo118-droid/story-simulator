/**
 * Narrate a simulation.
 *   npx tsx scripts/narrate.ts <seed=1> <days=30> [from=1] [to=days] [--llm]
 * Without --llm you get deterministic template prose (no network, no API key).
 * With --llm, set GROQ_API_KEY (optional: GROQ_MODEL).
 */
import { createWorld } from "../lib/world/content";
import { run } from "../lib/world/engine";
import { groqLlm } from "../lib/narrator/groq";
import { narrateRange } from "../lib/narrator/narrate";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const useLlm = process.argv.includes("--llm");
const seed = Number(args[0] ?? 1);
const days = Number(args[1] ?? 30);
const from = Number(args[2] ?? 1);
const to = Number(args[3] ?? days);

async function main(): Promise<void> {
  const world = run(createWorld(seed), days);
  const chapters = await narrateRange(world, from, to, { llm: useLlm ? groqLlm() : undefined });
  for (const c of chapters) {
    console.log(`\n=== Day ${c.day} (${c.mode}) ===`);
    for (const p of c.paragraphs) console.log(`${p.text}  [${p.beats.join(", ")}]\n`);
    for (const w of c.warnings) console.log(`  ! ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
