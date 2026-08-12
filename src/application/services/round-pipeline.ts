import {
  calculateSoundScore,
  normalizeRhyme,
  selectCandidates,
} from "../../domain";
import type {
  CandidateKey,
  ReadingResult,
  RhymeRepresentations,
  SelectionConfig,
  SemanticResult,
  SoundScoringConfig,
} from "../../domain";
import { ApplicationError } from "../errors/application-error";
import type { LlmAdapter } from "../ports/llm-adapter";
import type { ReadingResolver } from "../ports/reading-resolver";
import type {
  CompletedCandidateSnapshot,
  CompletedRoundSnapshot,
  PersistedRoundReferences,
} from "../ports/round-persistence";
import type {
  GeneratedCandidateView,
  GeneratedRoundView,
} from "../types";

interface RoundPipelineInput {
  readonly sourceSurface: string;
  readonly sourceReading: string;
  readonly sourceRhyme: RhymeRepresentations;
  readonly roundNumber: number;
  readonly generationTargetCount: number;
  readonly excludeTerms: readonly string[];
  readonly scoringConfig: SoundScoringConfig;
  readonly selectionConfig: SelectionConfig;
}

interface RoundPipelineDependencies {
  readonly readingResolver: ReadingResolver;
  readonly llmAdapter: LlmAdapter;
}

interface PreSemanticCandidate {
  readonly candidateKey: CandidateKey;
  readonly generationIndex: number;
  readonly surface: string;
  readonly readingResult: ReadingResult;
  readonly rhymeRepresentation: RhymeRepresentations;
  readonly soundResult: CompletedCandidateSnapshot["soundResult"];
}

function uniqueGenerationIndexes(
  candidates: CompletedRoundSnapshot["generationResult"]["candidates"],
): readonly number[] {
  const counts = new Map<CandidateKey, number>();
  for (const candidate of candidates) {
    counts.set(candidate.candidateKey, (counts.get(candidate.candidateKey) ?? 0) + 1);
  }

  return candidates.flatMap((candidate, index) =>
    counts.get(candidate.candidateKey) === 1 ? [index] : [],
  );
}

function semanticResultIsUsable(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= 100;
}

