export type Id = string;

export type ActionType =
  | "MOVE"
  | "SEARCH"
  | "OBSERVE"
  | "TALK"
  | "CONFRONT"
  | "REPORT"
  | "PUBLISH"
  | "LAY_LOW";

export type BeliefSource =
  | "initial"
  | "witnessed"
  | "document"
  | "told"
  | "rumor"
  | "inferred"
  | "group"
  | "published";

/** A proposition about the world. `truth` is ground truth; characters only hold beliefs about it. */
export interface Fact {
  id: Id;
  text: string;
  truth: boolean;
  topics: string[];
  secret: boolean;
  /** Character the fact is about (enables relationship side-effects on learning). */
  about?: Id;
  /** -1: learning it makes the learner trust `about` less. */
  valence?: -1 | 1;
  /** Organization harmed if this spreads. */
  threatens?: Id;
  /** Members of this org grow suspicious of `about` when they learn it. */
  hostileTo?: Id;
}

export interface Belief {
  factId: Id;
  /** 0-100: how strongly the holder believes the fact is true. */
  confidence: number;
  source: BeliefSource;
  fromId?: Id;
  day: number;
  /** Number of independent confirmations. */
  corroboration: number;
}

export interface Traits {
  curiosity: number;
  caution: number;
  loyalty: number;
  ambition: number;
  credulity: number;
  courage: number;
}

export interface Goal {
  id: Id;
  text: string;
  topics: string[];
  /** Fact ids, or patterns with `*` (e.g. "activity:*:investigating"). Empty = ongoing drive. */
  wantedFacts: string[];
  weight: number;
  affordances: string[];
}

export interface Relationship {
  trust: number;
  suspicion: number;
}

export interface Character {
  id: Id;
  name: string;
  role: string;
  traits: Traits;
  goals: Goal[];
  fear: { text: string; orgId?: Id };
  expertise: string[];
  capabilities: string[];
  location: Id;
  beliefs: Record<Id, Belief>;
  relationships: Record<Id, Relationship>;
  orgIds: Id[];
  secretFactIds: Id[];
  stress: number;
  /** Felt sense of being watched / in danger. */
  alarm: number;
  lastActions: ActionType[];
  lastTalkDay: Record<Id, number>;
  stayDays: number;
  visits: Record<Id, number>;
}

export type OrgKind = "company" | "university" | "association" | "group";

export interface Organization {
  id: Id;
  name: string;
  kind: OrgKind;
  funds: number;
  influence: number;
  secrecy: number;
  scrutiny: number;
  demand: number;
  /** What the organization collectively knows (fed by REPORT and observation). */
  pool: Record<Id, Belief>;
  /** How tightly each person is tied to the org (employment, debt, threat). */
  leverage: Record<Id, number>;
}

export interface Location {
  id: Id;
  name: string;
  purpose: string;
  affordances: string[];
  connectedTo: Id[];
  privacy: number;
  security: number;
  controlledBy?: Id;
}

export interface WorldObject {
  id: Id;
  name: string;
  locationId: Id | null;
  factIds: Id[];
  confidenceOnRead: number;
  readBy: Id[];
}

export interface Trace {
  actorId: Id;
  factId: Id;
  locationId: Id;
}

export type LogKind =
  | "WORLD_EVENT"
  | "ACTION"
  | "CONSEQUENCE"
  | "ORG_ACTION"
  | "BELIEF";

export interface LogEntry {
  id: string;
  day: number;
  kind: LogKind;
  actorId?: Id;
  targetId?: Id;
  locationId?: Id;
  text: string;
  data?: Record<string, unknown>;
}

export interface World {
  seed: number;
  day: number;
  facts: Record<Id, Fact>;
  characters: Record<Id, Character>;
  orgs: Record<Id, Organization>;
  locations: Record<Id, Location>;
  objects: Record<Id, WorldObject>;
  /** 0-100 per fact: how widely known it is publicly. */
  publicAwareness: Record<Id, number>;
  firedEvents: Record<Id, number>;
  flags: Record<string, number>;
  traces: Trace[];
  log: LogEntry[];
}
