import type {
  ConfigParameters,
  NormalizerVersion,
  VersionedConfig,
} from "../config/types";
import type { RawReadingRepresentation } from "../reading/types";

/**
 * One token in the parsed phonetic layer, such as "u", "N", or "do".
 * It is deliberately not the lyric-normalized comparison unit.
 */
export type PhoneticToken = string;

/** Parsed phonetic data derived from, but kept separate from, the raw reading. */
export interface PhoneticRepresentation {
  readonly tokens: readonly PhoneticToken[];
}

/**
 * One unit in a lyric-normalized rhyme pattern, such as a vowel or "X".
 * The unit remains extensible because later normalization modes are undecided.
 */
export type NormalizedRhymeUnit = string;

/** A comparison representation produced by a specific normalizer version. */
export interface NormalizedRhymeRepresentation {
  readonly units: readonly NormalizedRhymeUnit[];
  readonly normalizerVersion: NormalizerVersion;
}

/**
 * The three non-destructive rhyme layers stored together for reproducibility.
 */
export interface RhymeRepresentations {
  readonly rawReading: RawReadingRepresentation;
  readonly phonetic: PhoneticRepresentation;
  readonly normalized: NormalizedRhymeRepresentation;
}

/** Configuration for one normalization rule; rule behavior is implemented in M2. */
export interface NormalizationRuleConfig {
  readonly id: string;
  readonly enabled: boolean;
  readonly parameters?: ConfigParameters;
}

/** Versioned normalization settings without any normalization logic. */
export interface NormalizationConfig extends VersionedConfig<NormalizerVersion> {
  readonly rules: readonly NormalizationRuleConfig[];
}