/** Connect existing M2-M5 logic without duplicating their rules. */
export async function executeRoundPipeline(
  input: RoundPipelineInput,
  dependencies: RoundPipelineDependencies,
): Promise<CompletedRoundSnapshot> {
  let generationResult;
  try {
    generationResult = await dependencies.llmAdapter.generateCandidates({
      source: {
        surface: input.sourceSurface,
        reading: input.sourceReading,
      },
      targetCount: input.generationTargetCount,
      excludeTerms: input.excludeTerms,
    });
  } catch (cause) {
    throw new ApplicationError(
      "CANDIDATE_GENERATION_FAILED",
      "Candidate generation failed",
      cause,
    );
  }

  const preSemanticCandidates: PreSemanticCandidate[] = [];
  const generationIndexes = uniqueGenerationIndexes(generationResult.candidates);
  const readingRequests = generationIndexes.flatMap((generationIndex) => {
    const generated = generationResult.candidates[generationIndex];
    return generated === undefined
      ? []
      : [{
          requestKey: generated.candidateKey,
          surface: generated.surface,
          ...(generated.readingHint === undefined
            ? {}
            : { readingHint: generated.readingHint }),
        }];
  });

  let candidateReadingResolutionResult;
  try {
    candidateReadingResolutionResult =
      await dependencies.readingResolver.resolveBatch({ items: readingRequests });
  } catch (cause) {
    throw new ApplicationError(
      "READING_RESOLVER_FAILED",
      "Reading Resolver failed for candidate batch",
      cause,
    );
  }

  const readingCounts = new Map<CandidateKey, number>();
  for (const item of candidateReadingResolutionResult.results) {
    readingCounts.set(
      item.requestKey,
      (readingCounts.get(item.requestKey) ?? 0) + 1,
    );
  }
  const readingByRequestKey = new Map(
    candidateReadingResolutionResult.results.map((item) => [item.requestKey, item]),
  );

  for (const generationIndex of generationIndexes) {
    const generated = generationResult.candidates[generationIndex];
    if (generated === undefined || readingCounts.get(generated.candidateKey) !== 1) {
      continue;
    }

    const resolution = readingByRequestKey.get(generated.candidateKey);
    if (
      resolution === undefined ||
      resolution.status === "unresolved" ||
      resolution.reading.surface !== generated.surface
    ) {
      continue;
    }

    let rhymeRepresentation: RhymeRepresentations;
    try {
      rhymeRepresentation = normalizeRhyme(resolution.reading.reading);
    } catch {
      continue;
    }
    const soundResult = calculateSoundScore(
      input.sourceRhyme,
      rhymeRepresentation,
      input.scoringConfig,
    );
    preSemanticCandidates.push({
      candidateKey: generated.candidateKey,
      generationIndex,
      surface: generated.surface,
      readingResult: resolution.reading,
      rhymeRepresentation,
      soundResult,
    });
  }

  let semanticEvaluationResult;
  try {
    semanticEvaluationResult = await dependencies.llmAdapter.evaluateSemantics({
      source: { surface: input.sourceSurface },
      candidates: preSemanticCandidates.map((candidate) => ({
        candidateKey: candidate.candidateKey,
        surface: candidate.surface,
      })),
    });
  } catch (cause) {
    throw new ApplicationError(
      "SEMANTIC_EVALUATION_FAILED",
      "Semantic evaluation failed",
      cause,
    );
  }

  const semanticCounts = new Map<CandidateKey, number>();
  for (const item of semanticEvaluationResult.results) {
    semanticCounts.set(
      item.candidateKey,
      (semanticCounts.get(item.candidateKey) ?? 0) + 1,
    );
  }

  const semanticByCandidateKey = new Map(
    semanticEvaluationResult.results.map((item) => [item.candidateKey, item]),
  );
  const candidates: CompletedCandidateSnapshot[] = [];

  for (const candidate of preSemanticCandidates) {
    if (semanticCounts.get(candidate.candidateKey) !== 1) {
      continue;
    }

    const item = semanticByCandidateKey.get(candidate.candidateKey);
    if (item === undefined || !semanticResultIsUsable(item.score)) {
      continue;
    }

    const semanticResult: SemanticResult = {
      word: candidate.surface,
      semanticScore: item.score,
      reason: item.reason,
      primaryRelation: item.primaryRelation,
      secondaryRelations: item.secondaryRelations,
      semanticCluster: item.semanticCluster,
      modelIdentifier: semanticEvaluationResult.metadata.modelIdentifier,
      semanticPromptVersion:
        semanticEvaluationResult.metadata.semanticPromptVersion,
    };
    candidates.push({ ...candidate, semanticResult });
  }

  if (candidates.length === 0) {
    throw new ApplicationError(
      "NO_EVALUABLE_CANDIDATES",
      "No candidate completed Reading, Sound, and Semantic evaluation",
    );
  }

  const selectionResult = selectCandidates({
    source: { surface: input.sourceSurface },
    candidates: candidates.map((candidate) => ({
      candidateKey: candidate.candidateKey,
      surface: candidate.surface,
      reading: candidate.readingResult.reading,
      sound: candidate.soundResult,
      semantic: candidate.semanticResult,
    })),
    excludeTerms: input.excludeTerms,
    config: input.selectionConfig,
  });

  return {
    roundNumber: input.roundNumber,
    generationTargetCount: input.generationTargetCount,
    excludeTerms: input.excludeTerms,
    generationResult,
    candidateReadingResolutionResult,
    semanticEvaluationResult,
    sourceRhyme: input.sourceRhyme,
    scoringConfig: input.scoringConfig,
    selectionConfig: input.selectionConfig,
    selectionResult,
    candidates,
  };
}

export function joinPersistedRound(
  source: { readonly surface: string; readonly reading: string },
  round: CompletedRoundSnapshot,
  persisted: PersistedRoundReferences,
): GeneratedRoundView {
  const idByCandidateKey = new Map(
    persisted.candidateResults.map((candidate) => [
      candidate.candidateKey,
      candidate.candidateResultId,
    ]),
  );
  const candidateByKey = new Map(
    round.candidates.map((candidate) => [candidate.candidateKey, candidate]),
  );
  const candidates: GeneratedCandidateView[] = round.selectionResult.selected.map(
    (selection) => {
      const candidate = candidateByKey.get(selection.candidateKey);
      const candidateResultId = idByCandidateKey.get(selection.candidateKey);
      if (candidate === undefined || candidateResultId === undefined) {
        throw new ApplicationError(
          "PERSISTENCE_FAILED",
          `Persisted candidate mapping is incomplete: ${selection.candidateKey}`,
        );
      }

      return {
        candidateResultId,
        candidateKey: candidate.candidateKey,
        surface: candidate.surface,
        reading: candidate.readingResult.reading,
        sound: candidate.soundResult,
        semantic: candidate.semanticResult,
        selection,
        feedback: {
          candidate: null,
          soundScore: null,
        },
      };
    },
  );

  return {
    sessionId: persisted.sessionId,
    roundId: persisted.roundId,
    roundNumber: round.roundNumber,
    source,
    candidates,
  };
}
