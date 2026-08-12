import { getServerComposition } from "../../composition";
import { mapGeneratedRoundDto } from "../dto-mapper";
import { mapApiError } from "../error-mapper";
import { rerollRequestSchema, uuidSchema } from "../schemas";
import {
  ApiBoundaryError,
  jsonSuccess,
  parseJsonBody,
} from "../responses";
import type { BackendApiDependencies } from "./types";

export async function handleReroll(
  request: Request,
  params: Promise<{ readonly sessionId: string }>,
  dependencies: BackendApiDependencies = getServerComposition(),
): Promise<Response> {
  try {
    const body = await parseJsonBody(request, rerollRequestSchema);
    void body;
    const parsedId = uuidSchema.safeParse((await params).sessionId);
    if (!parsedId.success) {
      throw new ApiBoundaryError(400, "INVALID_REQUEST", "Request is invalid.");
    }
    const userId = dependencies.betaUserResolver.resolveUserId();
    const result = await dependencies.rerollService.reroll({
      userId,
      sessionId: parsedId.data,
    });
    return jsonSuccess(mapGeneratedRoundDto(result), 201);
  } catch (error) {
    return mapApiError(error);
  }
}

