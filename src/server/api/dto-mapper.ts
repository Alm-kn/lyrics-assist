import type {
  GeneratedCandidateView,
  GeneratedRoundView,
  SessionView,
} from "../../application";

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
    readonly category: GeneratedCandidateView["selection"]["selectionCategory"];
    readonly fallbackStrategy?: "balanced" | "sound" | "semantic";
    readonly rank: number;
  };
}

function mapCandidate(candidate: GeneratedCandidateView): ApiCandidate {
  const endingAdjustment = candidate.sound.adjustments.find(
    (adjustment) => adjustment.ruleId === "ending-rhyme-bonus",
  );
  if (endingAdjustment === undefined) {
    throw new Error("Sound result has no ending-rhyme-bonus adjustment");
  }

  return {
    candidateResultId: candidate.candidateResultId,
    surface: candidate.surface,
    reading: candidate.reading,
    sound: {
      finalScore: candidate.sound.finalScore,
      breakdown: {
        moraLengthScore: candidate.sound.breakdown.moraLengthScore,
        positionMatchScore: candidate.sound.breakdown.positionMatchScore,
        sequenceSimilarityScore:
          candidate.sound.breakdown.sequenceSimilarityScore,
      },
      endingAdjustment: {
        commonSuffixLength: endingAdjustment.commonSuffixLength,
        suffixCoverage: endingAdjustment.suffixCoverage,
        bonus: endingAdjustment.bonus,
      },
    },
    semantic: {
      score: candidate.semantic.semanticScore,
      reason: candidate.semantic.reason,
      primaryRelation: candidate.semantic.primaryRelation,
      secondaryRelations: candidate.semantic.secondaryRelations,
      semanticCluster: candidate.semantic.semanticCluster,
    },
    selection: {
      category: candidate.selection.selectionCategory,
      ...(candidate.selection.selectionCategory === "fallback"
        ? { fallbackStrategy: candidate.selection.fallbackStrategy }
        : {}),
      rank: candidate.selection.selectionRank,
    },
  };
}

export function mapGeneratedRoundDto(round: GeneratedRoundView) {
  return {
    sessionId: round.sessionId,
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    source: round.source,
    candidates: round.candidates.map(mapCandidate),
  };
}

export function mapSessionDto(session: SessionView) {
  return {
    sessionId: session.sessionId,
    source: session.source,
    rounds: session.rounds.map((round) => ({
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      candidates: round.candidates.map(mapCandidate),
    })),
  };
}

