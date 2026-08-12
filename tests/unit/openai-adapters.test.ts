import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import type {
  OpenAiResponsesExecutor,
  OpenAiStructuredRequest,
  OpenAiStructuredResponse,
} from "../../src/infrastructure/openai";
import {
  createDeterministicCandidateKey,
  createOpenAiClient,
  OPENAI_INFERENCE_CONFIG_VERSION,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
  OpenAiLlmAdapter,
  OpenAiReadingResolver,
  SdkOpenAiResponsesExecutor,
  candidateOutputSchema,
  readingOutputSchema,
  semanticOutputSchema,
} from "../../src/infrastructure/openai";
import { readExternalAdapterConfig } from "../../src/server/external-adapter-config";

class FakeExecutor implements OpenAiResponsesExecutor {
  readonly requests: OpenAiStructuredRequest<unknown>[] = [];

  constructor(private readonly responses: OpenAiStructuredResponse<unknown>[]) {}

  async parse<T>(
    request: OpenAiStructuredRequest<T>,
  ): Promise<OpenAiStructuredResponse<T>> {
    this.requests.push(request as OpenAiStructuredRequest<unknown>);
    const response = this.responses.shift();
    if (response === undefined) throw new Error("No fake response");
    return response as OpenAiStructuredResponse<T>;
  }
}

function completed<T>(outputParsed: T, id = "resp_1"): OpenAiStructuredResponse<T> {
  return {
    id,
    model: "gpt-5.6-terra-actual",
    status: "completed",
    outputParsed,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  };
}

