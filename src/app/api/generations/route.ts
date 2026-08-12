import { handleGeneration } from "../../../server/api/handlers/generation-handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleGeneration(request);
}

