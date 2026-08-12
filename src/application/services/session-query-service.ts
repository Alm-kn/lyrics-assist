import { ApplicationError } from "../errors/application-error";
import type { SessionQueryPort } from "../ports/session-query";
import type { SessionView } from "../types";
import { mapPersistenceError } from "./persistence-errors";

export class SessionQueryService {
  constructor(private readonly query: SessionQueryPort) {}

  async getSession(input: {
    readonly userId: string;
    readonly sessionId: string;
  }): Promise<SessionView> {
    if (input.userId.length === 0 || input.sessionId.length === 0) {
      throw new ApplicationError("INVALID_INPUT", "Session query input is invalid");
    }

    let session;
    try {
      session = await this.query.getSessionView(input);
    } catch (cause) {
      throw mapPersistenceError(cause);
    }
    if (session === null) {
      throw new ApplicationError("SESSION_NOT_FOUND", "Session was not found");
    }

    return session;
  }
}

