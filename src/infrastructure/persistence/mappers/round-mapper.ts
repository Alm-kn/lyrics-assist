import type { CandidateKey, SelectedCandidate } from "../../../domain";
import { candidateResults, generationRounds } from "../schema";
import { serializeJsonSnapshot } from "../json";
import type { CompletedRoundSnapshot } from "../types";

interface MappedRoundSnapshot {
  readonly round: typeof generationRounds.$inferInsert;
  readonly candidates: readonly (typeof candidateResults.$inferInsert)[];
  readonly candidateResultIds: Readonly<Record<CandidateKey, string>>;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
}

function assertIntegerAtLeast(value: number, minimum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
  }
}

function assertFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
}

function buildSelectionMap(
  selected: readonly SelectedCandidate[],
): ReadonlyMap<CandidateKey, SelectedCandidate> {
  const byCandidateKey = new Map<CandidateKey, SelectedCandidate>();

  selected.forEach((item, index) => {
    if (item.selectionRank !== index + 1) {
      throw new Error("SelectionResult ranks must match its 1-based array order");
    }

    if (!Number.isFinite(item.selectionScore)) {
      throw new Error("SelectionResult contains a non-finite selection score");
    }

    if (byCandidateKey.has(item.candidateKey)) {
      throw new Error(`SelectionResult contains duplicate key: ${item.candidateKey}`);
    }

    byCandidateKey.set(item.candidateKey, item);
  });

  return byCandidateKey;
}

