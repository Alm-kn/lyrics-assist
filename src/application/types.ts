import type {
  CandidateKey,
  SelectedCandidate,
  SemanticResult,
  SoundScoreResult,
} from "../domain";

export interface GenerationApplicationConfig {
  readonly generationTargetCount: number;
}

export const DEFAULT_GENERATION_APPLICATION_CONFIG = {
  generationTargetCount: 60,
} as const satisfies GenerationApplicationConfig;

export interface GeneratedCandidateView {
  readonly candidateResultId: string;
  readonly candidateKey: CandidateKey;
  readonly surface: string;
  readonly reading: string;
  readonly sound: SoundScoreResult;
  readonly semantic: SemanticResult;
  readonly selection: SelectedCandidate;
}

export interface GeneratedRoundView {
  readonly sessionId: string;
  readonly roundId: string;
  readonly roundNumber: number;
  readonly source: {
    readonly surface: string;
    readonly reading: string;
  };
  readonly candidates: readonly GeneratedCandidateView[];
}

export interface SessionView {
  readonly sessionId: string;
  readonly source: {
    readonly surface: string;
    readonly reading: string;
  };
  readonly rounds: readonly {
    readonly roundId: string;
    readonly roundNumber: number;
    readonly candidates: readonly GeneratedCandidateView[];
  }[];
}

