import { resolve } from "node:path";

import { count } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ApplicationError,
  FeedbackService,
  GenerationService,
  RerollService,
  SessionQueryService,
} from "../../src/application";
import type {
  EvaluateSemanticsRequest,
  EvaluateSemanticsResult,
  GenerateCandidatesRequest,
  GenerateCandidatesResult,
  LlmAdapter,
  ReadingResolver,
  ResolveReadingRequest,
  RoundPersistencePort,
} from "../../src/application";
import {
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_SOUND_SCORING_CONFIG,
} from "../../src/domain";
import type {
  ReadingResult,
  SelectionConfig,
  SoundScoringConfig,
} from "../../src/domain";
import { StubLlmAdapter } from "../../src/infrastructure/llm/stub-llm-adapter";
import {
  candidateFeedback,
  candidateResults,
  generationRounds,
  generationSessions,
  migratePersistenceDatabase,
  openPersistenceDatabase,
  RoundRepository,
  scoringConfigs,
  selectionConfigs,
  soundScoreFeedback,
  SqliteApplicationPersistence,
} from "../../src/infrastructure/persistence";
import type { PersistenceDatabaseConnection } from "../../src/infrastructure/persistence";
import { StubReadingResolver } from "../../src/infrastructure/reading/stub-reading-resolver";

const MIGRATIONS_FOLDER = resolve("drizzle");

function reading(surface: string, value: string): ReadingResult {
  return {
    surface,
    reading: value,
    morae: Array.from(value),
    source: "manual",
  };
}

function generationResult(
  candidates: GenerateCandidatesResult["candidates"],
): GenerateCandidatesResult {
  return {
    candidates,
    metadata: {
      modelIdentifier: "stub-generation",
      generationPromptVersion: "generation-v0.1",
    },
  };
}

function semanticResult(
  candidates: readonly { readonly candidateKey: string; readonly surface: string }[],
): EvaluateSemanticsResult {
  return {
    results: candidates.map((candidate, index) => ({
      candidateKey: candidate.candidateKey,
      score: 80 - index,
      reason: `reason-${candidate.surface}`,
      primaryRelation: `relation-${index}`,
      secondaryRelations: [`secondary-${index}`],
      semanticCluster: `cluster-${index}`,
    })),
    metadata: {
      modelIdentifier: "stub-semantic",
      semanticPromptVersion: "semantic-v0.1",
    },
  };
}

class RecordingLlmAdapter implements LlmAdapter {
  readonly generationRequests: GenerateCandidatesRequest[] = [];
  readonly semanticRequests: EvaluateSemanticsRequest[] = [];
  generationFailure?: Error;
  semanticFailure?: Error;

  constructor(
    public generationFixture: GenerateCandidatesResult,
    public semanticFixture: EvaluateSemanticsResult,
  ) {}

  async generateCandidates(
    request: GenerateCandidatesRequest,
  ): Promise<GenerateCandidatesResult> {
    this.generationRequests.push(request);
    if (this.generationFailure !== undefined) {
      throw this.generationFailure;
    }
    return this.generationFixture;
  }

  async evaluateSemantics(
    request: EvaluateSemanticsRequest,
  ): Promise<EvaluateSemanticsResult> {
    this.semanticRequests.push(request);
    if (this.semanticFailure !== undefined) {
      throw this.semanticFailure;
    }
    return this.semanticFixture;
  }
}

class RecordingReadingResolver implements ReadingResolver {
  readonly requests: ResolveReadingRequest[] = [];
  failingSurface?: string;

  constructor(private readonly delegate: ReadingResolver) {}

  async resolve(request: ResolveReadingRequest) {
    this.requests.push(request);
    if (request.surface === this.failingSurface) {
      throw new Error("reading provider failed");
    }
    return this.delegate.resolve(request);
  }
}

