import { eq } from "drizzle-orm";
import type { NodeSQLiteTransaction } from "drizzle-orm/node-sqlite";
import type { EmptyRelations } from "drizzle-orm/relations";

import type { SelectionConfig, SoundScoringConfig } from "../../../domain";
import type { PersistenceDatabase } from "../database";
import { parseJsonSnapshot, serializeCanonicalJson } from "../json";
import { scoringConfigs, selectionConfigs } from "../schema";

type PersistenceExecutor =
  | PersistenceDatabase
  | NodeSQLiteTransaction<EmptyRelations>;

function ensureImmutableConfig<TConfig>(
  executor: PersistenceExecutor,
  table: typeof scoringConfigs | typeof selectionConfigs,
  config: TConfig & { readonly version: string },
  createdAt: number,
  label: string,
): void {
  const configJson = serializeCanonicalJson(config, label);
  const existing = executor
    .select({ configJson: table.configJson })
    .from(table)
    .where(eq(table.version, config.version))
    .get();

  if (existing === undefined) {
    executor
      .insert(table)
      .values({ version: config.version, configJson, createdAt })
      .run();
    return;
  }

  if (existing.configJson !== configJson) {
    throw new Error(`${label} version already exists with different content`);
  }
}

export function ensureScoringConfig(
  executor: PersistenceExecutor,
  config: SoundScoringConfig,
  createdAt: number,
): void {
  ensureImmutableConfig(executor, scoringConfigs, config, createdAt, "ScoringConfig");
}

export function ensureSelectionConfig(
  executor: PersistenceExecutor,
  config: SelectionConfig,
  createdAt: number,
): void {
  ensureImmutableConfig(
    executor,
    selectionConfigs,
    config,
    createdAt,
    "SelectionConfig",
  );
}

export class ConfigRepository {
  constructor(
    private readonly db: PersistenceDatabase,
    private readonly clock: () => number = Date.now,
  ) {}

  ensureScoring(config: SoundScoringConfig): void {
    ensureScoringConfig(this.db, config, this.clock());
  }

  ensureSelection(config: SelectionConfig): void {
    ensureSelectionConfig(this.db, config, this.clock());
  }

  getScoring(version: string): SoundScoringConfig | undefined {
    const row = this.db
      .select({ configJson: scoringConfigs.configJson })
      .from(scoringConfigs)
      .where(eq(scoringConfigs.version, version))
      .get();
    return row === undefined
      ? undefined
      : parseJsonSnapshot<SoundScoringConfig>(row.configJson, "ScoringConfig");
  }

  getSelection(version: string): SelectionConfig | undefined {
    const row = this.db
      .select({ configJson: selectionConfigs.configJson })
      .from(selectionConfigs)
      .where(eq(selectionConfigs.version, version))
      .get();
    return row === undefined
      ? undefined
      : parseJsonSnapshot<SelectionConfig>(row.configJson, "SelectionConfig");
  }
}
