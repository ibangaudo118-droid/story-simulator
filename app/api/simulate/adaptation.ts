import type {
  ActionOutcome,
  Character,
} from "@/lib/simulation/types";

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

/**
 * How good was this outcome as a learning signal?
 * Progress and effectiveness reward; risk punishes;
 * genuinely new information rewards.
 */
export function signalFromOutcome(
  outcome: ActionOutcome
): number {
  const raw =
    0.5 *
      outcome.progress +
    0.4 *
      outcome.effectiveness +
    (outcome.newInformation
      ? 10
      : 0) -
    0.2 *
      outcome.risk;

  return clamp(raw);
}

/**
 * Recency-weighted strategy learning.
 *
 * Each use updates effectiveness with an EMA
 * (0.8 old / 0.2 new): recent outcomes dominate
 * while old experience keeps a residual influence
 * that never reaches exactly zero. Strategies that
 * were not used today drift very slowly toward the
 * neutral 50 so nothing freezes permanently and
 * nothing is ruled out forever.
 *
 * There is deliberately NO rule of the form
 * "switch after N failures".
 */
export function updateStrategies(
  character: Character,
  outcomes: ActionOutcome[],
  day: number
): void {
  for (
    const strategy of
      character.strategies
  ) {
    const used =
      outcomes.filter(
        (outcome) =>
          outcome.strategyId ===
          strategy.id
      );

    if (used.length > 0) {
      strategy.attempts +=
        used.length;

      for (
        const outcome of
          used
      ) {
        const useful =
          outcome.success &&
          (outcome.newInformation ||
            outcome.progress >=
              40);

        const failed =
          !outcome.success ||
          (outcome.progress <
            25 &&
            !outcome.newInformation);

        if (useful) {
          strategy.successes += 1;
        } else if (failed) {
          strategy.failures += 1;
        }

        strategy.effectiveness =
          clamp(
            0.8 *
              strategy.effectiveness +
              0.2 *
                signalFromOutcome(
                  outcome
                )
          );
      }

      strategy.lastUsedDay =
        day;
    } else {
      strategy.effectiveness =
        clamp(
          strategy.effectiveness +
            (50 -
              strategy.effectiveness) *
              0.03
        );
    }
  }
}
