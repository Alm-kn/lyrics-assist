import type { CandidateKey } from "../candidate/types";
import type { SoundScoreResult } from "../scoring/types";
import type { SemanticResult } from "../semantic/types";
import type {
  CandidateSelectionCandidate,
  CandidateSelectionInput,
  SelectedCandidate,
  SelectionConfig,
  SelectionResult,
  SelectionShortageEvent,
  SelectionTargetCategory,
} from "./types";

interface SelectableCandidate {
  readonly candidateKey: CandidateKey;
  readonly surface: string;
  readonly canonicalSurface: string;
  readonly sound: SoundScoreResult;
  readonly semantic: SemanticResult;
  readonly endingBonus: number;
}

interface BalancedMetrics {
  readonly minScore: number;
  readonly meanScore: number;
  readonly balancedScore: number;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function katakanaToHiragana(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);

    if (codePoint !== undefined && codePoint >= 0x30a1 && codePoint <= 0x30f6) {
      return String.fromCodePoint(codePoint - 0x60);
    }

    return character;
  }).join("");
}

/** Canonicalize only the literal surface features fixed by selection-v0.1. */
export function canonicalizeSurface(surface: string): string {
  const normalized = surface.trim().normalize("NFKC");
  const latinLowercase = Array.from(normalized, (character) =>
    /\p{Script=Latin}/u.test(character) ? character.toLowerCase() : character,
  ).join("");

  return katakanaToHiragana(latinLowercase);
}

function hasRequiredEvaluation(
  candidate: CandidateSelectionCandidate,
): candidate is CandidateSelectionCandidate & {
  readonly sound: SoundScoreResult;
  readonly semantic: SemanticResult;
} {
  return candidate.sound !== undefined && candidate.semantic !== undefined;
}

function buildSelectablePool(
  input: CandidateSelectionInput,
): SelectableCandidate[] {
  const candidateKeyCounts = new Map<CandidateKey, number>();

  for (const candidate of input.candidates) {
    candidateKeyCounts.set(
      candidate.candidateKey,
      (candidateKeyCounts.get(candidate.candidateKey) ?? 0) + 1,
    );
  }

  const duplicateCandidateKeys = new Set(
    [...candidateKeyCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([candidateKey]) => candidateKey),
  );
  const sourceCanonicalSurface = canonicalizeSurface(input.source.surface);
  const excludedCanonicalSurfaces = new Set(
    input.excludeTerms.map(canonicalizeSurface),
  );
  const eligible: SelectableCandidate[] = [];

  for (const candidate of input.candidates) {
    if (
      duplicateCandidateKeys.has(candidate.candidateKey) ||
      !hasRequiredEvaluation(candidate)
    ) {
      continue;
    }

    const canonicalSurface = canonicalizeSurface(candidate.surface);

    if (
      canonicalSurface === sourceCanonicalSurface ||
      excludedCanonicalSurfaces.has(canonicalSurface)
    ) {
      continue;
    }

    const endingBonus = candidate.sound.adjustments[0]?.bonus;
    const requiredNumbers = [
      candidate.sound.finalScore,
      candidate.sound.breakdown.moraLengthScore,
      candidate.semantic.semanticScore,
      endingBonus,
    ];

    if (endingBonus === undefined || !requiredNumbers.every(Number.isFinite)) {
      continue;
    }

    eligible.push({
      candidateKey: candidate.candidateKey,
      surface: candidate.surface,
      canonicalSurface,
      sound: candidate.sound,
      semantic: candidate.semantic,
      endingBonus,
    });
  }

  eligible.sort((left, right) =>
    compareText(left.candidateKey, right.candidateKey),
  );

  const representativeByCanonicalSurface = new Map<
    string,
    SelectableCandidate
  >();

  for (const candidate of eligible) {
    if (!representativeByCanonicalSurface.has(candidate.canonicalSurface)) {
      representativeByCanonicalSurface.set(
        candidate.canonicalSurface,
        candidate,
      );
    }
  }

  return [...representativeByCanonicalSurface.values()].sort(
    (left, right) =>
      compareText(left.canonicalSurface, right.canonicalSurface) ||
      compareText(left.candidateKey, right.candidateKey),
  );
}

