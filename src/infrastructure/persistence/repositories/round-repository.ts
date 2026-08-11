import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import type {
  EvaluateSemanticsResult,
  GenerateCandidatesResult,
} from "../../../application/ports/llm-adapter";
import type {
  ReadingResult,
  RhymeRepresentations,
  SelectionResult,
  SemanticResult,
  SoundScoreResult,
} from "../../../domain";
import type { PersistenceDatabase } from "../database";
import { parseJsonSnapshot } from "../json";
import { mapCompletedRoundSnapshot } from "../mappers/round-mapper";
import {
  candidateResults,
  generationRounds,
  generationSessions,
  users,
} from "../schema";
import type {
  FirstRoundPersistenceInput,
  LoadedCandidateSnapshot,
  LoadedRoundSnapshot,
  PersistedRoundIds,
  RerollPersistenceInput,
} from "../types";
import {
  ensureScoringConfig,
  ensureSelectionConfig,
} from "./config-repository";

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
}

export class RoundRepository {
  constructor(
    private readonly db: PersistenceDatabase,
    private readonly clock: () => number = Date.now,
    private readonly generateId: () => string = randomUUID,
  ) {}

  persistFirstRound(input: FirstRoundPersistenceInput): PersistedRoundIds {
    assertNonEmpty(input.sourceSurface, "sourceSurface");
    assertNonEmpty(input.sourceReading, "sourceReading");

    if (input.round.roundNumber !== 1) {
      throw new Error("persistFirstRound requires roundNumber 1");
    }

    if (input.round.sourceRhyme.rawReading.reading !== input.sourceReading) {
      throw new Error("Session sourceReading differs from source rhyme snapshot");
    }

    const timestamp = input.createdAt ?? this.clock();
    const userId = input.userId ?? this.generateId();
    const sessionId = input.sessionId ?? this.generateId();
    const roundId = this.generateId();
    const mapped = mapCompletedRoundSnapshot(
      roundId,
      sessionId,
      input.round,
      input.round.createdAt ?? timestamp,
      this.generateId,
    );

    this.db.transaction((transaction) => {
      ensureScoringConfig(
        transaction,
        input.round.scoringConfig,
        mapped.round.createdAt,
      );
      ensureSelectionConfig(
        transaction,
        input.round.selectionConfig,
        mapped.round.createdAt,
      );

      const existingUser = transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .get();

      if (existingUser === undefined) {
        transaction.insert(users).values({ id: userId, createdAt: timestamp }).run();
      }

      transaction
        .insert(generationSessions)
        .values({
          id: sessionId,
          userId,
          sourceSurface: input.sourceSurface,
          sourceReading: input.sourceReading,
          createdAt: timestamp,
        })
        .run();

      this.insertMappedRound(transaction, mapped);
    });

    return {
      userId,
      sessionId,
      roundId,
      candidateResultIds: mapped.candidateResultIds,
    };
  }

  persistReroll(input: RerollPersistenceInput): PersistedRoundIds {
    assertNonEmpty(input.sessionId, "sessionId");
    const timestamp = input.round.createdAt ?? this.clock();
    const roundId = this.generateId();
    const mapped = mapCompletedRoundSnapshot(
      roundId,
      input.sessionId,
      input.round,
      timestamp,
      this.generateId,
    );

    this.db.transaction((transaction) => {
      const session = transaction
        .select({ sourceReading: generationSessions.sourceReading })
        .from(generationSessions)
        .where(eq(generationSessions.id, input.sessionId))
        .get();

      if (session === undefined) {
        throw new Error(`GenerationSession does not exist: ${input.sessionId}`);
      }

      if (session.sourceReading !== input.round.sourceRhyme.rawReading.reading) {
        throw new Error("Reroll source rhyme differs from the saved Session reading");
      }

      ensureScoringConfig(
        transaction,
        input.round.scoringConfig,
        mapped.round.createdAt,
      );
      ensureSelectionConfig(
        transaction,
        input.round.selectionConfig,
        mapped.round.createdAt,
      );
      this.insertMappedRound(transaction, mapped);
    });

    return {
      sessionId: input.sessionId,
      roundId,
      candidateResultIds: mapped.candidateResultIds,
    };
  }

