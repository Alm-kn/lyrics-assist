import { getServerComposition } from "../../composition";
import { mapGeneratedRoundDto } from "../dto-mapper";
import { mapApiError } from "../error-mapper";
import { generationRequestSchema } from "../schemas";
import { jsonSuccess, parseJsonBody } from "../responses";
import type { BackendApiDependencies } from "./types";

export async function handleGeneration(
  request: Request,
  dependencies: BackendApiDependencies = getServerComposition(),
): Promise<Response> {
  try {
    const body = await parseJsonBody(request, generationRequestSchema);
    const userId = dependencies.betaUserResolver.resolveUserId();
    const result = await dependencies.generationService.generateInitialRound({
      userId,
      sourceSurface: body.sourceSurface,
    });
    return jsonSuccess(mapGeneratedRoundDto(result), 201);
  } catch (error) {
    return mapApiError(error);
  }
}

