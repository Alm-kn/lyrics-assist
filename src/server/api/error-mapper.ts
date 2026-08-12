import { ApplicationError } from "../../application";
import { ApiBoundaryError, jsonError } from "./responses";

export function mapApiError(error: unknown): Response {
  if (error instanceof ApiBoundaryError) {
    return jsonError(error.status, error.code, error.publicMessage);
  }

  if (error instanceof ApplicationError) {
    switch (error.code) {
      case "INVALID_INPUT":
        return jsonError(400, "INVALID_REQUEST", "Request is invalid.");
      case "SOURCE_READING_UNRESOLVED":
        return jsonError(
          422,
          "SOURCE_READING_UNRESOLVED",
          "The source reading could not be resolved.",
        );
      case "NO_EVALUABLE_CANDIDATES":
        return jsonError(
          422,
          "NO_EVALUABLE_CANDIDATES",
          "No evaluable candidates were produced.",
        );
      case "SESSION_NOT_FOUND":
      case "CANDIDATE_RESULT_NOT_FOUND":
        return jsonError(404, "NOT_FOUND", "The requested resource was not found.");
      case "READING_RESOLVER_FAILED":
      case "CANDIDATE_GENERATION_FAILED":
      case "SEMANTIC_EVALUATION_FAILED":
        return jsonError(
          502,
          "UPSTREAM_UNAVAILABLE",
          "An upstream service is unavailable.",
        );
      case "PERSISTENCE_FAILED":
      case "CONFIG_VERSION_CONFLICT":
        return jsonError(500, "INTERNAL_ERROR", "An internal error occurred.");
    }
  }

  return jsonError(500, "INTERNAL_ERROR", "An internal error occurred.");
}

