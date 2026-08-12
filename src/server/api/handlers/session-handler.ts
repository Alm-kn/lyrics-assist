import { getServerComposition } from "../../composition";
import { mapSessionDto } from "../dto-mapper";
import { mapApiError } from "../error-mapper";
import { uuidSchema } from "../schemas";
import { ApiBoundaryError, jsonSuccess } from "../responses";
import type { BackendApiDependencies } from "./types";

export async function handleSessionQuery(
  params: Promise<{ readonly sessionId: string }>,
  dependencies?: BackendApiDependencies,
): Promise<Response> {
  try {
    const resolvedDependencies = dependencies ?? getServerComposition();
    const parsedId = uuidSchema.safeParse((await params).sessionId);
    if (!parsedId.success) {
      throw new ApiBoundaryError(400, "INVALID_REQUEST", "Request is invalid.");
    }
    const userId = resolvedDependencies.betaUserResolver.resolveUserId();
    const result = await resolvedDependencies.sessionQueryService.getSession({
      userId,
      sessionId: parsedId.data,
    });
    return jsonSuccess(mapSessionDto(result));
  } catch (error) {
    return mapApiError(error);
  }
}
