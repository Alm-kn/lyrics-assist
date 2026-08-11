import type {
  SelectionConfigVersion,
  VersionedConfig,
} from "../config/types";
import type { Score0To100, ScoreWeight } from "../scoring/types";

/** Categories fixed by the v0.1 selector contract. */
export type SelectionCategory = "balanced" | "sound" | "semantic" | "fallback";

/** Categories that receive configurable target counts before fallback filling. */
export type SelectionTargetCategory = Exclude<SelectionCategory, "fallback">;

/** One candidate selected for the final result set. */
export interface SelectedCandidate {
  readonly candidateResultId: string;
  readonly selectionCategory: SelectionCategory;
  readonly selectionRank: number;
  readonly selectionScore: Score0To100;
  readonly selectionReason: string;
}

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

/** Configurable semantic-diversity preferences applied by the future selector. */
export interface SemanticDiversityConfig {
  readonly preferDistinctPrimaryRelations: boolean;
  readonly preferDistinctSemanticClusters: boolean;
}

/** Versioned selection settings without any candidate-selection logic. */
export interface SelectionConfig extends VersionedConfig<SelectionConfigVersion> {
  readonly targetCounts: SelectionTargetCounts;
  readonly balanced: BalancedSelectionConfig;
  readonly semanticDiversity: SemanticDiversityConfig;
  readonly minimumScores?: Readonly<
    Partial<Record<SelectionTargetCategory, Score0To100>>
  >;
}
