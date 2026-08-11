import { describe, expect, it } from "vitest";

import {
  normalizeRhyme,
  parsePhoneticRepresentation,
  RHYME_NORMALIZER_VERSION,
} from "../../src/domain";

describe("Rhyme Normalizer v0.1", () => {
  const representativeCases = [
    ["さよなら", ["a", "o", "a", "a"]],
    ["のっぴき", ["o", "X", "i", "i"]],
    ["コンビニ", ["o", "X", "i", "i"]],
    ["コーヒー", ["o", "o", "i", "i"]],
    ["うんどう", ["u", "X", "o", "o"]],
    ["せい", ["e", "e"]],
    ["きゃく", ["a", "u"]],
    ["あう", ["a", "u"]],
    ["かう", ["a", "u"]],
  ] as const;

  it.each(representativeCases)(
    "normalizes %s to the expected rhyme units",
    (reading, expectedUnits) => {
      const result = normalizeRhyme(reading);

      expect(result.normalized.units).toEqual(expectedUnits);
      expect(result.normalized.normalizerVersion).toBe(
        RHYME_NORMALIZER_VERSION,
      );
    },
  );

  it("keeps Q and N distinct in phonetic data while normalizing both to X", () => {
    const sokuon = normalizeRhyme("のっぴき");
    const hatsuon = normalizeRhyme("コンビニ");

    expect(sokuon.phonetic.tokens[1]).toEqual({
      kind: "sokuon",
      surface: "っ",
      symbol: "Q",
    });
    expect(hatsuon.phonetic.tokens[1]).toEqual({
      kind: "hatsuon",
      surface: "ン",
      symbol: "N",
    });
    expect(sokuon.normalized.units).toEqual(hatsuon.normalized.units);
  });

  it("keeps long marks in phonetic data", () => {
    const result = normalizeRhyme("コーヒー");

    expect(result.phonetic.tokens).toEqual([
      { kind: "mora", surface: "コ", consonant: "k", vowel: "o" },
      { kind: "long", surface: "ー" },
      { kind: "mora", surface: "ヒ", consonant: "h", vowel: "i" },
      { kind: "long", surface: "ー" },
    ]);
  });

  it("parses yoon as one mora and retains consonant information", () => {
    const result = normalizeRhyme("きゃく");

    expect(result.rawReading).toEqual({
      reading: "きゃく",
      morae: ["きゃ", "く"],
    });
    expect(result.phonetic.tokens[0]).toEqual({
      kind: "mora",
      surface: "きゃ",
      consonant: "ky",
      vowel: "a",
    });
  });

  it("preserves the exact raw reading while parsing katakana", () => {
    const result = normalizeRhyme("コンビニ");

    expect(result.rawReading.reading).toBe("コンビニ");
    expect(result.rawReading.morae).toEqual(["コ", "ン", "ビ", "ニ"]);
  });

  it("is deterministic for the same confirmed reading", () => {
    expect(normalizeRhyme("うんどう")).toEqual(normalizeRhyme("うんどう"));
  });

  it("can expose the phonetic layer independently", () => {
    expect(parsePhoneticRepresentation("せい").tokens).toEqual([
      { kind: "mora", surface: "せ", consonant: "s", vowel: "e" },
      { kind: "mora", surface: "い", consonant: null, vowel: "i" },
    ]);
  });

  describe("foreign loanword mora", () => {
    const wordCases = [
      ["ファイル", ["a", "i", "u"]],
      ["ティアラ", ["i", "a", "a"]],
      ["メディア", ["e", "e", "a"]],
      ["ヴォーカル", ["o", "o", "a", "u"]],
      ["シェア", ["e", "a"]],
      ["フォウ", ["o", "o"]],
    ] as const;

    it.each(wordCases)(
      "normalizes %s with combined mora kept as one token",
      (reading, expectedUnits) => {
        const result = normalizeRhyme(reading);

        expect(result.rawReading.reading).toBe(reading);
        expect(result.normalized.units).toEqual(expectedUnits);
        expect(result.normalized.normalizerVersion).toBe(
          RHYME_NORMALIZER_VERSION,
        );
      },
    );

    const mappingCases = [
      ["ファ", "ふぁ", "f", "a"],
      ["フィ", "ふぃ", "f", "i"],
      ["フェ", "ふぇ", "f", "e"],
      ["フォ", "ふぉ", "f", "o"],
      ["ティ", "てぃ", "t", "i"],
      ["トゥ", "とぅ", "t", "u"],
      ["ディ", "でぃ", "d", "i"],
      ["ドゥ", "どぅ", "d", "u"],
      ["ウィ", "うぃ", "w", "i"],
      ["ウェ", "うぇ", "w", "e"],
      ["ウォ", "うぉ", "w", "o"],
      ["ヴァ", "ゔぁ", "v", "a"],
      ["ヴィ", "ゔぃ", "v", "i"],
      ["ヴ", "ゔ", "v", "u"],
      ["ヴェ", "ゔぇ", "v", "e"],
      ["ヴォ", "ゔぉ", "v", "o"],
      ["シェ", "しぇ", "sh", "e"],
      ["ジェ", "じぇ", "j", "e"],
      ["チェ", "ちぇ", "ch", "e"],
      ["ツァ", "つぁ", "ts", "a"],
      ["ツィ", "つぃ", "ts", "i"],
      ["ツェ", "つぇ", "ts", "e"],
      ["ツォ", "つぉ", "ts", "o"],
      ["テュ", "てゅ", "ty", "u"],
      ["デュ", "でゅ", "dy", "u"],
      ["フュ", "ふゅ", "fy", "u"],
    ] as const;

    it.each(mappingCases)(
      "maps %s and its hiragana equivalent as the same one mora",
      (katakana, hiragana, consonant, vowel) => {
        for (const reading of [katakana, hiragana]) {
          expect(parsePhoneticRepresentation(reading).tokens).toEqual([
            {
              kind: "mora",
              surface: reading,
              consonant,
              vowel,
            },
          ]);
        }
      },
    );

    it("rejects an undefined small-kana combination instead of inferring it", () => {
      expect(() => normalizeRhyme("キェ")).toThrow(
        "Unsupported kana in reading: ェ",
      );
    });
  });
});
