import { ApplicationError } from "../errors/application-error";
import { ConfigVersionConflictPersistenceError } from "../ports/round-persistence";

export function mapPersistenceError(cause: unknown): ApplicationError {
  return cause instanceof ConfigVersionConflictPersistenceError
    ? new ApplicationError(
        "CONFIG_VERSION_CONFLICT",
        "A config version already exists with different content",
        cause,
      )
    : new ApplicationError(
        "PERSISTENCE_FAILED",
        "Persistence operation failed",
        cause,
      );
}

