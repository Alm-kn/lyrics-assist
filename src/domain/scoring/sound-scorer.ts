import type {
  NormalizedRhymeUnit,
  RhymeRepresentations,
} from "../rhyme/types";
import type {
  SoundScoreAdjustment,
  SoundScoreResult,
  SoundScoringConfig,
} from "./types";

function assertValidInput(
  label: "source" | "candidate",
  rhyme: RhymeRepresentations,
): void {
  if (rhyme.phonetic.tokens.length === 0) {
    throw new Error(
      `Invalid Sound Scorer input: ${label} Phonetic Representation is empty`,
    );
  }

  if (rhyme.normalized.units.length === 0) {
    throw new Error(
      `Invalid Sound Scorer input: ${label} Normalized Rhyme Representation is empty`,
    );
  }
}

function calculateMoraLengthScore(
  source: RhymeRepresentations,
  candidate: RhymeRepresentations,
  config: SoundScoringConfig,
): number {
  const difference = Math.abs(
    source.phonetic.tokens.length - candidate.phonetic.tokens.length,
  );

  return (
    config.moraLength.scoreByDifference[difference] ??
    config.moraLength.fallbackScore
  );
}

function calculatePositionMatchScore(
  sourceUnits: readonly NormalizedRhymeUnit[],
  candidateUnits: readonly NormalizedRhymeUnit[],
): number {
  const maxLength = Math.max(sourceUnits.length, candidateUnits.length);
  let matchingPositionCount = 0;

  for (let index = 0; index < maxLength; index += 1) {
    if (
      sourceUnits[index] !== undefined &&
      sourceUnits[index] === candidateUnits[index]
    ) {
      matchingPositionCount += 1;
    }
  }

  return (matchingPositionCount / maxLength) * 100;
}

function calculateLevenshteinDistance(
  sourceUnits: readonly NormalizedRhymeUnit[],
  candidateUnits: readonly NormalizedRhymeUnit[],
): number {
  let previousRow = Array.from(
    { length: candidateUnits.length + 1 },
    (_, index) => index,
  );

  for (let sourceIndex = 1; sourceIndex <= sourceUnits.length; sourceIndex += 1) {
    const currentRow = [sourceIndex];

    for (
      let candidateIndex = 1;
      candidateIndex <= candidateUnits.length;
      candidateIndex += 1
    ) {
      const substitutionCost =
        sourceUnits[sourceIndex - 1] === candidateUnits[candidateIndex - 1]
          ? 0
          : 1;

      currentRow[candidateIndex] = Math.min(
        currentRow[candidateIndex - 1] + 1,
        previousRow[candidateIndex] + 1,
        previousRow[candidateIndex - 1] + substitutionCost,
      );
    }

    previousRow = currentRow;
  }

  return previousRow[candidateUnits.length];
}

function calculateSequenceSimilarityScore(
  sourceUnits: readonly NormalizedRhymeUnit[],
  candidateUnits: readonly NormalizedRhymeUnit[],
): number {
  const maxLength = Math.max(sourceUnits.length, candidateUnits.length);
  const distance = calculateLevenshteinDistance(sourceUnits, candidateUnits);

  return (1 - distance / maxLength) * 100;
}

function calculateEndingAdjustment(
  sourceUnits: readonly NormalizedRhymeUnit[],
  candidateUnits: readonly NormalizedRhymeUnit[],
  config: SoundScoringConfig,
): SoundScoreAdjustment {
  const maxLength = Math.max(sourceUnits.length, candidateUnits.length);
  let commonSuffixLength = 0;

  while (
    commonSuffixLength < sourceUnits.length &&
    commonSuffixLength < candidateUnits.length &&
    sourceUnits[sourceUnits.length - 1 - commonSuffixLength] ===
      candidateUnits[candidateUnits.length - 1 - commonSuffixLength]
  ) {
    commonSuffixLength += 1;
  }

  const suffixCoverage = commonSuffixLength / maxLength;
  const bonus = suffixCoverage * config.endingBonus.maxPoints;

  return {
    ruleId: "ending-rhyme-bonus",
    scoreDelta: bonus,
    reason: "Linear bonus based on normalized common-suffix coverage",
    commonSuffixLength,
    suffixCoverage,
    bonus,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Calculate the deterministic v0.1 sound score from normalized inputs. */
export function calculateSoundScore(
  source: RhymeRepresentations,
  candidate: RhymeRepresentations,
  config: SoundScoringConfig,
): SoundScoreResult {
  assertValidInput("source", source);
  assertValidInput("candidate", candidate);

  if (
    source.normalized.normalizerVersion !==
    candidate.normalized.normalizerVersion
  ) {
    throw new Error(
      "Invalid Sound Scorer input: source and candidate normalizer versions differ",
    );
  }

  const moraLengthScore = calculateMoraLengthScore(source, candidate, config);
  const positionMatchScore = calculatePositionMatchScore(
    source.normalized.units,
    candidate.normalized.units,
  );
  const sequenceSimilarityScore = calculateSequenceSimilarityScore(
    source.normalized.units,
    candidate.normalized.units,
  );
  const endingAdjustment = calculateEndingAdjustment(
    source.normalized.units,
    candidate.normalized.units,
    config,
  );
  const rawScore =
    moraLengthScore * config.weights.moraLength +
    positionMatchScore * config.weights.positionMatch +
    sequenceSimilarityScore * config.weights.sequenceSimilarity +
    endingAdjustment.bonus;

  return {
    finalScore: Math.round(clamp(rawScore, 0, 100)),
    rawScore,
    breakdown: {
      moraLengthScore,
      positionMatchScore,
      sequenceSimilarityScore,
    },
    adjustments: [endingAdjustment],
    reason:
      "Mora length, normalized position and sequence similarity, plus ending rhyme bonus",
    scoringConfigVersion: config.version,
    normalizerVersion: source.normalized.normalizerVersion,
  };
}
