import type { EvaluateSemanticsRequest } from "../../../application";

export const SEMANTIC_PROMPT_VERSION = "semantic-openai-v0.1";

export const SEMANTIC_INSTRUCTIONS = [
  "sourceと各candidateの意味・文脈上の関連だけを0〜100で評価してください。",
  "candidateKeyを変更せずに返してください。",
  "primaryRelation、secondaryRelations、semanticClusterは開いた語彙で簡潔に記述してください。",
  "音、読み、韻、Sound Scoreを推測または評価に使用しないでください。",
].join("\n");

export function buildSemanticInput(request: EvaluateSemanticsRequest): string {
  return JSON.stringify({ source: request.source, candidates: request.candidates });
}
