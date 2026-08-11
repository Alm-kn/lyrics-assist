/** A single, unnormalized Japanese mora from the resolved reading. */
export type Mora = string;

/** Reading providers explicitly supported by the v0.1 resolver boundary. */
export type ReadingSource = "dictionary" | "parser" | "llm" | "manual";

/**
 * The original reading data before phonetic parsing or lyric normalization.
 * This representation must remain available when later rules change.
 */
export interface RawReadingRepresentation {
  readonly reading: string;
  readonly morae: readonly Mora[];
}

/** The provider result for one surface form. */
export interface ReadingResult extends RawReadingRepresentation {
  readonly surface: string;
  readonly source: ReadingSource;
  readonly confidence?: number;
}
