import type { ReadingResult } from "../../domain";

export interface ResolveReadingRequest {
  readonly surface: string;
  readonly readingHint?: string;
}

export type ReadingResolution =
  | { readonly status: "resolved"; readonly reading: ReadingResult }
  | { readonly status: "unresolved" };

export interface ReadingResolver {
  resolve(request: ResolveReadingRequest): Promise<ReadingResolution>;
}

