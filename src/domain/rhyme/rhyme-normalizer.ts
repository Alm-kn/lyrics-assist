import type { NormalizerVersion } from "../config/types";
import type {
  MoraPhoneticToken,
  NormalizedRhymeRepresentation,
  NormalizedRhymeUnit,
  PhoneticRepresentation,
  PhoneticToken,
  RhymeRepresentations,
  Vowel,
} from "./types";

export const RHYME_NORMALIZER_VERSION: NormalizerVersion = "rhyme-v0.1";

interface MoraSpec {
  readonly consonant: string | null;
  readonly vowel: Vowel;
}

const NORMAL_MORAE: Readonly<Record<string, MoraSpec>> = {
  あ: { consonant: null, vowel: "a" },
  い: { consonant: null, vowel: "i" },
  う: { consonant: null, vowel: "u" },
  え: { consonant: null, vowel: "e" },
  お: { consonant: null, vowel: "o" },
  か: { consonant: "k", vowel: "a" },
  き: { consonant: "k", vowel: "i" },
  く: { consonant: "k", vowel: "u" },
  け: { consonant: "k", vowel: "e" },
  こ: { consonant: "k", vowel: "o" },
  が: { consonant: "g", vowel: "a" },
  ぎ: { consonant: "g", vowel: "i" },
  ぐ: { consonant: "g", vowel: "u" },
  げ: { consonant: "g", vowel: "e" },
  ご: { consonant: "g", vowel: "o" },
  さ: { consonant: "s", vowel: "a" },
  し: { consonant: "sh", vowel: "i" },
  す: { consonant: "s", vowel: "u" },
  せ: { consonant: "s", vowel: "e" },
  そ: { consonant: "s", vowel: "o" },
  ざ: { consonant: "z", vowel: "a" },
  じ: { consonant: "j", vowel: "i" },
  ず: { consonant: "z", vowel: "u" },
  ぜ: { consonant: "z", vowel: "e" },
  ぞ: { consonant: "z", vowel: "o" },
  た: { consonant: "t", vowel: "a" },
  ち: { consonant: "ch", vowel: "i" },
  つ: { consonant: "ts", vowel: "u" },
  て: { consonant: "t", vowel: "e" },
  と: { consonant: "t", vowel: "o" },
  だ: { consonant: "d", vowel: "a" },
  ぢ: { consonant: "j", vowel: "i" },
  づ: { consonant: "z", vowel: "u" },
  で: { consonant: "d", vowel: "e" },
  ど: { consonant: "d", vowel: "o" },
  な: { consonant: "n", vowel: "a" },
  に: { consonant: "n", vowel: "i" },
  ぬ: { consonant: "n", vowel: "u" },
  ね: { consonant: "n", vowel: "e" },
  の: { consonant: "n", vowel: "o" },
  は: { consonant: "h", vowel: "a" },
  ひ: { consonant: "h", vowel: "i" },
  ふ: { consonant: "f", vowel: "u" },
  へ: { consonant: "h", vowel: "e" },
  ほ: { consonant: "h", vowel: "o" },
  ば: { consonant: "b", vowel: "a" },
  び: { consonant: "b", vowel: "i" },
  ぶ: { consonant: "b", vowel: "u" },
  べ: { consonant: "b", vowel: "e" },
  ぼ: { consonant: "b", vowel: "o" },
  ぱ: { consonant: "p", vowel: "a" },
  ぴ: { consonant: "p", vowel: "i" },
  ぷ: { consonant: "p", vowel: "u" },
  ぺ: { consonant: "p", vowel: "e" },
  ぽ: { consonant: "p", vowel: "o" },
  ま: { consonant: "m", vowel: "a" },
  み: { consonant: "m", vowel: "i" },
  む: { consonant: "m", vowel: "u" },
  め: { consonant: "m", vowel: "e" },
  も: { consonant: "m", vowel: "o" },
  や: { consonant: "y", vowel: "a" },
  ゆ: { consonant: "y", vowel: "u" },
  よ: { consonant: "y", vowel: "o" },
  ら: { consonant: "r", vowel: "a" },
  り: { consonant: "r", vowel: "i" },
  る: { consonant: "r", vowel: "u" },
  れ: { consonant: "r", vowel: "e" },
  ろ: { consonant: "r", vowel: "o" },
  わ: { consonant: "w", vowel: "a" },
  を: { consonant: "w", vowel: "o" },
};

const FOREIGN_MORAE: Readonly<Record<string, MoraSpec>> = {
  ふぁ: { consonant: "f", vowel: "a" },
  ふぃ: { consonant: "f", vowel: "i" },
  ふぇ: { consonant: "f", vowel: "e" },
  ふぉ: { consonant: "f", vowel: "o" },
  てぃ: { consonant: "t", vowel: "i" },
  とぅ: { consonant: "t", vowel: "u" },
  でぃ: { consonant: "d", vowel: "i" },
  どぅ: { consonant: "d", vowel: "u" },
  うぃ: { consonant: "w", vowel: "i" },
  うぇ: { consonant: "w", vowel: "e" },
  うぉ: { consonant: "w", vowel: "o" },
  ゔぁ: { consonant: "v", vowel: "a" },
  ゔぃ: { consonant: "v", vowel: "i" },
  ゔ: { consonant: "v", vowel: "u" },
  ゔぇ: { consonant: "v", vowel: "e" },
  ゔぉ: { consonant: "v", vowel: "o" },
  しぇ: { consonant: "sh", vowel: "e" },
  じぇ: { consonant: "j", vowel: "e" },
  ちぇ: { consonant: "ch", vowel: "e" },
  つぁ: { consonant: "ts", vowel: "a" },
  つぃ: { consonant: "ts", vowel: "i" },
  つぇ: { consonant: "ts", vowel: "e" },
  つぉ: { consonant: "ts", vowel: "o" },
  てゅ: { consonant: "ty", vowel: "u" },
  でゅ: { consonant: "dy", vowel: "u" },
  ふゅ: { consonant: "fy", vowel: "u" },
};

