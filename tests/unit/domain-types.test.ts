import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  GenerationPromptConfig,
  ModelConfig,
  NormalizationConfig,
  ReadingResult,
  RhymeRepresentations,
  Score0To100,
  SelectionCategory,
  SelectionConfig,
  SelectionResult,
  SemanticRelationTag,
  SemanticResult,
  SoundScoreResult,
  SoundScoringConfig,
} from "../../src/domain";

describe("domain type contracts", () => {
  it("keeps raw, phonetic, and normalized rhyme data in separate layers", () => {
    const reading = {
      surface: "運動",
      reading: "うんどう",
      morae: ["う", "ん", "ど", "う"],
      source: "dictionary",
    } satisfies ReadingResult;

    const rhyme = {
      rawReading: {
        reading: reading.reading,
        morae: reading.morae,
      },
      phonetic: {
        tokens: [
          { kind: "mora", surface: "う", consonant: null, vowel: "u" },
          { kind: "hatsuon", surface: "ん", symbol: "N" },
          { kind: "mora", surface: "ど", consonant: "d", vowel: "o" },
          { kind: "mora", surface: "う", consonant: null, vowel: "u" },
        ],
      },
      normalized: {
        units: ["u", "X", "o", "o"],
        normalizerVersion: "rhyme-v0.1",
      },
    } satisfies RhymeRepresentations;

    expect(rhyme.rawReading.reading).toBe("うんどう");
    expect(rhyme.phonetic.tokens.map((token) => token.kind)).toEqual([
      "mora",
      "hatsuon",
      "mora",
      "mora",
    ]);
    expect(rhyme.normalized.units).toEqual(["u", "X", "o", "o"]);
  });

  it("exposes score, semantic, and selection results with version context", () => {
    const soundResult: SoundScoreResult = {
      finalScore: 82,
      breakdown: {
        moraLengthScore: 100,
        vowelPositionScore: 76,
        sequenceSimilarityScore: 70,
      },
      adjustments: [
        {
          ruleId: "example-adjustment",
          scoreDelta: 1,
          reason: "Compile-time fixture only",
        },
      ],
      reason: "Compile-time fixture only",
      scoringConfigVersion: "sound-v0.1",
      normalizerVersion: "rhyme-v0.1",
    };

    const semanticResult: SemanticResult = {
      word: "疾走",
      semanticScore: 74,
      reason: "Compile-time fixture only",
      primaryRelation: "action",
      secondaryRelations: ["motion"],
      semanticCluster: "movement",
      modelIdentifier: "provider/model-id",
      semanticPromptVersion: "semantic-v0.1",
    };

    const selectionResult: SelectionResult = {
      selected: [
        {
          candidateResultId: "candidate-result-id",
          selectionCategory: "balanced",
          selectionRank: 1,
          selectionScore: 78,
          selectionReason: "Compile-time fixture only",
        },
      ],
      selectionConfigVersion: "selector-v0.1",
      shortageEvents: [],
    };

    expectTypeOf(soundResult.finalScore).toEqualTypeOf<Score0To100>();
    expect(semanticResult.primaryRelation).toBe("action");
    expect(selectionResult.selected[0]?.selectionCategory).toBe("balanced");
  });

  it("keeps relation tags open and fixed selection categories explicit", () => {
    const futureRelationTag: SemanticRelationTag = "future_relation_tag";

    expectTypeOf<SelectionCategory>().toEqualTypeOf<
      "balanced" | "sound" | "semantic" | "fallback"
    >();
    expect(futureRelationTag).toBe("future_relation_tag");
  });

  it("represents configurable values only inside versioned config snapshots", () => {
    const normalizationConfig = {
      version: "rhyme-v0.1",
      rules: [{ id: "example-rule", enabled: true }],
    } satisfies NormalizationConfig;

    const scoringConfig = {
      version: "sound-v0.1",
      weights: {
        moraLength: 0.4,
        vowelPosition: 0.25,
        sequenceSimilarity: 0.25,
      },
      moraLength: {
        scoreByDifference: { 0: 100, 1: 70 },
        fallbackScore: 0,
      },
      adjustments: [],
    } satisfies SoundScoringConfig;

    const selectionConfig = {
      version: "selector-v0.1",
      targetCounts: {
        balanced: 4,
        sound: 3,
        semantic: 3,
      },
      balanced: {
        minimumAxisWeight: 0.7,
        averageAxisWeight: 0.3,
        maximumPerSemanticCluster: 2,
      },
      semanticDiversity: {
        preferDistinctPrimaryRelations: true,
        preferDistinctSemanticClusters: true,
      },
    } satisfies SelectionConfig;

    const promptConfig = {
      version: "candidate-v0.1",
      template: "Compile-time fixture only",
    } satisfies GenerationPromptConfig;

    const modelConfig = {
      identifier: "provider/model-id",
      provider: "provider",
    } satisfies ModelConfig;

    expect(normalizationConfig.version).toBe("rhyme-v0.1");
    expect(scoringConfig.version).toBe("sound-v0.1");
    expect(selectionConfig.version).toBe("selector-v0.1");
    expect(promptConfig.version).toBe("candidate-v0.1");
    expect(modelConfig.identifier).toBe("provider/model-id");
  });
});
