CREATE TABLE `candidate_feedback` (
	`candidate_result_id` text PRIMARY KEY,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_candidate_feedback_candidate_result_id_candidate_results_id_fk` FOREIGN KEY (`candidate_result_id`) REFERENCES `candidate_results`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "candidate_feedback_value_check" CHECK("value" IN ('like', 'dislike'))
);
--> statement-breakpoint
CREATE TABLE `candidate_results` (
	`id` text PRIMARY KEY,
	`round_id` text NOT NULL,
	`candidate_key` text NOT NULL,
	`generation_index` integer NOT NULL,
	`surface` text NOT NULL,
	`generation_reading_hint` text,
	`reading` text NOT NULL,
	`reading_result_json` text NOT NULL,
	`rhyme_representation_json` text NOT NULL,
	`sound_final_score` integer NOT NULL,
	`sound_raw_score` real NOT NULL,
	`mora_length_score` real NOT NULL,
	`position_match_score` real NOT NULL,
	`sequence_similarity_score` real NOT NULL,
	`common_suffix_length` integer NOT NULL,
	`suffix_coverage` real NOT NULL,
	`ending_bonus` real NOT NULL,
	`sound_result_json` text NOT NULL,
	`semantic_score` real NOT NULL,
	`semantic_reason` text NOT NULL,
	`primary_relation` text NOT NULL,
	`secondary_relations_json` text NOT NULL,
	`semantic_cluster` text NOT NULL,
	`semantic_model_identifier` text NOT NULL,
	`semantic_prompt_version` text NOT NULL,
	`semantic_result_json` text NOT NULL,
	`selected` integer NOT NULL,
	`selection_category` text,
	`fallback_strategy` text,
	`selection_score` real,
	`selection_rank` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_candidate_results_round_id_generation_rounds_id_fk` FOREIGN KEY (`round_id`) REFERENCES `generation_rounds`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `candidate_results_round_id_candidate_key_unique` UNIQUE(`round_id`,`candidate_key`),
	CONSTRAINT `candidate_results_round_id_generation_index_unique` UNIQUE(`round_id`,`generation_index`),
	CONSTRAINT `candidate_results_round_id_selection_rank_unique` UNIQUE(`round_id`,`selection_rank`),
	CONSTRAINT "candidate_results_generation_index_check" CHECK("generation_index" >= 0),
	CONSTRAINT "candidate_results_selected_check" CHECK("selected" IN (0, 1)),
	CONSTRAINT "candidate_results_sound_final_score_check" CHECK("sound_final_score" BETWEEN 0 AND 100),
	CONSTRAINT "candidate_results_semantic_score_check" CHECK("semantic_score" BETWEEN 0 AND 100),
	CONSTRAINT "candidate_results_common_suffix_length_check" CHECK("common_suffix_length" >= 0),
	CONSTRAINT "candidate_results_suffix_coverage_check" CHECK("suffix_coverage" BETWEEN 0 AND 1),
	CONSTRAINT "candidate_results_selection_consistency_check" CHECK((
        "selected" = 0
        AND "selection_category" IS NULL
        AND "fallback_strategy" IS NULL
        AND "selection_score" IS NULL
        AND "selection_rank" IS NULL
      ) OR (
        "selected" = 1
        AND "selection_category" IS NOT NULL
        AND "selection_category" IN ('balanced', 'sound', 'semantic', 'fallback')
        AND "selection_score" IS NOT NULL
        AND "selection_rank" IS NOT NULL
        AND "selection_rank" >= 1
        AND (
          ("selection_category" = 'fallback' AND "fallback_strategy" IS NOT NULL AND "fallback_strategy" IN ('balanced', 'sound', 'semantic'))
          OR
          ("selection_category" IN ('balanced', 'sound', 'semantic') AND "fallback_strategy" IS NULL)
        )
      ))
);
--> statement-breakpoint
CREATE TABLE `generation_rounds` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`generation_target_count` integer NOT NULL,
	`exclude_terms_json` text NOT NULL,
	`generation_model_identifier` text NOT NULL,
	`generation_prompt_version` text NOT NULL,
	`generation_result_json` text NOT NULL,
	`semantic_evaluation_result_json` text NOT NULL,
	`normalizer_version` text NOT NULL,
	`source_rhyme_json` text NOT NULL,
	`scoring_config_version` text NOT NULL,
	`selection_config_version` text NOT NULL,
	`selection_result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_generation_rounds_session_id_generation_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `generation_sessions`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_generation_rounds_scoring_config_version_scoring_configs_version_fk` FOREIGN KEY (`scoring_config_version`) REFERENCES `scoring_configs`(`version`) ON DELETE RESTRICT,
	CONSTRAINT `fk_generation_rounds_selection_config_version_selection_configs_version_fk` FOREIGN KEY (`selection_config_version`) REFERENCES `selection_configs`(`version`) ON DELETE RESTRICT,
	CONSTRAINT `generation_rounds_session_id_round_number_unique` UNIQUE(`session_id`,`round_number`),
	CONSTRAINT "generation_rounds_round_number_check" CHECK("round_number" >= 1),
	CONSTRAINT "generation_rounds_target_count_check" CHECK("generation_target_count" > 0)
);
--> statement-breakpoint
CREATE TABLE `generation_sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`source_surface` text NOT NULL,
	`source_reading` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_generation_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `scoring_configs` (
	`version` text PRIMARY KEY,
	`config_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `selection_configs` (
	`version` text PRIMARY KEY,
	`config_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sound_score_feedback` (
	`candidate_result_id` text PRIMARY KEY,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_sound_score_feedback_candidate_result_id_candidate_results_id_fk` FOREIGN KEY (`candidate_result_id`) REFERENCES `candidate_results`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "sound_score_feedback_value_check" CHECK("value" IN ('low', 'valid', 'high'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `generation_sessions_user_id_created_at_idx` ON `generation_sessions` (`user_id`,`created_at`);