export type ActionType =
  | "OBSERVE"
  | "MOVE"
  | "FOLLOW"
  | "TALK"
  | "INVESTIGATE"
  | "SEARCH"
  | "WAIT";

export type Relationship = {
  targetId: string;
  trust: number;
  suspicion: number;
};

/**
 * Structured internal event.
 *
 * This is the simulation's source of truth.
 * Human-readable narration should be generated from this,
 * never the other way around.
 */
export type WorldEventType =
  | "ACTION"
  | "CONSEQUENCE"
  | "PERCEPTION"
  | "INTERVENTION";

export type WorldEvent = {
  id: string;
  type: WorldEventType;

  /**
   * Simulation day on which the event occurred.
   */
  day: number;

  /**
   * Character who caused the event.
   */
  actorId?: string;

  /**
   * Character affected by the event.
   */
  targetId?: string;

  /**
   * Location where the event occurred.
   */
  locationId?: string;

  /**
   * Machine-readable event information.
   *
   * Examples:
   * {
   *   action: "FOLLOW"
   * }
   *
   * {
   *   trustDelta: -5,
   *   suspicionDelta: 10
   * }
   */
  data: Record<string, unknown>;
};

export type Character = {
  id: string;
  name: string;
  role: string;

  goal: string;
  fear: string;
  secret: string;

  knowledge: string[];

  capabilities: string[];
  resources: string[];

  location: string;

  emotionalState: string;
  currentPriority: string;

  relationships: Relationship[];

  /**
   * Short-term action history used by the decision engine.
   */
  recentActions: ActionType[];

  /**
   * Event IDs this character has already processed.
   *
   * Important:
   * We track event identity rather than the English interpretation
   * of an event. This allows the same type of event to affect a
   * character differently when it happens again.
   */
  processedEventIds?: string[];
};

export type Location = {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
};

export type WorldState = {
  day: number;

  /**
   * Current global location/context.
   */
  location: string;

  /**
   * Current human-readable situation.
   *
   * This is presentation state, not the simulation's source of truth.
   */
  situation: string;

  characters: Character[];

  locations: Location[];

  entities: string[];
  objects: string[];

  /**
   * Evidence discovered in the world.
   */
  evidence: string[];

  /**
   * Legacy/display timeline.
   *
   * This will eventually become a rendered view of eventLog.
   */
  events: string[];

  /**
   * Canonical simulation event history.
   */
  eventLog: WorldEvent[];
};
