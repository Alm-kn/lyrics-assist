import type {
  ReadingResolution,
  ReadingResolver,
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

  async resolve(request: ResolveReadingRequest): Promise<ReadingResolution> {
    const reading = this.readingsBySurface.get(request.surface);
    return reading === undefined
      ? { status: "unresolved" }
      : { status: "resolved", reading };
  }
}

