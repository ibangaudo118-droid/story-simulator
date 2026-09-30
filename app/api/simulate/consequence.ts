import type {
  ActionOutcome,
  ActionType,
  Character,
  StrategyId,
  WorldEvent,
  WorldState,
} from "@/lib/simulation/types";

import {
  getUnknownItems,
  INVESTIGATION_POOL,
  SEARCH_POOL,
  locationRisk,
} from "@/lib/simulation/info";

import type { Decision } from "./decisions";

export type RelationshipChange = {
  ownerId: string;
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

  worldEvent: WorldEvent;

  outcome: ActionOutcome;
};

function clamp(
  value: number,
  min = 0,
  max = 100
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function locationName(
  world: WorldState,
  locationId: string
): string {
  return (
    world.locations.find(
      (location) =>
        location.id ===
        locationId
    )?.name ??
    locationId
  );
}

function createEventId(
  world: WorldState,
  action: ActionType,
  actorId: string
): string {
  return [
    "day",
    world.day,
    action.toLowerCase(),
    actorId,
    world.eventLog.length +
      1,
  ].join("-");
}

function createWorldEvent(
  world: WorldState,
  character: Character,
  action: ActionType,
  data: Record<string, unknown>,
  targetId?: string
): WorldEvent {
  return {
    id: createEventId(
      world,
      action,
      character.id
    ),

    type: "ACTION",

    day: world.day,

    actorId: character.id,

    targetId,

    locationId:
      character.location,

    data: {
      action,
      ...data,
    },
  };
}

function createOutcome(
  world: WorldState,
  worldEvent: WorldEvent,
  character: Character,
  action: ActionType,
  options: {
    success: boolean;
    progress: number;
    effectiveness: number;
    risk: number;
    newInformation: boolean;
    targetReacted: boolean;
    targetNoticed: boolean;
    summary: string;
    strategyId?: StrategyId;
    targetId?: string;
    locationId?: string;
  }
): ActionOutcome {
  return {
    id: `outcome-${
      worldEvent.id
    }`,

    eventId:
      worldEvent.id,

    day: world.day,

    actorId:
      character.id,

    action,

    targetId:
      options.targetId,

    locationId:
      options.locationId ??
      worldEvent.locationId ??
      character.location,

    success:
      options.success,

    progress:
      Math.round(
        clamp(
          options.progress,
          -100,
          100
        )
      ),

    effectiveness:
      Math.round(
        clamp(
          options.effectiveness,
          -100,
          100
        )
      ),

    risk: Math.round(
      clamp(
        options.risk
      )
    ),

    newInformation:
      options.newInformation,

    targetReacted:
      options.targetReacted,

    targetNoticed:
      options.targetNoticed,

    summary:
      options.summary,

    strategyId:
      options.strategyId,
  };
}

function textTokens(
  text: string
): string[] {
  return text
    .toLowerCase()
    .split(
      /[^a-z]+/
    )
    .filter(
      (token) =>
        token.length >= 4
    );
}

/**
 * Knowledge transfer through conversation:
 * the listener learns one thing the speaker
 * knows that they do not — preferring items
 * relevant to the listener's own concerns.
 */
function selectTransferItem(
  actor: Character,
  target: Character
): string | undefined {
  const unknown =
    target.knowledge.filter(
      (item) =>
        !actor.knowledge.includes(
          item
        )
    );

  if (
    unknown.length === 0
  ) {
    return undefined;
  }

  const profile =
    `${actor.goal} ${actor.fear} ${actor.currentPriority}`.toLowerCase();

  return (
    unknown.find(
      (item) =>
        textTokens(
          item
        ).some(
          (token) =>
            profile.includes(
              token
            )
        )
    ) ??
    unknown[0]
  );
}

const TOPIC_PRETTY: Record<
  string,
  string
> = {
  investigat:
    "the investigation",
  company:
    "the company",
  recruit:
    "the recruitment",
  evidence:
    "the evidence",
  student:
    "the students",
  family:
    "his family",
  harm: "possible harm",
  meeting:
    "a private meeting",
  protect:
    "protection",
  proof: "proof",
};

function sharedTopic(
  actor: Character,
  target: Character
): string | null {
  const actorText =
    `${actor.goal} ${actor.fear} ${actor.currentPriority}`.toLowerCase();

  const actorTopics =
    textTokens(
      actorText
    );

  const profile =
    targetProfileString(
      target
    );

  for (
    const token of
      actorTopics
  ) {
    if (
      profile.includes(
        token
      )
    ) {
      return (
        TOPIC_PRETTY[
          token
        ] ?? token
      );
    }
  }

  return null;
}

function targetProfileString(
  target: Character
): string {
  return [
    ...target.capabilities,
    ...target.resources,
    ...target.knowledge,
  ]
    .join(" ")
    .toLowerCase();
}

function countKnownInvestigationItems(
  character: Character
): number {
  const all = [
    ...INVESTIGATION_POOL.campus,
    ...INVESTIGATION_POOL[
      "campus-cafe"
    ],
    ...INVESTIGATION_POOL[
      "company-office"
    ],
  ].map(
    (item) => item.text
  );

  return all.filter(
    (text) =>
      character.knowledge.includes(
        text
      )
  ).length;
}

function resolveTarget(
  world: WorldState,
  character: Character,
  decision: Decision | undefined
): Character | undefined {
  if (
    decision?.targetId
  ) {
    const target =
      world.characters.find(
        (other) =>
          other.id ===
          decision.targetId
      );

    if (
      target &&
      target.location ===
        character.location
    ) {
      return target;
    }

    return undefined;
  }

  return world.characters.find(
    (other) =>
      other.id !==
        character.id &&
      other.location ===
        character.location
  );
}

export function executeAction(
  world: WorldState,
  character: Character,
  action: ActionType,
  decision?: Decision
): ActionConsequence {
  const worldEvent =
    createWorldEvent(
      world,
      character,
      action,
      {}
    );

  const consequence: ActionConsequence =
    {
      actorId:
        character.id,

      action,

      event: "",

      knowledgeGained:
        [],

      relationshipChanges:
        [],

      worldEvent,

      outcome:
        createOutcome(
          world,
          worldEvent,
          character,
          action,
          {
            success:
              false,

            progress:
              0,

            effectiveness:
              0,

            risk: 0,

            newInformation:
              false,

            targetReacted:
              false,

            targetNoticed:
              false,

            summary:
              "",
          }
        ),
    };

  const finish = (
    options: Parameters<
      typeof createOutcome
    >[4]
  ) => {
    consequence.outcome =
      createOutcome(
        world,
        worldEvent,
        character,
        action,
        {
          ...options,
          strategyId:
            options.strategyId ??
            decision?.strategyId,
        }
      );
  };

  const fail = (
    summary: string,
    risk = 5
  ) => {
    worldEvent.data = {
      ...worldEvent.data,
      success: false,
    };

    consequence.event =
      summary;

    finish({
      success: false,
      progress: 5,
      effectiveness: 10,
      risk,
      newInformation: false,
      targetReacted: false,
      targetNoticed: false,
      summary,
    });
  };

  switch (action) {
    case "WAIT": {
      const threat =
        character.memories.some(
          (memory) =>
            world.day -
              memory.day <=
              2 &&
            /follow|monitor|threat|danger/i.test(
              memory.summary
            )
        );

      const effectiveness =
        threat ? 45 : 25;

      worldEvent.data = {
        action: "WAIT",
      };

      consequence.event =
        `${character.name} keeps a low profile and waits.`;

      finish({
        success: true,
        progress: 12,
        effectiveness,
        risk: 5,
        newInformation: false,
        targetReacted: false,
        targetNoticed: false,
        summary: `${
          character.name
        } waited (${
          threat
            ? "sensible while feeling watched"
            : "quiet day"
        }).`,
      });

      break;
    }

    case "OBSERVE": {
      const unknown =
        getUnknownItems(
          SEARCH_POOL,
          character.location,
          character
        );

      const found =
        unknown[0];

      const risk =
        Math.round(
          5 +
            locationRisk(
              character.location
            ) *
              0.5
        );

      if (found) {
        consequence.knowledgeGained.push(
          found.text
        );

        worldEvent.data = {
          action: "OBSERVE",
          noticed:
            found.text,
        };

        consequence.event =
          `${character.name} notices something: ${found.text}`;

        finish({
          success: true,
          progress: 40,
          effectiveness: 55,
          risk,
          newInformation: true,
          targetReacted: false,
          targetNoticed: false,
          summary: `${
            character.name
          } observed ${locationName(
            world,
            character.location
          )} and picked up a lead.`,
        });
      } else {
        worldEvent.data = {
          action: "OBSERVE",
        };

        consequence.event =
          `${character.name} carefully observes the surroundings.`;

        finish({
          success: true,
          progress: 20,
          effectiveness: 25,
          risk,
          newInformation: false,
          targetReacted: false,
          targetNoticed: false,
          summary: `${
            character.name
          } observed ${locationName(
            world,
            character.location
          )} but noticed nothing new.`,
        });
      }

      break;
    }

    case "MOVE": {
      const current =
        world.locations.find(
          (location) =>
            location.id ===
            character.location
        );

      const destinationId =
        decision?.destinationId;

      if (
        !current ||
        !destinationId ||
        !current.connectedTo.includes(
          destinationId
        )
      ) {
        worldEvent.data = {
          action: "MOVE",
          success: false,
          from:
            character.location,
        };

        fail(
          `${character.name} stays put; no worthwhile destination.`,
          5
        );

        break;
      }

      const destination =
        world.locations.find(
          (location) =>
            location.id ===
            destinationId
        );

      if (!destination) {
        fail(
          `${character.name} stays put.`,
          5
        );
        break;
      }

      const previousLocation =
        character.location;

      character.location =
        destination.id;

      worldEvent.data = {
        action: "MOVE",
        success: true,
        from:
          previousLocation,
        to: destination.id,
      };

      consequence.event =
        `${character.name} moves to ${destination.name}.`;

      const lastVisit =
        [
          ...character.actionHistory,
        ]
          .reverse()
          .find(
            (outcome) =>
              outcome.action ===
                "MOVE" &&
              outcome.locationId ===
                destination.id
          );

      const daysSince =
        lastVisit
          ? world.day -
            lastVisit.day
          : 99;

      finish({
        success: true,
        progress: 35,
        effectiveness:
          clamp(
            38 +
              Math.min(
                17,
                2 *
                  Math.min(
                    daysSince,
                    8
                  )
              )
          ),
        risk: Math.round(
          clamp(
            8 +
              locationRisk(
                destination.id
              ) *
                0.55
          )
        ),
        newInformation: false,
        targetReacted: false,
        targetNoticed: false,
        summary: `${
          character.name
        } moved to ${destination.name}.`,
        locationId:
          destination.id,
      });

      break;
    }

    case "TALK": {
      const target =
        resolveTarget(
          world,
          character,
          decision
        );

      if (!target) {
        worldEvent.data = {
          action: "TALK",
          success: false,
        };

        fail(
          `${character.name} looks for someone to talk to, but nobody relevant is around.`,
          5
        );

        break;
      }

      worldEvent.targetId =
        target.id;

      const relationship =
        character.relationships.find(
          (item) =>
            item.targetId ===
            target.id
        );

      let reacted = false;

      if (relationship) {
        let trustDelta =
          relationship.trust >=
          50
            ? 3
            : 1;

        /*
         * Diminishing returns: each recent conversation
         * with the same person builds less trust than
         * the last.
         */
        const recentTalks =
          character.actionHistory.filter(
            (outcome) =>
              outcome.action ===
                "TALK" &&
              outcome.targetId ===
                target.id &&
              world.day -
                outcome.day <=
                6
          ).length;

        trustDelta =
          Math.round(
            trustDelta *
              Math.pow(
                0.6,
                recentTalks
              )
          );

        if (
          relationship.suspicion >=
          65
        ) {
          trustDelta = -2;
          reacted = true;
        }

        consequence.relationshipChanges.push(
          {
            ownerId:
              character.id,

            targetId:
              target.id,

            trustDelta,
          }
        );
      }

      const transferred =
        relationship &&
        relationship.trust >=
          55
          ? selectTransferItem(
              character,
              target
            )
          : undefined;

      let insight: string | null =
        null;

      if (
        !transferred
      ) {
        const topic =
          sharedTopic(
            character,
            target
          );

        if (
          topic
        ) {
          const candidate = `${target.name} seems to know something about ${topic}.`;

          /*
           * Only counts as new information if the
           * character does not already know it.
           */
          if (
            !character.knowledge.includes(
              candidate
            )
          ) {
            insight = candidate;
          }
        }
      }

      const gained: string[] =
        [];

      if (transferred) {
        gained.push(
          transferred
        );
      }

      if (insight) {
        gained.push(
          insight
        );
      }

      consequence.knowledgeGained.push(
        ...gained
      );

      const newInformation =
        gained.length > 0;

      worldEvent.data = {
        action: "TALK",
        success: true,
        targetId:
          target.id,
        reacted,
      };

      consequence.event =
        reacted
          ? `${character.name} talks with ${target.name}, but the conversation is guarded.`
          : `${character.name} talks with ${target.name}.`;

      if (reacted) {
        consequence.emotionalChange =
          "Guarded after the conversation";
      }

      /*
       * A conversation that yields nothing new is worth
       * less each time it is repeated with the same person.
       */
      const talkRepeats =
        character.actionHistory.filter(
          (outcome) =>
            outcome.action ===
              "TALK" &&
            outcome.targetId ===
              target.id &&
            world.day -
              outcome.day <=
              6
        ).length;

      const staleTalkPenalty =
        newInformation
          ? 0
          : Math.min(
              24,
              talkRepeats * 8
            );

      finish({
        success: true,
        progress: 40,
        effectiveness:
          clamp(
            42 +
              (transferred
                ? 24
                : insight
                  ? 12
                  : 0) +
              (relationship
                ? relationship.trust *
                  0.1
                : 0) -
              (reacted
                ? 14
                : 0) -
              staleTalkPenalty
          ),
        risk: 10,
        newInformation,
        targetReacted:
          reacted,
        targetNoticed: true,
        summary: `${
          character.name
        } talked with ${
          target.name
        }${
          transferred
            ? " and learned something"
            : insight
              ? " and picked up a hint"
              : ""
        }${
          reacted
            ? "; the talk was strained"
            : ""
        }.`,
        targetId:
          target.id,
      });

      break;
    }

    case "FOLLOW": {
      const target =
        resolveTarget(
          world,
          character,
          decision
        );

      if (!target) {
        worldEvent.data = {
          action: "FOLLOW",
          success: false,
        };

        fail(
          `${character.name} looks for someone to follow, but finds nobody.`,
          5
        );

        break;
      }

      const targetRelationship =
        target.relationships.find(
          (item) =>
            item.targetId ===
            character.id
        );

      const targetSuspicion =
        targetRelationship?.suspicion ??
        30;

      const recentFollows =
        character.actionHistory.filter(
          (outcome) =>
            outcome.action ===
              "FOLLOW" &&
            outcome.targetId ===
              target.id &&
            world.day -
              outcome.day <=
              3
        ).length;

      /*
       * Detection is state-based: the target's
       * suspicion plus how often they have been
       * tailed recently. No dice, no day counters.
       */
      const noticed =
        targetSuspicion +
          12 *
            recentFollows >=
        62;

      let trailed = false;

      if (
        target.location !==
        character.location
      ) {
        const current =
          world.locations.find(
            (location) =>
              location.id ===
              character.location
          );

        if (
          current?.connectedTo.includes(
            target.location
          )
        ) {
          character.location =
            target.location;

          trailed = true;
        } else {
          worldEvent.data = {
            action: "FOLLOW",
            success: false,
            targetId:
              target.id,
          };

          fail(
            `${character.name} tries to follow ${target.name} but loses them.`,
            10
          );

          break;
        }
      }

      worldEvent.targetId =
        target.id;

      worldEvent.data = {
        action: "FOLLOW",
        success: true,
        targetId:
          target.id,
        noticed,
        trailed,
      };

      const placeName =
        locationName(
          world,
          character.location
        );

      const observation = `${target.name} spent time at ${placeName}.`;

      const isNew =
        !character.knowledge.includes(
          observation
        );

      if (isNew) {
        consequence.knowledgeGained.push(
          observation
        );
      }

      consequence.event =
        noticed
          ? `${character.name} follows ${target.name}, but ${target.name} seems to notice.`
          : trailed
            ? `${character.name} trails ${target.name} to ${placeName}.`
            : `${character.name} quietly follows ${target.name}.`;

      finish({
        success: true,
        progress:
          noticed ? 25 : 45,

        effectiveness:
          noticed ? 25 : 50,

        risk: Math.round(
          clamp(
            25 +
              targetSuspicion *
                0.4 +
              (noticed
                ? 15
                : 0)
          )
        ),

        newInformation:
          isNew,

        targetReacted:
          noticed,

        targetNoticed:
          noticed,

        summary: noticed
          ? `${
              character.name
            } followed ${
              target.name
            }, who appeared to notice.`
          : `${
              character.name
            } followed ${
              target.name
            } without drawing attention.`,

        targetId:
          target.id,
      });

      break;
    }

    case "INVESTIGATE": {
      if (
        !character.capabilities.includes(
          "investigation"
        )
      ) {
        worldEvent.data = {
          action: "INVESTIGATE",
          success: false,
          reason:
            "missing_capability",
        };

        fail(
          `${character.name} does not know how to investigate properly.`,
          5
        );

        break;
      }

      const unknown =
        getUnknownItems(
          INVESTIGATION_POOL,
          character.location,
          character
        );

      const found =
        unknown[0];

      const risk =
        locationRisk(
          character.location
        );

      if (found) {
        consequence.knowledgeGained.push(
          found.text
        );

        if (
          !world.evidence.includes(
            found.text
          )
        ) {
          world.evidence.push(
            found.text
          );
        }

        worldEvent.data = {
          action: "INVESTIGATE",
          success: true,
          evidenceFound:
            true,
          evidence:
            found.text,
        };

        consequence.event =
          `${character.name} investigates and uncovers: ${found.text}`;

        consequence.emotionalChange =
          "More alert and suspicious";

        if (
          countKnownInvestigationItems(
            {
              ...character,
              knowledge: [
                ...character.knowledge,
                found.text,
              ],
            }
          ) >= 3 &&
          /find evidence/i.test(
            character.currentPriority
          )
        ) {
          consequence.priorityChange =
            "Protect the evidence gathered and avoid being discovered";
        }

        finish({
          success: true,
          progress: 55,
          effectiveness: 65,
          risk,
          newInformation: true,
          targetReacted: false,
          targetNoticed: false,
          summary: `${
            character.name
          } investigated ${
            locationName(
              world,
              character.location
            )
          } and found a real lead.`,
        });
      } else {
        worldEvent.data = {
          action: "INVESTIGATE",
          success: true,
          evidenceFound:
            false,
        };

        consequence.event =
          `${character.name} investigates further but finds nothing new.`;

        finish({
          success: true,
          progress: 8,
          effectiveness: 12,
          risk,
          newInformation: false,
          targetReacted: false,
          targetNoticed: false,
          summary: `${
            character.name
          } investigated ${
            locationName(
              world,
              character.location
            )
          } but everything here is already known.`,
        });
      }

      break;
    }

    case "SEARCH": {
      if (
        !character.capabilities.includes(
          "investigation"
        )
      ) {
        worldEvent.data = {
          action: "SEARCH",
          success: false,
          reason:
            "missing_capability",
        };

        fail(
          `${character.name} searches half-heartedly but does not know what to look for.`,
          5
        );

        break;
      }

      const unknown =
        getUnknownItems(
          SEARCH_POOL,
          character.location,
          character
        );

      const found =
        unknown[0];

      const risk =
        Math.max(
          5,
          locationRisk(
            character.location
          ) - 10
        );

      if (found) {
        consequence.knowledgeGained.push(
          found.text
        );

        worldEvent.data = {
          action: "SEARCH",
          success: true,
          knowledgeFound:
            found.text,
        };

        consequence.event =
          `${character.name} searches the area and finds: ${found.text}`;

        finish({
          success: true,
          progress: 45,
          effectiveness: 55,
          risk,
          newInformation: true,
          targetReacted: false,
          targetNoticed: false,
          summary: `${
            character.name
          } searched ${locationName(
            world,
            character.location
          )} and found something useful.`,
        });
      } else {
        worldEvent.data = {
          action: "SEARCH",
          success: true,
          knowledgeFound:
            null,
        };

        consequence.event =
          `${character.name} searches the area but turns up nothing new.`;

        finish({
          success: true,
          progress: 10,
          effectiveness: 12,
          risk,
          newInformation: false,
          targetReacted: false,
          targetNoticed: false,
          summary: `${
            character.name
          } searched ${locationName(
            world,
            character.location
          )} but found only what was already known.`,
        });
      }

      break;
    }

    default: {
      fail(
        `${character.name} takes no meaningful action.`,
        5
      );

      break;
    }
  }

  return consequence;
}

export function applyConsequence(
  world: WorldState,
  consequence: ActionConsequence
): void {
  const character =
    world.characters.find(
      (item) =>
        item.id ===
        consequence.actorId
    );

  if (!character) {
    return;
  }

  for (
    const item of
      consequence.knowledgeGained
  ) {
    if (
      !character.knowledge.includes(
        item
      )
    ) {
      character.knowledge.push(
        item
      );
    }
  }

  if (
    consequence.emotionalChange
  ) {
    character.emotionalState =
      consequence.emotionalChange;
  }

  if (
    consequence.priorityChange
  ) {
    character.currentPriority =
      consequence.priorityChange;
  }

  for (
    const change of
      consequence.relationshipChanges
  ) {
    const owner =
      world.characters.find(
        (item) =>
          item.id ===
          change.ownerId
      );

    if (!owner) {
      continue;
    }

    const relationship =
      owner.relationships.find(
        (item) =>
          item.targetId ===
          change.targetId
      );

    if (!relationship) {
      continue;
    }

    relationship.trust =
      clamp(
        relationship.trust +
          (change.trustDelta ??
            0)
      );

    relationship.suspicion =
      clamp(
        relationship.suspicion +
          (change.suspicionDelta ??
            0)
      );
  }

  character.actionHistory = [
    ...character.actionHistory,
    consequence.outcome,
  ].slice(-25);

  world.eventLog.push(
    consequence.worldEvent
  );
}
