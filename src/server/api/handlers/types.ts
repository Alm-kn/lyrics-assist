import type {
  FeedbackService,
  GenerationService,
  RerollService,
  SessionQueryService,
} from "../../../application";
import type { BetaUserResolver } from "../../identity/beta-user-resolver";

export interface BackendApiDependencies {
  readonly betaUserResolver: BetaUserResolver;
  readonly generationService: Pick<GenerationService, "generateInitialRound">;
  readonly rerollService: Pick<RerollService, "reroll">;
  readonly feedbackService: Pick<
    FeedbackService,
    "submitCandidateFeedback" | "submitSoundScoreFeedback"
  >;
  readonly sessionQueryService: Pick<SessionQueryService, "getSession">;
}

