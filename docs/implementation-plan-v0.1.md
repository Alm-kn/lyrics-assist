# Implementation Plan v0.1 β

## 方針

Codexへ要件定義書と設計書を一度に渡して「全部実装」させない。
各Milestoneを1タスクとして実装し、テスト・差分確認・動作確認を挟んでから次へ進む。

レビューはコードを一行ずつ理解することを意味しない。各Milestoneで最低限、以下を確認する。

1. Codexが変更内容を要約できる。
2. 指定したテスト / lint / typecheck が通る。
3. 想定した振る舞いを簡単な入力例で確認できる。
4. 設計書からの逸脱がある場合、理由が明示されている。
5. 不明な差分は次Milestoneへ進む前にChatで確認する。

## Milestones

### M0 - Project bootstrap
- Next.js + TypeScript project
- npm
- lint / typecheck
- Vitest
- Playwright skeleton
- directory skeleton
- プロダクト機能は実装しない

### M1 - Domain types
- ReadingResult
- normalized rhyme representations
- SoundScoreResult
- SemanticResult
- SelectionResult
- version/config types

### M2 - Rhyme Normalizer
- 長音
- 促音 Q -> X
- 撥音 N -> X
- 拗音
- o+u -> o+o（暫定）
- e+i -> e+e（暫定）
- unit tests

### M3 - Sound Scorer
- mora length
- vowel position match
- sequence similarity
- ending rhyme bonus
- versioned config
- unit tests

### M4 - LLM Adapter stub
- Application-owned `LlmAdapter` Port
- candidate generation schema
- semantic evaluation schema
- `candidateKey` based mapping
- fixture injection型deterministic Stub
- 実APIはまだ接続しない

### M5 - Candidate Selector
- Balanced 4
- Sound-focused 3
- Semantic-focused 3
- canonical duplicate filtering
- semantic diversity
- fallback allocation
- unit tests

### M6 - Persistence
- SQLite + Drizzle
- session / round / evaluated candidate snapshot / feedback / configs
- migration
- repository layer
- atomic round persistence
- immutable config snapshot

### M7 - Application Services / Pipeline Integration
- `ReadingResolver` Application Port
- deterministic `StubReadingResolver`
- Persistence Application Ports
- Initial Generation Service
- Reroll Service
- Feedback Service
- Session Query Service
- Application Error contract
- duplicate `candidateKey` / Semantic result reconciliation
- candidate shortage / failure persistence behavior
- Stub external adapters + real Domain + temporary SQLiteによるApplication Integration Tests
- M8 API以降には進まない

詳細: `docs/application-service-design-v0.1.md`

### M8 - Backend API
- Next.js App Router Route Handlers
- Node.js RuntimeをRoute単位で明示
- ZodによるHTTP / JSON strict validation
- POST endpointで `application/json` を要求
- Browserから `userId` を受け取らない
- server-side `FixedBetaUserResolver`
- `LYRICS_ASSIST_BETA_USER_ID` から固定UUIDを解決
- Initial Generation endpoint
- Reroll endpoint
- Session Query endpoint
- Candidate Feedback endpoint
- Sound Score Feedback endpoint
- ApplicationError -> HTTP / public API error mapping
- selected candidate向けAPI DTO
- internal `candidateKey` / raw snapshot / DB detailを通常responseへ出さない
- `Cache-Control: no-store`
- same-origin private APIとして扱い、CORS許可を追加しない
- current Stub ReadingResolver / Stub LLMをserver compositionで接続
- Backend API Integration Tests
- DB schema / migrationは変更しない
- authentication / rate limit / real adapters / UIには進まない

詳細: `docs/backend-api-design-v0.1.md`

M8の固定beta userはauthenticationではない。
M8時点のdeployment assumptionはowner-only / localまたはprivate利用とし、tester/public公開前にAuthenticatedUserResolverへの差し替えを別途設計する。

