import { createHash } from "node:crypto";

import type {
  EvaluateSemanticsRequest,
  EvaluateSemanticsResult,
  GenerateCandidatesRequest,
  GenerateCandidatesResult,
  LlmAdapter,
} from "../../application";
import {
  CANDIDATE_INSTRUCTIONS,
  CANDIDATE_PROMPT_VERSION,
  buildCandidateInput,
} from "./prompts/candidate-prompt";
import {
  buildSemanticInput,
  SEMANTIC_INSTRUCTIONS,
  SEMANTIC_PROMPT_VERSION,
} from "./prompts/semantic-prompt";
import {
  OPENAI_INFERENCE_CONFIG_VERSION,
  requireCompletedParsed,
  type OpenAiResponsesExecutor,
} from "./responses-executor";
import {
  candidateOutputSchema,
  semanticOutputSchema,
} from "./schemas";

export const DEFAULT_OPENAI_GENERATION_MODEL = "gpt-5.6-terra";
export const DEFAULT_OPENAI_SEMANTIC_MODEL = "gpt-5.6-terra";

export interface OpenAiLlmAdapterOptions {
  readonly executor: OpenAiResponsesExecutor;
  readonly generationModel?: string;
  readonly semanticModel?: string;
  readonly clock?: () => number;
}

export function createDeterministicCandidateKey(
  surface: string,
  readingHint: string | null | undefined,
): string {
  const digest = createHash("sha256")
    .update(surface)
    .update("\u001f")
    .update(readingHint ?? "")
    .digest("hex");
  return `candidate-${digest.slice(0, 32)}`;
}

export class OpenAiLlmAdapter implements LlmAdapter {
  private readonly generationModel: string;
  private readonly semanticModel: string;
  private readonly clock: () => number;

  constructor(private readonly options: OpenAiLlmAdapterOptions) {
    this.generationModel =
      options.generationModel ?? DEFAULT_OPENAI_GENERATION_MODEL;
    this.semanticModel = options.semanticModel ?? DEFAULT_OPENAI_SEMANTIC_MODEL;
    this.clock = options.clock ?? Date.now;
  }

  async generateCandidates(
    request: GenerateCandidatesRequest,
  ): Promise<GenerateCandidatesResult> {
    const startedAt = this.clock();
    const response = await this.options.executor.parse({
      model: this.generationModel,
      instructions: CANDIDATE_INSTRUCTIONS,
      input: buildCandidateInput(request),
      schema: candidateOutputSchema,
      schemaName: "lyrics_assist_candidates",
    });
    const parsed = requireCompletedParsed(response);

    return {
      candidates: parsed.candidates.map((candidate) => ({
        candidateKey: createDeterministicCandidateKey(
          candidate.surface,
          candidate.readingHint,
        ),
        surface: candidate.surface,
        ...(candidate.readingHint === null
          ? {}
          : { readingHint: candidate.readingHint }),
      })),
      metadata: {
        provider: "openai",
        providerResponseId: response.id,
        modelIdentifier: response.model,
        generationPromptVersion: CANDIDATE_PROMPT_VERSION,
        inferenceConfigVersion: OPENAI_INFERENCE_CONFIG_VERSION,
        durationMs: this.clock() - startedAt,
        ...(response.usage === undefined ? {} : { usage: response.usage }),
      },
    };
  }

  async evaluateSemantics(
    request: EvaluateSemanticsRequest,
  ): Promise<EvaluateSemanticsResult> {
    const startedAt = this.clock();
    const response = await this.options.executor.parse({
      model: this.semanticModel,
      instructions: SEMANTIC_INSTRUCTIONS,
      input: buildSemanticInput(request),
      schema: semanticOutputSchema,
      schemaName: "lyrics_assist_semantics",
    });
    const parsed = requireCompletedParsed(response);

    return {
      results: parsed.results,
      metadata: {
        provider: "openai",
        providerResponseId: response.id,
        modelIdentifier: response.model,
        semanticPromptVersion: SEMANTIC_PROMPT_VERSION,
        inferenceConfigVersion: OPENAI_INFERENCE_CONFIG_VERSION,
        durationMs: this.clock() - startedAt,
        ...(response.usage === undefined ? {} : { usage: response.usage }),
      },
    };
  }
}
