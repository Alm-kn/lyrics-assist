import type {
  CandidateKey,
  ReadingResult,
  RhymeRepresentations,
  SelectionCategory,
  SelectionConfig,
  SelectionResult,
  SelectionTargetCategory,
  SemanticResult,
  SoundScoreResult,
  SoundScoringConfig,
} from "../../domain";
import type {
  EvaluateSemanticsResult,
  GenerateCandidatesResult,
} from "../../application/ports/llm-adapter";

export type CandidateFeedbackValue = "like" | "dislike";
export type SoundScoreFeedbackValue = "low" | "valid" | "high";

/** One unmodified, fully evaluated member of the candidate pool. */
export interface CompletedCandidateSnapshot {
  readonly candidateKey: CandidateKey;
  readonly generationIndex: number;
  readonly surface: string;
  readonly readingResult: ReadingResult;
  readonly rhymeRepresentation: RhymeRepresentations;
  readonly soundResult: SoundScoreResult;
  readonly semanticResult: SemanticResult;
}

/** Completed in-memory round data accepted by Persistence after selection. */
export interface CompletedRoundSnapshot {
  readonly roundNumber: number;
  readonly generationTargetCount: number;
  readonly excludeTerms: readonly string[];
  readonly generationResult: GenerateCandidatesResult;
  readonly semanticEvaluationResult: EvaluateSemanticsResult;
  readonly sourceRhyme: RhymeRepresentations;
  readonly scoringConfig: SoundScoringConfig;
  readonly selectionConfig: SelectionConfig;
  readonly selectionResult: SelectionResult;
  readonly candidates: readonly CompletedCandidateSnapshot[];
  readonly createdAt?: number;
}

export interface FirstRoundPersistenceInput {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly sourceSurface: string;
  readonly sourceReading: string;
  readonly createdAt?: number;
  readonly round: CompletedRoundSnapshot;
}

export interface RerollPersistenceInput {
  readonly sessionId: string;
  readonly round: CompletedRoundSnapshot;
}

export interface PersistedRoundIds {
  readonly userId?: string;
  readonly sessionId: string;
  readonly roundId: string;
  readonly candidateResultIds: Readonly<Record<CandidateKey, string>>;
}

export interface LoadedCandidateSnapshot {
  readonly id: string;
  readonly candidateKey: CandidateKey;
  readonly generationIndex: number;
  readonly surface: string;
  readonly generationReadingHint: string | null;
  readonly reading: string;
  readonly readingResult: ReadingResult;
  readonly rhymeRepresentation: RhymeRepresentations;
  readonly soundResult: SoundScoreResult;
  readonly semanticResult: SemanticResult;
  readonly selected: boolean;
  readonly selectionCategory: SelectionCategory | null;
  readonly fallbackStrategy: SelectionTargetCategory | null;
  readonly selectionScore: number | null;
  readonly selectionRank: number | null;
  readonly analyticalProjection: {
    readonly soundFinalScore: number;
    readonly soundRawScore: number;
    readonly moraLengthScore: number;
    readonly positionMatchScore: number;
    readonly sequenceSimilarityScore: number;
    readonly commonSuffixLength: number;
    readonly suffixCoverage: number;
    readonly endingBonus: number;
    readonly semanticScore: number;
  };
}

export interface LoadedRoundSnapshot {
  readonly id: string;
  readonly sessionId: string;
  readonly roundNumber: number;
  readonly generationTargetCount: number;
  readonly excludeTerms: readonly string[];
  readonly generationResult: GenerateCandidatesResult;
  readonly semanticEvaluationResult: EvaluateSemanticsResult;
  readonly sourceRhyme: RhymeRepresentations;
  readonly selectionResult: SelectionResult;
  readonly normalizerVersion: string;
  readonly scoringConfigVersion: string;
  readonly selectionConfigVersion: string;
  readonly candidates: readonly LoadedCandidateSnapshot[];
}
