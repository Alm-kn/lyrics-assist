export type CandidateFeedbackValue = "like" | "dislike";
export type SoundScoreFeedbackValue = "low" | "valid" | "high";

export type FeedbackPersistenceResult = "saved" | "not_found";

export interface FeedbackPersistencePort {
  upsertCandidateFeedback(input: {
    readonly userId: string;
    readonly candidateResultId: string;
    readonly value: CandidateFeedbackValue;
  }): Promise<FeedbackPersistenceResult>;

  upsertSoundScoreFeedback(input: {
    readonly userId: string;
    readonly candidateResultId: string;
    readonly value: SoundScoreFeedbackValue;
  }): Promise<FeedbackPersistenceResult>;
}

