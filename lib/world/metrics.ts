import { hashSeed } from "./rng";
import type { World } from "./types";

export function stateHash(w: World): string {
  return hashSeed(JSON.stringify(w)).toString(16).padStart(8, "0");
}

/** Compact per-day action signature (who did what, where) used to locate divergence. */
export function daySignatures(w: World): Record<number, string> {
  const out: Record<number, string[]> = {};
  for (const e of w.log) {
    if (e.kind !== "ACTION" && e.kind !== "WORLD_EVENT" && e.kind !== "ORG_ACTION") continue;
    const d = (e.data ?? {}) as Record<string, unknown>;
    const sig = `${e.kind}:${e.actorId ?? "-"}:${String(d.action ?? d.eventId ?? "-")}:${e.targetId ?? "-"}:${e.locationId ?? "-"}`;
    (out[e.day] ??= []).push(sig);
  }
  const res: Record<number, string> = {};
  for (const [d, list] of Object.entries(out)) res[Number(d)] = list.join("|");
  return res;
}

export function outcomeMetrics(w: World): Record<string, number> {
  const z = w.characters.zara;
  const d = w.characters.daniel;
  const count = (action: string, actor?: string): number =>
    w.log.filter(
      (e) =>
        e.kind === "ACTION" &&
        (e.data as Record<string, unknown> | undefined)?.action === action &&
        (!actor || e.actorId === actor)
    ).length;
  const firstPublish = w.log.find(
    (e) => e.kind === "ACTION" && (e.data as Record<string, unknown> | undefined)?.action === "PUBLISH"
  );
  return {
    zaraKnowsHarm: z.beliefs["company.harms_students"]?.confidence ?? 0,
    zaraKnowsDanielInformant: z.beliefs["daniel.is_informant"]?.confidence ?? 0,
    trustZaraToDaniel: z.relationships.daniel.trust,
    trustDanielToZara: d.relationships.zara.trust,
    danielReports: count("REPORT", "daniel"),
    confessions: w.log.filter((e) => e.text.includes("breaks down and tells")).length,
    publications: count("PUBLISH"),
    firstPublishDay: firstPublish ? firstPublish.day : 0,
    groupSize: Object.values(w.characters).filter((c) => c.orgIds.includes("investigation-group")).length,
    companyScrutiny: w.orgs.company.scrutiny,
    companySecrecy: w.orgs.company.secrecy,
    recruited: w.flags.recruitedCount,
    harmAwareness: w.publicAwareness["company.harms_students"] ?? 0,
    zaraCompanyOfficeDays: z.visits["company-office"] ?? 0,
    zaraAlarm: z.alarm,
    eventsFired: Object.keys(w.firedEvents).length,
  };
}
