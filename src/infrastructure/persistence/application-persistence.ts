import { and, asc, eq } from "drizzle-orm";

import type {
  CompletedInitialRoundSnapshot,
  CompletedRerollRoundSnapshot,
  FeedbackPersistencePort,
  PersistedRoundReferences,
  RoundPersistencePort,
  SessionContext,
  SessionQueryPort,
  SessionView,
} from "../../application";
import { ConfigVersionConflictPersistenceError } from "../../application";
import type { CandidateKey, SelectedCandidate } from "../../domain";
import type { PersistenceDatabase } from "./database";
import {
  candidateResults,
  generationRounds,
  generationSessions,
} from "./schema";
import { FeedbackRepository } from "./repositories/feedback-repository";
import { ImmutableConfigConflictError } from "./repositories/config-repository";
import { RoundRepository } from "./repositories/round-repository";

function persistedReferences(
  sessionId: string,
  roundId: string,
  ids: Readonly<Record<CandidateKey, string>>,
  candidateKeys: readonly CandidateKey[],
): PersistedRoundReferences {
  return {
    sessionId,
    roundId,
    candidateResults: candidateKeys.map((candidateKey) => {
      const candidateResultId = ids[candidateKey];
      if (candidateResultId === undefined) {
        throw new Error(`Candidate result ID is missing: ${candidateKey}`);
      }
      return { candidateKey, candidateResultId };
    }),
  };
}

function selectionFor(
  selected: readonly SelectedCandidate[],
  candidateKey: CandidateKey,
): SelectedCandidate {
  const selection = selected.find((item) => item.candidateKey === candidateKey);
  if (selection === undefined) {
    throw new Error(`Selected candidate snapshot is missing: ${candidateKey}`);
  }
  return selection;
}

