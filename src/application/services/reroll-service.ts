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
import type { SessionContext, SessionQueryPort } from "../ports/session-query";
import {
  DEFAULT_GENERATION_APPLICATION_CONFIG,
  type GeneratedRoundView,
  type GenerationApplicationConfig,
} from "../types";
import { mapPersistenceError } from "./persistence-errors";
import { executeRoundPipeline, joinPersistedRound } from "./round-pipeline";

export interface RerollInput {
  readonly userId: string;
  readonly sessionId: string;
}

export interface RerollServiceDependencies {
  readonly readingResolver: ReadingResolver;
  readonly llmAdapter: LlmAdapter;
  readonly roundPersistence: RoundPersistencePort;
  readonly sessionQuery: SessionQueryPort;
  readonly scoringConfig?: SoundScoringConfig;
  readonly selectionConfig?: SelectionConfig;
  readonly applicationConfig?: GenerationApplicationConfig;
}

function buildExcludeTerms(
  rounds: SessionContext["priorRounds"],
): readonly string[] {
  const seen = new Set<string>();
  const excludeTerms: string[] = [];
  const orderedRounds = [...rounds].sort(
    (left, right) => left.roundNumber - right.roundNumber,
  );

  for (const round of orderedRounds) {
    const orderedCandidates = [...round.selectedCandidates].sort(
      (left, right) => left.selectionRank - right.selectionRank,
    );
    for (const candidate of orderedCandidates) {
      if (!seen.has(candidate.surface)) {
        seen.add(candidate.surface);
        excludeTerms.push(candidate.surface);
      }
    }
  }

  return excludeTerms;
}

export class RerollService {
  private readonly scoringConfig: SoundScoringConfig;
  private readonly selectionConfig: SelectionConfig;
  private readonly applicationConfig: GenerationApplicationConfig;

  constructor(private readonly dependencies: RerollServiceDependencies) {
    this.scoringConfig =
      dependencies.scoringConfig ?? DEFAULT_SOUND_SCORING_CONFIG;
    this.selectionConfig =
      dependencies.selectionConfig ?? DEFAULT_SELECTION_CONFIG;
    this.applicationConfig =
      dependencies.applicationConfig ?? DEFAULT_GENERATION_APPLICATION_CONFIG;
  }

  async reroll(input: RerollInput): Promise<GeneratedRoundView> {
    if (input.userId.length === 0 || input.sessionId.length === 0) {
      throw new ApplicationError("INVALID_INPUT", "Reroll input is invalid");
    }

    let context;
    try {
      context = await this.dependencies.sessionQuery.findSessionContext(input);
    } catch (cause) {
      throw mapPersistenceError(cause);
    }
    if (context === null) {
      throw new ApplicationError("SESSION_NOT_FOUND", "Session was not found");
    }

    const roundNumber =
      Math.max(0, ...context.priorRounds.map((round) => round.roundNumber)) + 1;
    const excludeTerms = buildExcludeTerms(context.priorRounds);
    const round = await executeRoundPipeline(
      {
        sourceSurface: context.sourceSurface,
        sourceReading: context.sourceReading,
        sourceRhyme: normalizeRhyme(context.sourceReading),
        roundNumber,
        generationTargetCount:
          this.applicationConfig.generationTargetCount,
        excludeTerms,
        scoringConfig: this.scoringConfig,
        selectionConfig: this.selectionConfig,
      },
      this.dependencies,
    );

    let persisted;
    try {
      persisted = await this.dependencies.roundPersistence.saveRerollRound({
        sessionId: context.sessionId,
        round,
      });
    } catch (cause) {
      throw mapPersistenceError(cause);
    }

    return joinPersistedRound(
      { surface: context.sourceSurface, reading: context.sourceReading },
      round,
      persisted,
    );
  }
}
