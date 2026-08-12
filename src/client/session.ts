import type {
  ApiCandidate,
  GeneratedRoundApiDto,
  SessionApiDto,
} from "../contracts/api";

export type SessionRound = SessionApiDto["rounds"][number];

export function latestRound(session: SessionApiDto): SessionRound | null {
  return session.rounds.reduce<SessionRound | null>(
    (latest, round) =>
      latest === null || round.roundNumber > latest.roundNumber ? round : latest,
    null,
  );
}

export function appendGeneratedRound(
  session: SessionApiDto,
  generated: GeneratedRoundApiDto,
): SessionApiDto {
  return {
    ...session,
    rounds: [
      ...session.rounds,
      {
        roundId: generated.roundId,
        roundNumber: generated.roundNumber,
        candidates: generated.candidates,
      },
    ],
  };
}

export function updateCandidateInSession(
  session: SessionApiDto,
  candidateResultId: string,
  update: (candidate: ApiCandidate) => ApiCandidate,
): SessionApiDto {
  return {
    ...session,
    rounds: session.rounds.map((round) => ({
      ...round,
      candidates: round.candidates.map((candidate) =>
        candidate.candidateResultId === candidateResultId
          ? update(candidate)
          : candidate,
      ),
    })),
  };
}
