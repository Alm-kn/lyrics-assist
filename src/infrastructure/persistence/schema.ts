import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import type { SelectionCategory, SelectionTargetCategory } from "../../domain";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

export const generationSessions = sqliteTable(
  "generation_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sourceSurface: text("source_surface").notNull(),
    sourceReading: text("source_reading").notNull(),
    sourceReadingResolutionJson: text("source_reading_resolution_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("generation_sessions_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const scoringConfigs = sqliteTable("scoring_configs", {
  version: text("version").primaryKey(),
  configJson: text("config_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const selectionConfigs = sqliteTable("selection_configs", {
  version: text("version").primaryKey(),
  configJson: text("config_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const generationRounds = sqliteTable(
  "generation_rounds",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => generationSessions.id, { onDelete: "restrict" }),
    roundNumber: integer("round_number").notNull(),
    generationTargetCount: integer("generation_target_count").notNull(),
    excludeTermsJson: text("exclude_terms_json").notNull(),
    generationModelIdentifier: text("generation_model_identifier").notNull(),
    generationPromptVersion: text("generation_prompt_version").notNull(),
    generationResultJson: text("generation_result_json").notNull(),
    semanticEvaluationResultJson: text(
      "semantic_evaluation_result_json",
    ).notNull(),
    candidateReadingResolutionResultJson: text(
      "candidate_reading_resolution_result_json",
    ),
    normalizerVersion: text("normalizer_version").notNull(),
    sourceRhymeJson: text("source_rhyme_json").notNull(),
    scoringConfigVersion: text("scoring_config_version")
      .notNull()
      .references(() => scoringConfigs.version, { onDelete: "restrict" }),
    selectionConfigVersion: text("selection_config_version")
      .notNull()
      .references(() => selectionConfigs.version, { onDelete: "restrict" }),
    selectionResultJson: text("selection_result_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    unique("generation_rounds_session_id_round_number_unique").on(
      table.sessionId,
      table.roundNumber,
    ),
    check(
      "generation_rounds_round_number_check",
      sql`${table.roundNumber} >= 1`,
    ),
    check(
      "generation_rounds_target_count_check",
      sql`${table.generationTargetCount} > 0`,
    ),
  ],
);

export const candidateResults = sqliteTable(
  "candidate_results",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id")
      .notNull()
      .references(() => generationRounds.id, { onDelete: "restrict" }),
    candidateKey: text("candidate_key").notNull(),
    generationIndex: integer("generation_index").notNull(),
    surface: text("surface").notNull(),
    generationReadingHint: text("generation_reading_hint"),
    reading: text("reading").notNull(),
    readingResultJson: text("reading_result_json").notNull(),
    rhymeRepresentationJson: text("rhyme_representation_json").notNull(),
    soundFinalScore: integer("sound_final_score").notNull(),
    soundRawScore: real("sound_raw_score").notNull(),
    moraLengthScore: real("mora_length_score").notNull(),
    positionMatchScore: real("position_match_score").notNull(),
    sequenceSimilarityScore: real("sequence_similarity_score").notNull(),
    commonSuffixLength: integer("common_suffix_length").notNull(),
    suffixCoverage: real("suffix_coverage").notNull(),
    endingBonus: real("ending_bonus").notNull(),
    soundResultJson: text("sound_result_json").notNull(),
    semanticScore: real("semantic_score").notNull(),
    semanticReason: text("semantic_reason").notNull(),
    primaryRelation: text("primary_relation").notNull(),
    secondaryRelationsJson: text("secondary_relations_json").notNull(),
    semanticCluster: text("semantic_cluster").notNull(),
    semanticModelIdentifier: text("semantic_model_identifier").notNull(),
    semanticPromptVersion: text("semantic_prompt_version").notNull(),
    semanticResultJson: text("semantic_result_json").notNull(),
    selected: integer("selected", { mode: "boolean" }).notNull(),
    selectionCategory: text("selection_category").$type<SelectionCategory>(),
    fallbackStrategy: text("fallback_strategy").$type<SelectionTargetCategory>(),
    selectionScore: real("selection_score"),
    selectionRank: integer("selection_rank"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    unique("candidate_results_round_id_candidate_key_unique").on(
      table.roundId,
      table.candidateKey,
    ),
    unique("candidate_results_round_id_generation_index_unique").on(
      table.roundId,
      table.generationIndex,
    ),
    unique("candidate_results_round_id_selection_rank_unique").on(
      table.roundId,
      table.selectionRank,
    ),
    check(
      "candidate_results_generation_index_check",
      sql`${table.generationIndex} >= 0`,
    ),
    check(
      "candidate_results_selected_check",
      sql`${table.selected} IN (0, 1)`,
    ),
    check(
      "candidate_results_sound_final_score_check",
      sql`${table.soundFinalScore} BETWEEN 0 AND 100`,
    ),
    check(
      "candidate_results_semantic_score_check",
      sql`${table.semanticScore} BETWEEN 0 AND 100`,
    ),
    check(
      "candidate_results_common_suffix_length_check",
      sql`${table.commonSuffixLength} >= 0`,
    ),
    check(
      "candidate_results_suffix_coverage_check",
      sql`${table.suffixCoverage} BETWEEN 0 AND 1`,
    ),
    check(
      "candidate_results_selection_consistency_check",
      sql`(
        ${table.selected} = 0
        AND ${table.selectionCategory} IS NULL
        AND ${table.fallbackStrategy} IS NULL
        AND ${table.selectionScore} IS NULL
        AND ${table.selectionRank} IS NULL
      ) OR (
        ${table.selected} = 1
        AND ${table.selectionCategory} IS NOT NULL
        AND ${table.selectionCategory} IN ('balanced', 'sound', 'semantic', 'fallback')
        AND ${table.selectionScore} IS NOT NULL
        AND ${table.selectionRank} IS NOT NULL
        AND ${table.selectionRank} >= 1
        AND (
          (${table.selectionCategory} = 'fallback' AND ${table.fallbackStrategy} IS NOT NULL AND ${table.fallbackStrategy} IN ('balanced', 'sound', 'semantic'))
          OR
          (${table.selectionCategory} IN ('balanced', 'sound', 'semantic') AND ${table.fallbackStrategy} IS NULL)
        )
      )`,
    ),
  ],
);

export const candidateFeedback = sqliteTable(
  "candidate_feedback",
  {
    candidateResultId: text("candidate_result_id")
      .primaryKey()
      .references(() => candidateResults.id, { onDelete: "restrict" }),
    value: text("value").$type<"like" | "dislike">().notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "candidate_feedback_value_check",
      sql`${table.value} IN ('like', 'dislike')`,
    ),
  ],
);

export const soundScoreFeedback = sqliteTable(
  "sound_score_feedback",
  {
    candidateResultId: text("candidate_result_id")
      .primaryKey()
      .references(() => candidateResults.id, { onDelete: "restrict" }),
    value: text("value").$type<"low" | "valid" | "high">().notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "sound_score_feedback_value_check",
      sql`${table.value} IN ('low', 'valid', 'high')`,
    ),
  ],
);

export const persistenceSchema = {
  users,
  generationSessions,
  generationRounds,
  candidateResults,
  candidateFeedback,
  soundScoreFeedback,
  scoringConfigs,
  selectionConfigs,
};