function expectApplicationError(
  promise: Promise<unknown>,
  code: ApplicationError["code"],
) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("M7 Application services integration", () => {
  let connection: PersistenceDatabaseConnection;
  let persistence: SqliteApplicationPersistence;

  beforeEach(() => {
    connection = openPersistenceDatabase(":memory:");
    migratePersistenceDatabase(connection.db, MIGRATIONS_FOLDER);
    persistence = new SqliteApplicationPersistence(connection.db);
  });

  afterEach(() => {
    connection.close();
  });

  it("resolves deterministic Reading fixtures and leaves hints unconfirmed", async () => {
    const fixture = reading("光", "ひかり");
    const resolver = new StubReadingResolver([fixture]);

    await expect(
      resolver.resolve({ surface: "光", readingHint: "wrong-hint" }),
    ).resolves.toEqual({ status: "resolved", reading: fixture });
    await expect(resolver.resolve({ surface: "未知" })).resolves.toEqual({
      status: "unresolved",
    });
    await expect(resolver.resolve({ surface: "未知" })).resolves.toEqual({
      status: "unresolved",
    });
  });

  it("runs the initial pipeline with real Domain modules and persists the full pool", async () => {
    const generated = [
      { candidateKey: "light", surface: "光", readingHint: "ひかり" },
      { candidateKey: "dark", surface: "闇" },
      { candidateKey: "star", surface: "星" },
    ];
    const llm = new StubLlmAdapter({
      generationResult: generationResult(generated),
      semanticResult: semanticResult(generated),
    });
    const resolver = new StubReadingResolver([
      reading("夜", "よる"),
      reading("光", "ひかり"),
      reading("闇", "やみ"),
      reading("星", "ほし"),
    ]);
    const result = await new GenerationService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });
    const loaded = new RoundRepository(connection.db).loadRound(result.roundId);

    expect(result.roundNumber).toBe(1);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.every((candidate) => candidate.candidateResultId.length > 0)).toBe(
      true,
    );
    expect(loaded?.generationTargetCount).toBe(60);
    expect(loaded?.candidates).toHaveLength(3);
    expect(loaded?.generationResult).toEqual(generationResult(generated));
    expect(loaded?.semanticEvaluationResult).toEqual(semanticResult(generated));
    expect(
      result.candidates.map((candidate) => candidate.candidateResultId),
    ).toEqual(
      loaded?.candidates
        .filter((candidate) => candidate.selected)
        .sort((left, right) => left.selectionRank! - right.selectionRank!)
        .map((candidate) => candidate.id),
    );
  });

  it("passes targetCount 60 and a meaning-only Semantic request", async () => {
    const generated = [{ candidateKey: "light", surface: "光" }];
    const llm = new RecordingLlmAdapter(
      generationResult(generated),
      semanticResult(generated),
    );
    await new GenerationService({
      readingResolver: new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
      ]),
      llmAdapter: llm,
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });

    expect(llm.generationRequests).toEqual([
      {
        source: { surface: "夜", reading: "よる" },
        targetCount: 60,
        excludeTerms: [],
      },
    ]);
    expect(llm.semanticRequests).toEqual([
      {
        source: { surface: "夜" },
        candidates: [{ candidateKey: "light", surface: "光" }],
      },
    ]);
  });

  it("stops before generation when source reading is unresolved or fails", async () => {
    const llm = new RecordingLlmAdapter(generationResult([]), semanticResult([]));
    const unresolved = new GenerationService({
      readingResolver: new StubReadingResolver([]),
      llmAdapter: llm,
      roundPersistence: persistence,
    });
    await expectApplicationError(
      unresolved.generateInitialRound({ userId: "owner", sourceSurface: "夜" }),
      "SOURCE_READING_UNRESOLVED",
    );

    const resolver = new RecordingReadingResolver(
      new StubReadingResolver([reading("夜", "よる")]),
    );
    resolver.failingSurface = "夜";
    const failed = new GenerationService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
    });
    await expectApplicationError(
      failed.generateInitialRound({ userId: "owner", sourceSurface: "夜" }),
      "READING_RESOLVER_FAILED",
    );

    expect(llm.generationRequests).toHaveLength(0);
    expect(connection.db.select({ value: count() }).from(generationSessions).get()?.value).toBe(0);
  });

  it("rejects empty Application input without HTTP concerns", async () => {
    const service = new GenerationService({
      readingResolver: new StubReadingResolver([]),
      llmAdapter: new StubLlmAdapter({
        generationResult: generationResult([]),
        semanticResult: semanticResult([]),
      }),
      roundPersistence: persistence,
    });

    await expectApplicationError(
      service.generateInitialRound({ userId: "", sourceSurface: "夜" }),
      "INVALID_INPUT",
    );
    await expectApplicationError(
      service.generateInitialRound({ userId: "owner", sourceSurface: "   " }),
      "INVALID_INPUT",
    );
  });

  it("filters ambiguous/unresolved candidates and reconciles Semantic keys safely", async () => {
    const generated = [
      { candidateKey: "duplicate", surface: "光" },
      { candidateKey: "duplicate", surface: "闇" },
      { candidateKey: "semantic-duplicate", surface: "星" },
      { candidateKey: "unresolved", surface: "月" },
      { candidateKey: "missing", surface: "空" },
      { candidateKey: "valid", surface: "風", readingHint: "かぜ" },
    ];
    const rawSemantic: EvaluateSemanticsResult = {
      ...semanticResult([]),
      results: [
        ...semanticResult([
          { candidateKey: "semantic-duplicate", surface: "星" },
        ]).results,
        ...semanticResult([
          { candidateKey: "semantic-duplicate", surface: "星" },
        ]).results,
        ...semanticResult([{ candidateKey: "valid", surface: "風" }]).results,
        ...semanticResult([{ candidateKey: "unknown", surface: "未知" }]).results,
      ],
    };
    const llm = new RecordingLlmAdapter(generationResult(generated), rawSemantic);
    const resolver = new RecordingReadingResolver(
      new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
        reading("闇", "やみ"),
        reading("星", "ほし"),
        reading("空", "そら"),
        reading("風", "かぜ"),
      ]),
    );
    const result = await new GenerationService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });
    const loaded = new RoundRepository(connection.db).loadRound(result.roundId);

    expect(llm.semanticRequests[0]?.candidates.map((item) => item.candidateKey)).toEqual([
      "semantic-duplicate",
      "missing",
      "valid",
    ]);
    expect(result.candidates.map((candidate) => candidate.candidateKey)).toEqual(["valid"]);
    expect(loaded?.candidates.map((candidate) => candidate.candidateKey)).toEqual(["valid"]);
    expect(loaded?.generationResult.candidates).toHaveLength(6);
    expect(loaded?.semanticEvaluationResult).toEqual(rawSemantic);
    expect(resolver.requests).toContainEqual({
      surface: "風",
      readingHint: "かぜ",
    });
    expect(llm.semanticRequests[0]).toEqual({
      source: { surface: "夜" },
      candidates: [
        { candidateKey: "semantic-duplicate", surface: "星" },
        { candidateKey: "missing", surface: "空" },
        { candidateKey: "valid", surface: "風" },
      ],
    });
  });

  it("fails the whole Round for candidate Resolver, generation, or semantic system failure", async () => {
    const generated = [{ candidateKey: "light", surface: "光" }];
    const llm = new RecordingLlmAdapter(
      generationResult(generated),
      semanticResult(generated),
    );
    const resolver = new RecordingReadingResolver(
      new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
      ]),
    );
    resolver.failingSurface = "光";
    const service = () =>
      new GenerationService({
        readingResolver: resolver,
        llmAdapter: llm,
        roundPersistence: persistence,
      }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });

    await expectApplicationError(service(), "READING_RESOLVER_FAILED");
    resolver.failingSurface = undefined;
    llm.generationFailure = new Error("generation down");
    await expectApplicationError(service(), "CANDIDATE_GENERATION_FAILED");
    llm.generationFailure = undefined;
    llm.semanticFailure = new Error("semantic down");
    await expectApplicationError(service(), "SEMANTIC_EVALUATION_FAILED");
    expect(connection.db.select({ value: count() }).from(generationRounds).get()?.value).toBe(0);
  });

  it("does not persist when reconciliation leaves zero evaluated candidates", async () => {
    const generated = [{ candidateKey: "light", surface: "光" }];
    const service = new GenerationService({
      readingResolver: new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
      ]),
      llmAdapter: new StubLlmAdapter({
        generationResult: generationResult(generated),
        semanticResult: semanticResult([]),
      }),
      roundPersistence: persistence,
    });

    await expectApplicationError(
      service.generateInitialRound({ userId: "owner", sourceSurface: "夜" }),
      "NO_EVALUABLE_CANDIDATES",
    );
    expect(connection.db.select({ value: count() }).from(generationSessions).get()?.value).toBe(0);
  });

  it("persists an evaluated pool even when Selector returns zero selected", async () => {
    const generated = [{ candidateKey: "same-surface", surface: "夜" }];
    const result = await new GenerationService({
      readingResolver: new StubReadingResolver([reading("夜", "よる")]),
      llmAdapter: new StubLlmAdapter({
        generationResult: generationResult(generated),
        semanticResult: semanticResult(generated),
      }),
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });

    expect(result.candidates).toEqual([]);
    expect(
      connection.db
        .select({ selected: candidateResults.selected })
        .from(candidateResults)
        .get(),
    ).toEqual({ selected: false });
  });

  it("rerolls with stored reading, ordered selected exclusions, and current configs", async () => {
    const initialGenerated = [
      { candidateKey: "shown-light", surface: "光" },
      { candidateKey: "unselected-source", surface: "夜" },
    ];
    const llm = new RecordingLlmAdapter(
      generationResult(initialGenerated),
      semanticResult(initialGenerated),
    );
    const resolver = new RecordingReadingResolver(
      new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
        reading("星", "ほし"),
        reading("風", "かぜ"),
      ]),
    );
    const initial = await new GenerationService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });
    const sourceCallsAfterInitial = resolver.requests.filter(
      (request) => request.surface === "夜",
    ).length;
    const scoringConfig = {
      ...DEFAULT_SOUND_SCORING_CONFIG,
      version: "sound-v0.2",
      endingBonus: { ...DEFAULT_SOUND_SCORING_CONFIG.endingBonus, maxPoints: 8 },
    } satisfies SoundScoringConfig;
    const selectionConfig = {
      ...DEFAULT_SELECTION_CONFIG,
      version: "selection-v0.2",
    } satisfies SelectionConfig;

    const reroll = new RerollService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
      sessionQuery: persistence,
      scoringConfig,
      selectionConfig,
    });
    const secondGenerated = [
      { candidateKey: "ignored-exclusion", surface: "光" },
      { candidateKey: "shown-star", surface: "星" },
    ];
    llm.generationFixture = generationResult(secondGenerated);
    llm.semanticFixture = semanticResult(secondGenerated);
    const second = await reroll.reroll({
      userId: "owner",
      sessionId: initial.sessionId,
    });

    expect(second.roundNumber).toBe(2);
    expect(second.source.reading).toBe("よる");
    expect(second.candidates.map((candidate) => candidate.surface)).toEqual(["星"]);
    expect(
      resolver.requests.filter((request) => request.surface === "夜").length,
    ).toBe(sourceCallsAfterInitial);
    expect(llm.generationRequests[1]?.excludeTerms).toEqual(["光"]);
    const loadedSecond = new RoundRepository(connection.db).loadRound(second.roundId);
    expect(loadedSecond?.excludeTerms).toEqual(["光"]);
    expect(loadedSecond?.generationResult.candidates.map((item) => item.surface)).toEqual([
      "光",
      "星",
    ]);
    expect(loadedSecond?.scoringConfigVersion).toBe("sound-v0.2");
    expect(loadedSecond?.selectionConfigVersion).toBe("selection-v0.2");

    const thirdGenerated = [{ candidateKey: "shown-wind", surface: "風" }];
    llm.generationFixture = generationResult(thirdGenerated);
    llm.semanticFixture = semanticResult(thirdGenerated);
    const third = await reroll.reroll({
      userId: "owner",
      sessionId: initial.sessionId,
    });
    expect(third.roundNumber).toBe(3);
    expect(llm.generationRequests[2]?.excludeTerms).toEqual(["光", "星"]);
    expect(connection.db.select({ value: count() }).from(generationRounds).get()?.value).toBe(3);
    const session = await new SessionQueryService(persistence).getSession({
      userId: "owner",
      sessionId: initial.sessionId,
    });
    expect(session.rounds.map((round) => round.roundNumber)).toEqual([1, 2, 3]);
    expect(
      session.rounds.map((round) =>
        round.candidates.map((candidate) => candidate.surface),
      ),
    ).toEqual([["光"], ["星"], ["風"]]);
  });

  it("maps reroll config conflict and rolls back the attempted Round", async () => {
    const generated = [{ candidateKey: "light", surface: "光" }];
    const llm = new RecordingLlmAdapter(
      generationResult(generated),
      semanticResult(generated),
    );
    const resolver = new StubReadingResolver([
      reading("夜", "よる"),
      reading("光", "ひかり"),
      reading("星", "ほし"),
    ]);
    const initial = await new GenerationService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });
    llm.generationFixture = generationResult([{ candidateKey: "star", surface: "星" }]);
    llm.semanticFixture = semanticResult([{ candidateKey: "star", surface: "星" }]);
    const conflictingConfig = {
      ...DEFAULT_SOUND_SCORING_CONFIG,
      endingBonus: { ...DEFAULT_SOUND_SCORING_CONFIG.endingBonus, maxPoints: 9 },
    } satisfies SoundScoringConfig;

    await expectApplicationError(
      new RerollService({
        readingResolver: resolver,
        llmAdapter: llm,
        roundPersistence: persistence,
        sessionQuery: persistence,
        scoringConfig: conflictingConfig,
      }).reroll({ userId: "owner", sessionId: initial.sessionId }),
      "CONFIG_VERSION_CONFLICT",
    );
    expect(connection.db.select({ value: count() }).from(generationRounds).get()?.value).toBe(1);
    expect(connection.db.select({ value: count() }).from(scoringConfigs).get()?.value).toBe(1);
    expect(connection.db.select({ value: count() }).from(selectionConfigs).get()?.value).toBe(1);
  });

  it("does not reveal unknown versus other-user Sessions", async () => {
    const generated = [{ candidateKey: "light", surface: "光" }];
    const llm = new RecordingLlmAdapter(
      generationResult(generated),
      semanticResult(generated),
    );
    const resolver = new StubReadingResolver([
      reading("夜", "よる"),
      reading("光", "ひかり"),
    ]);
    const initial = await new GenerationService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });
    const reroll = new RerollService({
      readingResolver: resolver,
      llmAdapter: llm,
      roundPersistence: persistence,
      sessionQuery: persistence,
    });
    const query = new SessionQueryService(persistence);

    await expectApplicationError(
      reroll.reroll({ userId: "owner", sessionId: "missing" }),
      "SESSION_NOT_FOUND",
    );
    await expectApplicationError(
      reroll.reroll({ userId: "other", sessionId: initial.sessionId }),
      "SESSION_NOT_FOUND",
    );
    await expectApplicationError(
      query.getSession({ userId: "other", sessionId: initial.sessionId }),
      "SESSION_NOT_FOUND",
    );
  });

  it("persists independent current-state feedback with ownership checks", async () => {
    const generated = [{ candidateKey: "light", surface: "光" }];
    const result = await new GenerationService({
      readingResolver: new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
      ]),
      llmAdapter: new StubLlmAdapter({
        generationResult: generationResult(generated),
        semanticResult: semanticResult(generated),
      }),
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });
    const candidateResultId = result.candidates[0]!.candidateResultId;
    const service = new FeedbackService(persistence);
    const query = new SessionQueryService(persistence);

    expect(
      (await query.getSession({ userId: "owner", sessionId: result.sessionId }))
        .rounds[0]?.candidates[0]?.feedback,
    ).toEqual({ candidate: null, soundScore: null });

    await service.submitCandidateFeedback({
      userId: "owner",
      candidateResultId,
      value: "like",
    });
    expect(
      (await query.getSession({ userId: "owner", sessionId: result.sessionId }))
        .rounds[0]?.candidates[0]?.feedback,
    ).toEqual({ candidate: "like", soundScore: null });
    await service.submitCandidateFeedback({
      userId: "owner",
      candidateResultId,
      value: "dislike",
    });
    await service.submitSoundScoreFeedback({
      userId: "owner",
      candidateResultId,
      value: "low",
    });
    expect(
      (await query.getSession({ userId: "owner", sessionId: result.sessionId }))
        .rounds[0]?.candidates[0]?.feedback,
    ).toEqual({ candidate: "dislike", soundScore: "low" });
    await service.submitSoundScoreFeedback({
      userId: "owner",
      candidateResultId,
      value: "valid",
    });

    expect(connection.db.select().from(candidateFeedback).get()?.value).toBe("dislike");
    expect(connection.db.select().from(soundScoreFeedback).get()?.value).toBe("valid");
    expect(
      (await query.getSession({ userId: "owner", sessionId: result.sessionId }))
        .rounds[0]?.candidates[0]?.feedback,
    ).toEqual({ candidate: "dislike", soundScore: "valid" });
    expect(connection.db.select({ value: count() }).from(candidateFeedback).get()?.value).toBe(1);
    expect(connection.db.select({ value: count() }).from(soundScoreFeedback).get()?.value).toBe(1);
    await expectApplicationError(
      service.submitCandidateFeedback({
        userId: "other",
        candidateResultId,
        value: "like",
      }),
      "CANDIDATE_RESULT_NOT_FOUND",
    );
    await expectApplicationError(
      service.submitSoundScoreFeedback({
        userId: "owner",
        candidateResultId: "missing",
        value: "valid",
      }),
      "CANDIDATE_RESULT_NOT_FOUND",
    );
  });

  it("queries stored selected snapshots in Round and selection order", async () => {
    const generated = [
      { candidateKey: "light", surface: "光" },
      { candidateKey: "same-source", surface: "夜" },
    ];
    const initial = await new GenerationService({
      readingResolver: new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
      ]),
      llmAdapter: new StubLlmAdapter({
        generationResult: generationResult(generated),
        semanticResult: semanticResult(generated),
      }),
      roundPersistence: persistence,
    }).generateInitialRound({ userId: "owner", sourceSurface: "夜" });
    const view = await new SessionQueryService(persistence).getSession({
      userId: "owner",
      sessionId: initial.sessionId,
    });

    expect(view.source).toEqual({ surface: "夜", reading: "よる" });
    expect(view.rounds.map((round) => round.roundNumber)).toEqual([1]);
    expect(view.rounds[0]?.candidates.map((candidate) => candidate.surface)).toEqual([
      "光",
    ]);
    expect(view.rounds[0]?.candidates[0]?.sound).toEqual(initial.candidates[0]?.sound);
    expect(view.rounds[0]?.candidates[0]?.semantic).toEqual(
      initial.candidates[0]?.semantic,
    );
  });

  it("maps a failing Persistence Port to PERSISTENCE_FAILED", async () => {
    const generated = [{ candidateKey: "light", surface: "光" }];
    const failingPersistence: RoundPersistencePort = {
      async saveInitialRound() {
        throw new Error("storage unavailable");
      },
      async saveRerollRound() {
        throw new Error("storage unavailable");
      },
    };
    const service = new GenerationService({
      readingResolver: new StubReadingResolver([
        reading("夜", "よる"),
        reading("光", "ひかり"),
      ]),
      llmAdapter: new StubLlmAdapter({
        generationResult: generationResult(generated),
        semanticResult: semanticResult(generated),
      }),
      roundPersistence: failingPersistence,
    });

    await expectApplicationError(
      service.generateInitialRound({ userId: "owner", sourceSurface: "夜" }),
      "PERSISTENCE_FAILED",
    );
  });
});
