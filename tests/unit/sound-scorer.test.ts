import { describe, expect, it } from "vitest";

import {
  calculateSoundScore,
  DEFAULT_SOUND_SCORING_CONFIG,
} from "../../src/domain";
import type {
  NormalizedRhymeUnit,
  PhoneticToken,
  RhymeRepresentations,
  SoundScoringConfig,
} from "../../src/domain";

interface RhymeFixtureOptions {
  readonly reading?: string;
  readonly tokens?: readonly PhoneticToken[];
  readonly normalizerVersion?: string;
}

function tokenForUnit(
  unit: NormalizedRhymeUnit,
  index: number,
): PhoneticToken {
  if (unit === "X") {
    return { kind: "sokuon", surface: "っ", symbol: "Q" };
  }

  return {
    kind: "mora",
    surface: `${unit}-${index}`,
    consonant: null,
    vowel: unit,
  };
}

function rhymeFixture(
  units: readonly NormalizedRhymeUnit[],
  options: RhymeFixtureOptions = {},
): RhymeRepresentations {
  const tokens =
    options.tokens ?? units.map((unit, index) => tokenForUnit(unit, index));
  const reading = options.reading ?? units.join("");

  return {
    rawReading: {
      reading,
      morae: tokens.map((token) => token.surface),
    },
    phonetic: { tokens },
    normalized: {
      units,
      normalizerVersion: options.normalizerVersion ?? "rhyme-v0.1",
    },
  };
}

function repeatedUnits(
  length: number,
  unit: NormalizedRhymeUnit = "a",
): readonly NormalizedRhymeUnit[] {
  return Array.from({ length }, () => unit);
}

