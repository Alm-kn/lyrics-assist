import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { asc, count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  EvaluateSemanticsResult,
  GenerateCandidatesResult,
} from "../../src/application/ports/llm-adapter";
import {
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_SOUND_SCORING_CONFIG,
  normalizeRhyme,
} from "../../src/domain";
import type {
  SelectionConfig,
  SelectionResult,
  SemanticResult,
  SoundScoreResult,
  SoundScoringConfig,
} from "../../src/domain";
import {
  candidateFeedback,
  candidateResults,
  ConfigRepository,
  FeedbackRepository,
  generationRounds,
  generationSessions,
  migratePersistenceDatabase,
  openPersistenceDatabase,
  RoundRepository,
  scoringConfigs,
  selectionConfigs,
  soundScoreFeedback,
  users,
} from "../../src/infrastructure/persistence";
import type {
  CompletedCandidateSnapshot,
  CompletedRoundSnapshot,
  PersistenceDatabaseConnection,
} from "../../src/infrastructure/persistence";

const MIGRATIONS_FOLDER = resolve("drizzle");

function soundResult(score: number): SoundScoreResult {
  return {
    finalScore: score,
    rawScore: score - 0.25,
    breakdown: {
      moraLengthScore: 100,
      positionMatchScore: 75.5,
      sequenceSimilarityScore: 70.25,
    },
    adjustments: [
      {
        ruleId: "ending-rhyme-bonus",
        scoreDelta: 5,
        reason: "Persistence fixture",
        commonSuffixLength: 1,
        suffixCoverage: 0.5,
        bonus: 5,
      },
    ],
    reason: "Persistence fixture",
    scoringConfigVersion: DEFAULT_SOUND_SCORING_CONFIG.version,
    normalizerVersion: "rhyme-v0.1",
  };
}

function semanticResult(surface: string, score: number): SemanticResult {
  return {
    word: surface,
    semanticScore: score,
    reason: `Semantic reason for ${surface}`,
    primaryRelation: "scene",
    secondaryRelations: ["visual"],
    semanticCluster: `cluster-${surface}`,
    modelIdentifier: "stub-semantic",
    semanticPromptVersion: "semantic-v0.1",
  };
}

