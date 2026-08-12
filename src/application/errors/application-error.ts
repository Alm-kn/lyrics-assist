export type ApplicationErrorCode =
  | "INVALID_INPUT"
  | "SOURCE_READING_UNRESOLVED"
  | "READING_RESOLVER_FAILED"
  | "CANDIDATE_GENERATION_FAILED"
  | "SEMANTIC_EVALUATION_FAILED"
  | "NO_EVALUABLE_CANDIDATES"
  | "SESSION_NOT_FOUND"
  | "CANDIDATE_RESULT_NOT_FOUND"
  | "PERSISTENCE_FAILED"
  | "CONFIG_VERSION_CONFLICT";

/** Identifiable use-case failure. HTTP mapping belongs to M8. */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApplicationError";
    this.code = code;
  }
}

