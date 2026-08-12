import { ApplicationError } from "../errors/application-error";
import type {
  CandidateFeedbackValue,
  FeedbackPersistencePort,
  SoundScoreFeedbackValue,
} from "../ports/feedback-persistence";
import { mapPersistenceError } from "./persistence-errors";

export class FeedbackService {
  constructor(private readonly persistence: FeedbackPersistencePort) {}

  async submitCandidateFeedback(input: {
    readonly userId: string;
    readonly candidateResultId: string;
    readonly value: CandidateFeedbackValue;
  }): Promise<void> {
    await this.submit("candidate", input);
  }

  async submitSoundScoreFeedback(input: {
    readonly userId: string;
    readonly candidateResultId: string;
    readonly value: SoundScoreFeedbackValue;
  }): Promise<void> {
    await this.submit("sound", input);
  }

  private async submit(
    kind: "candidate" | "sound",
    input: {
      readonly userId: string;
      readonly candidateResultId: string;
      readonly value: CandidateFeedbackValue | SoundScoreFeedbackValue;
    },
  ): Promise<void> {
    if (input.userId.length === 0 || input.candidateResultId.length === 0) {
      throw new ApplicationError("INVALID_INPUT", "Feedback input is invalid");
    }

    let result;
    try {
      result =
        kind === "candidate"
          ? await this.persistence.upsertCandidateFeedback({
              ...input,
              value: input.value as CandidateFeedbackValue,
            })
          : await this.persistence.upsertSoundScoreFeedback({
              ...input,
              value: input.value as SoundScoreFeedbackValue,
            });
    } catch (cause) {
      throw mapPersistenceError(cause);
    }

    if (result === "not_found") {
      throw new ApplicationError(
        "CANDIDATE_RESULT_NOT_FOUND",
        "Candidate result was not found",
      );
    }
  }
}

