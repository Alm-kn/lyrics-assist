import { handleSoundScoreFeedback } from "../../../../server/api/handlers/feedback-handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleSoundScoreFeedback(request);
}

