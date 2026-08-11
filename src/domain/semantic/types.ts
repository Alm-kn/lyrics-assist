import type {
  ModelIdentifier,
  SemanticPromptVersion,
} from "../config/types";
import type { Score0To100 } from "../scoring/types";

/**
 * An open semantic-relation tag vocabulary.
 * Known v0.1 examples are not a closed enum because the taxonomy is undecided.
 */
export type SemanticRelationTag = string;

/** A provider-defined semantic or associative cluster label. */
export type SemanticCluster = string;

/** The semantic evaluation for one candidate, including LLM version context. */
export interface SemanticResult {
  readonly word: string;
  readonly semanticScore: Score0To100;
  readonly reason: string;
  readonly primaryRelation: SemanticRelationTag;
  readonly secondaryRelations: readonly SemanticRelationTag[];
  readonly semanticCluster: SemanticCluster;
  readonly modelIdentifier: ModelIdentifier;
  readonly semanticPromptVersion: SemanticPromptVersion;
}
