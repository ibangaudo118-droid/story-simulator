import type { ActionType, Character, WorldState } from "./types";

export type RelationshipChange = {
  targetId: string;
  trustDelta?: number;
  suspicionDelta?: number;
};

export type ActionConsequence = {
  actorId: string;
  action: ActionType;
  event: string;
  knowledgeGained: string[];
  emotionalChange?: string;
  priorityChange?: string;
  relationshipChanges: RelationshipChange[];
};

function findCharacter(
  world: WorldState,
  characterId: string
): Character | undefined {
  return world.characters.find((character) => character.id === characterId);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function updateRelationship(
  character: Character,
  targetId: string,
  trustDelta = 0,
  suspicionDelta = 0
) {
  const relationship = character.relationships.find(
    (item) => item.targetId === targetId
  );

  if (!relationship) {
    return;
  }

  relationship.trust = clamp(relationship.trust + trustDelta);
  relationship.suspicion = clamp(
    relationship.suspicion + suspicionDelta
  );
}

function addKnowledge(character: Character, knowledge: string[]) {
  for (const item of knowledge) {
    if (!character.knowledge.includes(item)) {
      character.knowledge.push(item);
    }
  }
}

export function executeAction(
  world: WorldState,
  character: Character,
  action: ActionType
): ActionConsequence {
  const consequence: ActionConsequence = {
    actorId: character.id,
    action,
    event: "",
    knowledgeGained: [],
    relationshipChanges: [],
  };

  switch (action) {
    case "WAIT": {
      consequence.event = `${character.name} waits and watches the situation without taking direct action.`;

      consequence.emotionalChange = character.emotionalState;

      break;
    }

    case "OBSERVE": {
      consequence.event = `${character.name} carefully observes what is happening around them.`;

      consequence.emotionalChange = "Alert and observant";

      break;
    }

    case "MOVE": {
      const currentLocation = world.locations.find(
        (location) => location.id === character.location
      );

      if (!currentLocation || currentLocation.connectedTo.length === 0) {
        consequence.event = `${character.name} remains at ${character.location}.`;
        break;
      }

      const destinationIndex =
        character.recentActions.length %
        currentLocation.connectedTo.length;

      const destinationId =
        currentLocation.connectedTo[destinationIndex];

      const destination = world.locations.find(
        (location) => location.id === destinationId
      );

      if (!destination) {
        consequence.event = `${character.name} remains at ${character.location}.`;
        break;
      }

      character.location = destination.id;

      consequence.event = `${character.name} moves to ${destination.name}.`;

      if (character.id === "daniel" && destination.id === "company-office") {
        consequence.emotionalChange = "More anxious about being discovered";
        consequence.priorityChange =
          "Protect his family without betraying Zara";
      }

      break;
    }

    case "TALK": {
      const target = world.characters.find(
        (other) =>
          other.id !== character.id &&
          other.location === character.location
      );

      if (!target) {
        consequence.event = `${character.name} wants to talk but nobody relevant is nearby.`;
        break;
      }

      consequence.event = `${character.name} talks with ${target.name}.`;

      if (character.id === "daniel" && target.id === "zara") {
        consequence.event =
          `Daniel talks with Zara but avoids revealing his agreement with the company.`;

        consequence.relationshipChanges.push({
          targetId: target.id,
          suspicionDelta: 5,
        });

        consequence.emotionalChange = "Conflicted and cautious";
        consequence.priorityChange =
          "Protect his family without betraying Zara";
      } else if (character.id === "zara" && target.id === "daniel") {
        consequence.event =
          `Zara questions Daniel about the company and watches his reactions carefully.`;

        consequence.relationshipChanges.push({
          targetId: target.id,
          suspicionDelta: 5,
        });

        consequence.emotionalChange = "Suspicious but focused";
        consequence.priorityChange =
          "Determine how much Daniel knows about the company";
      }

      break;
    }

    case "FOLLOW": {
      const target = world.characters.find(
        (other) =>
          other.id !== character.id &&
          other.location === character.location
      );

      if (!target) {
        consequence.event = `${character.name} looks for someone to follow but finds nobody nearby.`;
        break;
      }

      consequence.event = `${character.name} quietly follows ${target.name}.`;

      consequence.relationshipChanges.push({
        targetId: target.id,
        suspicionDelta: 10,
      });

      consequence.knowledgeGained.push(
        `${character.name} is actively monitoring ${target.name}.`
      );

      break;
    }

    case "INVESTIGATE": {
      if (!character.capabilities.includes("investigation")) {
        consequence.event = `${character.name} attempts to investigate but lacks the necessary capability.`;
        break;
      }

      const evidence =
        "The company is deliberately approaching students privately.";

      consequence.event = `${character.name} investigates the company's activities.`;

      consequence.knowledgeGained.push(evidence);

      if (!world.evidence.includes(evidence)) {
        world.evidence.push(evidence);
        consequence.event =
          `${character.name} investigates the company's activities and discovers useful evidence.`;
      } else {
        consequence.event =
          `${character.name} investigates further but finds no new evidence.`;
      }

      if (character.id === "zara") {
        consequence.emotionalChange =
          "More suspicious but increasingly confident";

        consequence.priorityChange =
          "Determine why the company is recruiting students";
      }

      break;
    }

    case "SEARCH": {
      const knowledge =
        "Something about the current location suggests the company has been using the area to meet students.";

      consequence.event = `${character.name} searches the area for useful information.`;

      consequence.knowledgeGained.push(knowledge);

      if (character.id === "zara") {
        consequence.emotionalChange = "Focused and suspicious";
        consequence.priorityChange =
          "Find evidence connecting the company to student activity";
      }

      break;
    }

    default: {
      consequence.event = `${character.name} takes no meaningful action.`;
      break;
    }
  }

  return consequence;
}

export function applyConsequence(
  world: WorldState,
  consequence: ActionConsequence
): void {
  const character = findCharacter(world, consequence.actorId);

  if (!character) {
    return;
  }

  addKnowledge(character, consequence.knowledgeGained);

  if (consequence.emotionalChange) {
    character.emotionalState = consequence.emotionalChange;
  }

  if (consequence.priorityChange) {
    character.currentPriority = consequence.priorityChange;
  }

  for (const relationshipChange of consequence.relationshipChanges) {
    updateRelationship(
      character,
      relationshipChange.targetId,
      relationshipChange.trustDelta ?? 0,
      relationshipChange.suspicionDelta ?? 0
    );
  }
}
