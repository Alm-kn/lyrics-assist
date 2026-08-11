import type { SoundScoringConfig } from "./types";

/** The accepted v0.1 beta hypothesis, kept as one immutable config snapshot. */
export const DEFAULT_SOUND_SCORING_CONFIG = {
  version: "sound-v0.1",
  weights: {
    moraLength: 0.4,
    positionMatch: 0.25,
    sequenceSimilarity: 0.25,
  },
  moraLength: {
    scoreByDifference: {
      0: 100,
      1: 70,
      2: 35,
    },
    fallbackScore: 0,
  },
  endingBonus: {
    maxPoints: 10,
    mode: "linear-suffix-coverage",
  },
} as const satisfies SoundScoringConfig;