/** SQLite/Drizzle implementation of the Application-owned persistence ports. */
export class SqliteApplicationPersistence
  implements RoundPersistencePort, SessionQueryPort, FeedbackPersistencePort
{
  private readonly rounds: RoundRepository;
  private readonly feedback: FeedbackRepository;

  constructor(private readonly db: PersistenceDatabase) {
    this.rounds = new RoundRepository(db);
    this.feedback = new FeedbackRepository(db);
  }

  async saveInitialRound(
    input: CompletedInitialRoundSnapshot,
  ): Promise<PersistedRoundReferences> {
    try {
      const persisted = this.rounds.persistFirstRound({
        userId: input.userId,
        sourceSurface: input.sourceSurface,
        sourceReading: input.sourceReading,
        round: input.round,
      });
      return persistedReferences(
        persisted.sessionId,
        persisted.roundId,
        persisted.candidateResultIds,
        input.round.candidates.map((candidate) => candidate.candidateKey),
      );
    } catch (cause) {
      if (cause instanceof ImmutableConfigConflictError) {
        throw new ConfigVersionConflictPersistenceError(cause);
      }
      throw cause;
    }
  }

  async saveRerollRound(
    input: CompletedRerollRoundSnapshot,
  ): Promise<PersistedRoundReferences> {
    try {
      const persisted = this.rounds.persistReroll({
        sessionId: input.sessionId,
        round: input.round,
      });
      return persistedReferences(
        persisted.sessionId,
        persisted.roundId,
        persisted.candidateResultIds,
        input.round.candidates.map((candidate) => candidate.candidateKey),
      );
    } catch (cause) {
      if (cause instanceof ImmutableConfigConflictError) {
        throw new ConfigVersionConflictPersistenceError(cause);
      }
      throw cause;
    }
  }

  async findSessionContext(input: {
    readonly userId: string;
    readonly sessionId: string;
  }): Promise<SessionContext | null> {
    const session = this.db
      .select()
      .from(generationSessions)
      .where(
        and(
          eq(generationSessions.id, input.sessionId),
          eq(generationSessions.userId, input.userId),
        ),
      )
      .get();
    if (session === undefined) {
      return null;
    }

    const rounds = this.db
      .select({ id: generationRounds.id, roundNumber: generationRounds.roundNumber })
      .from(generationRounds)
      .where(eq(generationRounds.sessionId, session.id))
      .orderBy(asc(generationRounds.roundNumber))
      .all();
    const priorRounds = rounds.map((round) => ({
      roundNumber: round.roundNumber,
      selectedCandidates: this.db
        .select({
          candidateKey: candidateResults.candidateKey,
          surface: candidateResults.surface,
          selectionRank: candidateResults.selectionRank,
        })
        .from(candidateResults)
        .where(
          and(
            eq(candidateResults.roundId, round.id),
            eq(candidateResults.selected, true),
          ),
        )
        .orderBy(asc(candidateResults.selectionRank))
        .all()
        .map((candidate) => {
          if (candidate.selectionRank === null) {
            throw new Error("Selected candidate has no selection rank");
          }
          return { ...candidate, selectionRank: candidate.selectionRank };
        }),
    }));

    return {
      sessionId: session.id,
      userId: session.userId,
      sourceSurface: session.sourceSurface,
      sourceReading: session.sourceReading,
      priorRounds,
    };
  }

  async getSessionView(input: {
    readonly userId: string;
    readonly sessionId: string;
  }): Promise<SessionView | null> {
    const context = await this.findSessionContext(input);
    if (context === null) {
      return null;
    }

    const roundRows = this.db
      .select({ id: generationRounds.id, roundNumber: generationRounds.roundNumber })
      .from(generationRounds)
      .where(eq(generationRounds.sessionId, context.sessionId))
      .orderBy(asc(generationRounds.roundNumber))
      .all();
    const rounds = roundRows.map((roundRow) => {
      const loaded = this.rounds.loadRound(roundRow.id);
      if (loaded === undefined) {
        throw new Error(`Persisted Round disappeared: ${roundRow.id}`);
      }
      const candidates = loaded.candidates
        .filter((candidate) => candidate.selected)
        .sort(
          (left, right) =>
            (left.selectionRank ?? Number.MAX_SAFE_INTEGER) -
            (right.selectionRank ?? Number.MAX_SAFE_INTEGER),
        )
        .map((candidate) => ({
          candidateResultId: candidate.id,
          candidateKey: candidate.candidateKey,
          surface: candidate.surface,
          reading: candidate.reading,
          sound: candidate.soundResult,
          semantic: candidate.semanticResult,
          selection: selectionFor(
            loaded.selectionResult.selected,
            candidate.candidateKey,
          ),
          feedback: {
            candidate:
              this.feedback.getCandidateFeedback(candidate.id)?.value ?? null,
            soundScore:
              this.feedback.getSoundScoreFeedback(candidate.id)?.value ?? null,
          },
        }));
      return {
        roundId: loaded.id,
        roundNumber: loaded.roundNumber,
        candidates,
      };
    });

    return {
      sessionId: context.sessionId,
      source: {
        surface: context.sourceSurface,
        reading: context.sourceReading,
      },
      rounds,
    };
  }

  async upsertCandidateFeedback(
    input: Parameters<FeedbackPersistencePort["upsertCandidateFeedback"]>[0],
  ): Promise<"saved" | "not_found"> {
    if (!this.ownsCandidate(input.userId, input.candidateResultId)) {
      return "not_found";
    }
    this.feedback.upsertCandidateFeedback(input.candidateResultId, input.value);
    return "saved";
  }

  async upsertSoundScoreFeedback(
    input: Parameters<FeedbackPersistencePort["upsertSoundScoreFeedback"]>[0],
  ): Promise<"saved" | "not_found"> {
    if (!this.ownsCandidate(input.userId, input.candidateResultId)) {
      return "not_found";
    }
    this.feedback.upsertSoundScoreFeedback(input.candidateResultId, input.value);
    return "saved";
  }

  private ownsCandidate(userId: string, candidateResultId: string): boolean {
    return (
      this.db
        .select({ id: candidateResults.id })
        .from(candidateResults)
        .innerJoin(
          generationRounds,
          eq(candidateResults.roundId, generationRounds.id),
        )
        .innerJoin(
          generationSessions,
          eq(generationRounds.sessionId, generationSessions.id),
        )
        .where(
          and(
            eq(candidateResults.id, candidateResultId),
            eq(generationSessions.userId, userId),
          ),
        )
        .get() !== undefined
    );
  }
}
