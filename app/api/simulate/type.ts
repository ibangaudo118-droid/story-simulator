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
  recentActions: ActionType[];
};

export type Location = {
  id: string;
  name: string;
  description: string;
  connectedTo: string[];
};

export type WorldState = {
  day: number;
  location: string;
  situation: string;
  characters: Character[];
  locations: Location[];
  entities: string[];
  objects: string[];
  evidence: string[];
  events: string[];
};
