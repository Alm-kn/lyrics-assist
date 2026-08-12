import { z } from "zod";

export const candidateOutputSchema = z
  .object({
    candidates: z.array(
      z
        .object({
          surface: z.string().min(1),
          readingHint: z.string().min(1).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const semanticOutputSchema = z
  .object({
    results: z.array(
      z
        .object({
          candidateKey: z.string().min(1),
          score: z.number().min(0).max(100),
          reason: z.string(),
          primaryRelation: z.string(),
          secondaryRelations: z.array(z.string()),
          semanticCluster: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const readingOutputSchema = z
  .object({
    results: z.array(
      z
        .object({
          requestKey: z.string().min(1),
          status: z.enum(["resolved", "unresolved"]),
          reading: z.string().min(1).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export type OpenAiCandidateOutput = z.infer<typeof candidateOutputSchema>;
export type OpenAiSemanticOutput = z.infer<typeof semanticOutputSchema>;
export type OpenAiReadingOutput = z.infer<typeof readingOutputSchema>;
