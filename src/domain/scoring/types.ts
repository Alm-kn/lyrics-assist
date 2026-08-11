import type {
  NormalizerVersion,
  ScoringConfigVersion,
  VersionedConfig,
} from "../config/types";

/**
 * A score whose domain meaning is the inclusive range 0 through 100.
 * Runtime range validation is intentionally deferred beyond M1.
 */
export type Score0To100 = number;

/** A configurable coefficient used when combining sound sub-scores. */
export type ScoreWeight = number;

/** Every deterministic component retained for score explanation and analysis. */
export interface SoundScoreBreakdown {
  readonly moraLengthScore: Score0To100;
  readonly positionMatchScore: Score0To100;
  readonly sequenceSimilarityScore: Score0To100;
}

/** Numeric evidence retained for the v0.1 linear ending-rhyme bonus. */
export interface SoundScoreAdjustment {
  readonly ruleId: string;
  readonly scoreDelta: number;
  readonly reason: string;
  readonly commonSuffixLength: number;
  readonly suffixCoverage: number;
  readonly bonus: number;
}

/** The complete deterministic sound-scoring result and its version context. */
export interface SoundScoreResult {
  readonly finalScore: Score0To100;
  readonly rawScore: number;
  readonly breakdown: SoundScoreBreakdown;
  readonly adjustments: readonly SoundScoreAdjustment[];
  readonly reason: string;
  readonly scoringConfigVersion: ScoringConfigVersion;
  readonly normalizerVersion: NormalizerVersion;
}

/** Configurable weights for the v0.1 sound-score components. */
export interface SoundScoringWeights {
  readonly moraLength: ScoreWeight;
  readonly positionMatch: ScoreWeight;
  readonly sequenceSimilarity: ScoreWeight;
}

/** Configurable mora-length scores keyed by absolute mora-count difference. */
export interface MoraLengthScoringConfig {
  readonly scoreByDifference: Readonly<Record<number, Score0To100>>;
  readonly fallbackScore: Score0To100;
}

/** Configuration for the v0.1 linear suffix-coverage adjustment. */
export interface EndingRhymeBonusConfig {
  readonly maxPoints: number;
  readonly mode: "linear-suffix-coverage";
}

/** Versioned sound-scoring settings consumed by the deterministic scorer. */
export interface SoundScoringConfig extends VersionedConfig<ScoringConfigVersion> {
  readonly weights: SoundScoringWeights;
  readonly moraLength: MoraLengthScoringConfig;
  readonly endingBonus: EndingRhymeBonusConfig;
}
