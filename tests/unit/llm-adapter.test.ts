import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  CandidateKey,
  EvaluateSemanticsRequest,
  EvaluateSemanticsResult,
  GenerateCandidatesRequest,
  GenerateCandidatesResult,
  LlmAdapter,
} from "../../src/application/ports/llm-adapter";
import { StubLlmAdapter } from "../../src/infrastructure/llm/stub-llm-adapter";

const generationResultFixture = {
  candidates: [
    {
      candidateKey: "candidate-001",
      surface: "月",
      readingHint: "つき",
    },
    {
      candidateKey: "candidate-002",
      surface: "孤独",
    },
  ],
  metadata: {
    modelIdentifier: "stub",
    generationPromptVersion: "generation-v0.1",
  },
} satisfies GenerateCandidatesResult;

const semanticResultFixture = {
  results: [
    {
      candidateKey: "candidate-002",
      score: 88,
      reason: "夜の感情的な連想",
      primaryRelation: "emotion",
      secondaryRelations: ["abstract_association"],
      semanticCluster: "emotion-solitude",
    },
    {
      candidateKey: "candidate-001",
      score: 94,
      reason: "夜の情景に現れる対象",
      primaryRelation: "scene",
      secondaryRelations: ["visual", "object"],
      semanticCluster: "night-sky",
    },
  ],
  metadata: {
    modelIdentifier: "stub",
    semanticPromptVersion: "semantic-v0.1",
  },
} satisfies EvaluateSemanticsResult;

const generationRequest = {
  source: {
    surface: "夜",
    reading: "よる",
  },
  targetCount: 1,
  excludeTerms: ["月"],
} satisfies GenerateCandidatesRequest;

const semanticRequest = {
  source: {
    surface: "夜",
  },
  candidates: [
    { candidateKey: "candidate-001", surface: "月" },
    { candidateKey: "candidate-002", surface: "孤独" },
  ],
} satisfies EvaluateSemanticsRequest;

function createAdapter(): StubLlmAdapter {
  return new StubLlmAdapter({
    generationResult: generationResultFixture,
    semanticResult: semanticResultFixture,
  });
}

describe("Stub LLM Adapter contract", () => {
  it("implements the Application-owned async port", () => {
    const adapter: LlmAdapter = createAdapter();

    expectTypeOf(adapter.generateCandidates).returns.toEqualTypeOf<
      Promise<GenerateCandidatesResult>
    >();
    expectTypeOf(adapter.evaluateSemantics).returns.toEqualTypeOf<
      Promise<EvaluateSemanticsResult>
    >();
  });

  describe("Candidate Generation", () => {
    it("returns a Promise containing the injected fixture", async () => {
      const pendingResult = createAdapter().generateCandidates(
        generationRequest,
      );

      expect(pendingResult).toBeInstanceOf(Promise);
      await expect(pendingResult).resolves.toBe(generationResultFixture);
    });

    it("preserves candidate keys and optional reading hints", async () => {
      const result = await createAdapter().generateCandidates(
        generationRequest,
      );

      expect(result.candidates).toEqual([
        {
          candidateKey: "candidate-001",
          surface: "月",
          readingHint: "つき",
        },
        {
          candidateKey: "candidate-002",
          surface: "孤独",
        },
      ]);
      expect(result.candidates[1]).not.toHaveProperty("readingHint");
    });

    it("preserves model and generation prompt metadata", async () => {
      const result = await createAdapter().generateCandidates(
        generationRequest,
      );

      expect(result.metadata).toEqual({
        modelIdentifier: "stub",
        generationPromptVersion: "generation-v0.1",
      });
    });

    it("is deterministic and does not reinterpret request policy", async () => {
      const adapter = createAdapter();
      const alternateRequest = {
        source: { surface: "朝", reading: "あさ" },
        targetCount: 99,
        excludeTerms: ["月", "孤独"],
      } satisfies GenerateCandidatesRequest;

      const first = await adapter.generateCandidates(generationRequest);
      const second = await adapter.generateCandidates(alternateRequest);

      expect(first).toEqual(generationResultFixture);
      expect(second).toEqual(first);
    });
  });

  describe("Semantic Evaluation", () => {
    it("returns a Promise containing the injected fixture", async () => {
      const pendingResult = createAdapter().evaluateSemantics(semanticRequest);

      expect(pendingResult).toBeInstanceOf(Promise);
      await expect(pendingResult).resolves.toBe(semanticResultFixture);
    });

    it("preserves all candidate-keyed semantic fields", async () => {
      const result = await createAdapter().evaluateSemantics(semanticRequest);

      expect(result.results[0]).toEqual({
        candidateKey: "candidate-002",
        score: 88,
        reason: "夜の感情的な連想",
        primaryRelation: "emotion",
        secondaryRelations: ["abstract_association"],
        semanticCluster: "emotion-solitude",
      });
    });

    it("preserves model and semantic prompt metadata independently", async () => {
      const result = await createAdapter().evaluateSemantics(semanticRequest);

      expect(result.metadata).toEqual({
        modelIdentifier: "stub",
        semanticPromptVersion: "semantic-v0.1",
      });
    });

    it("supports candidate matching by key instead of array index", async () => {
      const result = await createAdapter().evaluateSemantics(semanticRequest);
      const resultByCandidateKey = new Map(
        result.results.map((item) => [item.candidateKey, item]),
      );

      expect(result.results.map((item) => item.candidateKey)).toEqual([
        "candidate-002",
        "candidate-001",
      ]);
      expect(resultByCandidateKey.get("candidate-001")?.score).toBe(94);
      expect(resultByCandidateKey.get("candidate-002")?.score).toBe(88);
    });

    it("is deterministic for different requests with the same fixture", async () => {
      const adapter = createAdapter();
      const alternateRequest = {
        source: { surface: "朝" },
        candidates: [{ candidateKey: "other-key", surface: "光" }],
      } satisfies EvaluateSemanticsRequest;

      const first = await adapter.evaluateSemantics(semanticRequest);
      const second = await adapter.evaluateSemantics(alternateRequest);

      expect(second).toEqual(first);
    });
  });

  it("keeps the Semantic Evaluation request free of sound data", () => {
    expectTypeOf<keyof EvaluateSemanticsRequest>().toEqualTypeOf<
      "source" | "candidates"
    >();
    expectTypeOf<keyof EvaluateSemanticsRequest["source"]>().toEqualTypeOf<
      "surface"
    >();
    expectTypeOf<
      keyof EvaluateSemanticsRequest["candidates"][number]
    >().toEqualTypeOf<"candidateKey" | "surface">();
  });

  it("uses the same candidate-key type across generation and semantics", () => {
    expectTypeOf<
      GenerateCandidatesResult["candidates"][number]["candidateKey"]
    >().toEqualTypeOf<CandidateKey>();
    expectTypeOf<
      EvaluateSemanticsResult["results"][number]["candidateKey"]
    >().toEqualTypeOf<CandidateKey>();
  });
});