function makeRound(
  roundNumber: number,
  candidateCount: number,
  selectedCount = Math.min(candidateCount, 10),
): CompletedRoundSnapshot {
  const generatedCandidates = Array.from(
    { length: candidateCount },
    (_, generationIndex) => ({
      candidateKey: `round-${roundNumber}-candidate-${generationIndex}`,
      surface: `候補-${roundNumber}-${generationIndex}`,
      ...(generationIndex % 2 === 0
        ? { readingHint: `ひんと-${generationIndex}` }
        : {}),
    }),
  );
  const semanticResults: EvaluateSemanticsResult["results"] =
    generatedCandidates.map((generated, index) => {
      const semantic = semanticResult(generated.surface, 60 + (index % 40));
      return {
        candidateKey: generated.candidateKey,
        score: semantic.semanticScore,
        reason: semantic.reason,
        primaryRelation: semantic.primaryRelation,
        secondaryRelations: semantic.secondaryRelations,
        semanticCluster: semantic.semanticCluster,
      };
    });
  const generationResult = {
    candidates: generatedCandidates,
    metadata: {
      modelIdentifier: "stub-generation",
      generationPromptVersion: "generation-v0.1",
    },
  } satisfies GenerateCandidatesResult;
  const semanticEvaluationResult = {
    results: semanticResults,
    metadata: {
      modelIdentifier: "stub-semantic",
      semanticPromptVersion: "semantic-v0.1",
    },
  } satisfies EvaluateSemanticsResult;
  const selected: SelectionResult["selected"] = generatedCandidates
    .slice(0, selectedCount)
    .map((generated, index) => ({
      candidateKey: generated.candidateKey,
      selectionCategory:
        index < 4 ? "balanced" : index < 7 ? "sound" : "semantic",
      selectionRank: index + 1,
      selectionScore: 90 - index * 0.5,
      selectionReason: "Persistence fixture",
    }));
  const selectionResult = {
    selected,
    selectionConfigVersion: DEFAULT_SELECTION_CONFIG.version,
    shortageEvents: [],
  } satisfies SelectionResult;
  const candidates: CompletedCandidateSnapshot[] = generatedCandidates.map(
    (generated, generationIndex) => ({
      candidateKey: generated.candidateKey,
      generationIndex,
      surface: generated.surface,
      readingResult: {
        surface: generated.surface,
        reading: "はし",
        morae: ["は", "し"],
        source: "manual",
      },
      rhymeRepresentation: normalizeRhyme("はし"),
      soundResult: soundResult(70 + (generationIndex % 30)),
      semanticResult: semanticResult(
        generated.surface,
        60 + (generationIndex % 40),
      ),
    }),
  );

  return {
    roundNumber,
    generationTargetCount: Math.max(candidateCount, 1),
    excludeTerms: roundNumber === 1 ? [] : ["既出語"],
    generationResult,
    candidateReadingResolutionResult: {
      results: generatedCandidates.map((generated) => ({
        requestKey: generated.candidateKey,
        status: "resolved" as const,
        reading: {
          surface: generated.surface,
          reading: "はな",
          morae: ["は", "な"],
          source: "manual" as const,
        },
      })),
      metadata: {
        resolverIdentifier: "stub",
        promptVersion: "reading-stub-v0.1",
        inferenceConfigVersion: "stub-v0.1",
        durationMs: 0,
      },
    },
    semanticEvaluationResult,
    sourceRhyme: normalizeRhyme("よる"),
    scoringConfig: DEFAULT_SOUND_SCORING_CONFIG,
    selectionConfig: DEFAULT_SELECTION_CONFIG,
    selectionResult,
    candidates,
    createdAt: 1_700_000_000_000 + roundNumber,
  };
}

function withConfigVersions(
  round: CompletedRoundSnapshot,
  scoringConfig: SoundScoringConfig,
  selectionConfig: SelectionConfig,
): CompletedRoundSnapshot {
  return {
    ...round,
    scoringConfig,
    selectionConfig,
    selectionResult: {
      ...round.selectionResult,
      selectionConfigVersion: selectionConfig.version,
    },
    candidates: round.candidates.map((candidate) => ({
      ...candidate,
      soundResult: {
        ...candidate.soundResult,
        scoringConfigVersion: scoringConfig.version,
      },
    })),
  };
}

function persistFirstRound(
  connection: PersistenceDatabaseConnection,
  round = makeRound(1, 2),
  overrides: Partial<{
    userId: string;
    sessionId: string;
    sourceSurface: string;
  }> = {},
) {
  return new RoundRepository(connection.db, () => 1_700_000_000_000).persistFirstRound({
    userId: overrides.userId,
    sessionId: overrides.sessionId,
    sourceSurface: overrides.sourceSurface ?? "夜",
    sourceReading: "よる",
    round,
  });
}

