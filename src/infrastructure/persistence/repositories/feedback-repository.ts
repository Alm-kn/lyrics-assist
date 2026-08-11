import { eq } from "drizzle-orm";

import type { PersistenceDatabase } from "../database";
import { candidateFeedback, soundScoreFeedback } from "../schema";
import type {
  CandidateFeedbackValue,
  SoundScoreFeedbackValue,
} from "../types";

export class FeedbackRepository {
  constructor(
    private readonly db: PersistenceDatabase,
    private readonly clock: () => number = Date.now,
  ) {}

  upsertCandidateFeedback(
    candidateResultId: string,
    value: CandidateFeedbackValue,
  ): void {
    const timestamp = this.clock();
    this.db
      .insert(candidateFeedback)
      .values({
        candidateResultId,
        value,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: candidateFeedback.candidateResultId,
        set: { value, updatedAt: timestamp },
      })
      .run();
  }

  upsertSoundScoreFeedback(
    candidateResultId: string,
    value: SoundScoreFeedbackValue,
  ): void {
    const timestamp = this.clock();
    this.db
      .insert(soundScoreFeedback)
      .values({
        candidateResultId,
        value,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: soundScoreFeedback.candidateResultId,
        set: { value, updatedAt: timestamp },
      })
      .run();
  }

  getCandidateFeedback(candidateResultId: string) {
    return this.db
      .select()
      .from(candidateFeedback)
      .where(eq(candidateFeedback.candidateResultId, candidateResultId))
      .get();
  }

  getSoundScoreFeedback(candidateResultId: string) {
    return this.db
      .select()
      .from(soundScoreFeedback)
      .where(eq(soundScoreFeedback.candidateResultId, candidateResultId))
      .get();
  }
}
