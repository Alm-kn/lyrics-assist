import type { CandidateKey } from "../../domain";
import type { SessionView } from "../types";

export interface SessionContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly sourceSurface: string;
  readonly sourceReading: string;
  readonly priorRounds: readonly {
    readonly roundNumber: number;
    readonly selectedCandidates: readonly {
      readonly candidateKey: CandidateKey;
      readonly surface: string;
      readonly selectionRank: number;
    }[];
  }[];
}

export interface SessionQueryPort {
  findSessionContext(input: {
    readonly userId: string;
    readonly sessionId: string;
  }): Promise<SessionContext | null>;

  getSessionView(input: {
    readonly userId: string;
    readonly sessionId: string;
  }): Promise<SessionView | null>;
}