export function mapCompletedRoundSnapshot(
  roundId: string,
  sessionId: string,
  snapshot: CompletedRoundSnapshot,
  createdAt: number,
  generateId: () => string,
): MappedRoundSnapshot {
  assertNonEmpty(roundId, "roundId");
  assertNonEmpty(sessionId, "sessionId");
  assertIntegerAtLeast(snapshot.roundNumber, 1, "roundNumber");
  assertIntegerAtLeast(
    snapshot.generationTargetCount,
    1,
    "generationTargetCount",
  );
  assertIntegerAtLeast(createdAt, 0, "createdAt");

  const normalizerVersion = snapshot.sourceRhyme.normalized.normalizerVersion;
  assertNonEmpty(normalizerVersion, "normalizerVersion");

  if (
    snapshot.selectionResult.selectionConfigVersion !==
    snapshot.selectionConfig.version
  ) {
    throw new Error("SelectionResult and SelectionConfig versions differ");
  }

  const generatedKeyCounts = new Map<CandidateKey, number>();
  for (const generated of snapshot.generationResult.candidates) {
    generatedKeyCounts.set(
      generated.candidateKey,
      (generatedKeyCounts.get(generated.candidateKey) ?? 0) + 1,
    );
  }

  const semanticKeyCounts = new Map<CandidateKey, number>();
  for (const evaluated of snapshot.semanticEvaluationResult.results) {
    semanticKeyCounts.set(
      evaluated.candidateKey,
      (semanticKeyCounts.get(evaluated.candidateKey) ?? 0) + 1,
    );
  }

  const selectionByCandidateKey = buildSelectionMap(
    snapshot.selectionResult.selected,
  );
  const candidateKeys = new Set<CandidateKey>();
  const generationIndices = new Set<number>();
  const candidateResultIds: Record<CandidateKey, string> = {};

  const candidates = snapshot.candidates.map((candidate) => {
    assertNonEmpty(candidate.candidateKey, "candidateKey");
    assertNonEmpty(candidate.surface, "candidate surface");
    assertIntegerAtLeast(candidate.generationIndex, 0, "generationIndex");

    if (candidateKeys.has(candidate.candidateKey)) {
      throw new Error(`Duplicate evaluated candidateKey: ${candidate.candidateKey}`);
    }
    candidateKeys.add(candidate.candidateKey);

    if (generationIndices.has(candidate.generationIndex)) {
      throw new Error(`Duplicate generationIndex: ${candidate.generationIndex}`);
    }
    generationIndices.add(candidate.generationIndex);

    if (generatedKeyCounts.get(candidate.candidateKey) !== 1) {
      throw new Error(
        `Evaluated candidateKey is not unique in generation result: ${candidate.candidateKey}`,
      );
    }

    if (semanticKeyCounts.get(candidate.candidateKey) !== 1) {
      throw new Error(
        `Evaluated candidateKey is not unique in semantic result: ${candidate.candidateKey}`,
      );
    }

    const generated = snapshot.generationResult.candidates[candidate.generationIndex];
    if (
      generated === undefined ||
      generated.candidateKey !== candidate.candidateKey ||
      generated.surface !== candidate.surface
    ) {
      throw new Error(
        `generationIndex does not identify candidate ${candidate.candidateKey}`,
      );
    }

    const semanticItem = snapshot.semanticEvaluationResult.results.find(
      (item) => item.candidateKey === candidate.candidateKey,
    );
    if (
      semanticItem === undefined ||
      semanticItem.score !== candidate.semanticResult.semanticScore ||
      semanticItem.reason !== candidate.semanticResult.reason ||
      semanticItem.primaryRelation !== candidate.semanticResult.primaryRelation ||
      semanticItem.semanticCluster !== candidate.semanticResult.semanticCluster ||
      JSON.stringify(semanticItem.secondaryRelations) !==
        JSON.stringify(candidate.semanticResult.secondaryRelations)
    ) {
      throw new Error(
        `Semantic projection does not match adapter result: ${candidate.candidateKey}`,
      );
    }

    if (
      candidate.semanticResult.modelIdentifier !==
        snapshot.semanticEvaluationResult.metadata.modelIdentifier ||
      candidate.semanticResult.semanticPromptVersion !==
        snapshot.semanticEvaluationResult.metadata.semanticPromptVersion
    ) {
      throw new Error(
        `Semantic metadata differs for candidate: ${candidate.candidateKey}`,
      );
    }

    if (
      candidate.readingResult.surface !== candidate.surface ||
      candidate.readingResult.reading !==
        candidate.rhymeRepresentation.rawReading.reading
    ) {
      throw new Error(
        `Reading and rhyme snapshots differ for candidate: ${candidate.candidateKey}`,
      );
    }

    if (
      candidate.rhymeRepresentation.normalized.normalizerVersion !==
        normalizerVersion ||
      candidate.soundResult.normalizerVersion !== normalizerVersion
    ) {
      throw new Error(
        `Normalizer versions differ for candidate: ${candidate.candidateKey}`,
      );
    }

    if (candidate.soundResult.scoringConfigVersion !== snapshot.scoringConfig.version) {
      throw new Error(
        `Scoring config version differs for candidate: ${candidate.candidateKey}`,
      );
    }

    assertIntegerAtLeast(candidate.soundResult.finalScore, 0, "sound final score");
    assertFiniteRange(candidate.soundResult.finalScore, 0, 100, "sound final score");
    assertFiniteRange(
      candidate.semanticResult.semanticScore,
      0,
      100,
      "semantic score",
    );

    const endingAdjustment = candidate.soundResult.adjustments.find(
      (adjustment) => adjustment.ruleId === "ending-rhyme-bonus",
    );
    if (endingAdjustment === undefined) {
      throw new Error(
        `Sound result has no ending-rhyme-bonus: ${candidate.candidateKey}`,
      );
    }

    assertIntegerAtLeast(
      endingAdjustment.commonSuffixLength,
      0,
      "commonSuffixLength",
    );
    assertFiniteRange(endingAdjustment.suffixCoverage, 0, 1, "suffixCoverage");

    const analyticalNumbers = [
      candidate.soundResult.rawScore,
      candidate.soundResult.breakdown.moraLengthScore,
      candidate.soundResult.breakdown.positionMatchScore,
      candidate.soundResult.breakdown.sequenceSimilarityScore,
      endingAdjustment.bonus,
    ];
    if (!analyticalNumbers.every(Number.isFinite)) {
      throw new Error(
        `Sound result contains non-finite analysis data: ${candidate.candidateKey}`,
      );
    }

    const selection = selectionByCandidateKey.get(candidate.candidateKey);
    const id = generateId();
    candidateResultIds[candidate.candidateKey] = id;

    const selectionProjection =
      selection === undefined
        ? {
            selected: false,
            selectionCategory: null,
            fallbackStrategy: null,
            selectionScore: null,
            selectionRank: null,
          }
        : {
            selected: true,
            selectionCategory: selection.selectionCategory,
            fallbackStrategy:
              selection.selectionCategory === "fallback"
                ? selection.fallbackStrategy
                : null,
            selectionScore: selection.selectionScore,
            selectionRank: selection.selectionRank,
          };

    return {
      id,
      roundId,
      candidateKey: candidate.candidateKey,
      generationIndex: candidate.generationIndex,
      surface: candidate.surface,
      generationReadingHint: generated.readingHint ?? null,
      reading: candidate.readingResult.reading,
      readingResultJson: serializeJsonSnapshot(
        candidate.readingResult,
        "readingResult",
      ),
      rhymeRepresentationJson: serializeJsonSnapshot(
        candidate.rhymeRepresentation,
        "rhymeRepresentation",
      ),
      soundFinalScore: candidate.soundResult.finalScore,
      soundRawScore: candidate.soundResult.rawScore,
      moraLengthScore: candidate.soundResult.breakdown.moraLengthScore,
      positionMatchScore: candidate.soundResult.breakdown.positionMatchScore,
      sequenceSimilarityScore:
        candidate.soundResult.breakdown.sequenceSimilarityScore,
      commonSuffixLength: endingAdjustment.commonSuffixLength,
      suffixCoverage: endingAdjustment.suffixCoverage,
      endingBonus: endingAdjustment.bonus,
      soundResultJson: serializeJsonSnapshot(candidate.soundResult, "soundResult"),
      semanticScore: candidate.semanticResult.semanticScore,
      semanticReason: candidate.semanticResult.reason,
      primaryRelation: candidate.semanticResult.primaryRelation,
      secondaryRelationsJson: serializeJsonSnapshot(
        candidate.semanticResult.secondaryRelations,
        "secondaryRelations",
      ),
      semanticCluster: candidate.semanticResult.semanticCluster,
      semanticModelIdentifier: candidate.semanticResult.modelIdentifier,
      semanticPromptVersion: candidate.semanticResult.semanticPromptVersion,
      semanticResultJson: serializeJsonSnapshot(
        candidate.semanticResult,
        "semanticResult",
      ),
      ...selectionProjection,
      createdAt,
    } satisfies typeof candidateResults.$inferInsert;
  });

  for (const selectedKey of selectionByCandidateKey.keys()) {
    if (!candidateKeys.has(selectedKey)) {
      throw new Error(`Selected candidate is not in evaluated pool: ${selectedKey}`);
    }
  }

  return {
    round: {
      id: roundId,
      sessionId,
      roundNumber: snapshot.roundNumber,
      generationTargetCount: snapshot.generationTargetCount,
      excludeTermsJson: serializeJsonSnapshot(snapshot.excludeTerms, "excludeTerms"),
      generationModelIdentifier:
        snapshot.generationResult.metadata.modelIdentifier,
      generationPromptVersion:
        snapshot.generationResult.metadata.generationPromptVersion,
      generationResultJson: serializeJsonSnapshot(
        snapshot.generationResult,
        "generationResult",
      ),
      candidateReadingResolutionResultJson: serializeJsonSnapshot(
        snapshot.candidateReadingResolutionResult,
        "candidateReadingResolutionResult",
      ),
      semanticEvaluationResultJson: serializeJsonSnapshot(
        snapshot.semanticEvaluationResult,
        "semanticEvaluationResult",
      ),
      normalizerVersion,
      sourceRhymeJson: serializeJsonSnapshot(snapshot.sourceRhyme, "sourceRhyme"),
      scoringConfigVersion: snapshot.scoringConfig.version,
      selectionConfigVersion: snapshot.selectionConfig.version,
      selectionResultJson: serializeJsonSnapshot(
        snapshot.selectionResult,
        "selectionResult",
      ),
      createdAt,
    },
    candidates,
    candidateResultIds,
  };
}
