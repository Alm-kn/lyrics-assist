import { getServerComposition } from "../../composition";
import { mapSessionDto } from "../dto-mapper";
import { mapApiError } from "../error-mapper";
import { uuidSchema } from "../schemas";
import { ApiBoundaryError, jsonSuccess } from "../responses";
import type { BackendApiDependencies } from "./types";

export async function handleSessionQuery(
  params: Promise<{ readonly sessionId: string }>,
  dependencies: BackendApiDependencies = getServerComposition(),
): Promise<Response> {
  try {
    const parsedId = uuidSchema.safeParse((await params).sessionId);
    if (!parsedId.success) {
      throw new ApiBoundaryError(400, "INVALID_REQUEST", "Request is invalid.");
    }
    const userId = dependencies.betaUserResolver.resolveUserId();
    const result = await dependencies.sessionQueryService.getSession({
      userId,
      sessionId: parsedId.data,
    });
    return jsonSuccess(mapSessionDto(result));
  } catch (error) {
    return mapApiError(error);
  }
}

