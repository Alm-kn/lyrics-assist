import type {
  SelectionConfigVersion,
  VersionedConfig,
} from "../config/types";
import type { CandidateKey } from "../candidate/types";
import type { Score0To100, ScoreWeight } from "../scoring/types";
import type { SoundScoreResult } from "../scoring/types";
import type { SemanticResult } from "../semantic/types";

/** Categories fixed by the v0.1 selector contract. */
export type SelectionCategory = "balanced" | "sound" | "semantic" | "fallback";

/** Categories that receive configurable target counts before fallback filling. */
export type SelectionTargetCategory = Exclude<SelectionCategory, "fallback">;

interface SelectedCandidateBase {
  readonly candidateKey: CandidateKey;
  readonly selectionRank: number;
  readonly selectionScore: Score0To100;
  readonly selectionReason: string;
}

export interface PrimarySelectedCandidate extends SelectedCandidateBase {
  readonly selectionCategory: SelectionTargetCategory;
  readonly fallbackStrategy?: never;
}

export interface FallbackSelectedCandidate extends SelectedCandidateBase {
  readonly selectionCategory: "fallback";
  readonly fallbackStrategy: SelectionTargetCategory;
}

/** One candidate selected for the final result set. */
export type SelectedCandidate =
  | PrimarySelectedCandidate
  | FallbackSelectedCandidate;

/** A recorded target-category shortage that may lead to fallback selection. */
export interface SelectionShortageEvent {
  readonly category: SelectionTargetCategory;
  readonly missingCount: number;
  readonly reason: string;
}

/** The selector output. Its array may be short when quality candidates are exhausted. */
export interface SelectionResult {
  readonly selected: readonly SelectedCandidate[];
  readonly selectionConfigVersion: SelectionConfigVersion;
  readonly shortageEvents: readonly SelectionShortageEvent[];
}

/** Target counts such as the versioned v0.1 balanced/sound/semantic composition. */
export type SelectionTargetCounts = Readonly<Record<SelectionTargetCategory, number>>;

/** Configurable parameters for ranking and de-duplicating balanced candidates. */
export interface BalancedSelectionConfig {
  readonly minimumAxisWeight: ScoreWeight;
  readonly averageAxisWeight: ScoreWeight;
  readonly maximumPerSemanticCluster: number;
}

/** Semantic cluster caps for primary and fallback selection. */
export interface SemanticSelectionConfig {
  readonly primaryMaximumPerSemanticCluster: number;
  readonly fallbackMaximumPerSemanticCluster: number;
}

/** Versioned settings consumed by the deterministic selector. */
export interface SelectionConfig extends VersionedConfig<SelectionConfigVersion> {
  readonly targetTotal: number;
  readonly targetCounts: SelectionTargetCounts;
  readonly balanced: BalancedSelectionConfig;
  readonly semantic: SemanticSelectionConfig;
  readonly fallbackPriority: readonly SelectionTargetCategory[];
}

/** Candidate pool item; incomplete evaluations are removed by the General Filter. */
export interface CandidateSelectionCandidate {
  readonly candidateKey: CandidateKey;
  readonly surface: string;
  /** Confirmed reading may be carried through, but is not used for duplicates. */
  readonly reading?: string;
  readonly sound?: SoundScoreResult;
  readonly semantic?: SemanticResult;
}

export interface CandidateSelectionInput {
  readonly source: { readonly surface: string };
  readonly candidates: readonly CandidateSelectionCandidate[];
  readonly excludeTerms: readonly string[];
  readonly config: SelectionConfig;
}
