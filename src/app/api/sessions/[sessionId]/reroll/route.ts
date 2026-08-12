import { handleReroll } from "../../../../../server/api/handlers/reroll-handler";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  return handleReroll(request, params);
}