  loadRound(roundId: string): LoadedRoundSnapshot | undefined {
    const round = this.db
      .select()
      .from(generationRounds)
      .where(eq(generationRounds.id, roundId))
      .get();

    if (round === undefined) {
      return undefined;
    }

    const candidates: LoadedCandidateSnapshot[] = this.db
      .select()
      .from(candidateResults)
      .where(eq(candidateResults.roundId, roundId))
      .orderBy(asc(candidateResults.generationIndex))
      .all()
      .map((candidate) => ({
        id: candidate.id,
        candidateKey: candidate.candidateKey,
        generationIndex: candidate.generationIndex,
        surface: candidate.surface,
        generationReadingHint: candidate.generationReadingHint,
        reading: candidate.reading,
        readingResult: parseJsonSnapshot<ReadingResult>(
          candidate.readingResultJson,
          "readingResultJson",
        ),
        rhymeRepresentation: parseJsonSnapshot<RhymeRepresentations>(
          candidate.rhymeRepresentationJson,
          "rhymeRepresentationJson",
        ),
        soundResult: parseJsonSnapshot<SoundScoreResult>(
          candidate.soundResultJson,
          "soundResultJson",
        ),
        semanticResult: parseJsonSnapshot<SemanticResult>(
          candidate.semanticResultJson,
          "semanticResultJson",
        ),
        selected: candidate.selected,
        selectionCategory: candidate.selectionCategory,
        fallbackStrategy: candidate.fallbackStrategy,
        selectionScore: candidate.selectionScore,
        selectionRank: candidate.selectionRank,
        analyticalProjection: {
          soundFinalScore: candidate.soundFinalScore,
          soundRawScore: candidate.soundRawScore,
          moraLengthScore: candidate.moraLengthScore,
          positionMatchScore: candidate.positionMatchScore,
          sequenceSimilarityScore: candidate.sequenceSimilarityScore,
          commonSuffixLength: candidate.commonSuffixLength,
          suffixCoverage: candidate.suffixCoverage,
          endingBonus: candidate.endingBonus,
          semanticScore: candidate.semanticScore,
        },
      }));

    return {
      id: round.id,
      sessionId: round.sessionId,
      roundNumber: round.roundNumber,
      generationTargetCount: round.generationTargetCount,
      excludeTerms: parseJsonSnapshot<readonly string[]>(
        round.excludeTermsJson,
        "excludeTermsJson",
      ),
      generationResult: parseJsonSnapshot<GenerateCandidatesResult>(
        round.generationResultJson,
        "generationResultJson",
      ),
      semanticEvaluationResult:
        parseJsonSnapshot<EvaluateSemanticsResult>(
          round.semanticEvaluationResultJson,
          "semanticEvaluationResultJson",
        ),
      sourceRhyme: parseJsonSnapshot<RhymeRepresentations>(
        round.sourceRhymeJson,
        "sourceRhymeJson",
      ),
      selectionResult: parseJsonSnapshot<SelectionResult>(
        round.selectionResultJson,
        "selectionResultJson",
      ),
      normalizerVersion: round.normalizerVersion,
      scoringConfigVersion: round.scoringConfigVersion,
      selectionConfigVersion: round.selectionConfigVersion,
      candidates,
    };
  }

  private insertMappedRound(
    transaction: Parameters<Parameters<PersistenceDatabase["transaction"]>[0]>[0],
    mapped: ReturnType<typeof mapCompletedRoundSnapshot>,
  ): void {
    transaction.insert(generationRounds).values(mapped.round).run();

    for (const candidate of mapped.candidates) {
      transaction.insert(candidateResults).values(candidate).run();
    }
  }
}
