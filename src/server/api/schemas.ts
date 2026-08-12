import { z } from "zod";

export const uuidSchema = z.uuid();

export const generationRequestSchema = z.strictObject({
  sourceSurface: z.string().trim().min(1),
});

export const rerollRequestSchema = z.strictObject({});

export const candidateFeedbackRequestSchema = z.strictObject({
  candidateResultId: uuidSchema,
  value: z.enum(["like", "dislike"]),
});

export const soundScoreFeedbackRequestSchema = z.strictObject({
  candidateResultId: uuidSchema,
  value: z.enum(["low", "valid", "high"]),
});

