import type { ReadingResult } from "../../domain";

export interface ResolveReadingRequest {
  readonly surface: string;
  readonly readingHint?: string;
}

export interface ReadingResolutionMetadata {
  readonly resolverIdentifier: string;
  readonly promptVersion: string;
  readonly inferenceConfigVersion: string;
  readonly providerResponseId?: string;
  readonly durationMs?: number;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

export type ReadingResolution =
  | {
      readonly status: "resolved";
      readonly reading: ReadingResult;
      readonly metadata: ReadingResolutionMetadata;
    }
  | { readonly status: "unresolved"; readonly metadata: ReadingResolutionMetadata };

export interface ResolveReadingBatchItem extends ResolveReadingRequest {
  readonly requestKey: string;
}

export interface ResolveReadingBatchRequest {
  readonly items: readonly ResolveReadingBatchItem[];
}

export type ReadingBatchResolutionItem =
  | {
      readonly requestKey: string;
      readonly status: "resolved";
      readonly reading: ReadingResult;
    }
  | { readonly requestKey: string; readonly status: "unresolved" };

export interface ResolveReadingBatchResult {
  readonly results: readonly ReadingBatchResolutionItem[];
  readonly metadata: ReadingResolutionMetadata;
}

export interface ReadingResolver {
  resolve(request: ResolveReadingRequest): Promise<ReadingResolution>;
  resolveBatch(
    request: ResolveReadingBatchRequest,
  ): Promise<ResolveReadingBatchResult>;
}
