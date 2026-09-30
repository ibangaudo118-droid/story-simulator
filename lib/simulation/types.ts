export type ActionType =
  | "OBSERVE"
  | "MOVE"
  | "FOLLOW"
  | "TALK"
  | "INVESTIGATE"
  | "SEARCH"
  | "WAIT";

export type StrategyId =
  | "direct-investigation"
  | "social-contact"
  | "surveillance"
  | "observation"
  | "exploration"
  | "cautious-waiting";

export type WorldEventType =
  | "ACTION"
  | "CONSEQUENCE"
  | "PERCEPTION"
  | "INTERVENTION";

export interface Relationship {
  targetId: string;
  trust: number;
  suspicion: number;
}

export interface WorldEvent {
  id: string;
  type: WorldEventType;
  day: number;
  actorId?: string;
  targetId?: string;
  locationId?: string;
  data: Record<string, unknown>;
}

export interface MemoryEntry {
  eventId: string;
  day: number;
  type: WorldEventType;
  sourceCharacterId?: string;
  targetCharacterId?: string;
  locationId?: string;
  importance: number;
  confidence: number;
  summary: string;
}

/**
 * Structured result of executing one action (PRD section 6).
 * Every meaningful action produces exactly one ActionOutcome.
 * `strategyId` is an additive extension used by adaptation;
 * all PRD-required fields are present unchanged.
 */
export interface ActionOutcome {
  id: string;
  eventId: string;
  day: number;

  actorId: string;
  action: ActionType;
  targetId?: string;
  locationId: string;

  success: boolean;

  progress: number;
  effectiveness: number;
  risk: number;

  newInformation: boolean;
  targetReacted: boolean;
  targetNoticed: boolean;

  summary: string;

  strategyId?: StrategyId;
}

export interface StrategyState {
  id: StrategyId;
  label: string;

  effectiveness: number;

  attempts: number;
  successes: number;
  failures: number;

  lastUsedDay?: number;
}

export interface Character {
  id: string;
  name: string;
  role: string;

  goal: string;
  fear: string;
  secret: string;

  knowledge: string[];
  memories: MemoryEntry[];

  capabilities: string[];
  resources: string[];

  location: string;

  emotionalState: string;
  currentPriority: string;

  relationships: Relationship[];

  actionHistory: ActionOutcome[];

  strategies: StrategyState[];
  currentStrategyId?: StrategyId;

  recentActions: ActionType[];
  processedEventIds: string[];
}

export interface Location {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
}

export interface WorldState {
  day: number;
  location: string;
  situation: string;

  characters: Character[];
  locations: Location[];

  entities: string[];
  objects: string[];
  evidence: string[];

  events: string[];
  eventLog: WorldEvent[];
}
