import type { Beat } from "./beats";
import type { Brief } from "./brief";
import type { Paragraph } from "./narrate";

/** Deterministic, LLM-free narration. Plain, but always faithful to the log. */
export function renderTemplate(brief: Brief): Paragraph[] {
  if (brief.beats.length === 0) {
    return [{ text: `Day ${brief.day} passes without incident.`, beats: [] }];
  }
  const out: Paragraph[] = [];
  const nameOf = (id: string): string => brief.cast.find((c) => c.id === id)?.name ?? id;
  const join = (names: string[]): string =>
    names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const sentence = (b: Beat): string => {
    let s = b.summary.replace(/\.$/, "") + ".";
    for (const d of b.details) s += " " + d.replace(/\.$/, "") + ".";
    // group "who learned what" by fact, skipping facts the details already state
    const byFact = new Map<string, { names: string[]; isTrue: boolean }>();
    for (const l of b.learned) {
      if (b.details.some((d) => d.includes(l.fact))) continue;
      const entry = byFact.get(l.fact) ?? { names: [], isTrue: l.isTrue };
      const n = nameOf(l.actorId);
      if (!entry.names.includes(n)) entry.names.push(n);
      byFact.set(l.fact, entry);
    }
    for (const [fact, { names, isTrue }] of byFact) {
      const plural = names.length > 1;
      s += isTrue
        ? ` ${join(names)} ${plural ? "now believe" : "now believes"}: "${fact}".`
        : ` ${join(names)} ${plural ? "come to believe" : "comes to believe"}, wrongly: "${fact}".`;
    }
    return s;
  };
  for (let i = 0; i < brief.beats.length; i += 2) {
    const chunk = brief.beats.slice(i, i + 2);
    const prefix = i === 0 ? `Day ${brief.day}. ` : "";
    out.push({ text: prefix + chunk.map(sentence).join(" "), beats: chunk.map((b) => b.id) });
  }
  return out;
}
