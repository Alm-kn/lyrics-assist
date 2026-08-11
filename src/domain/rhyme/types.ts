import type {
  ConfigParameters,
  NormalizerVersion,
  VersionedConfig,
} from "../config/types";
import type { RawReadingRepresentation } from "../reading/types";

/** The five vowel classes used by the v0.1 phonetic model. */
export type Vowel = "a" | "i" | "u" | "e" | "o";

export interface MoraPhoneticToken {
  readonly kind: "mora";
  readonly surface: string;
  readonly consonant: string | null;
  readonly vowel: Vowel;
}

export interface SokuonPhoneticToken {
  readonly kind: "sokuon";
  readonly surface: "っ" | "ッ";
  readonly symbol: "Q";
}

export interface HatsuonPhoneticToken {
  readonly kind: "hatsuon";
  readonly surface: "ん" | "ン";
  readonly symbol: "N";
}

export interface LongPhoneticToken {
  readonly kind: "long";
  readonly surface: "ー";
}

/** Phonetic tokens preserve distinctions that normalization may later merge. */
export type PhoneticToken =
  | MoraPhoneticToken
  | SokuonPhoneticToken
  | HatsuonPhoneticToken
  | LongPhoneticToken;

/** Parsed phonetic data derived from, but kept separate from, the raw reading. */
export interface PhoneticRepresentation {
  readonly tokens: readonly PhoneticToken[];
}

/** The comparison units fixed by the v0.1 normalization design. */
export type NormalizedRhymeUnit = Vowel | "X";

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