const YOON_CONSONANTS: Readonly<Record<string, string>> = {
  き: "ky",
  ぎ: "gy",
  し: "sh",
  じ: "j",
  ち: "ch",
  ぢ: "j",
  に: "ny",
  ひ: "hy",
  び: "by",
  ぴ: "py",
  み: "my",
  り: "ry",
};

const YOON_VOWELS: Readonly<Record<string, Vowel>> = {
  ゃ: "a",
  ゅ: "u",
  ょ: "o",
};

function toHiragana(character: string): string {
  const codePoint = character.codePointAt(0);

  if (codePoint !== undefined && codePoint >= 0x30a1 && codePoint <= 0x30f6) {
    return String.fromCodePoint(codePoint - 0x60);
  }

  return character;
}

function moraToken(surface: string, spec: MoraSpec): MoraPhoneticToken {
  return {
    kind: "mora",
    surface,
    consonant: spec.consonant,
    vowel: spec.vowel,
  };
}

/** Parse a confirmed kana reading without applying lyric comparison rules. */
export function parsePhoneticRepresentation(
  reading: string,
): PhoneticRepresentation {
  const characters = Array.from(reading);
  const tokens: PhoneticToken[] = [];

  for (let index = 0; index < characters.length; index += 1) {
    const surface = characters[index];

    if (surface === undefined) {
      continue;
    }

    const hiragana = toHiragana(surface);

    if (hiragana === "っ") {
      tokens.push({
        kind: "sokuon",
        surface: surface === "ッ" ? "ッ" : "っ",
        symbol: "Q",
      });
      continue;
    }

    if (hiragana === "ん") {
      tokens.push({
        kind: "hatsuon",
        surface: surface === "ン" ? "ン" : "ん",
        symbol: "N",
      });
      continue;
    }

    if (surface === "ー") {
      tokens.push({ kind: "long", surface: "ー" });
      continue;
    }

    const nextSurface = characters[index + 1];
    const nextHiragana =
      nextSurface === undefined ? undefined : toHiragana(nextSurface);
    const foreignMora =
      nextHiragana === undefined
        ? FOREIGN_MORAE[hiragana]
        : FOREIGN_MORAE[`${hiragana}${nextHiragana}`] ??
          FOREIGN_MORAE[hiragana];

    if (foreignMora !== undefined) {
      const isCombinedMora =
        nextHiragana !== undefined &&
        FOREIGN_MORAE[`${hiragana}${nextHiragana}`] !== undefined;
      const foreignSurface =
        isCombinedMora && nextSurface !== undefined
          ? `${surface}${nextSurface}`
          : surface;

      tokens.push(moraToken(foreignSurface, foreignMora));

      if (isCombinedMora) {
        index += 1;
      }

      continue;
    }

    const spec = NORMAL_MORAE[hiragana];

    if (spec === undefined) {
      throw new Error(`Unsupported kana in reading: ${surface}`);
    }

    const yoonVowel =
      nextHiragana === undefined ? undefined : YOON_VOWELS[nextHiragana];
    const yoonConsonant = YOON_CONSONANTS[hiragana];

    if (
      nextSurface !== undefined &&
      yoonVowel !== undefined &&
      yoonConsonant !== undefined
    ) {
      tokens.push(
        moraToken(`${surface}${nextSurface}`, {
          consonant: yoonConsonant,
          vowel: yoonVowel,
        }),
      );
      index += 1;
      continue;
    }

    tokens.push(moraToken(surface, spec));
  }

  return { tokens };
}

/** Apply only the comparison rules defined for rhyme-v0.1. */
export function normalizePhoneticRepresentation(
  phonetic: PhoneticRepresentation,
): NormalizedRhymeRepresentation {
  const units: NormalizedRhymeUnit[] = [];
  let previousPhoneticVowel: Vowel | undefined;

  for (const token of phonetic.tokens) {
    switch (token.kind) {
      case "mora": {
        const unit =
          (previousPhoneticVowel === "o" && token.vowel === "u") ||
          (previousPhoneticVowel === "e" && token.vowel === "i")
            ? previousPhoneticVowel
            : token.vowel;

        units.push(unit);
        previousPhoneticVowel = token.vowel;
        break;
      }
      case "sokuon":
      case "hatsuon":
        units.push("X");
        previousPhoneticVowel = undefined;
        break;
      case "long": {
        const previousUnit = units[units.length - 1];

        if (previousUnit === undefined || previousUnit === "X") {
          throw new Error("Long vowel mark has no preceding vowel to inherit");
        }

        units.push(previousUnit);
        previousPhoneticVowel = undefined;
        break;
      }
    }
  }

  return {
    units,
    normalizerVersion: RHYME_NORMALIZER_VERSION,
  };
}

/** Produce all three non-destructive representations from a confirmed reading. */
export function normalizeRhyme(reading: string): RhymeRepresentations {
  const phonetic = parsePhoneticRepresentation(reading);

  return {
    rawReading: {
      reading,
      morae: phonetic.tokens.map((token) => token.surface),
    },
    phonetic,
    normalized: normalizePhoneticRepresentation(phonetic),
  };
}