describe("M10 OpenAI adapters (offline)", () => {
  it("maps candidate Structured Output and generates deterministic opaque keys", async () => {
    const executor = new FakeExecutor([
      completed({
        candidates: [
          { surface: "月", readingHint: "つき" },
          { surface: "孤独", readingHint: null },
          { surface: "月", readingHint: "つき" },
        ],
      }),
    ]);
    const times = [100, 125];
    const result = await new OpenAiLlmAdapter({
      executor,
      clock: () => times.shift() ?? 125,
    }).generateCandidates({
      source: { surface: "夜", reading: "よる" },
      targetCount: 3,
      excludeTerms: ["星"],
    });

    expect(result.candidates[0]?.candidateKey).toBe(
      createDeterministicCandidateKey("月", "つき"),
    );
    expect(result.candidates[2]?.candidateKey).toBe(
      result.candidates[0]?.candidateKey,
    );
    expect(result.candidates[1]).not.toHaveProperty("readingHint");
    expect(result.metadata).toEqual({
      provider: "openai",
      providerResponseId: "resp_1",
      modelIdentifier: "gpt-5.6-terra-actual",
      generationPromptVersion: "candidate-openai-v0.1",
      inferenceConfigVersion: OPENAI_INFERENCE_CONFIG_VERSION,
      durationMs: 25,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    expect(JSON.parse(executor.requests[0]!.input)).toEqual({
      source: { surface: "夜", reading: "よる" },
      targetCount: 3,
      excludeTerms: ["星"],
    });
  });

  it("keeps semantic requests meaning-only and preserves candidate keys", async () => {
    const executor = new FakeExecutor([
      completed({
        results: [
          {
            candidateKey: "key-b",
            score: 82,
            reason: "夜の情景に近い",
            primaryRelation: "scene",
            secondaryRelations: ["visual"],
            semanticCluster: "night-scene",
          },
        ],
      }),
    ]);
    const result = await new OpenAiLlmAdapter({ executor }).evaluateSemantics({
      source: { surface: "夜" },
      candidates: [
        { candidateKey: "key-a", surface: "月" },
        { candidateKey: "key-b", surface: "静寂" },
      ],
    });

    expect(result.results[0]?.candidateKey).toBe("key-b");
    expect(JSON.parse(executor.requests[0]!.input)).toEqual({
      source: { surface: "夜" },
      candidates: [
        { candidateKey: "key-a", surface: "月" },
        { candidateKey: "key-b", surface: "静寂" },
      ],
    });
    expect(executor.requests[0]!.input).not.toMatch(/reading|sound|rhyme/i);
    expect(result.metadata.semanticPromptVersion).toBe("semantic-openai-v0.1");
  });

  it("rejects incomplete or missing parsed provider responses", async () => {
    const adapter = new OpenAiLlmAdapter({
      executor: new FakeExecutor([
        {
          id: "resp_incomplete",
          model: "gpt-5.6-terra",
          status: "incomplete",
          outputParsed: null,
        },
      ]),
    });
    await expect(
      adapter.generateCandidates({
        source: { surface: "夜", reading: "よる" },
        targetCount: 1,
        excludeTerms: [],
      }),
    ).rejects.toThrow(/incomplete|refused|unparseable/);
  });

  it("maps one reading batch call, validates readings, and keeps raw identities", async () => {
    const executor = new FakeExecutor([
      completed({
        results: [
          { requestKey: "a", status: "resolved", reading: "つき" },
          { requestKey: "a", status: "resolved", reading: "げつ" },
          { requestKey: "b", status: "resolved", reading: "ABC" },
          { requestKey: "missing", status: "resolved", reading: "よる" },
          { requestKey: "c", status: "unresolved", reading: null },
        ],
      }, "resp_reading"),
    ]);
    const result = await new OpenAiReadingResolver({ executor }).resolveBatch({
      items: [
        { requestKey: "a", surface: "月", readingHint: "つき" },
        { requestKey: "b", surface: "英字" },
        { requestKey: "c", surface: "未知" },
      ],
    });

    expect(executor.requests).toHaveLength(1);
    expect(result.results).toEqual([
      {
        requestKey: "a",
        status: "resolved",
        reading: {
          surface: "月",
          reading: "つき",
          morae: ["つ", "き"],
          source: "llm",
        },
      },
      {
        requestKey: "a",
        status: "resolved",
        reading: {
          surface: "月",
          reading: "げつ",
          morae: ["げ", "つ"],
          source: "llm",
        },
      },
      { requestKey: "b", status: "unresolved" },
      { requestKey: "missing", status: "unresolved" },
      { requestKey: "c", status: "unresolved" },
    ]);
    expect(result.metadata).toMatchObject({
      resolverIdentifier: "openai/gpt-5.6-terra-actual",
      promptVersion: "reading-openai-v0.1",
      providerResponseId: "resp_reading",
    });
  });

  it("supports source single resolved and unresolved results through the same contract", async () => {
    const executor = new FakeExecutor([
      completed({
        results: [{ requestKey: "source", status: "resolved", reading: "よる" }],
      }),
      completed({
        results: [{ requestKey: "source", status: "unresolved", reading: null }],
      }),
    ]);
    const resolver = new OpenAiReadingResolver({ executor });

    await expect(resolver.resolve({ surface: "夜" })).resolves.toMatchObject({
      status: "resolved",
      reading: { surface: "夜", reading: "よる", source: "llm" },
    });
    await expect(resolver.resolve({ surface: "空" })).resolves.toMatchObject({
      status: "unresolved",
    });
  });

  it("propagates a batch-level provider failure instead of fabricating unresolved items", async () => {
    const resolver = new OpenAiReadingResolver({ executor: new FakeExecutor([]) });
    await expect(
      resolver.resolveBatch({ items: [{ requestKey: "a", surface: "月" }] }),
    ).rejects.toThrow("No fake response");
  });

  it("uses the official SDK parse request contract without storage or tools", async () => {
    let captured: Record<string, unknown> | undefined;
    const fakeClient = {
      responses: {
        async parse(body: Record<string, unknown>) {
          captured = body;
          return {
            id: "resp_sdk",
            model: "gpt-5.6-terra",
            status: "completed",
            output_parsed: { candidates: [] },
          };
        },
      },
    } as unknown as OpenAI;
    await new SdkOpenAiResponsesExecutor(fakeClient).parse({
      model: "gpt-5.6-terra",
      instructions: "instructions",
      input: "{}",
      schema: candidateOutputSchema,
      schemaName: "candidates",
    });

    expect(captured).toMatchObject({
      model: "gpt-5.6-terra",
      store: false,
      stream: false,
      tools: [],
      reasoning: { effort: "none" },
    });
    expect(captured?.text).toBeDefined();
  });

  it("keeps Structured Output schemas strict and configures bounded SDK retries", () => {
    expect(
      candidateOutputSchema.safeParse({ candidates: [], extra: true }).success,
    ).toBe(false);
    expect(
      semanticOutputSchema.safeParse({ results: [{ candidateKey: "k", score: 101 }] })
        .success,
    ).toBe(false);
    expect(
      readingOutputSchema.safeParse({
        results: [{ requestKey: "k", status: "resolved", reading: null }],
      }).success,
    ).toBe(true);
    const client = createOpenAiClient("test-only-key");
    expect(client.maxRetries).toBe(OPENAI_MAX_RETRIES);
    expect(client.timeout).toBe(OPENAI_REQUEST_TIMEOUT_MS);
  });

  it("defaults composition to stub and validates openai mode without fallback", () => {
    expect(readExternalAdapterConfig({})).toEqual({ mode: "stub" });
    expect(() =>
      readExternalAdapterConfig({ LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE: "openai" }),
    ).toThrow("Server configuration is invalid");
    expect(() =>
      readExternalAdapterConfig({ LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE: "unknown" }),
    ).toThrow("Server configuration is invalid");
    expect(
      readExternalAdapterConfig({
        LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE: "openai",
        OPENAI_API_KEY: "server-only-test-key",
      }),
    ).toMatchObject({
      mode: "openai",
      generationModel: "gpt-5.6-terra",
      semanticModel: "gpt-5.6-terra",
      readingModel: "gpt-5.6-terra",
    });
  });
});
