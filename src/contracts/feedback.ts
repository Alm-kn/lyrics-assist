export type CandidateFeedbackValue = "like" | "dislike";

export type SoundScoreFeedbackValue = "low" | "valid" | "high";

export interface CandidateFeedbackState {
  readonly candidate: CandidateFeedbackValue | null;
  readonly soundScore: SoundScoreFeedbackValue | null;
}
