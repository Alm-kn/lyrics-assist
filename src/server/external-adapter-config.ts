import { z } from "zod";

import {
  DEFAULT_OPENAI_GENERATION_MODEL,
  DEFAULT_OPENAI_READING_MODEL,
  DEFAULT_OPENAI_SEMANTIC_MODEL,
} from "../infrastructure/openai";
import { ServerConfigurationError } from "./identity/beta-user-resolver";

export type ExternalAdapterConfig =
  | { readonly mode: "stub" }
  | {
      readonly mode: "openai";
      readonly apiKey: string;
      readonly generationModel: string;
      readonly semanticModel: string;
      readonly readingModel: string;
    };

export function readExternalAdapterConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ExternalAdapterConfig {
  const mode = environment.LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE ?? "stub";
  if (mode === "stub") {
    return { mode };
  }
  if (mode !== "openai") {
    throw new ServerConfigurationError();
  }

  const apiKey = z.string().min(1).safeParse(environment.OPENAI_API_KEY);
  if (!apiKey.success) {
    throw new ServerConfigurationError();
  }
  return {
    mode,
    apiKey: apiKey.data,
    generationModel:
      environment.LYRICS_ASSIST_OPENAI_GENERATION_MODEL ??
      DEFAULT_OPENAI_GENERATION_MODEL,
    semanticModel:
      environment.LYRICS_ASSIST_OPENAI_SEMANTIC_MODEL ??
      DEFAULT_OPENAI_SEMANTIC_MODEL,
    readingModel:
      environment.LYRICS_ASSIST_OPENAI_READING_MODEL ??
      DEFAULT_OPENAI_READING_MODEL,
  };
}
