import { getServerComposition } from "../../composition";
import { mapApiError } from "../error-mapper";
import {
  candidateFeedbackRequestSchema,
  soundScoreFeedbackRequestSchema,
} from "../schemas";
import { jsonSuccess, parseJsonBody } from "../responses";
import type { BackendApiDependencies } from "./types";

export async function handleCandidateFeedback(
  request: Request,
  dependencies: BackendApiDependencies = getServerComposition(),
): Promise<Response> {
  try {
    const body = await parseJsonBody(request, candidateFeedbackRequestSchema);
    const userId = dependencies.betaUserResolver.resolveUserId();
    await dependencies.feedbackService.submitCandidateFeedback({
      userId,
      candidateResultId: body.candidateResultId,
      value: body.value,
    });
    return jsonSuccess(body);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function handleSoundScoreFeedback(
  request: Request,
  dependencies: BackendApiDependencies = getServerComposition(),
): Promise<Response> {
  try {
    const body = await parseJsonBody(
      request,
      soundScoreFeedbackRequestSchema,
    );
    const userId = dependencies.betaUserResolver.resolveUserId();
    await dependencies.feedbackService.submitSoundScoreFeedback({
      userId,
      candidateResultId: body.candidateResultId,
      value: body.value,
    });
    return jsonSuccess(body);
  } catch (error) {
    return mapApiError(error);
  }
}

