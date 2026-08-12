import type {
  GenerationPromptVersion,
  ModelIdentifier,
  SemanticPromptVersion,
} from "../../domain/config/types";
import type { CandidateKey } from "../../domain/candidate/types";
import type { ReadingResult } from "../../domain/reading/types";
import type { SemanticResult } from "../../domain/semantic/types";

export type { CandidateKey } from "../../domain/candidate/types";

export type GenerateCandidatesSource = Pick<
  ReadingResult,
  "surface" | "reading"
>;

export interface GenerateCandidatesRequest {
  readonly source: GenerateCandidatesSource;
  readonly targetCount: number;
  readonly excludeTerms: readonly string[];
}

export interface GeneratedCandidate {
  readonly candidateKey: CandidateKey;
  readonly surface: string;
  /** LLM-originated reference data, not a confirmed Reading Resolver result. */
  readonly readingHint?: string;
}

export interface ProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface ProviderCallMetadata {
  readonly provider?: string;
  readonly providerResponseId?: string;
  readonly inferenceConfigVersion?: string;
  readonly durationMs?: number;
  readonly usage?: ProviderUsage;
}

export interface CandidateGenerationMetadata extends ProviderCallMetadata {
  readonly modelIdentifier: ModelIdentifier;
  readonly generationPromptVersion: GenerationPromptVersion;
}

export interface GenerateCandidatesResult {
  readonly candidates: readonly GeneratedCandidate[];
  readonly metadata: CandidateGenerationMetadata;
}

export type EvaluateSemanticsSource = Pick<ReadingResult, "surface">;

export interface EvaluateSemanticsCandidate {
  readonly candidateKey: CandidateKey;
  readonly surface: string;
}

/** Meaning-only input; sound and phonetic data intentionally have no fields here. */
export interface EvaluateSemanticsRequest {
  readonly source: EvaluateSemanticsSource;
  readonly candidates: readonly EvaluateSemanticsCandidate[];
}

/** Candidate-keyed semantic fields reuse the existing M1 domain value types. */
export interface SemanticEvaluationItem {
  readonly candidateKey: CandidateKey;
  readonly score: SemanticResult["semanticScore"];
  readonly reason: SemanticResult["reason"];
  readonly primaryRelation: SemanticResult["primaryRelation"];
  readonly secondaryRelations: SemanticResult["secondaryRelations"];
  readonly semanticCluster: SemanticResult["semanticCluster"];
}

export interface SemanticEvaluationMetadata extends ProviderCallMetadata {
  readonly modelIdentifier: ModelIdentifier;
  readonly semanticPromptVersion: SemanticPromptVersion;
}

export interface EvaluateSemanticsResult {
  readonly results: readonly SemanticEvaluationItem[];
  readonly metadata: SemanticEvaluationMetadata;
}

/** Application-owned port implemented by concrete infrastructure adapters. */
export interface LlmAdapter {
  generateCandidates(
    request: GenerateCandidatesRequest,
  ): Promise<GenerateCandidatesResult>;

  evaluateSemantics(
    request: EvaluateSemanticsRequest,
  ): Promise<EvaluateSemanticsResult>;
}
