import type { ResolveReadingBatchRequest } from "../../../application";

export const READING_PROMPT_VERSION = "reading-openai-v0.1";

export const READING_INSTRUCTIONS = [
  "各日本語surfaceについて、歌詞中の単語として最も自然な読みを原則ひらがなで返してください。",
  "requestKeyを変更せずに返してください。",
  "readingHintは参考情報にとどめ、surfaceと矛盾する場合はsurfaceを優先してください。",
  "複数候補を併記せず、判断できない場合はstatusをunresolved、readingをnullにしてください。",
].join("\n");

export function buildReadingInput(request: ResolveReadingBatchRequest): string {
  return JSON.stringify({ items: request.items });
}
