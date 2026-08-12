import type { z } from "zod";

export type PublicApiErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "SOURCE_READING_UNRESOLVED"
  | "NO_EVALUABLE_CANDIDATES"
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiBoundaryError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicApiErrorCode,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "ApiBoundaryError";
  }
}

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export function jsonSuccess<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: JSON_HEADERS,
  });
}

export function jsonError(
  status: number,
  code: PublicApiErrorCode,
  message: string,
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: JSON_HEADERS,
  });
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (mediaType !== "application/json") {
    throw new ApiBoundaryError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiBoundaryError(
      400,
      "INVALID_REQUEST",
      "Request is invalid.",
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiBoundaryError(
      400,
      "INVALID_REQUEST",
      "Request is invalid.",
    );
  }
  return parsed.data;
}

