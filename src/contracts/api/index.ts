import type {
  CandidateFeedbackState,
  CandidateFeedbackValue,
  SoundScoreFeedbackValue,
} from "../feedback";

export type {
  CandidateFeedbackState,
  CandidateFeedbackValue,
  SoundScoreFeedbackValue,
} from "../feedback";

export type PublicApiErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "SOURCE_READING_UNRESOLVED"
  | "NO_EVALUABLE_CANDIDATES"
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiCandidate {
  readonly candidateResultId: string;
  readonly surface: string;
  readonly reading: string;
  readonly sound: {
    readonly finalScore: number;
    readonly breakdown: {
      readonly moraLengthScore: number;
      readonly positionMatchScore: number;
      readonly sequenceSimilarityScore: number;
    };
    readonly endingAdjustment: {
      readonly commonSuffixLength: number;
      readonly suffixCoverage: number;
      readonly bonus: number;
    };
  };
  readonly semantic: {
    readonly score: number;
    readonly reason: string;
    readonly primaryRelation: string;
    readonly secondaryRelations: readonly string[];
    readonly semanticCluster: string;
  };
  readonly selection: {
    readonly category: "balanced" | "sound" | "semantic" | "fallback";
    readonly fallbackStrategy?: "balanced" | "sound" | "semantic";
    readonly rank: number;
  };
  readonly feedback: CandidateFeedbackState;
}

export interface GeneratedRoundApiDto {
  readonly sessionId: string;
  readonly roundId: string;
  readonly roundNumber: number;
  readonly source: {
    readonly surface: string;
    readonly reading: string;
  };
  readonly candidates: readonly ApiCandidate[];
}

export interface SessionApiDto {
  readonly sessionId: string;
  readonly source: {
    readonly surface: string;
    readonly reading: string;
  };
  readonly rounds: readonly {
    readonly roundId: string;
    readonly roundNumber: number;
    readonly candidates: readonly ApiCandidate[];
  }[];
}

export interface CandidateFeedbackApiDto {
  readonly candidateResultId: string;
  readonly value: CandidateFeedbackValue;
}

export interface SoundScoreFeedbackApiDto {
  readonly candidateResultId: string;
  readonly value: SoundScoreFeedbackValue;
}

export interface ApiSuccessEnvelope<T> {
  readonly data: T;
}

export interface ApiErrorEnvelope {
  readonly error: {
    readonly code: PublicApiErrorCode;
    readonly message: string;
  };
}
