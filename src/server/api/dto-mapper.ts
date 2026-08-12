import type {
  GeneratedCandidateView,
  GeneratedRoundView,
  SessionView,
} from "../../application";
import type {
  ApiCandidate,
  GeneratedRoundApiDto,
  SessionApiDto,
} from "../../contracts/api";

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
    feedback: candidate.feedback,
  };
}

export function mapGeneratedRoundDto(
  round: GeneratedRoundView,
): GeneratedRoundApiDto {
  return {
    sessionId: round.sessionId,
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    source: round.source,
    candidates: round.candidates.map(mapCandidate),
  };
}

export function mapSessionDto(session: SessionView): SessionApiDto {
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
