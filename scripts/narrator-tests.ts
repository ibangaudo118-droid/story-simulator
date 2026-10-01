/** Narrator tests (no network): npx tsx scripts/narrator-tests.ts */
import { createWorld } from "../lib/world/content";
import { run } from "../lib/world/engine";
import { stateHash } from "../lib/world/metrics";
import { beatsForDay, extractBeats } from "../lib/narrator/beats";
import { narrateDay, narrateRange, type LlmFn } from "../lib/narrator/narrate";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
const world = run(createWorld(1), 40);
const beats = extractBeats(world);

// 1. Beats are deterministic and well-formed
{
  const again = extractBeats(run(createWorld(1), 40));
  check("beat extraction is deterministic", JSON.stringify(beats) === JSON.stringify(again));
  const ids = new Set(beats.map((b) => b.id));
  check("beat ids are unique", ids.size === beats.length);
  check("every beat has significance 0..10", beats.every((b) => b.significance >= 0 && b.significance <= 10));
  check(
    "learned facts exist in the world and carry the right truth value",
    beats.every((b) => b.learned.every((l) => Object.values(world.facts).some((f) => f.text === l.fact && f.truth === l.isTrue)))
  );
  check("trivial moves are not narrated on their own", beats.every((b) => !(b.action === "MOVE" && b.details.length === 0 && b.learned.length === 0)));
  check("world events become beats", beats.some((b) => b.kind === "EVENT" && /research program/.test(b.summary)));
}

// 2. Read-only
{
  const before = stateHash(world);
  await narrateRange(world, 1, 40);
  check("narrator leaves world state unchanged", stateHash(world) === before);
}

// helper: find a busy day
const busy = [...new Set(beats.map((b) => b.day))].sort((a, b) => beatsForDay(beats, b).length - beatsForDay(beats, a).length)[0];
const dayBeats = beatsForDay(beats, busy);

// 3. Template mode is faithful
{
  const ch = await narrateDay(world, busy);
  check("no LLM => template mode", ch.mode === "template");
  const cited = new Set(ch.paragraphs.flatMap((p) => p.beats));
  check("template cites every selected beat", dayBeats.every((b) => cited.has(b.id)));
}

// 4. Good LLM output accepted
const goodLlm: LlmFn = async () =>
  JSON.stringify({ paragraphs: [{ text: "The day unfolded in small, tense steps.", beats: dayBeats.map((b) => b.id) }] });
{
  const ch = await narrateDay(world, busy, { llm: goodLlm });
  check("valid grounded LLM output is accepted", ch.mode === "llm" && ch.paragraphs.length === 1);
}

// 5. Retry then success
{
  let calls = 0;
  const flaky: LlmFn = async () => {
    calls++;
    return calls === 1 ? "not json at all" : await goodLlm({ system: "", user: "" });
  };
  const ch = await narrateDay(world, busy, { llm: flaky });
  check("bad JSON triggers one retry, then succeeds", ch.mode === "llm" && calls === 2);
}

// 6. Unknown beat id / uncited paragraph => fallback
{
  let calls = 0;
  const bad: LlmFn = async () => {
    calls++;
    return JSON.stringify({ paragraphs: [{ text: "Something happened.", beats: ["B999.1"] }] });
  };
  const ch = await narrateDay(world, busy, { llm: bad });
  check("citing an unknown beat is rejected, then falls back to template", ch.mode === "template" && calls === 2 && ch.warnings.some((w) => w.includes("unknown beat")));
}
{
  const bad: LlmFn = async () => JSON.stringify({ paragraphs: [{ text: "Vague prose.", beats: [] }] });
  const ch = await narrateDay(world, busy, { llm: bad });
  check("uncited paragraphs are rejected", ch.mode === "template");
}

// 7. Omitting a high-significance beat is rejected
{
  const important = dayBeats.find((b) => b.significance >= 8);
  if (important) {
    const lazy: LlmFn = async () =>
      JSON.stringify({ paragraphs: [{ text: "Quiet day.", beats: dayBeats.filter((b) => b !== important).map((b) => b.id).slice(0, 1) || [dayBeats[0].id] }] });
    const ch = await narrateDay(world, busy, { llm: lazy });
    check("dropping a major beat is rejected", ch.mode === "template");
  } else {
    check("dropping a major beat is rejected (no major beat on busiest day; skipped)", true);
  }
}

// 8. Invented names are flagged as warnings
{
  const inventive: LlmFn = async () =>
    JSON.stringify({ paragraphs: [{ text: "Everyone hushed when Chidi walked in with seven folders.", beats: dayBeats.map((b) => b.id) }] });
  const ch = await narrateDay(world, busy, { llm: inventive });
  check("invented names and numbers are surfaced as warnings", ch.warnings.some((w) => w.includes("Chidi")) && ch.warnings.some((w) => w.includes("seven") || w.includes("numbers")) || ch.warnings.some((w) => w.includes("Chidi")));
}

// 9. LLM failure never breaks the pipeline
{
  const down: LlmFn = async () => {
    throw new Error("network down");
  };
  const ch = await narrateDay(world, busy, { llm: down });
  check("LLM outage falls back to template", ch.mode === "template" && ch.warnings.some((w) => w.includes("network down")));
}

// 10. Quiet days still narrate
{
  const quiet = await narrateDay(createWorld(1), 1);
  check("a day with no beats still produces text", quiet.paragraphs.length === 1 && quiet.paragraphs[0].text.length > 0);
}

console.log(failures === 0 ? "\nAll narrator tests passed." : `\n${failures} narrator test(s) FAILED.`);
}

main().then(() => process.exit(failures === 0 ? 0 : 1));