### M9 - Web UI
- Home `/`
  - keyword input
  - generation pending / error
  - Generation successでSession URLへnavigation
- Session Result `/sessions/[sessionId]`
  - Session APIからdirect reload復元
  - latest Roundのみ通常表示
  - selected candidate 0〜10件
  - Candidate Like / Dislike
  - reroll
  - reroll中も旧結果を維持
- Session Detail `/sessions/[sessionId]/detail`
  - x=Sound / y=Semantic
  - 0〜100固定Scatter Plot
  - SVG + CSS
  - hover / focus / tap + candidate legend
  - active candidate詳細
  - Sound Score Feedback
- M9 feedback read-contract extension
  - M7 Session Queryへcurrent Candidate / Sound Feedback stateを追加
  - M8 `ApiCandidate.feedback`へcurrent stateを追加
  - Generation / Reroll直後は `null / null`
  - Session reloadではDB current stateを復元
  - DB schema / Feedback write policyは変更しない
- Browser API client
  - same-origin M8 APIのみ
  - BrowserからuserIdを送信しない
  - public API errorをuser-facing messageへ変換
- shared public API contract typesをneutral layerへ配置
- responsive / keyboard / aria-live / aria-pressed
- CSS Modules / Global CSS
- new chart / UI / state management dependencyなし
- Playwright E2E
  - dedicated temporary SQLite
  - fixed beta user
  - Home -> Result
  - Candidate Feedback -> reload復元
  - Detail / Scatter interaction
  - Sound Feedback -> reload復元
  - Reroll
  - direct reload / error
- M10 real adaptersには進まない

詳細: `docs/web-ui-design-v0.1.md`

### M10 - Real External Adapters / β Evaluation
- Real LLM Adapter
- OpenAI Responses API + Structured Outputs
- Real Reading Resolver
- model / provider config via server-side environment
- fixed keyword evaluation set
- latency / quality / cost observation
- β feedbackを用いたscoring / selection仮説の評価

## Codex task rule

- 1つの依頼では原則1 Milestoneのみ扱う。
- 次Milestoneへ自動で進まない。
- 完了時に変更ファイル、実行した検証、残課題を報告する。
- 設計変更が必要なら実装で黙って吸収せず、提案として止める。
- 詳細設計文書があるMilestoneでは、その文書を実装時のSource of Truthとして読む。

## M8 implementation stop conditions

M8では以下に該当した場合、独自判断でscopeを広げず停止して報告する。

- M7 Application contract変更が必要
- DB schema / migration変更が必要
- authentication / public tester accessが必要
- CORS許可やrate limitingが必要
- Zod以外の新direct dependencyが必要
- real LLM / real Reading Resolverが必要
- Product上の新しい入力制限が必要

M8完了後は、docs / tests / implementation reportを確認してからM9へ進む。

M9で、reload後のFeedback表示復元に必要なM7/M8 read-contract extensionは承認済み。以後はM9詳細設計を優先する。

## M9 implementation stop conditions

M9では以下に該当した場合、独自判断でscopeを広げず停止して報告する。

- Feedback current-state read contract拡張にDB schema変更が必要
- M7 Session Queryからcurrent Feedbackを安全に返せない
- M8 public DTO変更が既存endpoint semanticsを壊す
- Feedbackをneutralへ戻す新endpointが必要
- past Round閲覧UIが必要
- new API endpointが必要
- new direct dependencyが必要
- chart / UI / state management libraryが必要
- real LLM / real Reading Resolverが必要
- authentication / public tester access対応が必要
- M10のProduct評価scopeへ踏み込む必要がある

M9では `docs/web-ui-design-v0.1.md` を詳細Source of Truthとする。

M9のreload Feedback復元は承認済みcross-layer extensionであり、M7/M8のread model / public DTOを最小変更してよい。ただしPersistence schema / migration / Feedback current-state write semanticsは変更しない。

M9完了後はdocs / tests / Browser E2E / implementation reportを確認してからM10へ進む。
