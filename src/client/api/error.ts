import type { PublicApiErrorCode } from "../../contracts/api";

export class ApiClientError extends Error {
  constructor(
    readonly code: PublicApiErrorCode | "NETWORK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const USER_MESSAGES: Record<ApiClientError["code"], string> = {
  INVALID_REQUEST: "リクエストを確認できませんでした。",
  UNSUPPORTED_MEDIA_TYPE: "リクエストを確認できませんでした。",
  SOURCE_READING_UNRESOLVED:
    "読みを判定できませんでした。別の表記で試してください。",
  NO_EVALUABLE_CANDIDATES:
    "候補を評価できませんでした。もう一度試してください。",
  NOT_FOUND: "このセッションは見つかりませんでした。",
  UPSTREAM_UNAVAILABLE:
    "生成処理を利用できませんでした。少し後で試してください。",
  INTERNAL_ERROR: "処理中に問題が発生しました。",
  NETWORK_ERROR: "通信に失敗しました。",
};

export function userMessageFor(error: unknown): string {
  return error instanceof ApiClientError
    ? USER_MESSAGES[error.code]
    : USER_MESSAGES.INTERNAL_ERROR;
}
