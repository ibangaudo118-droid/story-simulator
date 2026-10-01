import type { Id, World } from "../world/types";
import type { Beat } from "./beats";

export interface CharacterCard {
  id: Id;
  name: string;
  role: string;
  temperament: string;
  state: string;
  fears: string;
}

export interface Brief {
  day: number;
  beats: Beat[];
  cast: CharacterCard[];
  places: Record<Id, string>;
  allowedNames: string[];
}

function temperament(w: World, id: Id): string {
  const t = w.characters[id].traits;
  const bits: string[] = [];
  if (t.curiosity >= 70) bits.push("relentlessly curious");
  if (t.caution >= 65) bits.push("careful");
  if (t.courage >= 65) bits.push("bold");
  if (t.courage <= 35) bits.push("easily frightened");
  if (t.loyalty >= 70) bits.push("loyal");
  if (t.ambition >= 70) bits.push("ambitious");
  if (t.credulity >= 60) bits.push("quick to believe");
  return bits.slice(0, 3).join(", ") || "even-tempered";
}

function stateOf(w: World, id: Id): string {
  const c = w.characters[id];
  if (c.alarm >= 50) return "on edge, sure they are being watched";
  if (c.stress >= 60) return "strained";
  if (c.stress >= 40) return "uneasy";
  return "steady";
}

/** A frozen, text-only description of what the narrator is allowed to know about a day. */
export function buildBrief(world: World, day: number, beats: Beat[]): Brief {
  const ids = new Set<Id>();
  for (const b of beats) {
    for (const a of b.actors) ids.add(a);
    for (const l of b.learned) ids.add(l.actorId);
  }
  const cast: CharacterCard[] = [...ids]
    .filter((id) => world.characters[id])
    .map((id) => ({
      id,
      name: world.characters[id].name,
      role: world.characters[id].role,
      temperament: temperament(world, id),
      state: stateOf(world, id),
      fears: world.characters[id].fear.text,
    }));
  const places: Record<Id, string> = {};
  for (const b of beats) {
    if (b.locationId && world.locations[b.locationId]) {
      places[b.locationId] = world.locations[b.locationId].name;
    }
  }
  const allowed = new Set<string>();
  for (const c of Object.values(world.characters)) c.name.split(/\s+/).forEach((p) => allowed.add(p));
  for (const l of Object.values(world.locations)) l.name.split(/\s+/).forEach((p) => allowed.add(p));
  for (const o of Object.values(world.orgs)) o.name.split(/\s+/).forEach((p) => allowed.add(p));
  return { day, beats, cast, places, allowedNames: [...allowed] };
}
