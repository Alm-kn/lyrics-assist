import type {
  ReadingResolution,
  ReadingResolutionMetadata,
  ReadingResolver,
  ResolveReadingBatchRequest,
  ResolveReadingBatchResult,
  ResolveReadingRequest,
} from "../../application";
import { normalizeRhyme } from "../../domain";
import {
  buildReadingInput,
  READING_INSTRUCTIONS,
  READING_PROMPT_VERSION,
} from "./prompts/reading-prompt";
import {
  OPENAI_INFERENCE_CONFIG_VERSION,
  requireCompletedParsed,
  type OpenAiResponsesExecutor,
  type OpenAiStructuredResponse,
} from "./responses-executor";
import { readingOutputSchema, type OpenAiReadingOutput } from "./schemas";

export const DEFAULT_OPENAI_READING_MODEL = "gpt-5.6-terra";

export interface OpenAiReadingResolverOptions {
  readonly executor: OpenAiResponsesExecutor;
  readonly model?: string;
  readonly clock?: () => number;
}

function metadataFor(
  response: OpenAiStructuredResponse<OpenAiReadingOutput>,
  durationMs: number,
): ReadingResolutionMetadata {
  return {
    resolverIdentifier: `openai/${response.model}`,
    promptVersion: READING_PROMPT_VERSION,
    inferenceConfigVersion: OPENAI_INFERENCE_CONFIG_VERSION,
    providerResponseId: response.id,
    durationMs,
    ...(response.usage === undefined ? {} : { usage: response.usage }),
  };
}

export class OpenAiReadingResolver implements ReadingResolver {
  private readonly model: string;
  private readonly clock: () => number;

  constructor(private readonly options: OpenAiReadingResolverOptions) {
    this.model = options.model ?? DEFAULT_OPENAI_READING_MODEL;
    this.clock = options.clock ?? Date.now;
  }

  async resolve(request: ResolveReadingRequest): Promise<ReadingResolution> {
    const result = await this.resolveBatch({
      items: [{ requestKey: "source", ...request }],
    });
    const matches = result.results.filter((item) => item.requestKey === "source");
    const item = matches.length === 1 ? matches[0] : undefined;
    return item?.status === "resolved"
      ? { status: "resolved", reading: item.reading, metadata: result.metadata }
      : { status: "unresolved", metadata: result.metadata };
  }

  async resolveBatch(
    request: ResolveReadingBatchRequest,
  ): Promise<ResolveReadingBatchResult> {
    const startedAt = this.clock();
    const response = await this.options.executor.parse({
      model: this.model,
      instructions: READING_INSTRUCTIONS,
      input: buildReadingInput(request),
      schema: readingOutputSchema,
      schemaName: "lyrics_assist_readings",
    });
    const parsed = requireCompletedParsed(response);
    const requestedByKey = new Map(
      request.items.map((item) => [item.requestKey, item]),
    );

    return {
      results: parsed.results.map((item) => {
        const requested = requestedByKey.get(item.requestKey);
        if (
          requested === undefined ||
          item.status !== "resolved" ||
          item.reading === null
        ) {
          return { requestKey: item.requestKey, status: "unresolved" as const };
        }

        try {
          const rhyme = normalizeRhyme(item.reading);
          if (rhyme.phonetic.tokens.length === 0) {
            return { requestKey: item.requestKey, status: "unresolved" as const };
          }
          return {
            requestKey: item.requestKey,
            status: "resolved" as const,
            reading: {
              surface: requested.surface,
              reading: item.reading,
              morae: rhyme.rawReading.morae,
              source: "llm" as const,
            },
          };
        } catch {
          return { requestKey: item.requestKey, status: "unresolved" as const };
        }
      }),
      metadata: metadataFor(response, this.clock() - startedAt),
    };
  }
}
