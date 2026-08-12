import { handleSessionQuery } from "../../../../server/api/handlers/session-handler";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  return handleSessionQuery(params);
}

