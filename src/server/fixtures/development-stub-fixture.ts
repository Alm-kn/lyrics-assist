import type {
  EvaluateSemanticsResult,
  GenerateCandidatesResult,
} from "../../application";
import type { ReadingResult } from "../../domain";

export const DEVELOPMENT_READINGS: readonly ReadingResult[] = [
  { surface: "夜", reading: "よる", morae: ["よ", "る"], source: "manual" },
  {
    surface: "光",
    reading: "ひかり",
    morae: ["ひ", "か", "り"],
    source: "manual",
  },
  { surface: "闇", reading: "やみ", morae: ["や", "み"], source: "manual" },
  { surface: "星", reading: "ほし", morae: ["ほ", "し"], source: "manual" },
];

export const DEVELOPMENT_GENERATION_RESULT: GenerateCandidatesResult = {
  candidates: [
    { candidateKey: "stub-light", surface: "光", readingHint: "ひかり" },
    { candidateKey: "stub-dark", surface: "闇" },
    { candidateKey: "stub-star", surface: "星" },
  ],
  metadata: {
    modelIdentifier: "stub",
    generationPromptVersion: "generation-v0.1",
  },
};

export const DEVELOPMENT_SEMANTIC_RESULT: EvaluateSemanticsResult = {
  results: DEVELOPMENT_GENERATION_RESULT.candidates.map((candidate, index) => ({
    candidateKey: candidate.candidateKey,
    score: 80 - index * 5,
    reason: `Deterministic development fixture for ${candidate.surface}`,
    primaryRelation: index === 0 ? "visual" : index === 1 ? "contrast" : "scene",
    secondaryRelations: [],
    semanticCluster: `development-${index}`,
  })),
  metadata: {
    modelIdentifier: "stub",
    semanticPromptVersion: "semantic-v0.1",
  },
};

