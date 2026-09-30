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
   */
  data: Record<string, unknown>;
};

/**
 * A character's memory of a specific world event.
 *
 * Memory is derived from perception.
 * It is NOT the source of truth for what actually happened.
 *
 * The canonical truth remains WorldEvent.
 *
 * This allows us to distinguish:
 *
 * - what actually happened
 * - what a character perceived
 * - what the character remembers
 * - how confident they are about that memory
 */
export type MemoryEntry = {
  /**
   * The exact world event this memory came from.
   */
  eventId: string;

  /**
   * Simulation day when the event occurred.
   */
  day: number;

  /**
   * Type of the original world event.
   */
  type: WorldEventType;

  /**
   * Character responsible for the event, when applicable.
   */
  sourceCharacterId?: string;

  /**
   * Character affected by the event, when applicable.
   */
  targetCharacterId?: string;

  /**
   * Location where the event occurred, when applicable.
   */
  locationId?: string;

  /**
   * How important this memory is to the character.
   *
   * Higher importance means it should be more resistant
   * to future memory pruning or decay.
   */
  importance: number;

  /**
   * How confident the character is that their memory
   * accurately represents what they perceived.
   */
  confidence: number;

  /**
   * Human-readable interpretation of the event.
   *
   * This is derived information.
   * It must never be used as the canonical simulation state.
   */
  summary: string;
};

export type Character = {
  id: string;
  name: string;
  role: string;

  goal: string;
  fear: string;
  secret: string;

  /**
   * Legacy knowledge representation.
   *
   * Kept temporarily for compatibility while the simulation
   * transitions to structured memory.
   *
   * This should eventually become a derived view of memory
   * rather than primary character state.
   */
  knowledge: string[];

  /**
   * Structured memories tied to specific world events.
   *
   * This becomes the primary foundation for character memory.
   */
  memories?: MemoryEntry[];

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
   * IMPORTANT:
   * processedEventIds and memories are different concepts.
   *
   * processedEventIds answers:
   * "Has this character already perceived/processed this event?"
   *
   * memories answers:
   * "What does this character retain from events?"
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
