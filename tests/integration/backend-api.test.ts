import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "../../src/application";
import type {
  GeneratedCandidateView,
  GeneratedRoundView,
  SessionView,
} from "../../src/application";
import { POST as generationRoutePost } from "../../src/app/api/generations/route";
import { runtime as generationRouteRuntime } from "../../src/app/api/generations/route";
import {
  migratePersistenceDatabase,
  openPersistenceDatabase,
} from "../../src/infrastructure/persistence";
import { mapApiError } from "../../src/server/api/error-mapper";
import { handleCandidateFeedback, handleSoundScoreFeedback } from "../../src/server/api/handlers/feedback-handler";
import { handleGeneration } from "../../src/server/api/handlers/generation-handler";
import { handleReroll } from "../../src/server/api/handlers/reroll-handler";
import { handleSessionQuery } from "../../src/server/api/handlers/session-handler";
import type { BackendApiDependencies } from "../../src/server/api/handlers/types";
import { resetServerCompositionForTests } from "../../src/server/composition";
import {
  FixedBetaUserResolver,
  ServerConfigurationError,
} from "../../src/server/identity/beta-user-resolver";

const BETA_USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174001";
const ROUND_ID = "123e4567-e89b-42d3-a456-426614174002";
const CANDIDATE_RESULT_ID = "123e4567-e89b-42d3-a456-426614174003";

function candidate(
  overrides: Partial<GeneratedCandidateView> = {},
): GeneratedCandidateView {
  return {
    candidateResultId: CANDIDATE_RESULT_ID,
    candidateKey: "internal-candidate-key",
    surface: "光",
    reading: "ひかり",
    sound: {
      finalScore: 85,
      rawScore: 84.5,
      breakdown: {
        moraLengthScore: 70,
        positionMatchScore: 75,
        sequenceSimilarityScore: 80,
      },
      adjustments: [
        {
          ruleId: "ending-rhyme-bonus",
          scoreDelta: 5,
          reason: "internal sound reason",
          commonSuffixLength: 1,
          suffixCoverage: 0.5,
          bonus: 5,
        },
      ],
      reason: "internal aggregate reason",
      scoringConfigVersion: "sound-v0.1",
      normalizerVersion: "rhyme-v0.1",
    },
    semantic: {
      word: "光",
      semanticScore: 82,
      reason: "夜との対照",
      primaryRelation: "contrast",
      secondaryRelations: ["visual"],
      semanticCluster: "light",
      modelIdentifier: "internal-model",
      semanticPromptVersion: "internal-prompt",
    },
    selection: {
      candidateKey: "internal-candidate-key",
      selectionCategory: "balanced",
      selectionRank: 1,
      selectionScore: 80,
      selectionReason: "internal selection reason",
    },
    feedback: {
      candidate: null,
      soundScore: null,
    },
    ...overrides,
  };
}

function generatedRound(): GeneratedRoundView {
  return {
    sessionId: SESSION_ID,
    roundId: ROUND_ID,
    roundNumber: 1,
    source: { surface: "夜", reading: "よる" },
    candidates: [candidate()],
  };
}

function sessionView(): SessionView {
  return {
    sessionId: SESSION_ID,
    source: { surface: "夜", reading: "よる" },
    rounds: [
      {
        roundId: ROUND_ID,
        roundNumber: 2,
        candidates: [
          candidate({
            candidateResultId: "123e4567-e89b-42d3-a456-426614174004",
            surface: "星",
            selection: {
              candidateKey: "internal-star",
              selectionCategory: "sound",
              selectionRank: 2,
              selectionScore: 70,
              selectionReason: "internal",
            },
            feedback: { candidate: "dislike", soundScore: "valid" },
          }),
        ],
      },
      {
        roundId: "123e4567-e89b-42d3-a456-426614174005",
        roundNumber: 1,
        candidates: [candidate()],
      },
    ],
  };
}

function dependencies(): BackendApiDependencies & {
  generationService: { generateInitialRound: ReturnType<typeof vi.fn> };
  rerollService: { reroll: ReturnType<typeof vi.fn> };
  feedbackService: {
    submitCandidateFeedback: ReturnType<typeof vi.fn>;
    submitSoundScoreFeedback: ReturnType<typeof vi.fn>;
  };
  sessionQueryService: { getSession: ReturnType<typeof vi.fn> };
} {
  return {
    betaUserResolver: { resolveUserId: vi.fn(() => BETA_USER_ID) },
    generationService: {
      generateInitialRound: vi.fn(async () => generatedRound()),
    },
    rerollService: { reroll: vi.fn(async () => generatedRound()) },
    feedbackService: {
      submitCandidateFeedback: vi.fn(async () => undefined),
      submitSoundScoreFeedback: vi.fn(async () => undefined),
    },
    sessionQueryService: { getSession: vi.fn(async () => sessionView()) },
  };
}

