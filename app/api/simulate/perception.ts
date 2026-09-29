import type {
  Character,
  WorldState,
} from "./types";

export type Perception = {
  characterId: string;
  event: string;
  interpretation: string;
  importance: number;
};

/* =========================================================
   HELPERS
========================================================= */

function addKnowledge(
  character: Character,
  information: string
) {
  if (
    !character.knowledge.includes(
      information
    )
  ) {
    character.knowledge.push(
      information
    );
  }
}

function getRelationship(
  character: Character,
  targetId: string
) {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId ===
      targetId
  );
}

/* =========================================================
   PROCESS PERCEPTIONS
========================================================= */

export function processPerceptions(
  world: WorldState,
  events: string[]
): Perception[] {

  const perceptions: Perception[] =
    [];

  for (
    const character
    of world.characters
  ) {

    for (
      const event
      of events
    ) {

      const perception =
        perceiveEvent(
          world,
          character,
          event
        );

      if (
        perception
      ) {

        perceptions.push(
          perception
        );
      }
    }
  }

  return perceptions;
}

/* =========================================================
   PERCEIVE ONE EVENT
========================================================= */

function perceiveEvent(
  world: WorldState,
  character: Character,
  event: string
): Perception | null {

  const text =
    event.toLowerCase();


  /* -------------------------------------------------------
     Is the character directly involved?
  ------------------------------------------------------- */

  const directlyInvolved =
    text.includes(
      character.name.toLowerCase()
    );


  /* -------------------------------------------------------
     Is the event happening somewhere
     relevant to the character?
  ------------------------------------------------------- */

  const sameLocation =
    eventIsRelevantToLocation(
      world,
      character,
      event
    );


  if (
    !directlyInvolved &&
    !sameLocation
  ) {

    return null;
  }


  /* =======================================================
     INVESTIGATION / EVIDENCE
  ======================================================= */

  if (
    text.includes(
      "investigates"
    ) &&
    text.includes(
      "evidence"
    )
  ) {

    /* -----------------------------------------------------
       Daniel notices Zara's investigation
    ----------------------------------------------------- */

    if (
      character.id ===
      "daniel"
    ) {

      const relationship =
        getRelationship(
          character,
          "zara"
        );


      if (
        relationship
      ) {

        relationship.suspicion =
          Math.min(
            100,
            relationship.suspicion +
              10
          );
      }


      character.emotionalState =
        "More nervous about Zara's investigation";


      addKnowledge(
        character,
        "Zara has discovered evidence connected to the company."
      );


      return {
        characterId:
          character.id,

        event,

        interpretation:
          "Zara's investigation is becoming more serious.",

        importance:
          9,
      };
    }


    /* -----------------------------------------------------
       Zara or another character notices
       useful investigative progress
    ----------------------------------------------------- */

    return {
      characterId:
        character.id,

      event,

      interpretation:
        "The investigation produced something useful.",

      importance:
        7,
    };
  }


  /* =======================================================
     TALK / QUESTIONS
  ======================================================= */

  if (
    text.includes(
      "talks with"
    ) ||
    text.includes(
      "questions"
    )
  ) {

    const otherCharacter =
      world.characters.find(
        (other) =>
          other.id !==
            character.id &&
          text.includes(
            other.name.toLowerCase()
          )
      );


    if (
      !otherCharacter
    ) {

      return null;
    }


    /* -----------------------------------------------------
       Zara interprets conversations
    ----------------------------------------------------- */

    if (
      character.id ===
      "zara"
    ) {

      const relationship =
        getRelationship(
          character,
          otherCharacter.id
        );


      if (
        relationship
      ) {

        relationship.suspicion =
          Math.min(
            100,
            relationship.suspicion +
              3
          );
      }


      character.emotionalState =
        "Alert and questioning";


      return {
        characterId:
          character.id,

        event,

        interpretation:
          `${otherCharacter.name}'s behaviour gives Zara another reason to pay attention.`,

        importance:
          6,
      };
    }


    /* -----------------------------------------------------
       Daniel interprets conversations
    ----------------------------------------------------- */

    if (
      character.id ===
      "daniel"
    ) {

      character.emotionalState =
        "Careful and guarded";


      return {
        characterId:
          character.id,

        event,

        interpretation:
          "The conversation could expose information Daniel wants to keep hidden.",

        importance:
          8,
      };
    }
  }


  /* =======================================================
     MOVEMENT
  ======================================================= */

  if (
    text.includes(
      "moves to"
    )
  ) {

    const otherCharacter =
      world.characters.find(
        (other) =>
          other.id !==
            character.id &&
          text.includes(
            other.name.toLowerCase()
          )
      );


    if (
      otherCharacter
    ) {

      addKnowledge(
        character,
        `${otherCharacter.name} moved to another location.`
      );


      return {
        characterId:
          character.id,

        event,

        interpretation:
          `${otherCharacter.name}'s movement may reveal what they are trying to do.`,

        importance:
          4,
      };
    }
  }


  /* =======================================================
     SEARCH
  ======================================================= */

  if (
    text.includes(
      "searches the area"
    )
  ) {

    if (
      character.id ===
      "daniel"
    ) {

      const relationship =
        getRelationship(
          character,
          "zara"
        );


      if (
        relationship
      ) {

        relationship.suspicion =
          Math.min(
            100,
            relationship.suspicion +
              5
          );
      }


      character.emotionalState =
        "Worried that Zara is getting closer";


      addKnowledge(
        character,
        "Zara is actively searching for clues."
      );


      return {
        characterId:
          character.id,

        event,

        interpretation:
          "Zara may be getting closer to discovering something important.",

        importance:
          8,
      };
    }
  }


  /* =======================================================
     FOLLOW
  ======================================================= */

  if (
    text.includes(
      "follows"
    )
  ) {

    const otherCharacter =
      world.characters.find(
        (other) =>
          other.id !==
            character.id &&
          text.includes(
            other.name.toLowerCase()
          )
      );


    if (
      otherCharacter
    ) {

      addKnowledge(
        character,
        `${otherCharacter.name} is following someone.`
      );


      character.emotionalState =
        "More alert and cautious";


      return {
        characterId:
          character.id,

        event,

        interpretation:
          `${otherCharacter.name} is behaving unusually.`,

        importance:
          8,
      };
    }
  }


  /* =======================================================
     DEFAULT PERCEPTION
  ======================================================= */

  return {
    characterId:
      character.id,

    event,

    interpretation:
      "The event is noticeable but does not immediately change the character's plans.",

    importance:
      2,
  };
}

/* =========================================================
   LOCATION RELEVANCE
========================================================= */

function eventIsRelevantToLocation(
  world: WorldState,
  character: Character,
  event: string
): boolean {

  const location =
    world.locations.find(
      (item) =>
        item.id ===
        character.location
    );


  if (
    !location
  ) {

    return false;
  }


  return event
    .toLowerCase()
    .includes(
      location.name.toLowerCase()
    );
  }
