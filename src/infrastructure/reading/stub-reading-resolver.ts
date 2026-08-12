import type {
  ReadingResolutionMetadata,
  ReadingResolution,
  ReadingResolver,
  ResolveReadingBatchRequest,
  ResolveReadingBatchResult,
  ResolveReadingRequest,
} from "../../application";
import type { ReadingResult } from "../../domain";

/** Deterministic, fixture-injected reading boundary with no external access. */
export class StubReadingResolver implements ReadingResolver {
  private readonly readingsBySurface: ReadonlyMap<string, ReadingResult>;

  constructor(fixtures: readonly ReadingResult[]) {
    this.readingsBySurface = new Map(
      fixtures.map((reading) => [reading.surface, reading]),
    );
  }

  private metadata(): ReadingResolutionMetadata {
    return {
      resolverIdentifier: "stub",
      promptVersion: "reading-stub-v0.1",
      inferenceConfigVersion: "stub-v0.1",
      durationMs: 0,
    };
  }

  async resolve(request: ResolveReadingRequest): Promise<ReadingResolution> {
    const reading = this.readingsBySurface.get(request.surface);
    return reading === undefined
      ? { status: "unresolved", metadata: this.metadata() }
      : { status: "resolved", reading, metadata: this.metadata() };
  }

  async resolveBatch(
    request: ResolveReadingBatchRequest,
  ): Promise<ResolveReadingBatchResult> {
    return {
      results: request.items.map((item) => {
        const reading = this.readingsBySurface.get(item.surface);
        return reading === undefined
          ? { requestKey: item.requestKey, status: "unresolved" as const }
          : { requestKey: item.requestKey, status: "resolved" as const, reading };
      }),
      metadata: this.metadata(),
    };
  }
}
