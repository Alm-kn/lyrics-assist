/** Stored version identifiers. Their concrete naming convention is configuration-owned. */
export type NormalizerVersion = string;
export type ScoringConfigVersion = string;
export type SelectionConfigVersion = string;
export type GenerationPromptVersion = string;
export type SemanticPromptVersion = string;
export type ModelIdentifier = string;

/** JSON-compatible values suitable for persisted beta configuration snapshots. */
export type ConfigPrimitive = string | number | boolean | null;
export type ConfigValue =
  | ConfigPrimitive
  | readonly ConfigValue[]
  | { readonly [key: string]: ConfigValue };
export type ConfigParameters = Readonly<Record<string, ConfigValue>>;

/** Common contract for immutable, versioned configuration snapshots. */
export interface VersionedConfig<TVersion extends string> {
  readonly version: TVersion;
}

/** Versioned prompt text. Prompt construction and use belong to later milestones. */
export interface PromptConfig<TVersion extends string>
  extends VersionedConfig<TVersion> {
  readonly template: string;
}

export type GenerationPromptConfig = PromptConfig<GenerationPromptVersion>;
export type SemanticPromptConfig = PromptConfig<SemanticPromptVersion>;

/** Model selection data without coupling the domain to an LLM client. */
export interface ModelConfig {
  readonly identifier: ModelIdentifier;
  readonly provider: string;
  readonly parameters?: ConfigParameters;
}

/** Full version context retained with a completed candidate-evaluation snapshot. */
export interface PipelineVersionSnapshot {
  readonly normalizerVersion: NormalizerVersion;
  readonly scoringConfigVersion: ScoringConfigVersion;
  readonly selectionConfigVersion: SelectionConfigVersion;
  readonly generationPromptVersion: GenerationPromptVersion;
  readonly semanticPromptVersion: SemanticPromptVersion;
  readonly modelIdentifier: ModelIdentifier;
}
