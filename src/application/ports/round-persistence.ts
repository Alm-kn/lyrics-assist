import type {
  CandidateKey,
  ReadingResult,
  RhymeRepresentations,
  SelectionConfig,
  SelectionResult,
  SemanticResult,
  SoundScoreResult,
  SoundScoringConfig,
} from "../../domain";
import type {
  EvaluateSemanticsResult,
  GenerateCandidatesResult,
} from "./llm-adapter";
import type {
  ReadingResolution,
  ResolveReadingBatchResult,
} from "./reading-resolver";

export interface CompletedCandidateSnapshot {
  readonly candidateKey: CandidateKey;
  readonly generationIndex: number;
  readonly surface: string;
  readonly readingResult: ReadingResult;
  readonly rhymeRepresentation: RhymeRepresentations;
  readonly soundResult: SoundScoreResult;
  readonly semanticResult: SemanticResult;
}

export interface CompletedRoundSnapshot {
  readonly roundNumber: number;
  readonly generationTargetCount: number;
  readonly excludeTerms: readonly string[];
  readonly generationResult: GenerateCandidatesResult;
  readonly candidateReadingResolutionResult: ResolveReadingBatchResult;
  readonly semanticEvaluationResult: EvaluateSemanticsResult;
  readonly sourceRhyme: RhymeRepresentations;
  readonly scoringConfig: SoundScoringConfig;
  readonly selectionConfig: SelectionConfig;
  readonly selectionResult: SelectionResult;
  readonly candidates: readonly CompletedCandidateSnapshot[];
  readonly createdAt?: number;
}

export interface CompletedInitialRoundSnapshot {
  readonly userId: string;
  readonly sourceSurface: string;
  readonly sourceReading: string;
  readonly sourceReadingResolution: ReadingResolution;
  readonly round: CompletedRoundSnapshot;
}

export interface CompletedRerollRoundSnapshot {
  readonly sessionId: string;
  readonly round: CompletedRoundSnapshot;
}

export interface PersistedRoundReferences {
  readonly sessionId: string;
  readonly roundId: string;
  readonly candidateResults: readonly {
    readonly candidateKey: CandidateKey;
    readonly candidateResultId: string;
  }[];
}

/** Port-level signal that lets Application distinguish immutable-config conflict. */
export class ConfigVersionConflictPersistenceError extends Error {
  constructor(cause?: unknown) {
    super("Config version already exists with different content", {
      cause,
    });
    this.name = "ConfigVersionConflictPersistenceError";
  }
}

export interface RoundPersistencePort {
  saveInitialRound(
    input: CompletedInitialRoundSnapshot,
  ): Promise<PersistedRoundReferences>;

  saveRerollRound(
    input: CompletedRerollRoundSnapshot,
  ): Promise<PersistedRoundReferences>;
}
