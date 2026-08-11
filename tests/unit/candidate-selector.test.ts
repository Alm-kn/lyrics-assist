import { describe, expect, it } from "vitest";

import {
  canonicalizeSurface,
  DEFAULT_SELECTION_CONFIG,
  selectCandidates,
} from "../../src/domain";
import type {
  CandidateSelectionCandidate,
  SelectionConfig,
  SelectionTargetCategory,
  SemanticResult,
  SoundScoreResult,
} from "../../src/domain";

interface CandidateOptions {
  readonly surface?: string;
  readonly reading?: string;
  readonly soundScore?: number;
  readonly semanticScore?: number;
  readonly endingBonus?: number;
  readonly moraLengthScore?: number;
  readonly semanticCluster?: string;
  readonly primaryRelation?: string;
}

interface TestConfigOptions {
  readonly balanced?: number;
  readonly sound?: number;
  readonly semantic?: number;
  readonly targetTotal?: number;
  readonly balancedClusterMax?: number;
  readonly semanticPrimaryClusterMax?: number;
  readonly semanticFallbackClusterMax?: number;
  readonly fallbackPriority?: readonly SelectionTargetCategory[];
}

function soundResult(
  finalScore: number,
  endingBonus: number,
  moraLengthScore: number,
): SoundScoreResult {
  return {
    finalScore,
    rawScore: finalScore,
    breakdown: {
      moraLengthScore,
      positionMatchScore: finalScore,
      sequenceSimilarityScore: finalScore,
    },
    adjustments: [
      {
        ruleId: "ending-rhyme-bonus",
        scoreDelta: endingBonus,
        reason: "Selector fixture",
        commonSuffixLength: endingBonus > 0 ? 1 : 0,
        suffixCoverage: endingBonus / 10,
        bonus: endingBonus,
      },
    ],
    reason: "Selector fixture",
    scoringConfigVersion: "sound-v0.1",
    normalizerVersion: "rhyme-v0.1",
  };
}

function semanticResult(
  surface: string,
  score: number,
  semanticCluster: string,
  primaryRelation: string,
): SemanticResult {
  return {
    word: surface,
    semanticScore: score,
    reason: "Selector fixture",
    primaryRelation,
    secondaryRelations: [],
    semanticCluster,
    modelIdentifier: "stub",
    semanticPromptVersion: "semantic-v0.1",
  };
}

function candidate(
  candidateKey: string,
  options: CandidateOptions = {},
): CandidateSelectionCandidate {
  const surface = options.surface ?? candidateKey;
  const soundScore = options.soundScore ?? 50;
  const semanticScore = options.semanticScore ?? 50;

  return {
    candidateKey,
    surface,
    reading: options.reading,
    sound: soundResult(
      soundScore,
      options.endingBonus ?? 0,
      options.moraLengthScore ?? soundScore,
    ),
    semantic: semanticResult(
      surface,
      semanticScore,
      options.semanticCluster ?? `cluster-${candidateKey}`,
      options.primaryRelation ?? `relation-${candidateKey}`,
    ),
  };
}

function testConfig(options: TestConfigOptions = {}): SelectionConfig {
  const balanced = options.balanced ?? 0;
  const sound = options.sound ?? 0;
  const semantic = options.semantic ?? 0;

  return {
    version: "selection-test",
    targetTotal: options.targetTotal ?? balanced + sound + semantic,
    targetCounts: { balanced, sound, semantic },
    balanced: {
      ...DEFAULT_SELECTION_CONFIG.balanced,
      maximumPerSemanticCluster: options.balancedClusterMax ?? 2,
    },
    semantic: {
      primaryMaximumPerSemanticCluster:
        options.semanticPrimaryClusterMax ?? 1,
      fallbackMaximumPerSemanticCluster:
        options.semanticFallbackClusterMax ?? 2,
    },
    fallbackPriority:
      options.fallbackPriority ?? DEFAULT_SELECTION_CONFIG.fallbackPriority,
  };
}

function select(
  candidates: readonly CandidateSelectionCandidate[],
  config: SelectionConfig,
  sourceSurface = "source",
  excludeTerms: readonly string[] = [],
) {
  return selectCandidates({
    source: { surface: sourceSurface },
    candidates,
    excludeTerms,
    config,
  });
}

