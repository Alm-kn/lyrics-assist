import type { GenerateCandidatesRequest } from "../../../application";

export const CANDIDATE_PROMPT_VERSION = "candidate-openai-v0.1";

export const CANDIDATE_INSTRUCTIONS = [
  "日本語の歌詞制作に使う候補語を生成してください。",
  "同義語だけでなく、情景、感情、イメージ、動作、物、時間、場所、比喩へ広げてください。",
  "音の近さだけに寄せず、韻の位置やスコアや説明は出力しないでください。",
  "source自身とexcludeTermsは候補に含めないでください。",
  "readingHintは参考情報であり、分からない場合はnullにしてください。",
].join("\n");

export function buildCandidateInput(request: GenerateCandidatesRequest): string {
  return JSON.stringify({
    source: request.source,
    targetCount: request.targetCount,
    excludeTerms: request.excludeTerms,
  });
}