describe("Sound Scorer v0.1", () => {
  describe("Mora Length Similarity", () => {
    it.each([
      [0, 100],
      [1, 70],
      [2, 35],
      [3, 0],
      [4, 0],
    ])("maps mora difference %i to %i", (difference, expectedScore) => {
      const source = rhymeFixture(repeatedUnits(4));
      const candidate = rhymeFixture(repeatedUnits(4 + difference));

      const result = calculateSoundScore(
        source,
        candidate,
        DEFAULT_SOUND_SCORING_CONFIG,
      );

      expect(result.breakdown.moraLengthScore).toBe(expectedScore);
    });
  });

  describe("Position Match Similarity", () => {
    it("scores three matching positions out of four as 75", () => {
      const result = calculateSoundScore(
        rhymeFixture(["a", "o", "a", "a"]),
        rhymeFixture(["a", "o", "a", "i"]),
        DEFAULT_SOUND_SCORING_CONFIG,
      );

      expect(result.breakdown.positionMatchScore).toBe(75);
    });

    it("counts a position present on only one side as a mismatch", () => {
      const result = calculateSoundScore(
        rhymeFixture(["a", "o", "a", "a"]),
        rhymeFixture(["a", "o", "a", "a", "i"]),
        DEFAULT_SOUND_SCORING_CONFIG,
      );

      expect(result.breakdown.positionMatchScore).toBe(80);
    });
  });

  describe("Sequence Similarity", () => {
    it("scores Levenshtein distance one with max length four as 75", () => {
      const result = calculateSoundScore(
        rhymeFixture(["a", "o", "a", "a"]),
        rhymeFixture(["a", "o", "a", "i"]),
        DEFAULT_SOUND_SCORING_CONFIG,
      );

      expect(result.breakdown.sequenceSimilarityScore).toBe(75);
    });

    it("uses standard insertion and deletion costs", () => {
      const source = rhymeFixture(["a", "o", "a", "a"]);
      const candidate = rhymeFixture(["i", "a", "o", "a", "a"]);

      expect(
        calculateSoundScore(source, candidate, DEFAULT_SOUND_SCORING_CONFIG)
          .breakdown.sequenceSimilarityScore,
      ).toBe(80);
      expect(
        calculateSoundScore(candidate, source, DEFAULT_SOUND_SCORING_CONFIG)
          .breakdown.sequenceSimilarityScore,
      ).toBe(80);
    });
  });

  describe("Ending Rhyme Bonus", () => {
    it("retains suffix length three, 0.75 coverage, and 7.5 bonus", () => {
      const result = calculateSoundScore(
        rhymeFixture(["a", "X", "a", "i"]),
        rhymeFixture(["o", "X", "a", "i"]),
        DEFAULT_SOUND_SCORING_CONFIG,
      );

      expect(result.adjustments[0]).toMatchObject({
        commonSuffixLength: 3,
        suffixCoverage: 0.75,
        bonus: 7.5,
        scoreDelta: 7.5,
      });
    });

    it("uses the longer normalized length as the coverage denominator", () => {
      const result = calculateSoundScore(
        rhymeFixture(["a", "X", "a", "i"]),
        rhymeFixture(["u", "u", "o", "X", "a", "i"]),
        DEFAULT_SOUND_SCORING_CONFIG,
      );

      expect(result.adjustments[0]).toMatchObject({
        commonSuffixLength: 3,
        suffixCoverage: 0.5,
        bonus: 5,
      });
    });

    it("adds no bonus when there is no common suffix", () => {
      const result = calculateSoundScore(
        rhymeFixture(["a", "o"]),
        rhymeFixture(["i", "u"]),
        DEFAULT_SOUND_SCORING_CONFIG,
      );

      expect(result.adjustments[0]).toMatchObject({
        commonSuffixLength: 0,
        suffixCoverage: 0,
        bonus: 0,
      });
    });
  });

  it("scores the たんたい / もんだい equivalent fixture as 85", () => {
    const result = calculateSoundScore(
      rhymeFixture(["a", "X", "a", "i"], { reading: "たんたい" }),
      rhymeFixture(["o", "X", "a", "i"], { reading: "もんだい" }),
      DEFAULT_SOUND_SCORING_CONFIG,
    );

    expect(result.breakdown).toEqual({
      moraLengthScore: 100,
      positionMatchScore: 75,
      sequenceSimilarityScore: 75,
    });
    expect(result.adjustments[0]).toMatchObject({
      commonSuffixLength: 3,
      suffixCoverage: 0.75,
      bonus: 7.5,
    });
    expect(result.rawScore).toBe(85);
    expect(result.finalScore).toBe(85);
    expect(result.scoringConfigVersion).toBe("sound-v0.1");
    expect(result.normalizerVersion).toBe("rhyme-v0.1");
  });

  it("treats Q and N as equal X units when normalized patterns match", () => {
    const source = rhymeFixture(["o", "X", "i", "i"], {
      reading: "のっぴき",
      tokens: [
        { kind: "mora", surface: "の", consonant: "n", vowel: "o" },
        { kind: "sokuon", surface: "っ", symbol: "Q" },
        { kind: "mora", surface: "ぴ", consonant: "p", vowel: "i" },
        { kind: "mora", surface: "き", consonant: "k", vowel: "i" },
      ],
    });
    const candidate = rhymeFixture(["o", "X", "i", "i"], {
      reading: "コンビニ",
      tokens: [
        { kind: "mora", surface: "コ", consonant: "k", vowel: "o" },
        { kind: "hatsuon", surface: "ン", symbol: "N" },
        { kind: "mora", surface: "ビ", consonant: "b", vowel: "i" },
        { kind: "mora", surface: "ニ", consonant: "n", vowel: "i" },
      ],
    });

    const result = calculateSoundScore(
      source,
      candidate,
      DEFAULT_SOUND_SCORING_CONFIG,
    );

    expect(source.phonetic.tokens[1]).not.toEqual(candidate.phonetic.tokens[1]);
    expect(result.rawScore).toBe(100);
    expect(result.finalScore).toBe(100);
  });

  it("is deterministic and symmetric", () => {
    const source = rhymeFixture(["a", "X", "a", "i"]);
    const candidate = rhymeFixture(["o", "X", "a", "i"]);
    const first = calculateSoundScore(
      source,
      candidate,
      DEFAULT_SOUND_SCORING_CONFIG,
    );

    expect(
      calculateSoundScore(source, candidate, DEFAULT_SOUND_SCORING_CONFIG),
    ).toEqual(first);
    expect(
      calculateSoundScore(candidate, source, DEFAULT_SOUND_SCORING_CONFIG),
    ).toEqual(first);
  });

  it("keeps finalScore within the inclusive 0 to 100 range", () => {
    const perfect = calculateSoundScore(
      rhymeFixture(["a"]),
      rhymeFixture(["a"]),
      DEFAULT_SOUND_SCORING_CONFIG,
    );
    const noSimilarity = calculateSoundScore(
      rhymeFixture(["a"]),
      rhymeFixture(["i", "i", "i", "i"]),
      DEFAULT_SOUND_SCORING_CONFIG,
    );

    expect(perfect.finalScore).toBe(100);
    expect(noSimilarity.finalScore).toBe(0);

    for (const score of [perfect.finalScore, noSimilarity.finalScore]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("keeps intermediate values unrounded and rounds only finalScore", () => {
    const result = calculateSoundScore(
      rhymeFixture(["a", "a", "a"]),
      rhymeFixture(["a", "a", "i"]),
      DEFAULT_SOUND_SCORING_CONFIG,
    );

    expect(result.breakdown.positionMatchScore).toBeCloseTo(200 / 3, 12);
    expect(result.breakdown.sequenceSimilarityScore).toBeCloseTo(200 / 3, 12);
    expect(result.rawScore).toBeCloseTo(220 / 3, 12);
    expect(result.finalScore).toBe(73);
  });

  it("uses the supplied versioned config instead of fixed scorer values", () => {
    const customConfig = {
      ...DEFAULT_SOUND_SCORING_CONFIG,
      version: "sound-test",
      moraLength: {
        ...DEFAULT_SOUND_SCORING_CONFIG.moraLength,
        scoreByDifference: {
          ...DEFAULT_SOUND_SCORING_CONFIG.moraLength.scoreByDifference,
          1: 60,
        },
      },
      endingBonus: {
        ...DEFAULT_SOUND_SCORING_CONFIG.endingBonus,
        maxPoints: 8,
      },
    } satisfies SoundScoringConfig;

    const result = calculateSoundScore(
      rhymeFixture(["a"]),
      rhymeFixture(["a", "i"]),
      customConfig,
    );

    expect(result.breakdown.moraLengthScore).toBe(60);
    expect(result.scoringConfigVersion).toBe("sound-test");

    const exactMatch = calculateSoundScore(
      rhymeFixture(["a"]),
      rhymeFixture(["a"]),
      customConfig,
    );

    expect(exactMatch.adjustments[0]?.bonus).toBe(8);
    expect(exactMatch.rawScore).toBe(98);
    expect(exactMatch.finalScore).toBe(98);
  });

  it("keeps the default config maximum mathematically consistent", () => {
    const weightTotal =
      DEFAULT_SOUND_SCORING_CONFIG.weights.moraLength +
      DEFAULT_SOUND_SCORING_CONFIG.weights.positionMatch +
      DEFAULT_SOUND_SCORING_CONFIG.weights.sequenceSimilarity;

    expect(DEFAULT_SOUND_SCORING_CONFIG).toMatchObject({
      version: "sound-v0.1",
      moraLength: {
        scoreByDifference: { 0: 100, 1: 70, 2: 35 },
        fallbackScore: 0,
      },
      endingBonus: {
        maxPoints: 10,
        mode: "linear-suffix-coverage",
      },
    });
    expect(
      100 * weightTotal +
        DEFAULT_SOUND_SCORING_CONFIG.endingBonus.maxPoints,
    ).toBe(100);
  });

  describe("input invariants", () => {
    const valid = rhymeFixture(["a"]);
    const emptyPhonetic = rhymeFixture(["a"], { tokens: [] });
    const emptyNormalized = rhymeFixture([], {
      tokens: [
        { kind: "mora", surface: "あ", consonant: null, vowel: "a" },
      ],
    });

    it.each([
      ["source Phonetic", emptyPhonetic, valid, "source Phonetic"],
      ["candidate Phonetic", valid, emptyPhonetic, "candidate Phonetic"],
      ["source Normalized", emptyNormalized, valid, "source Normalized"],
      ["candidate Normalized", valid, emptyNormalized, "candidate Normalized"],
    ])(
      "rejects an empty %s Representation",
      (_caseName, source, candidate, expectedMessage) => {
        expect(() =>
          calculateSoundScore(
            source,
            candidate,
            DEFAULT_SOUND_SCORING_CONFIG,
          ),
        ).toThrow(`Invalid Sound Scorer input: ${expectedMessage}`);
      },
    );

    it("rejects inputs produced by different normalizer versions", () => {
      expect(() =>
        calculateSoundScore(
          rhymeFixture(["a"], { normalizerVersion: "rhyme-v0.1" }),
          rhymeFixture(["a"], { normalizerVersion: "rhyme-v0.2" }),
          DEFAULT_SOUND_SCORING_CONFIG,
        ),
      ).toThrow("source and candidate normalizer versions differ");
    });
  });
});