describe("Candidate Selector v0.1", () => {
  describe("General Filter", () => {
    it("keeps source and exclude terms excluded during fallback", () => {
      const result = select(
        [
          candidate("source-key", { surface: " 夜 " }),
          candidate("excluded-key", { surface: "ツキ" }),
          candidate("valid-key", { surface: "星" }),
        ],
        testConfig({ targetTotal: 3 }),
        "夜",
        ["つき"],
      );

      expect(result.selected).toHaveLength(1);
      expect(result.selected[0]?.candidateKey).toBe("valid-key");
      expect(result.selected[0]?.selectionCategory).toBe("fallback");
    });

    it("collapses katakana and hiragana duplicates by candidateKey order", () => {
      const pool = [
        candidate("candidate-z", { surface: "コンビニ" }),
        candidate("candidate-a", { surface: "こんびに" }),
      ];
      const config = testConfig({ balanced: 1 });

      expect(select(pool, config).selected[0]?.candidateKey).toBe(
        "candidate-a",
      );
      expect(select([...pool].reverse(), config)).toEqual(select(pool, config));
    });

    it("normalizes NFKC, outer whitespace, and Latin case for duplicates", () => {
      const result = select(
        [
          candidate("candidate-z", { surface: " ＨＥＬＬＯ " }),
          candidate("candidate-a", { surface: "hello" }),
        ],
        testConfig({ balanced: 1 }),
      );

      expect(canonicalizeSurface(" ＨＥＬＬＯ ")).toBe("hello");
      expect(canonicalizeSurface("ÉLAN")).toBe("élan");
      expect(canonicalizeSurface("ΑΒ")).toBe("ΑΒ");
      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "candidate-a",
      ]);
    });

    it("does not use matching readings to merge different surfaces", () => {
      const result = select(
        [
          candidate("bridge", { surface: "橋", reading: "はし" }),
          candidate("chopsticks", { surface: "箸", reading: "はし" }),
        ],
        testConfig({ balanced: 2 }),
      );

      expect(result.selected.map((item) => item.candidateKey).sort()).toEqual([
        "bridge",
        "chopsticks",
      ]);
    });

    it("does not remove internal whitespace or punctuation", () => {
      expect(canonicalizeSurface("A B")).toBe("a b");
      expect(canonicalizeSurface("AB")).toBe("ab");
      expect(canonicalizeSurface("A-B")).toBe("a-b");
    });

    it("removes all ambiguous duplicate keys and incomplete evaluations", () => {
      const incomplete = candidate("incomplete");
      const result = select(
        [
          candidate("duplicate", { surface: "候補A" }),
          candidate("duplicate", { surface: "候補B" }),
          { ...incomplete, sound: undefined },
          candidate("valid", { surface: "候補C" }),
        ],
        testConfig({ targetTotal: 4 }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "valid",
      ]);
    });
  });

  describe("Balanced selection", () => {
    it("selects the configured primary target of four", () => {
      const result = select(
        [1, 2, 3, 4, 5].map((index) =>
          candidate(`candidate-${index}`, {
            soundScore: 100 - index,
            semanticScore: 100 - index,
          }),
        ),
        testConfig({ balanced: 4 }),
      );

      expect(result.selected).toHaveLength(4);
      expect(
        result.selected.every(
          (item) => item.selectionCategory === "balanced",
        ),
      ).toBe(true);
    });

    it("retains the unrounded configured balancedScore", () => {
      const result = select(
        [candidate("candidate", { soundScore: 83, semanticScore: 71 })],
        testConfig({ balanced: 1 }),
      );

      expect(result.selected[0]?.selectionScore).toBeCloseTo(72.8, 12);
    });

    it("appropriately penalizes a candidate with one weak axis", () => {
      const result = select(
        [
          candidate("one-weak-axis", {
            soundScore: 100,
            semanticScore: 20,
          }),
          candidate("both-balanced", {
            soundScore: 60,
            semanticScore: 60,
          }),
        ],
        testConfig({ balanced: 1 }),
      );

      expect(result.selected[0]?.candidateKey).toBe("both-balanced");
    });

    it("limits a semantic cluster to two during primary selection", () => {
      const result = select(
        [
          candidate("a-1", { soundScore: 100, semanticScore: 100, semanticCluster: "a" }),
          candidate("a-2", { soundScore: 99, semanticScore: 99, semanticCluster: "a" }),
          candidate("a-3", { soundScore: 98, semanticScore: 98, semanticCluster: "a" }),
          candidate("b-1", { soundScore: 80, semanticScore: 80, semanticCluster: "b" }),
          candidate("c-1", { soundScore: 70, semanticScore: 70, semanticCluster: "c" }),
        ],
        testConfig({ balanced: 4 }),
      );

      expect(
        result.selected.filter((item) => item.candidateKey.startsWith("a-")),
      ).toHaveLength(2);
    });

    it("prefers the less represented cluster when balanced scores tie", () => {
      const result = select(
        [
          candidate("a-first", { surface: "a", semanticCluster: "used" }),
          candidate("b-used", { surface: "b", semanticCluster: "used" }),
          candidate("c-fresh", { surface: "c", semanticCluster: "fresh" }),
        ],
        testConfig({ balanced: 2 }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "a-first",
        "c-fresh",
      ]);
    });
  });

  describe("Sound-focused selection", () => {
    it("selects three by soundScore without semantic penalty", () => {
      const result = select(
        [
          candidate("sound-100", { soundScore: 100, semanticScore: 0 }),
          candidate("sound-90", { soundScore: 90, semanticScore: 100 }),
          candidate("sound-80", { soundScore: 80, semanticScore: 100 }),
          candidate("sound-70", { soundScore: 70, semanticScore: 100 }),
        ],
        testConfig({ sound: 3 }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "sound-100",
        "sound-90",
        "sound-80",
      ]);
      expect(result.selected.map((item) => item.selectionScore)).toEqual([
        100, 90, 80,
      ]);
    });

    it("breaks sound ties by Ending Bonus and then Mora Length", () => {
      const result = select(
        [
          candidate("ending-5-mora-90", {
            soundScore: 80,
            endingBonus: 5,
            moraLengthScore: 90,
          }),
          candidate("ending-4-mora-100", {
            soundScore: 80,
            endingBonus: 4,
            moraLengthScore: 100,
          }),
          candidate("ending-5-mora-80", {
            soundScore: 80,
            endingBonus: 5,
            moraLengthScore: 80,
          }),
        ],
        testConfig({ sound: 3 }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "ending-5-mora-90",
        "ending-5-mora-80",
        "ending-4-mora-100",
      ]);
    });

    it("does not apply semantic cluster constraints", () => {
      const result = select(
        [1, 2, 3].map((index) =>
          candidate(`same-cluster-${index}`, {
            soundScore: 100 - index,
            semanticCluster: "same",
          }),
        ),
        testConfig({ sound: 3 }),
      );

      expect(result.selected).toHaveLength(3);
    });
  });

  describe("Semantic-focused selection", () => {
    it("selects three by semanticScore without sound penalty", () => {
      const result = select(
        [
          candidate("semantic-100", { soundScore: 0, semanticScore: 100 }),
          candidate("semantic-90", { soundScore: 100, semanticScore: 90 }),
          candidate("semantic-80", { soundScore: 100, semanticScore: 80 }),
          candidate("semantic-70", { soundScore: 100, semanticScore: 70 }),
        ],
        testConfig({ semantic: 3 }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "semantic-100",
        "semantic-90",
        "semantic-80",
      ]);
    });

    it("limits a semantic cluster to one during primary selection", () => {
      const result = select(
        [
          candidate("a-100", { semanticScore: 100, semanticCluster: "a" }),
          candidate("a-99", { semanticScore: 99, semanticCluster: "a" }),
          candidate("b-80", { semanticScore: 80, semanticCluster: "b" }),
          candidate("c-70", { semanticScore: 70, semanticCluster: "c" }),
        ],
        testConfig({ semantic: 3 }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "a-100",
        "b-80",
        "c-70",
      ]);
    });

    it("prefers an unused relation before canonical order on score ties", () => {
      const result = select(
        [
          candidate("a-first", {
            surface: "a",
            semanticCluster: "a",
            primaryRelation: "used",
          }),
          candidate("b-used-relation", {
            surface: "b",
            semanticCluster: "b",
            primaryRelation: "used",
          }),
          candidate("c-new-relation", {
            surface: "c",
            semanticCluster: "c",
            primaryRelation: "new",
          }),
        ],
        testConfig({ semantic: 2 }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "a-first",
        "c-new-relation",
      ]);
    });

    it("prefers a less represented cluster after relation diversity ties", () => {
      const result = select(
        [
          candidate("a-first", {
            surface: "a",
            semanticCluster: "used",
            primaryRelation: "first",
          }),
          candidate("b-used-cluster", {
            surface: "b",
            semanticCluster: "used",
            primaryRelation: "new-b",
          }),
          candidate("c-fresh-cluster", {
            surface: "c",
            semanticCluster: "fresh",
            primaryRelation: "new-c",
          }),
        ],
        testConfig({
          semantic: 2,
          semanticPrimaryClusterMax: 2,
        }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "a-first",
        "c-fresh-cluster",
      ]);
    });
  });

  describe("Fallback and result invariants", () => {
    it("never selects one candidate in more than one category", () => {
      const pool = Array.from({ length: 12 }, (_, index) =>
        candidate(`candidate-${String(index).padStart(2, "0")}`),
      );
      const result = select(pool, DEFAULT_SELECTION_CONFIG);
      const selectedKeys = result.selected.map((item) => item.candidateKey);

      expect(new Set(selectedKeys).size).toBe(selectedKeys.length);
    });

    it("fills one item per B -> Sound -> Semantic strategy turn", () => {
      const pool = Array.from({ length: 12 }, (_, index) =>
        candidate(`candidate-${String(index).padStart(2, "0")}`, {
          soundScore: 100 - index,
          semanticScore: 100 - index,
          semanticCluster: "same",
          primaryRelation: "same",
        }),
      );
      const config = {
        ...DEFAULT_SELECTION_CONFIG,
        targetTotal: 12,
      } satisfies SelectionConfig;
      const result = select(pool, config);
      const fallback = result.selected.filter(
        (item) => item.selectionCategory === "fallback",
      );

      expect(result.selected.slice(0, 6).map((item) => item.selectionCategory)).toEqual([
        "balanced",
        "balanced",
        "sound",
        "sound",
        "sound",
        "semantic",
      ]);
      expect(fallback.map((item) => item.fallbackStrategy)).toEqual([
        "balanced",
        "sound",
        "semantic",
        "balanced",
        "sound",
        "semantic",
      ]);
    });

    it("keeps the Balanced cap when a capped fallback candidate exists", () => {
      const result = select(
        [
          candidate("a-100", { soundScore: 100, semanticScore: 100, semanticCluster: "a" }),
          candidate("a-99", { soundScore: 99, semanticScore: 99, semanticCluster: "a" }),
          candidate("a-98", { soundScore: 98, semanticScore: 98, semanticCluster: "a" }),
          candidate("b-10", { soundScore: 10, semanticScore: 10, semanticCluster: "b" }),
        ],
        testConfig({
          balanced: 2,
          targetTotal: 3,
          fallbackPriority: ["balanced"],
        }),
      );

      expect(result.selected[2]).toMatchObject({
        candidateKey: "b-10",
        selectionCategory: "fallback",
        fallbackStrategy: "balanced",
        selectionScore: 10,
      });
    });

    it("relaxes Semantic cluster max one to max two and then unrestricted", () => {
      const result = select(
        [
          candidate("a-100", { semanticScore: 100, semanticCluster: "a" }),
          candidate("a-90", { semanticScore: 90, semanticCluster: "a" }),
          candidate("a-80", { semanticScore: 80, semanticCluster: "a" }),
        ],
        testConfig({
          semantic: 1,
          targetTotal: 3,
          fallbackPriority: ["semantic"],
        }),
      );

      expect(result.selected.map((item) => item.candidateKey)).toEqual([
        "a-100",
        "a-90",
        "a-80",
      ]);
      expect(result.selected.slice(1)).toEqual([
        expect.objectContaining({ fallbackStrategy: "semantic" }),
        expect.objectContaining({ fallbackStrategy: "semantic" }),
      ]);
    });

    it("returns fewer than targetTotal when valid candidates are exhausted", () => {
      const result = select(
        [candidate("one"), candidate("two")],
        DEFAULT_SELECTION_CONFIG,
      );

      expect(result.selected).toHaveLength(2);
      expect(result.selected.length).toBeLessThanOrEqual(
        DEFAULT_SELECTION_CONFIG.targetTotal,
      );
      expect(result.shortageEvents).toEqual([
        expect.objectContaining({ category: "balanced", missingCount: 2 }),
        expect.objectContaining({ category: "sound", missingCount: 3 }),
        expect.objectContaining({ category: "semantic", missingCount: 3 }),
      ]);
    });

    it("does not introduce an absolute score threshold", () => {
      const result = select(
        [candidate("zero", { soundScore: 0, semanticScore: 0 })],
        testConfig({ balanced: 1 }),
      );

      expect(result.selected).toHaveLength(1);
      expect(result.selected[0]?.selectionScore).toBe(0);
    });

    it("is deterministic and independent of candidate input order", () => {
      const pool = Array.from({ length: 12 }, (_, index) =>
        candidate(`candidate-${String(index).padStart(2, "0")}`, {
          soundScore: (index * 17) % 101,
          semanticScore: (index * 29) % 101,
          semanticCluster: `cluster-${index % 3}`,
          primaryRelation: `relation-${index % 4}`,
        }),
      );

      const first = select(pool, DEFAULT_SELECTION_CONFIG);
      const repeated = select(pool, DEFAULT_SELECTION_CONFIG);
      const reversed = select([...pool].reverse(), DEFAULT_SELECTION_CONFIG);

      expect(repeated).toEqual(first);
      expect(reversed).toEqual(first);
      expect(first.selected.length).toBeLessThanOrEqual(
        DEFAULT_SELECTION_CONFIG.targetTotal,
      );
    });
  });

  it("exposes the accepted default SelectionConfig", () => {
    expect(DEFAULT_SELECTION_CONFIG).toEqual({
      version: "selection-v0.1",
      targetTotal: 10,
      targetCounts: { balanced: 4, sound: 3, semantic: 3 },
      balanced: {
        minimumAxisWeight: 0.7,
        averageAxisWeight: 0.3,
        maximumPerSemanticCluster: 2,
      },
      semantic: {
        primaryMaximumPerSemanticCluster: 1,
        fallbackMaximumPerSemanticCluster: 2,
      },
      fallbackPriority: ["balanced", "sound", "semantic"],
    });
  });
});
