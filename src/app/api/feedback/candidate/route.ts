import { handleCandidateFeedback } from "../../../../server/api/handlers/feedback-handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleCandidateFeedback(request);
}

