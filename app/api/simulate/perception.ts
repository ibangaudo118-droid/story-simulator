import {
  Character,
  WorldState,
} from "./engine";

export type Perception = {
  characterId: string;
  event: string;
  interpretation: string;
  importance: number;
};

function addKnowledge(
  character: Character,
  information: string
) {
  if (!character.knowledge.includes(information)) {
    character.knowledge.push(information);
  }
}

function getRelationship(
  character: Character,
  targetId: string
) {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId === targetId
  );
}

export function processPerceptions(
  world: WorldState,
  events: string[]
): Perception[] {
  const perceptions: Perception[] = [];

  for (const character of world.characters) {
    for (const event of events) {
      const perception = perceiveEvent(
        world,
        character,
        event
      );

      if (perception) {
        perceptions.push(perception);
      }
    }
  }

  return perceptions;
}

function perceiveEvent(
  world: WorldState,
  character: Character,
  event: string
): Perception | null {
  const text = event.toLowerCase();

  /*
   * Characters should not automatically know everything
   * that happens in the simulation.
   *
   * They primarily perceive:
   * 1. Things happening in their location.
   * 2. Things directly involving them.
   * 3. Information they already have reason to know.
   */

  const directlyInvolved =
    text.includes(character.name.toLowerCase());

  const sameLocation =
    eventIsRelevantToLocation(
      world,
      character,
      event
    );

  if (!directlyInvolved && !sameLocation) {
    return null;
  }

  if (
    text.includes("investigates") &&
    text.includes("evidence")
  ) {
    if (character.id === "daniel") {
      const relationship =
        getRelationship(
          character,
          "zara"
        );

      if (relationship) {
        relationship.suspicion = Math.min(
          100,
          relationship.suspicion + 10
        );
      }

      character.emotionalState =
        "More nervous about Zara's investigation";

      addKnowledge(
        character,
        "Zara has discovered evidence connected to the company."
      );

      return {
        characterId: character.id,
        event,
        interpretation:
          "Zara's investigation is becoming more serious.",
        importance: 9,
      };
    }

    return {
      characterId: character.id,
      event,
      interpretation:
        "The investigation produced something useful.",
      importance: 7,
    };
  }

  if (
    text.includes("talks with") ||
    text.includes("questions")
  ) {
    const otherCharacter =
      world.characters.find(
        (other) =>
          other.id !== character.id &&
          event
            .toLowerCase()
            .includes(
              other.name.toLowerCase()
            )
      );

    if (!otherCharacter) {
      return null;
    }

    if (character.id === "zara") {
      const relationship =
        getRelationship(
          character,
          otherCharacter.id
        );

      if (relationship) {
        relationship.suspicion =
          Math.min(
            100,
            relationship.suspicion + 3
          );
      }

      character.emotionalState =
        "Alert and questioning";

      return {
        characterId: character.id,
        event,
        interpretation:
          `${otherCharacter.name}'s behaviour gives Zara another reason to pay attention.`,
        importance: 6,
      };
    }

    if (character.id === "daniel") {
      character.emotionalState =
        "Careful and guarded";

      return {
        characterId: character.id,
        event,
        interpretation:
          "The conversation could expose information Daniel wants to keep hidden.",
        importance: 8,
      };
    }
  }

  if (
    text.includes("moves to")
  ) {
    const otherCharacter =
      world.characters.find(
        (other) =>
          other.id !== character.id &&
          event
            .toLowerCase()
            .includes(
              other.name.toLowerCase()
            )
      );

    if (otherCharacter) {
      addKnowledge(
        character,
        `${otherCharacter.name} moved to another location.`
      );

      return {
        characterId: character.id,
        event,
        interpretation:
          `${otherCharacter.name}'s movement may reveal what they are trying to do.`,
        importance: 4,
      };
    }
  }

  if (
    text.includes("searches the area")
  ) {
    if (character.id === "daniel") {
      const relationship =
        getRelationship(
          character,
          "zara"
        );

      if (relationship) {
        relationship.suspicion =
          Math.min(
            100,
            relationship.suspicion + 5
          );
      }

      character.emotionalState =
        "Worried that Zara is getting closer";

      addKnowledge(
        character,
        "Zara is actively searching for clues."
      );

      return {
        characterId: character.id,
        event,
        interpretation:
          "Zara may be getting closer to discovering something important.",
        importance: 8,
      };
    }
  }

  if (
    text.includes("follows")
  ) {
    const otherCharacter =
      world.characters.find(
        (other) =>
          other.id !== character.id &&
          event
            .toLowerCase()
            .includes(
              other.name.toLowerCase()
            )
      );

    if (otherCharacter) {
      addKnowledge(
        character,
        `${otherCharacter.name} is following someone.`
      );

      character.emotionalState =
        "More alert and cautious";

      return {
        characterId: character.id,
        event,
        interpretation:
          `${otherCharacter.name} is behaving unusually.`,
        importance: 8,
      };
    }
  }

  return {
    characterId: character.id,
    event,
    interpretation:
      "The event is noticeable but does not immediately change the character's plans.",
    importance: 2,
  };
}

function eventIsRelevantToLocation(
  world: WorldState,
  character: Character,
  event: string
): boolean {
  const location =
    world.locations.find(
      (item) =>
        item.id === character.location
    );

  if (!location) {
    return false;
  }

  return event
    .toLowerCase()
    .includes(
      location.name.toLowerCase()
    );
}
