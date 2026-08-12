import {
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_SOUND_SCORING_CONFIG,
  normalizeRhyme,
} from "../../domain";
import type { SelectionConfig, SoundScoringConfig } from "../../domain";
import { ApplicationError } from "../errors/application-error";
import type { LlmAdapter } from "../ports/llm-adapter";
import type { ReadingResolver } from "../ports/reading-resolver";
import type { RoundPersistencePort } from "../ports/round-persistence";
import {
  DEFAULT_GENERATION_APPLICATION_CONFIG,
  type GeneratedRoundView,
  type GenerationApplicationConfig,
} from "../types";
import { mapPersistenceError } from "./persistence-errors";
import { executeRoundPipeline, joinPersistedRound } from "./round-pipeline";

export interface GenerateInitialRoundInput {
  readonly userId: string;
  readonly sourceSurface: string;
}

export interface GenerationServiceDependencies {
  readonly readingResolver: ReadingResolver;
  readonly llmAdapter: LlmAdapter;
  readonly roundPersistence: RoundPersistencePort;
  readonly scoringConfig?: SoundScoringConfig;
  readonly selectionConfig?: SelectionConfig;
  readonly applicationConfig?: GenerationApplicationConfig;
}

export class GenerationService {
  private readonly scoringConfig: SoundScoringConfig;
  private readonly selectionConfig: SelectionConfig;
  private readonly applicationConfig: GenerationApplicationConfig;

  constructor(private readonly dependencies: GenerationServiceDependencies) {
    this.scoringConfig =
      dependencies.scoringConfig ?? DEFAULT_SOUND_SCORING_CONFIG;
    this.selectionConfig =
      dependencies.selectionConfig ?? DEFAULT_SELECTION_CONFIG;
    this.applicationConfig =
      dependencies.applicationConfig ?? DEFAULT_GENERATION_APPLICATION_CONFIG;
  }

  async generateInitialRound(
    input: GenerateInitialRoundInput,
  ): Promise<GeneratedRoundView> {
    if (
      input.userId.length === 0 ||
      input.sourceSurface.trim().length === 0 ||
      !Number.isInteger(this.applicationConfig.generationTargetCount) ||
      this.applicationConfig.generationTargetCount <= 0
    ) {
      throw new ApplicationError("INVALID_INPUT", "Generation input is invalid");
    }

    let resolution;
    try {
      resolution = await this.dependencies.readingResolver.resolve({
        surface: input.sourceSurface,
      });
    } catch (cause) {
      throw new ApplicationError(
        "READING_RESOLVER_FAILED",
        "Reading Resolver failed for the source",
        cause,
      );
    }

    if (resolution.status === "unresolved") {
      throw new ApplicationError(
        "SOURCE_READING_UNRESOLVED",
        "The source reading could not be resolved",
      );
    }

    if (resolution.reading.surface !== input.sourceSurface) {
      throw new ApplicationError(
        "READING_RESOLVER_FAILED",
        "Reading Resolver returned a different source surface",
      );
    }

    const sourceReading = resolution.reading.reading;
    const round = await executeRoundPipeline(
      {
        sourceSurface: input.sourceSurface,
        sourceReading,
        sourceRhyme: normalizeRhyme(sourceReading),
        roundNumber: 1,
        generationTargetCount:
          this.applicationConfig.generationTargetCount,
        excludeTerms: [],
        scoringConfig: this.scoringConfig,
        selectionConfig: this.selectionConfig,
      },
      this.dependencies,
    );

    let persisted;
    try {
      persisted = await this.dependencies.roundPersistence.saveInitialRound({
        userId: input.userId,
        sourceSurface: input.sourceSurface,
        sourceReading,
        round,
      });
    } catch (cause) {
      throw mapPersistenceError(cause);
    }

    return joinPersistedRound(
      { surface: input.sourceSurface, reading: sourceReading },
      round,
      persisted,
    );
  }
}