describe("M6 Persistence integration", () => {
  let connection: PersistenceDatabaseConnection;

  beforeEach(() => {
    connection = openPersistenceDatabase(":memory:");
    migratePersistenceDatabase(connection.db, MIGRATIONS_FOLDER);
  });

  afterEach(() => {
    connection.close();
  });

  it("applies the initial migration with exactly the eight M6 tables", () => {
    const tables = connection.client
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '__drizzle%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    const sessionIndexes = connection.client
      .prepare("PRAGMA index_list('generation_sessions')")
      .all();
    const candidateIndexes = connection.client
      .prepare("PRAGMA index_list('candidate_results')")
      .all();
    const candidateTableSql = connection.client
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'candidate_results'",
      )
      .get()?.sql;
    const sessionColumns = connection.client
      .prepare("PRAGMA table_info('generation_sessions')")
      .all()
      .map((column) => column.name);
    const roundColumns = connection.client
      .prepare("PRAGMA table_info('generation_rounds')")
      .all()
      .map((column) => column.name);

    expect(tables).toEqual([
      "candidate_feedback",
      "candidate_results",
      "generation_rounds",
      "generation_sessions",
      "scoring_configs",
      "selection_configs",
      "sound_score_feedback",
      "users",
    ]);
    expect(sessionIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "generation_sessions_user_id_created_at_idx",
        }),
      ]),
    );
    expect(candidateIndexes.filter((index) => index.unique === 1)).toHaveLength(4);
    expect(candidateTableSql).toContain(
      "candidate_results_selection_consistency_check",
    );
    expect(connection.client.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
    expect(sessionColumns).toContain("source_reading_resolution_json");
    expect(roundColumns).toContain(
      "candidate_reading_resolution_result_json",
    );
  });

  it("migrates legacy rows additively and leaves their provenance nullable", () => {
    const legacy = new DatabaseSync(":memory:");
    const readMigration = (folder: string) =>
      readFileSync(resolve("drizzle", folder, "migration.sql"), "utf8").replaceAll(
        "--> statement-breakpoint",
        "\n",
      );
    try {
      legacy.exec(readMigration("20260811180734_outgoing_christian_walker"));
      legacy.exec(`
        PRAGMA foreign_keys = ON;
        INSERT INTO users (id, created_at) VALUES ('legacy-user', 1);
        INSERT INTO scoring_configs (version, config_json, created_at)
          VALUES ('sound-v0.1', '{}', 1);
        INSERT INTO selection_configs (version, config_json, created_at)
          VALUES ('selection-v0.1', '{}', 1);
        INSERT INTO generation_sessions
          (id, user_id, source_surface, source_reading, created_at)
          VALUES ('legacy-session', 'legacy-user', '夜', 'よる', 1);
        INSERT INTO generation_rounds (
          id, session_id, round_number, generation_target_count,
          exclude_terms_json, generation_model_identifier,
          generation_prompt_version, generation_result_json,
          semantic_evaluation_result_json, normalizer_version,
          source_rhyme_json, scoring_config_version,
          selection_config_version, selection_result_json, created_at
        ) VALUES (
          'legacy-round', 'legacy-session', 1, 1,
          '[]', 'stub', 'generation-v0.1', '{}', '{}', 'rhyme-v0.1',
          '{}', 'sound-v0.1', 'selection-v0.1', '{}', 1
        );
      `);

      legacy.exec(readMigration("20260812090711_marvelous_the_hood"));

      expect(
        legacy
          .prepare(
            "SELECT source_surface, source_reading_resolution_json FROM generation_sessions WHERE id = ?",
          )
          .get("legacy-session"),
      ).toEqual({
        source_surface: "夜",
        source_reading_resolution_json: null,
      });
      expect(
        legacy
          .prepare(
            "SELECT round_number, candidate_reading_resolution_result_json FROM generation_rounds WHERE id = ?",
          )
          .get("legacy-round"),
      ).toEqual({
        round_number: 1,
        candidate_reading_resolution_result_json: null,
      });
      expect(legacy.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(legacy.prepare("PRAGMA integrity_check").get()).toEqual({
        integrity_check: "ok",
      });
    } finally {
      legacy.close();
    }
  });

  it("rejects missing parents and restricts deletion of referenced parents", () => {
    expect(() =>
      connection.db
        .insert(generationSessions)
        .values({
          id: "missing-parent-session",
          userId: "missing-user",
          sourceSurface: "夜",
          sourceReading: "よる",
          createdAt: 1,
        })
        .run(),
    ).toThrow();

    const persisted = persistFirstRound(connection);
    expect(() =>
      connection.db.delete(users).where(eq(users.id, persisted.userId!)).run(),
    ).toThrow();
  });

  it("stores multiple rounds per Session and rejects a duplicate round number", () => {
    const first = persistFirstRound(connection);
    const repository = new RoundRepository(connection.db);
    repository.persistReroll({ sessionId: first.sessionId, round: makeRound(2, 2) });

    expect(
      connection.db
        .select({ value: count() })
        .from(generationRounds)
        .where(eq(generationRounds.sessionId, first.sessionId))
        .get()?.value,
    ).toBe(2);
    expect(() =>
      repository.persistReroll({
        sessionId: first.sessionId,
        round: makeRound(2, 2),
      }),
    ).toThrow();
  });

  it("allows separate Sessions for the same User and source surface", () => {
    const first = persistFirstRound(connection, makeRound(1, 1), {
      userId: "owner",
      sessionId: "session-one",
    });
    persistFirstRound(connection, makeRound(1, 1), {
      userId: first.userId,
      sessionId: "session-two",
    });

    const sessions = connection.db
      .select()
      .from(generationSessions)
      .where(eq(generationSessions.userId, first.userId!))
      .all();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.sourceSurface)).toEqual([
      "夜",
      "夜",
    ]);
  });

  it("persists the entire evaluated pool including fifty unselected candidates", () => {
    const persisted = persistFirstRound(connection, makeRound(1, 60));
    const rows = connection.db
      .select()
      .from(candidateResults)
      .where(eq(candidateResults.roundId, persisted.roundId))
      .all();

    expect(rows).toHaveLength(60);
    expect(rows.filter((row) => row.selected)).toHaveLength(10);
    expect(rows.filter((row) => !row.selected)).toHaveLength(50);
  });

  it("enforces candidate key, generation index, and selected rank uniqueness", () => {
    const persisted = persistFirstRound(connection, makeRound(1, 2, 1));
    const rows = connection.db
      .select()
      .from(candidateResults)
      .where(eq(candidateResults.roundId, persisted.roundId))
      .all();
    const selectedRow = rows.find((row) => row.selected);
    const unselectedRow = rows.find((row) => !row.selected);
    expect(selectedRow).toBeDefined();
    expect(unselectedRow).toBeDefined();

    expect(() =>
      connection.db
        .insert(candidateResults)
        .values({
          ...unselectedRow!,
          id: "duplicate-key-id",
          generationIndex: 99,
          candidateKey: selectedRow!.candidateKey,
        })
        .run(),
    ).toThrow();
    expect(() =>
      connection.db
        .insert(candidateResults)
        .values({
          ...unselectedRow!,
          id: "duplicate-index-id",
          candidateKey: "unique-key",
          generationIndex: selectedRow!.generationIndex,
        })
        .run(),
    ).toThrow();
    expect(() =>
      connection.db
        .insert(candidateResults)
        .values({
          ...selectedRow!,
          id: "duplicate-rank-id",
          candidateKey: "unique-rank-key",
          generationIndex: 98,
        })
        .run(),
    ).toThrow();
  });

  it("does not collapse candidates merely because their readings match", () => {
    const persisted = persistFirstRound(connection, makeRound(1, 2));
    const rows = connection.db
      .select({ surface: candidateResults.surface, reading: candidateResults.reading })
      .from(candidateResults)
      .where(eq(candidateResults.roundId, persisted.roundId))
      .all();

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.surface)).size).toBe(2);
    expect(new Set(rows.map((row) => row.reading))).toEqual(new Set(["はし"]));
  });

  it("enforces all selected-state CHECK combinations in SQLite", () => {
    const persisted = persistFirstRound(connection, makeRound(1, 1, 0));
    const base = connection.db
      .select()
      .from(candidateResults)
      .where(eq(candidateResults.roundId, persisted.roundId))
      .get()!;
    const insertInvalid = (
      id: string,
      values: Partial<typeof candidateResults.$inferInsert>,
    ) =>
      connection.db
        .insert(candidateResults)
        .values({
          ...base,
          id,
          candidateKey: id,
          generationIndex: base.generationIndex + id.length,
          ...values,
        })
        .run();

    expect(() =>
      insertInvalid("invalid-unselected-category", {
        selected: false,
        selectionCategory: "balanced",
      }),
    ).toThrow();
    expect(() =>
      insertInvalid("invalid-selected-no-category", {
        selected: true,
        selectionCategory: null,
        selectionScore: 1,
        selectionRank: 2,
      }),
    ).toThrow();
    expect(() =>
      insertInvalid("invalid-fallback-no-strategy", {
        selected: true,
        selectionCategory: "fallback",
        fallbackStrategy: null,
        selectionScore: 1,
        selectionRank: 2,
      }),
    ).toThrow();
    expect(() =>
      insertInvalid("invalid-primary-with-strategy", {
        selected: true,
        selectionCategory: "sound",
        fallbackStrategy: "sound",
        selectionScore: 1,
        selectionRank: 2,
      }),
    ).toThrow();
  });

  it("persists fallback strategy only for fallback selections", () => {
    const base = makeRound(1, 1, 0);
    const selectedCandidate = base.candidates[0]!;
    const round: CompletedRoundSnapshot = {
      ...base,
      selectionResult: {
        ...base.selectionResult,
        selected: [
          {
            candidateKey: selectedCandidate.candidateKey,
            selectionCategory: "fallback",
            fallbackStrategy: "balanced",
            selectionRank: 1,
            selectionScore: 72.5,
            selectionReason: "Persistence fallback fixture",
          },
        ],
      },
    };
    const persisted = persistFirstRound(connection, round);
    const row = connection.db
      .select()
      .from(candidateResults)
      .where(eq(candidateResults.roundId, persisted.roundId))
      .get();

    expect(row).toMatchObject({
      selected: true,
      selectionCategory: "fallback",
      fallbackStrategy: "balanced",
      selectionRank: 1,
      selectionScore: 72.5,
    });
  });

  it("upserts both feedback types as current state while retaining createdAt", () => {
    const persisted = persistFirstRound(connection, makeRound(1, 2));
    const candidateIds = Object.values(persisted.candidateResultIds);
    let now = 100;
    const repository = new FeedbackRepository(connection.db, () => now);

    repository.upsertCandidateFeedback(candidateIds[0]!, "like");
    now = 200;
    repository.upsertCandidateFeedback(candidateIds[0]!, "dislike");
    repository.upsertSoundScoreFeedback(candidateIds[1]!, "low");
    now = 300;
    repository.upsertSoundScoreFeedback(candidateIds[1]!, "valid");

    expect(repository.getCandidateFeedback(candidateIds[0]!)).toMatchObject({
      value: "dislike",
      createdAt: 100,
      updatedAt: 200,
    });
    expect(repository.getSoundScoreFeedback(candidateIds[1]!)).toMatchObject({
      value: "valid",
      createdAt: 200,
      updatedAt: 300,
    });
    expect(connection.db.select({ value: count() }).from(candidateFeedback).get()?.value).toBe(1);
    expect(connection.db.select({ value: count() }).from(soundScoreFeedback).get()?.value).toBe(1);
    expect(() =>
      connection.client
        .prepare("UPDATE candidate_feedback SET value = 'maybe'")
        .run(),
    ).toThrow();
    expect(() =>
      connection.client
        .prepare("UPDATE sound_score_feedback SET value = 'maybe'")
        .run(),
    ).toThrow();
  });

  it("reuses canonical-equivalent configs and rejects changed content for a version", () => {
    const repository = new ConfigRepository(connection.db, () => 123);
    const reorderedScoring: SoundScoringConfig = {
      endingBonus: DEFAULT_SOUND_SCORING_CONFIG.endingBonus,
      moraLength: DEFAULT_SOUND_SCORING_CONFIG.moraLength,
      weights: DEFAULT_SOUND_SCORING_CONFIG.weights,
      version: DEFAULT_SOUND_SCORING_CONFIG.version,
    };
    const reorderedSelection: SelectionConfig = {
      fallbackPriority: DEFAULT_SELECTION_CONFIG.fallbackPriority,
      semantic: DEFAULT_SELECTION_CONFIG.semantic,
      balanced: DEFAULT_SELECTION_CONFIG.balanced,
      targetCounts: DEFAULT_SELECTION_CONFIG.targetCounts,
      targetTotal: DEFAULT_SELECTION_CONFIG.targetTotal,
      version: DEFAULT_SELECTION_CONFIG.version,
    };

    repository.ensureScoring(DEFAULT_SOUND_SCORING_CONFIG);
    repository.ensureScoring(reorderedScoring);
    repository.ensureSelection(DEFAULT_SELECTION_CONFIG);
    repository.ensureSelection(reorderedSelection);

    expect(connection.db.select({ value: count() }).from(scoringConfigs).get()?.value).toBe(1);
    expect(connection.db.select({ value: count() }).from(selectionConfigs).get()?.value).toBe(1);
    expect(repository.getScoring(DEFAULT_SOUND_SCORING_CONFIG.version)).toEqual(
      DEFAULT_SOUND_SCORING_CONFIG,
    );
    expect(() =>
      repository.ensureScoring({
        ...DEFAULT_SOUND_SCORING_CONFIG,
        endingBonus: { ...DEFAULT_SOUND_SCORING_CONFIG.endingBonus, maxPoints: 9 },
      }),
    ).toThrow(/different content/);
    expect(() =>
      repository.ensureSelection({
        ...DEFAULT_SELECTION_CONFIG,
        targetTotal: 9,
      }),
    ).toThrow(/different content/);
  });

  it("restricts deletion of configs used by a Round", () => {
    persistFirstRound(connection);

    expect(() =>
      connection.db
        .delete(scoringConfigs)
        .where(eq(scoringConfigs.version, DEFAULT_SOUND_SCORING_CONFIG.version))
        .run(),
    ).toThrow();
    expect(() =>
      connection.db
        .delete(selectionConfigs)
        .where(eq(selectionConfigs.version, DEFAULT_SELECTION_CONFIG.version))
        .run(),
    ).toThrow();
  });

  it("ensures newly versioned configs when persisting a reroll", () => {
    const first = persistFirstRound(connection, makeRound(1, 2));
    const scoringConfig = {
      ...DEFAULT_SOUND_SCORING_CONFIG,
      version: "sound-v0.2-reroll",
      endingBonus: {
        ...DEFAULT_SOUND_SCORING_CONFIG.endingBonus,
        maxPoints: 8,
      },
    } satisfies SoundScoringConfig;
    const selectionConfig = {
      ...DEFAULT_SELECTION_CONFIG,
      version: "selection-v0.2-reroll",
      balanced: {
        ...DEFAULT_SELECTION_CONFIG.balanced,
        maximumPerSemanticCluster: 3,
      },
    } satisfies SelectionConfig;
    const repository = new RoundRepository(connection.db, () => 200);

    const persisted = repository.persistReroll({
      sessionId: first.sessionId,
      round: withConfigVersions(makeRound(2, 2), scoringConfig, selectionConfig),
    });
    const roundRow = connection.db
      .select()
      .from(generationRounds)
      .where(eq(generationRounds.id, persisted.roundId))
      .get();
    const configs = new ConfigRepository(connection.db);

    expect(roundRow).toMatchObject({
      scoringConfigVersion: scoringConfig.version,
      selectionConfigVersion: selectionConfig.version,
    });
    expect(configs.getScoring(scoringConfig.version)).toEqual(scoringConfig);
    expect(configs.getSelection(selectionConfig.version)).toEqual(selectionConfig);
    expect(connection.db.select({ value: count() }).from(scoringConfigs).get()?.value).toBe(2);
    expect(connection.db.select({ value: count() }).from(selectionConfigs).get()?.value).toBe(2);

    expect(() =>
      repository.persistReroll({
        sessionId: first.sessionId,
        round: withConfigVersions(
          makeRound(3, 1),
          {
            ...scoringConfig,
            endingBonus: { ...scoringConfig.endingBonus, maxPoints: 7 },
          },
          selectionConfig,
        ),
      }),
    ).toThrow(/different content/);
    expect(connection.db.select({ value: count() }).from(generationRounds).get()?.value).toBe(2);
  });

  it("stores selection ranks as one-based Selection Result order", () => {
    const persisted = persistFirstRound(connection, makeRound(1, 3, 3));
    const ranks = connection.db
      .select({ selectionRank: candidateResults.selectionRank })
      .from(candidateResults)
      .where(eq(candidateResults.roundId, persisted.roundId))
      .orderBy(asc(candidateResults.selectionRank))
      .all()
      .map(({ selectionRank }) => selectionRank);

    expect(ranks).toEqual([1, 2, 3]);
  });

  it("stores generation indexes as zero-based raw Generation Result positions", () => {
    const base = makeRound(1, 3, 0);
    const round = {
      ...base,
      candidates: [base.candidates[0]!, base.candidates[2]!],
    } satisfies CompletedRoundSnapshot;
    const persisted = persistFirstRound(connection, round);
    const rows = connection.db
      .select({
        candidateKey: candidateResults.candidateKey,
        generationIndex: candidateResults.generationIndex,
      })
      .from(candidateResults)
      .where(eq(candidateResults.roundId, persisted.roundId))
      .orderBy(asc(candidateResults.generationIndex))
      .all();

    expect(rows).toEqual([
      {
        candidateKey: base.generationResult.candidates[0]!.candidateKey,
        generationIndex: 0,
      },
      {
        candidateKey: base.generationResult.candidates[2]!.candidateKey,
        generationIndex: 2,
      },
    ]);
  });

  it("rolls back a first Round completely after a later Candidate insert fails", () => {
    const ids = ["user", "session", "round", "candidate-id", "candidate-id"];
    const repository = new RoundRepository(
      connection.db,
      () => 100,
      () => ids.shift() ?? "unexpected-id",
    );

    expect(() =>
      repository.persistFirstRound({
        sourceSurface: "夜",
        sourceReading: "よる",
        round: makeRound(1, 2),
      }),
    ).toThrow();

    expect(connection.db.select({ value: count() }).from(users).get()?.value).toBe(0);
    expect(connection.db.select({ value: count() }).from(generationSessions).get()?.value).toBe(0);
    expect(connection.db.select({ value: count() }).from(generationRounds).get()?.value).toBe(0);
    expect(connection.db.select({ value: count() }).from(candidateResults).get()?.value).toBe(0);
    expect(connection.db.select({ value: count() }).from(scoringConfigs).get()?.value).toBe(0);
  });

  it("rolls back only the failed reroll and leaves the previous Round unchanged", () => {
    const first = persistFirstRound(connection, makeRound(1, 2));
    const scoringConfig = {
      ...DEFAULT_SOUND_SCORING_CONFIG,
      version: "sound-v0.2-rollback",
    } satisfies SoundScoringConfig;
    const selectionConfig = {
      ...DEFAULT_SELECTION_CONFIG,
      version: "selection-v0.2-rollback",
    } satisfies SelectionConfig;
    const ids = ["round-two", "duplicate-candidate", "duplicate-candidate"];
    const repository = new RoundRepository(
      connection.db,
      () => 200,
      () => ids.shift() ?? "unexpected-id",
    );

    expect(() =>
      repository.persistReroll({
        sessionId: first.sessionId,
        round: withConfigVersions(makeRound(2, 2), scoringConfig, selectionConfig),
      }),
    ).toThrow();
    expect(connection.db.select({ value: count() }).from(generationRounds).get()?.value).toBe(1);
    expect(connection.db.select({ value: count() }).from(candidateResults).get()?.value).toBe(2);
    expect(
      connection.db
        .select()
        .from(scoringConfigs)
        .where(eq(scoringConfigs.version, scoringConfig.version))
        .get(),
    ).toBeUndefined();
    expect(
      connection.db
        .select()
        .from(selectionConfigs)
        .where(eq(selectionConfigs.version, selectionConfig.version))
        .get(),
    ).toBeUndefined();
  });

  it("round-trips raw snapshots and preserves analytical projections", () => {
    const base = makeRound(1, 2, 1);
    const generationResult = {
      ...base.generationResult,
      candidates: [
        ...base.generationResult.candidates,
        { candidateKey: "raw-duplicate", surface: "重複A" },
        { candidateKey: "raw-duplicate", surface: "重複B" },
      ],
    } satisfies GenerateCandidatesResult;
    const semanticEvaluationResult = {
      ...base.semanticEvaluationResult,
      results: [
        ...base.semanticEvaluationResult.results,
        {
          candidateKey: "raw-duplicate",
          score: 10,
          reason: "raw only",
          primaryRelation: "unknown",
          secondaryRelations: [],
          semanticCluster: "raw",
        },
        {
          candidateKey: "raw-duplicate",
          score: 20,
          reason: "raw only duplicate",
          primaryRelation: "unknown",
          secondaryRelations: [],
          semanticCluster: "raw",
        },
      ],
    } satisfies EvaluateSemanticsResult;
    const round = { ...base, generationResult, semanticEvaluationResult };
    const persisted = persistFirstRound(connection, round);
    const loaded = new RoundRepository(connection.db).loadRound(persisted.roundId);

    expect(loaded?.generationResult).toEqual(generationResult);
    expect(loaded?.semanticEvaluationResult).toEqual(semanticEvaluationResult);
    expect(loaded?.sourceRhyme).toEqual(round.sourceRhyme);
    expect(loaded?.selectionResult).toEqual(round.selectionResult);
    expect(loaded?.candidates).toHaveLength(2);
    expect(loaded?.candidates[0]?.readingResult).toEqual(
      round.candidates[0]?.readingResult,
    );
    expect(loaded?.candidates[0]?.rhymeRepresentation).toEqual(
      round.candidates[0]?.rhymeRepresentation,
    );
    expect(loaded?.candidates[0]?.soundResult).toEqual(
      round.candidates[0]?.soundResult,
    );
    expect(loaded?.candidates[0]?.semanticResult).toEqual(
      round.candidates[0]?.semanticResult,
    );
    expect(loaded?.candidates[0]?.analyticalProjection).toEqual({
      soundFinalScore: round.candidates[0]?.soundResult.finalScore,
      soundRawScore: round.candidates[0]?.soundResult.rawScore,
      moraLengthScore:
        round.candidates[0]?.soundResult.breakdown.moraLengthScore,
      positionMatchScore:
        round.candidates[0]?.soundResult.breakdown.positionMatchScore,
      sequenceSimilarityScore:
        round.candidates[0]?.soundResult.breakdown.sequenceSimilarityScore,
      commonSuffixLength:
        round.candidates[0]?.soundResult.adjustments[0]?.commonSuffixLength,
      suffixCoverage:
        round.candidates[0]?.soundResult.adjustments[0]?.suffixCoverage,
      endingBonus: round.candidates[0]?.soundResult.adjustments[0]?.bonus,
      semanticScore: round.candidates[0]?.semanticResult.semanticScore,
    });
  });
});
