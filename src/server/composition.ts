import {
  FeedbackService,
  GenerationService,
  RerollService,
  SessionQueryService,
} from "../application";
import { StubLlmAdapter } from "../infrastructure/llm/stub-llm-adapter";
import {
  DEFAULT_DATABASE_PATH,
  openPersistenceDatabase,
  SqliteApplicationPersistence,
} from "../infrastructure/persistence";
import type { PersistenceDatabaseConnection } from "../infrastructure/persistence";
import { StubReadingResolver } from "../infrastructure/reading/stub-reading-resolver";
import type { BackendApiDependencies } from "./api/handlers/types";
import {
  DEVELOPMENT_GENERATION_RESULT,
  DEVELOPMENT_READINGS,
  DEVELOPMENT_SEMANTIC_RESULT,
} from "./fixtures/development-stub-fixture";
import { FixedBetaUserResolver } from "./identity/beta-user-resolver";

let singleton:
  | {
      readonly dependencies: BackendApiDependencies;
      readonly connection: PersistenceDatabaseConnection;
    }
  | undefined;

export function getServerComposition(): BackendApiDependencies {
  if (singleton !== undefined) {
    return singleton.dependencies;
  }

  const connection = openPersistenceDatabase(
    process.env.LYRICS_ASSIST_DB_PATH ?? DEFAULT_DATABASE_PATH,
  );
  const persistence = new SqliteApplicationPersistence(connection.db);
  const readingResolver = new StubReadingResolver(DEVELOPMENT_READINGS);
  const llmAdapter = new StubLlmAdapter({
    generationResult: DEVELOPMENT_GENERATION_RESULT,
    semanticResult: DEVELOPMENT_SEMANTIC_RESULT,
  });
  const dependencies: BackendApiDependencies = {
    betaUserResolver: new FixedBetaUserResolver(),
    generationService: new GenerationService({
      readingResolver,
      llmAdapter,
      roundPersistence: persistence,
    }),
    rerollService: new RerollService({
      readingResolver,
      llmAdapter,
      roundPersistence: persistence,
      sessionQuery: persistence,
    }),
    feedbackService: new FeedbackService(persistence),
    sessionQueryService: new SessionQueryService(persistence),
  };
  singleton = { dependencies, connection };
  return dependencies;
}

/** Test-only lifecycle hook; production keeps the lazy graph for process reuse. */
export function resetServerCompositionForTests(): void {
  singleton?.connection.close();
  singleton = undefined;
}