function countBy(
  candidates: readonly SelectableCandidate[],
  value: (candidate: SelectableCandidate) => string,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    const key = value(candidate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function balancedMetrics(
  candidate: SelectableCandidate,
  config: SelectionConfig,
): BalancedMetrics {
  const minScore = Math.min(
    candidate.sound.finalScore,
    candidate.semantic.semanticScore,
  );
  const meanScore =
    (candidate.sound.finalScore + candidate.semantic.semanticScore) / 2;

  return {
    minScore,
    meanScore,
    balancedScore:
      minScore * config.balanced.minimumAxisWeight +
      meanScore * config.balanced.averageAxisWeight,
  };
}

function compareBalanced(
  left: SelectableCandidate,
  right: SelectableCandidate,
  selected: readonly SelectableCandidate[],
  config: SelectionConfig,
): number {
  const leftMetrics = balancedMetrics(left, config);
  const rightMetrics = balancedMetrics(right, config);
  const clusterCounts = countBy(
    selected,
    (candidate) => candidate.semantic.semanticCluster,
  );

  return (
    rightMetrics.balancedScore - leftMetrics.balancedScore ||
    (clusterCounts.get(left.semantic.semanticCluster) ?? 0) -
      (clusterCounts.get(right.semantic.semanticCluster) ?? 0) ||
    rightMetrics.minScore - leftMetrics.minScore ||
    rightMetrics.meanScore - leftMetrics.meanScore ||
    compareText(left.canonicalSurface, right.canonicalSurface) ||
    compareText(left.candidateKey, right.candidateKey)
  );
}

function compareSound(
  left: SelectableCandidate,
  right: SelectableCandidate,
): number {
  return (
    right.sound.finalScore - left.sound.finalScore ||
    right.endingBonus - left.endingBonus ||
    right.sound.breakdown.moraLengthScore -
      left.sound.breakdown.moraLengthScore ||
    compareText(left.canonicalSurface, right.canonicalSurface) ||
    compareText(left.candidateKey, right.candidateKey)
  );
}

function compareSemantic(
  left: SelectableCandidate,
  right: SelectableCandidate,
  selected: readonly SelectableCandidate[],
): number {
  const relationCounts = countBy(
    selected,
    (candidate) => candidate.semantic.primaryRelation,
  );
  const clusterCounts = countBy(
    selected,
    (candidate) => candidate.semantic.semanticCluster,
  );
  const leftRelationIsUnused =
    (relationCounts.get(left.semantic.primaryRelation) ?? 0) === 0;
  const rightRelationIsUnused =
    (relationCounts.get(right.semantic.primaryRelation) ?? 0) === 0;

  return (
    right.semantic.semanticScore - left.semantic.semanticScore ||
    Number(rightRelationIsUnused) - Number(leftRelationIsUnused) ||
    (clusterCounts.get(left.semantic.semanticCluster) ?? 0) -
      (clusterCounts.get(right.semantic.semanticCluster) ?? 0) ||
    compareText(left.canonicalSurface, right.canonicalSurface) ||
    compareText(left.candidateKey, right.candidateKey)
  );
}

function pickBest(
  candidates: readonly SelectableCandidate[],
  eligible: (candidate: SelectableCandidate) => boolean,
  compare: (left: SelectableCandidate, right: SelectableCandidate) => number,
): SelectableCandidate | undefined {
  let best: SelectableCandidate | undefined;

  for (const candidate of candidates) {
    if (!eligible(candidate)) {
      continue;
    }

    if (best === undefined || compare(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best;
}

function scoreForStrategy(
  candidate: SelectableCandidate,
  strategy: SelectionTargetCategory,
  config: SelectionConfig,
): number {
  switch (strategy) {
    case "balanced":
      return balancedMetrics(candidate, config).balancedScore;
    case "sound":
      return candidate.sound.finalScore;
    case "semantic":
      return candidate.semantic.semanticScore;
  }
}

/** Select up to the configured total from an already evaluated candidate pool. */
export function selectCandidates(input: CandidateSelectionInput): SelectionResult {
  const remaining = buildSelectablePool(input);
  const selected: SelectedCandidate[] = [];
  const balancedSelected: SelectableCandidate[] = [];
  const semanticSelected: SelectableCandidate[] = [];
  const primaryCounts: Record<SelectionTargetCategory, number> = {
    balanced: 0,
    sound: 0,
    semantic: 0,
  };

  const removeAndRecord = (
    candidate: SelectableCandidate,
    category: SelectionTargetCategory | "fallback",
    strategy: SelectionTargetCategory,
  ): void => {
    const remainingIndex = remaining.findIndex(
      (item) => item.candidateKey === candidate.candidateKey,
    );

    if (remainingIndex >= 0) {
      remaining.splice(remainingIndex, 1);
    }

    const selectionBase = {
      candidateKey: candidate.candidateKey,
      selectionRank: selected.length + 1,
      selectionScore: scoreForStrategy(candidate, strategy, input.config),
      selectionReason:
        category === "fallback"
          ? `Fallback selected with ${strategy} ranking`
          : `Primary ${strategy} selection`,
    };

    if (category === "fallback") {
      selected.push({
        ...selectionBase,
        selectionCategory: "fallback",
        fallbackStrategy: strategy,
      });
    } else {
      selected.push({
        ...selectionBase,
        selectionCategory: category,
      });
      primaryCounts[category] += 1;
    }

    if (strategy === "balanced") {
      balancedSelected.push(candidate);
    } else if (strategy === "semantic") {
      semanticSelected.push(candidate);
    }
  };

  while (
    primaryCounts.balanced < input.config.targetCounts.balanced &&
    selected.length < input.config.targetTotal
  ) {
    const clusterCounts = countBy(
      balancedSelected,
      (candidate) => candidate.semantic.semanticCluster,
    );
    const candidate = pickBest(
      remaining,
      (item) =>
        (clusterCounts.get(item.semantic.semanticCluster) ?? 0) <
        input.config.balanced.maximumPerSemanticCluster,
      (left, right) =>
        compareBalanced(left, right, balancedSelected, input.config),
    );

    if (candidate === undefined) {
      break;
    }

    removeAndRecord(candidate, "balanced", "balanced");
  }

  while (
    primaryCounts.sound < input.config.targetCounts.sound &&
    selected.length < input.config.targetTotal
  ) {
    const candidate = pickBest(remaining, () => true, compareSound);

    if (candidate === undefined) {
      break;
    }

    removeAndRecord(candidate, "sound", "sound");
  }

  while (
    primaryCounts.semantic < input.config.targetCounts.semantic &&
    selected.length < input.config.targetTotal
  ) {
    const clusterCounts = countBy(
      semanticSelected,
      (candidate) => candidate.semantic.semanticCluster,
    );
    const candidate = pickBest(
      remaining,
      (item) =>
        (clusterCounts.get(item.semantic.semanticCluster) ?? 0) <
        input.config.semantic.primaryMaximumPerSemanticCluster,
      (left, right) => compareSemantic(left, right, semanticSelected),
    );

    if (candidate === undefined) {
      break;
    }

    removeAndRecord(candidate, "semantic", "semantic");
  }

  const shortageEvents: SelectionShortageEvent[] = (
    ["balanced", "sound", "semantic"] as const
  ).flatMap((category) => {
    const missingCount =
      input.config.targetCounts[category] - primaryCounts[category];

    return missingCount > 0
      ? [
          {
            category,
            missingCount,
            reason: "Primary target was not met by the valid remaining pool",
          },
        ]
      : [];
  });

  const pickFallback = (
    strategy: SelectionTargetCategory,
  ): SelectableCandidate | undefined => {
    if (strategy === "sound") {
      return pickBest(remaining, () => true, compareSound);
    }

    if (strategy === "balanced") {
      const clusterCounts = countBy(
        balancedSelected,
        (candidate) => candidate.semantic.semanticCluster,
      );
      const compare = (left: SelectableCandidate, right: SelectableCandidate) =>
        compareBalanced(left, right, balancedSelected, input.config);
      const capped = pickBest(
        remaining,
        (item) =>
          (clusterCounts.get(item.semantic.semanticCluster) ?? 0) <
          input.config.balanced.maximumPerSemanticCluster,
        compare,
      );

      return capped ?? pickBest(remaining, () => true, compare);
    }

    const clusterCounts = countBy(
      semanticSelected,
      (candidate) => candidate.semantic.semanticCluster,
    );
    const compare = (left: SelectableCandidate, right: SelectableCandidate) =>
      compareSemantic(left, right, semanticSelected);
    const capped = pickBest(
      remaining,
      (item) =>
        (clusterCounts.get(item.semantic.semanticCluster) ?? 0) <
        input.config.semantic.fallbackMaximumPerSemanticCluster,
      compare,
    );

    return capped ?? pickBest(remaining, () => true, compare);
  };

  while (
    selected.length < input.config.targetTotal &&
    remaining.length > 0
  ) {
    let additionsThisRound = 0;

    for (const strategy of input.config.fallbackPriority) {
      if (
        selected.length >= input.config.targetTotal ||
        remaining.length === 0
      ) {
        break;
      }

      const candidate = pickFallback(strategy);

      if (candidate !== undefined) {
        removeAndRecord(candidate, "fallback", strategy);
        additionsThisRound += 1;
      }
    }

    if (additionsThisRound === 0) {
      break;
    }
  }

  return {
    selected,
    selectionConfigVersion: input.config.version,
    shortageEvents,
  };
}