function jsonRequest(
  url: string,
  body: string | object,
  contentType = "application/json",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<unknown> {
  return response.json();
}

afterEach(() => {
  resetServerCompositionForTests();
});

describe("M8 Backend API", () => {
  it("validates Generation JSON, injects beta user, and maps a public DTO", async () => {
    const deps = dependencies();
    const response = await handleGeneration(
      jsonRequest("http://test/api/generations", { sourceSurface: " 夜 " }),
      deps,
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deps.generationService.generateInitialRound).toHaveBeenCalledWith({
      userId: BETA_USER_ID,
      sourceSurface: "夜",
    });
    expect(body).toEqual({
      data: {
        sessionId: SESSION_ID,
        roundId: ROUND_ID,
        roundNumber: 1,
        source: { surface: "夜", reading: "よる" },
        candidates: [
          {
            candidateResultId: CANDIDATE_RESULT_ID,
            surface: "光",
            reading: "ひかり",
            sound: {
              finalScore: 85,
              breakdown: {
                moraLengthScore: 70,
                positionMatchScore: 75,
                sequenceSimilarityScore: 80,
              },
              endingAdjustment: {
                commonSuffixLength: 1,
                suffixCoverage: 0.5,
                bonus: 5,
              },
            },
            semantic: {
              score: 82,
              reason: "夜との対照",
              primaryRelation: "contrast",
              secondaryRelations: ["visual"],
              semanticCluster: "light",
            },
            selection: { category: "balanced", rank: 1 },
            feedback: { candidate: null, soundScore: null },
          },
        ],
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("candidateKey");
    expect(serialized).not.toContain("rawScore");
    expect(serialized).not.toContain("internal-model");
    expect(serialized).not.toContain(BETA_USER_ID);
  });

  it.each([
    [{ sourceSurface: "" }, "application/json"],
    [{ sourceSurface: "   " }, "application/json"],
    [{ sourceSurface: "夜", userId: BETA_USER_ID }, "application/json"],
    ["{broken", "application/json"],
  ])("rejects invalid Generation bodies", async (body, contentType) => {
    const response = await handleGeneration(
      jsonRequest("http://test/api/generations", body, contentType),
      dependencies(),
    );
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({
      error: { code: "INVALID_REQUEST", message: "Request is invalid." },
    });
  });

  it("requires JSON Content-Type and permits media type parameters case-insensitively", async () => {
    const wrong = await handleGeneration(
      jsonRequest("http://test/api/generations", { sourceSurface: "夜" }, "text/plain"),
      dependencies(),
    );
    const accepted = await handleGeneration(
      jsonRequest(
        "http://test/api/generations",
        { sourceSurface: "夜" },
        "Application/JSON; Charset=UTF-8",
      ),
      dependencies(),
    );
    expect(wrong.status).toBe(415);
    expect(await bodyOf(wrong)).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
    expect(accepted.status).toBe(201);
  });

  it("validates Reroll UUID/body and injects beta identity", async () => {
    const deps = dependencies();
    const valid = await handleReroll(
      jsonRequest(`http://test/api/sessions/${SESSION_ID}/reroll`, {}),
      Promise.resolve({ sessionId: SESSION_ID }),
      deps,
    );
    expect(valid.status).toBe(201);
    expect(await bodyOf(valid)).toMatchObject({
      data: {
        candidates: [
          { feedback: { candidate: null, soundScore: null } },
        ],
      },
    });
    expect(deps.rerollService.reroll).toHaveBeenCalledWith({
      userId: BETA_USER_ID,
      sessionId: SESSION_ID,
    });

    const invalidId = await handleReroll(
      jsonRequest("http://test/api/sessions/not-a-uuid/reroll", {}),
      Promise.resolve({ sessionId: "not-a-uuid" }),
      dependencies(),
    );
    const extraBody = await handleReroll(
      jsonRequest(`http://test/api/sessions/${SESSION_ID}/reroll`, { extra: true }),
      Promise.resolve({ sessionId: SESSION_ID }),
      dependencies(),
    );
    const wrongType = await handleReroll(
      jsonRequest(`http://test/api/sessions/${SESSION_ID}/reroll`, {}, "text/plain"),
      Promise.resolve({ sessionId: SESSION_ID }),
      dependencies(),
    );
    expect(invalidId.status).toBe(400);
    expect(extraBody.status).toBe(400);
    expect(wrongType.status).toBe(415);
  });

  it("maps unknown valid Reroll and Session resources to 404", async () => {
    const deps = dependencies();
    deps.rerollService.reroll.mockRejectedValue(
      new ApplicationError("SESSION_NOT_FOUND", "internal session detail"),
    );
    deps.sessionQueryService.getSession.mockRejectedValue(
      new ApplicationError("SESSION_NOT_FOUND", "internal session detail"),
    );
    const reroll = await handleReroll(
      jsonRequest(`http://test/api/sessions/${SESSION_ID}/reroll`, {}),
      Promise.resolve({ sessionId: SESSION_ID }),
      deps,
    );
    const query = await handleSessionQuery(
      Promise.resolve({ sessionId: SESSION_ID }),
      deps,
    );
    expect(reroll.status).toBe(404);
    expect(query.status).toBe(404);
    expect(JSON.stringify(await bodyOf(query))).not.toContain("internal session detail");
  });

  it("preserves Session view ordering and maps only public selected DTO fields", async () => {
    const response = await handleSessionQuery(
      Promise.resolve({ sessionId: SESSION_ID }),
      dependencies(),
    );
    const body = (await bodyOf(response)) as { data: SessionView };
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.rounds.map((round) => round.roundNumber)).toEqual([2, 1]);
    expect(body.data.rounds[0]?.candidates[0]?.feedback).toEqual({
      candidate: "dislike",
      soundScore: "valid",
    });
    expect(JSON.stringify(body)).not.toContain("candidateKey");

    const invalid = await handleSessionQuery(
      Promise.resolve({ sessionId: "invalid" }),
      dependencies(),
    );
    expect(invalid.status).toBe(400);
  });

  it.each(["like", "dislike"] as const)(
    "accepts Candidate Feedback value %s",
    async (value) => {
      const deps = dependencies();
      const response = await handleCandidateFeedback(
        jsonRequest("http://test/api/feedback/candidate", {
          candidateResultId: CANDIDATE_RESULT_ID,
          value,
        }),
        deps,
      );
      expect(response.status).toBe(200);
      expect(deps.feedbackService.submitCandidateFeedback).toHaveBeenCalledWith({
        userId: BETA_USER_ID,
        candidateResultId: CANDIDATE_RESULT_ID,
        value,
      });
      expect(await bodyOf(response)).toEqual({
        data: { candidateResultId: CANDIDATE_RESULT_ID, value },
      });
    },
  );

  it.each(["low", "valid", "high"] as const)(
    "accepts Sound Feedback value %s",
    async (value) => {
      const deps = dependencies();
      const response = await handleSoundScoreFeedback(
        jsonRequest("http://test/api/feedback/sound-score", {
          candidateResultId: CANDIDATE_RESULT_ID,
          value,
        }),
        deps,
      );
      expect(response.status).toBe(200);
      expect(deps.feedbackService.submitSoundScoreFeedback).toHaveBeenCalledWith({
        userId: BETA_USER_ID,
        candidateResultId: CANDIDATE_RESULT_ID,
        value,
      });
    },
  );

  it("strictly rejects invalid Feedback bodies and maps missing candidates", async () => {
    const invalidBodies = [
      { candidateResultId: "invalid", value: "like" },
      { candidateResultId: CANDIDATE_RESULT_ID, value: "maybe" },
      { candidateResultId: CANDIDATE_RESULT_ID, value: "like", userId: BETA_USER_ID },
    ];
    for (const body of invalidBodies) {
      const response = await handleCandidateFeedback(
        jsonRequest("http://test/api/feedback/candidate", body),
        dependencies(),
      );
      expect(response.status).toBe(400);
    }

    const deps = dependencies();
    deps.feedbackService.submitCandidateFeedback.mockRejectedValue(
      new ApplicationError("CANDIDATE_RESULT_NOT_FOUND", "internal"),
    );
    const missing = await handleCandidateFeedback(
      jsonRequest("http://test/api/feedback/candidate", {
        candidateResultId: CANDIDATE_RESULT_ID,
        value: "like",
      }),
      deps,
    );
    expect(missing.status).toBe(404);
  });

  it("rejects invalid Sound Feedback enum and maps missing candidates", async () => {
    const invalid = await handleSoundScoreFeedback(
      jsonRequest("http://test/api/feedback/sound-score", {
        candidateResultId: CANDIDATE_RESULT_ID,
        value: "maybe",
      }),
      dependencies(),
    );
    expect(invalid.status).toBe(400);

    const deps = dependencies();
    deps.feedbackService.submitSoundScoreFeedback.mockRejectedValue(
      new ApplicationError("CANDIDATE_RESULT_NOT_FOUND", "internal"),
    );
    const missing = await handleSoundScoreFeedback(
      jsonRequest("http://test/api/feedback/sound-score", {
        candidateResultId: CANDIDATE_RESULT_ID,
        value: "valid",
      }),
      deps,
    );
    expect(missing.status).toBe(404);
  });

  it.each([
    ["SOURCE_READING_UNRESOLVED", 422, "SOURCE_READING_UNRESOLVED"],
    ["NO_EVALUABLE_CANDIDATES", 422, "NO_EVALUABLE_CANDIDATES"],
    ["READING_RESOLVER_FAILED", 502, "UPSTREAM_UNAVAILABLE"],
    ["CANDIDATE_GENERATION_FAILED", 502, "UPSTREAM_UNAVAILABLE"],
    ["SEMANTIC_EVALUATION_FAILED", 502, "UPSTREAM_UNAVAILABLE"],
    ["PERSISTENCE_FAILED", 500, "INTERNAL_ERROR"],
    ["CONFIG_VERSION_CONFLICT", 500, "INTERNAL_ERROR"],
  ] as const)("maps %s to public HTTP semantics", async (code, status, publicCode) => {
    const response = mapApiError(
      new ApplicationError(
        code,
        "SECRET C:\\dev\\lyrics-assist SQLite constraint stack",
        new Error("provider raw payload"),
      ),
    );
    const serialized = JSON.stringify(await bodyOf(response));
    expect(response.status).toBe(status);
    expect(serialized).toContain(publicCode);
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("SQLite");
    expect(serialized).not.toContain("provider raw payload");
  });

  it("masks unexpected and server configuration errors", async () => {
    for (const error of [
      new Error("C:\\private\\file.db unexpected stack"),
      new ServerConfigurationError(),
    ]) {
      const response = mapApiError(error);
      expect(response.status).toBe(500);
      expect(await bodyOf(response)).toEqual({
        error: { code: "INTERNAL_ERROR", message: "An internal error occurred." },
      });
    }
  });

  it("masks missing OpenAI configuration before any provider request", async () => {
    const previousMode = process.env.LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE;
    const previousKey = process.env.OPENAI_API_KEY;
    try {
      process.env.LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE = "openai";
      delete process.env.OPENAI_API_KEY;
      resetServerCompositionForTests();
      const response = await handleGeneration(
        jsonRequest("http://test/api/generations", { sourceSurface: "夜" }),
      );
      expect(response.status).toBe(500);
      expect(await bodyOf(response)).toEqual({
        error: { code: "INTERNAL_ERROR", message: "An internal error occurred." },
      });
    } finally {
      resetServerCompositionForTests();
      if (previousMode === undefined) {
        delete process.env.LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE;
      } else {
        process.env.LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE = previousMode;
      }
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("validates the fixed beta user environment without exposing its value", () => {
    const previous = process.env.LYRICS_ASSIST_BETA_USER_ID;
    try {
      process.env.LYRICS_ASSIST_BETA_USER_ID = BETA_USER_ID;
      expect(new FixedBetaUserResolver().resolveUserId()).toBe(BETA_USER_ID);
      delete process.env.LYRICS_ASSIST_BETA_USER_ID;
      expect(() => new FixedBetaUserResolver().resolveUserId()).toThrow(
        ServerConfigurationError,
      );
      process.env.LYRICS_ASSIST_BETA_USER_ID = "invalid-secret-value";
      let configurationError: unknown;
      try {
        new FixedBetaUserResolver().resolveUserId();
      } catch (error) {
        configurationError = error;
      }
      expect(configurationError).toBeInstanceOf(ServerConfigurationError);
      expect((configurationError as Error).message).not.toContain(
        "invalid-secret-value",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.LYRICS_ASSIST_BETA_USER_ID;
      } else {
        process.env.LYRICS_ASSIST_BETA_USER_ID = previous;
      }
    }
  });

  it("wires the actual Node Route Handler through lazy composition and temporary SQLite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "lyrics-assist-m8-"));
    const databasePath = join(directory, "api-smoke.db");
    const previousPath = process.env.LYRICS_ASSIST_DB_PATH;
    const previousUser = process.env.LYRICS_ASSIST_BETA_USER_ID;
    try {
      const connection = openPersistenceDatabase(databasePath);
      migratePersistenceDatabase(connection.db, join(process.cwd(), "drizzle"));
      connection.close();
      process.env.LYRICS_ASSIST_DB_PATH = databasePath;
      process.env.LYRICS_ASSIST_BETA_USER_ID = randomUUID();

      const response = await generationRoutePost(
        jsonRequest("http://test/api/generations", { sourceSurface: "夜" }),
      );
      expect(generationRouteRuntime).toBe("nodejs");
      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(await bodyOf(response))).not.toContain(
        process.env.LYRICS_ASSIST_BETA_USER_ID,
      );
    } finally {
      resetServerCompositionForTests();
      if (previousPath === undefined) delete process.env.LYRICS_ASSIST_DB_PATH;
      else process.env.LYRICS_ASSIST_DB_PATH = previousPath;
      if (previousUser === undefined) delete process.env.LYRICS_ASSIST_BETA_USER_ID;
      else process.env.LYRICS_ASSIST_BETA_USER_ID = previousUser;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
