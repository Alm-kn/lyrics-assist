import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

export const OPENAI_INFERENCE_CONFIG_VERSION = "openai-responses-v0.1";
export const OPENAI_REQUEST_TIMEOUT_MS = 60_000;
export const OPENAI_MAX_RETRIES = 1;

export interface OpenAiStructuredRequest<T> {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly schema: z.ZodType<T>;
  readonly schemaName: string;
}

export interface OpenAiStructuredResponse<T> {
  readonly id: string;
  readonly model: string;
  readonly status?: string;
  readonly outputParsed: T | null;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

export interface OpenAiResponsesExecutor {
  parse<T>(request: OpenAiStructuredRequest<T>): Promise<OpenAiStructuredResponse<T>>;
}

/** Official SDK boundary kept inside Infrastructure for offline fake injection. */
export class SdkOpenAiResponsesExecutor implements OpenAiResponsesExecutor {
  constructor(private readonly client: OpenAI) {}

  async parse<T>(
    request: OpenAiStructuredRequest<T>,
  ): Promise<OpenAiStructuredResponse<T>> {
    const response = await this.client.responses.parse({
      model: request.model,
      instructions: request.instructions,
      input: request.input,
      text: { format: zodTextFormat(request.schema, request.schemaName) },
      reasoning: { effort: "none" },
      tools: [],
      store: false,
      stream: false,
    });

    return {
      id: response.id,
      model: response.model,
      status: response.status,
      outputParsed: response.output_parsed,
      ...(response.usage === undefined
        ? {}
        : {
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            },
          }),
    };
  }
}

export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES,
  });
}

export function requireCompletedParsed<T>(
  response: OpenAiStructuredResponse<T>,
): T {
  if (response.status !== "completed" || response.outputParsed === null) {
    throw new Error("OpenAI response was incomplete, refused, or unparseable");
  }
  return response.outputParsed;
}
