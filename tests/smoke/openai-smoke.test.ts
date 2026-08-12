import { expect, it } from "vitest";

import {
  createOpenAiClient,
  OpenAiLlmAdapter,
  OpenAiReadingResolver,
  SdkOpenAiResponsesExecutor,
} from "../../src/infrastructure/openai";
import { readExternalAdapterConfig } from "../../src/server/external-adapter-config";

it("runs the explicitly opted-in real OpenAI adapter contract", async () => {
  if (process.env.LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE !== "openai") {
    throw new Error(
      "Set LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE=openai to opt in to real inference",
    );
  }
  const config = readExternalAdapterConfig();
  if (config.mode !== "openai") throw new Error("OpenAI mode is required");

  const executor = new SdkOpenAiResponsesExecutor(
    createOpenAiClient(config.apiKey),
  );
  const readingResolver = new OpenAiReadingResolver({
    executor,
    model: config.readingModel,
  });
  const llmAdapter = new OpenAiLlmAdapter({
    executor,
    generationModel: config.generationModel,
    semanticModel: config.semanticModel,
  });

  const sourceResolution = await readingResolver.resolve({ surface: "夜" });
  expect(sourceResolution.status).toBe("resolved");
  if (sourceResolution.status !== "resolved") return;

  const generation = await llmAdapter.generateCandidates({
    source: {
      surface: sourceResolution.reading.surface,
      reading: sourceResolution.reading.reading,
    },
    targetCount: 3,
    excludeTerms: [],
  });
  expect(generation.candidates.length).toBeGreaterThan(0);

  const readings = await readingResolver.resolveBatch({
    items: generation.candidates.map((candidate) => ({
      requestKey: candidate.candidateKey,
      surface: candidate.surface,
      ...(candidate.readingHint === undefined
        ? {}
        : { readingHint: candidate.readingHint }),
    })),
  });
  const resolvedKeys = new Set(
    readings.results
      .filter((item) => item.status === "resolved")
      .map((item) => item.requestKey),
  );
  const semantics = await llmAdapter.evaluateSemantics({
    source: { surface: "夜" },
    candidates: generation.candidates
      .filter((candidate) => resolvedKeys.has(candidate.candidateKey))
      .map((candidate) => ({
        candidateKey: candidate.candidateKey,
        surface: candidate.surface,
      })),
  });
  expect(semantics.metadata.provider).toBe("openai");
});
