import { z } from "zod";

export interface BetaUserResolver {
  resolveUserId(): string;
}

export class ServerConfigurationError extends Error {
  constructor() {
    super("Server configuration is invalid");
    this.name = "ServerConfigurationError";
  }
}

export class FixedBetaUserResolver implements BetaUserResolver {
  constructor(
    private readonly readConfiguredId: () => string | undefined = () =>
      process.env.LYRICS_ASSIST_BETA_USER_ID,
  ) {}

  resolveUserId(): string {
    const result = z.uuid().safeParse(this.readConfiguredId());
    if (!result.success) {
      throw new ServerConfigurationError();
    }
    return result.data;
  }
}

