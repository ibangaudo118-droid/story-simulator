import {
  Character,
  WorldState,
} from "./engine";

export type Belief = {
  subject: string;
  belief: string;
  confidence: number;
};

export type Motive = {
  type:
    | "GOAL"
    | "FEAR"
    | "CURIOSITY"
    | "PROTECTION"
    | "SELF_PRESERVATION"
    | "LOYALTY";

  description: string;

  strength: number;
};

export type MindState = {
  characterId: string;
  beliefs: Belief[];
  motives: Motive[];
};

function getRelationship(
  character: Character,
  targetId: string
) {
  return character.relationships.find(
    (relationship) =>
      relationship.targetId === targetId
  );
}

function clamp(value: number) {
  return Math.max(
    0,
    Math.min(100, value)
  );
}

export function buildMindState(
  world: WorldState,
  character: Character
): MindState {
  const beliefs: Belief[] = [];
  const motives: Motive[] = [];

  /*
   * GOAL
   */
  motives.push({
    type: "GOAL",
    description: character.goal,
    strength: 80,
  });

  /*
   * FEAR
   */
  motives.push({
    type: "FEAR",
    description: character.fear,
    strength: 70,
  });

  /*
   * Recent events increase curiosity.
   */
  if (
    character.recentActions.includes(
      "INVESTIGATE"
    ) ||
    character.recentActions.includes(
      "SEARCH"
    )
  ) {
    motives.push({
      type: "CURIOSITY",
      description:
        "Understand what is happening before acting.",
      strength: 65,
    });
  }

  /*
   * Character-specific motives.
   */
  if (character.id === "zara") {
    const daniel =
      getRelationship(
        character,
        "daniel"
      );

    if (daniel) {
      if (daniel.suspicion >= 60) {
        beliefs.push({
          subject: "Daniel",
          belief:
            "Daniel may know more about the company than he admits.",
          confidence: clamp(
            daniel.suspicion
          ),
        });

        motives.push({
          type: "CURIOSITY",
          description:
            "Find out what Daniel is hiding.",
          strength: clamp(
            daniel.suspicion
          ),
        });
      }

      if (daniel.trust >= 60) {
        beliefs.push({
          subject: "Daniel",
          belief:
            "Daniel may still be willing to help.",
          confidence: clamp(
            daniel.trust
          ),
        });
      }
    }

    if (world.evidence.length > 0) {
      beliefs.push({
        subject: "Company",
        belief:
          "The company's student recruitment deserves deeper investigation.",
        confidence: 80,
      });

      motives.push({
        type: "GOAL",
        description:
          "Connect the evidence and discover the company's real objective.",
        strength: 90,
      });
    }
  }

  /*
   * Daniel's internal model.
   */
  if (character.id === "daniel") {
    const zara =
      getRelationship(
        character,
        "zara"
      );

    if (zara) {
      if (zara.suspicion >= 55) {
        beliefs.push({
          subject: "Zara",
          belief:
            "Zara is becoming suspicious of me.",
          confidence: clamp(
            zara.suspicion
          ),
        });

        motives.push({
          type: "SELF_PRESERVATION",
          description:
            "Prevent Zara from discovering the agreement with the company.",
          strength: clamp(
            zara.suspicion + 20
          ),
        });
      }

      if (zara.trust >= 60) {
        beliefs.push({
          subject: "Zara",
          belief:
            "Zara still trusts me enough to listen.",
          confidence: clamp(
            zara.trust
          ),
        });
      }
    }

    motives.push({
      type: "PROTECTION",
      description:
        "Protect his family from consequences caused by the company.",
      strength: 95,
    });

    motives.push({
      type: "LOYALTY",
      description:
        "Avoid completely betraying either Zara or the company.",
      strength: 75,
    });
  }

  /*
   * Knowledge creates grounded beliefs.
   */
  for (const knowledge of character.knowledge) {
    if (
      knowledge
        .toLowerCase()
        .includes("company")
    ) {
      beliefs.push({
        subject: "Company",
        belief: knowledge,
        confidence: 75,
      });
    }
  }

  /*
   * Emotional state affects self-preservation.
   */
  if (
    character.emotionalState
      .toLowerCase()
      .includes("afraid") ||
    character.emotionalState
      .toLowerCase()
      .includes("nervous")
  ) {
    motives.push({
      type: "SELF_PRESERVATION",
      description:
        "Avoid actions that could expose or endanger the character.",
      strength: 85,
    });
  }

  return {
    characterId: character.id,
    beliefs,
    motives,
  };
}

export function buildAllMindStates(
  world: WorldState
): MindState[] {
  return world.characters.map(
    (character) =>
      buildMindState(
        world,
        character
      )
  );
}
