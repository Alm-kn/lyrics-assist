import type {
  EvaluateSemanticsRequest,
  EvaluateSemanticsResult,
  GenerateCandidatesRequest,
  GenerateCandidatesResult,
  LlmAdapter,
} from "../../application/ports/llm-adapter";

export interface StubLlmAdapterFixtures {
  readonly generationResult: GenerateCandidatesResult;
  readonly semanticResult: EvaluateSemanticsResult;
}

/** Deterministic, network-free adapter that returns caller-provided fixtures. */
export class StubLlmAdapter implements LlmAdapter {
  constructor(private readonly fixtures: StubLlmAdapterFixtures) {}

  async generateCandidates(
    request: GenerateCandidatesRequest,
  ): Promise<GenerateCandidatesResult> {
    void request;
    return this.fixtures.generationResult;
  }

  async evaluateSemantics(
    request: EvaluateSemanticsRequest,
  ): Promise<EvaluateSemanticsResult> {
    void request;
    return this.fixtures.semanticResult;
  }
}
