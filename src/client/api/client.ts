import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CandidateFeedbackApiDto,
  CandidateFeedbackValue,
  GeneratedRoundApiDto,
  PublicApiErrorCode,
  SessionApiDto,
  SoundScoreFeedbackApiDto,
  SoundScoreFeedbackValue,
} from "../../contracts/api";
import { ApiClientError } from "./error";

const PUBLIC_CODES = new Set<PublicApiErrorCode>([
  "INVALID_REQUEST",
  "UNSUPPORTED_MEDIA_TYPE",
  "SOURCE_READING_UNRESOLVED",
  "NO_EVALUABLE_CANDIDATES",
  "NOT_FOUND",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    PUBLIC_CODES.has(error.code as PublicApiErrorCode)
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new ApiClientError("NETWORK_ERROR", "Network request failed");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError("INTERNAL_ERROR", "Invalid API response");
  }

  if (!response.ok) {
    const code = isApiErrorEnvelope(payload)
      ? payload.error.code
      : "INTERNAL_ERROR";
    throw new ApiClientError(code, "API request failed");
  }

  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ApiClientError("INTERNAL_ERROR", "Invalid API response");
  }

  return (payload as ApiSuccessEnvelope<T>).data;
}

function postJson<T>(url: string, body: object): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function generate(sourceSurface: string): Promise<GeneratedRoundApiDto> {
  return postJson("/api/generations", { sourceSurface });
}

export function getSession(sessionId: string): Promise<SessionApiDto> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function reroll(sessionId: string): Promise<GeneratedRoundApiDto> {
  return postJson(`/api/sessions/${encodeURIComponent(sessionId)}/reroll`, {});
}

export function submitCandidateFeedback(
  candidateResultId: string,
  value: CandidateFeedbackValue,
): Promise<CandidateFeedbackApiDto> {
  return postJson("/api/feedback/candidate", { candidateResultId, value });
}

export function submitSoundScoreFeedback(
  candidateResultId: string,
  value: SoundScoreFeedbackValue,
): Promise<SoundScoreFeedbackApiDto> {
  return postJson("/api/feedback/sound-score", { candidateResultId, value });
}
