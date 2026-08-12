# Backend API 詳細設計 v0.1.1

更新日: 2026-08-12

> M9追補: reload後のFeedback表示復元のため、public `ApiCandidate` にcurrent Feedback stateを追加した。endpoint / write API / DB schemaは変更しない。

## 1. 位置づけ

本書は M8 - Backend API の詳細設計を定義する。

M7までに、以下はApplication Serviceとして接続済みである。

```text
Initial Generation
Reroll
Feedback
Session Query
```

M8の目的は、Browserから受け取るHTTP / JSONを検証し、M7 Application Serviceへ安全に渡し、その結果・失敗をHTTP responseへ変換する境界を実装することである。

M8では新しいDomain ruleを実装しない。

---

## 2. M8の責務

Backend APIの責務は以下。

```text
Browser
  ↓
HTTP method / path / JSON
  ↓
Backend API
  - request validation
  - beta user identity resolution
  - Application Service invocation
  - ApplicationError -> HTTP mapping
  - API response DTO mapping
  - internal detail masking
  ↓
Application Services
```

M8では以下を実装しない。

- Domain rule変更
- Candidate selection rule変更
- DB schema変更
- authentication
- account management
- tester multi-user support
- rate limiting
- real LLM
- real Reading Resolver
- UI
- feedback learning
- operation log / failed pipeline log
- performance timing persistence
- API version prefix
- cross-origin public API

---

## 3. Runtime / Framework

Backend APIはNext.js App RouterのRoute Handlerを使用する。

Route Handlerは `src/app/api/**/route.ts` に配置し、Web標準の `Request` / `Response` APIを利用する。

SQLite runtimeは `node:sqlite` であるため、M8の各Route Handlerは意図を明示するため次をexportする。

```ts
export const runtime = "nodejs";
```

Edge Runtimeへ移さない。

Route HandlerはNext.js側ではdefaultでcacheされないが、v0.1 APIは生成履歴・Feedback等のcurrent stateを扱うため、API responseには明示的に

```text
Cache-Control: no-store
```

を付与する。

`dynamic = "force-static"` 等のcache opt-inは行わない。

---

## 4. API endpoints

v0.1では既存System Designの5 endpointを維持する。

| Method | Path | Application Use Case |
| --- | --- | --- |
| POST | `/api/generations` | Initial Generation |
| POST | `/api/sessions/[sessionId]/reroll` | Reroll |
| GET | `/api/sessions/[sessionId]` | Session Query |
| POST | `/api/feedback/candidate` | Candidate Feedback |
| POST | `/api/feedback/sound-score` | Sound Score Feedback |

API version prefix `/api/v1` はv0.1では追加しない。

---

## 5. BrowserからuserIdを受け取らない

v0.1ではuser identityをBackend側で決定する。

Browser requestには `userId` を含めない。

```text
Browser
  ↓
request without userId
  ↓
Backend API
  ↓
BetaUserResolver
  ↓
server-side fixed userId
  ↓
M7 Application Service
```

Browserが任意のuserIdを指定できるcontractは作らない。

request objectはstrict validationし、`userId` 等の未定義fieldが送信された場合はinvalid requestとして拒否する。

---

## 6. BetaUserResolver

M8ではBackend API層のidentity abstractionとして `BetaUserResolver` を定義する。

概念I/F:

```ts
interface BetaUserResolver {
  resolveUserId(): string;
}
```

v0.1 implementation:

```text
FixedBetaUserResolver
```

server-side環境変数:

```text
LYRICS_ASSIST_BETA_USER_ID
```

から固定userIdを取得する。

要件:

- UUID形式
- server-side only
- `NEXT_PUBLIC_` prefixを付けない
- Browser responseへuserIdを含めない
- request body / query parameter / pathからuserIdを取得しない
- missing / invalid configはserver configuration failure

このIDは認証credentialではない。

### 6.1 重要な制約

FixedBetaUserResolverはauthenticationではない。

v0.1 M8のdeployment assumptionは、

```text
owner-only / local or otherwise private deployment
```

である。

固定user identityのままInternet上の不特定clientへ公開した場合、APIへ到達できるclientはownerとして操作できる。

tester公開・public deploymentの前には、

```text
FixedBetaUserResolver
  ↓ replace
AuthenticatedUserResolver
```

としてauthentication / authorizationを別途設計する。

M8では先取り実装しない。

---

## 7. Server composition root

M7 Application Serviceはconcrete Infrastructureへ依存しない。

M8ではBackend server側にcomposition rootを置き、そこでApplicationとInfrastructureを接続する。

概念:

```text
Route Handler
  ↓
Backend API handler
  ↓
Server Composition Root
  ├─ FixedBetaUserResolver
  ├─ GenerationService
  ├─ RerollService
  ├─ FeedbackService
  ├─ SessionQueryService
  ├─ SqliteApplicationPersistence
  ├─ StubReadingResolver
  └─ StubLlmAdapter
```

composition rootはApplication layerではないため、ApplicationとInfrastructureの両方をimportしてよい。

Application Service内部からInfrastructureをimportしてはいけない。

DB connection / service graphはrequestごとに無制限生成せず、server process内でlazy singleton相当として再利用してよい。

起動時自動migrationは行わない。

---

## 8. M8時点のAdapter

M8ではreal external adapterへ進まない。

Backend APIのserver compositionは、

```text
StubReadingResolver
StubLlmAdapter
```

を使用する。

M8/M9でHTTP・UI wiringを確認できるよう、deterministicなdevelopment fixtureを用意してよい。

fixtureは既存M7 Integration Testで使用している語彙・構造を再利用することを優先し、fixture内容自体をProduct仕様にしない。

したがってM10以前は、

> 任意のkeywordで実用候補を返せること

をM8の完了条件としない。

real LLM / real Reading ResolverはM10で接続する。

---

## 9. Validation

HTTP境界ではZodを使用する。

M8ではZod 4 stableの通常packageを利用し、object requestは `z.strictObject(...)` 相当で未定義fieldを拒否する。

validationの責務:

```text
HTTP / JSON shape
  -> Backend API + Zod

Use Case precondition
  -> M7 Application Service
```

M8はM7のvalidationを削除しない。

### 9.1 JSON body

bodyを持つPOST endpointはすべて、

```text
Content-Type: application/json
```

を要求する。

media type parameter（例 `application/json; charset=utf-8`）は許容する。

Content-Type不正:

```text
415 UNSUPPORTED_MEDIA_TYPE
```

JSON parse失敗:

```text
400 INVALID_REQUEST
```

Zod validation失敗:

```text
400 INVALID_REQUEST
```

Rerollもbodyを持つPOSTとして `{}` を要求する。

これにより5つのendpointすべてでrequest contractを明示し、mutation requestをHTML form等から偶発的に送信しにくくする。

ただしこれはauthenticationの代替ではない。

---

## 10. ID validation

以下はUUIDとしてvalidationする。

```text
sessionId
candidateResultId
LYRICS_ASSIST_BETA_USER_ID
```

syntaxとしてUUIDでないpath / body IDは `400 INVALID_REQUEST`。

UUIDとしてvalidだがresourceが存在しない場合はM7 Application Serviceから `NOT_FOUND` 相当を受けて `404` とする。

---

## 11. Generation request

### Request

```http
POST /api/generations
Content-Type: application/json
```

```json
{
  "sourceSurface": "夜"
}
```

schema:

```ts
z.strictObject({
  sourceSurface: z.string().trim().min(1),
});
```

M8では新しい文字数上限・日本語文字種制限をProduct仕様として追加しない。

`userId` はrequestに含めない。

### Application call

```text
GenerationService.generateInitialRound({
  userId: betaUserResolver.resolveUserId(),
  sourceSurface
})
```

### Success

```text
201 Created
```

---

## 12. Reroll request

### Request

```http
POST /api/sessions/{sessionId}/reroll
Content-Type: application/json
```

body:

```json
{}
```

strict empty object以外は拒否する。

`sessionId` はpath parameterから取得しUUID validationする。

### Application call

```text
RerollService.reroll({
  userId: betaUserId,
  sessionId
})
```

### Success

```text
201 Created
```

---

## 13. Session Query request

```http
GET /api/sessions/{sessionId}
```

bodyは使用しない。

`sessionId` はUUID validationする。

### Application call

```text
SessionQueryService.getSession({
  userId: betaUserId,
  sessionId
})
```

### Success

```text
200 OK
```

M8のSession responseはM7 Session Queryが提供するselected candidate snapshotのみを使用する。

unselected poolは返さない。

M7 Session Queryに含まれないcurrent Feedback状態はM8でPersistenceを直接読んで補わない。

Feedback状態の再表示がM9 UXで必要になった場合は、Application contractを先に設計してから拡張する。

---

## 14. Candidate Feedback request

```http
POST /api/feedback/candidate
Content-Type: application/json
```

```json
{
  "candidateResultId": "UUID",
  "value": "like"
}
```

schema:

```ts
z.strictObject({
  candidateResultId: z.string().uuid(),
  value: z.enum(["like", "dislike"]),
});
```

### Success

```text
200 OK
```

---

## 15. Sound Score Feedback request

```http
POST /api/feedback/sound-score
Content-Type: application/json
```

```json
{
  "candidateResultId": "UUID",
  "value": "valid"
}
```

schema:

```ts
z.strictObject({
  candidateResultId: z.string().uuid(),
  value: z.enum(["low", "valid", "high"]),
});
```

### Success

```text
200 OK
```


## 16. API response envelope

Success responseは次の形を基本とする。

```json
{
  "data": {}
}
```

Error responseは次の形を基本とする。

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request is invalid."
  }
}
```

`message` はhuman-readableだがstable contractではない。

Client分岐には `code` を使用する。

stack trace、DB error、filesystem path、provider raw error、environment valueはresponseへ含めない。

---

## 17. Generated Round API DTO

Initial GenerationとRerollは同じresponse shapeを使用する。

概念:

```ts
type GeneratedRoundApiDto = {
  sessionId: string;
  roundId: string;
  roundNumber: number;

  source: {
    surface: string;
    reading: string;
  };

  candidates: ApiCandidate[];
};
```

`candidates` はselected candidateのみ。

orderはApplication / persisted selection orderを維持する。

---

## 18. Candidate API DTO

BrowserへDB persistence分析用の全snapshotを返さない。

M9で必要な表示情報へ絞る。

概念:

```ts
type ApiCandidate = {
  candidateResultId: string;
  surface: string;
  reading: string;

  sound: {
    finalScore: number;
    breakdown: {
      moraLengthScore: number;
      positionMatchScore: number;
      sequenceSimilarityScore: number;
    };
    endingAdjustment: {
      commonSuffixLength: number;
      suffixCoverage: number;
      bonus: number;
    };
  };

  semantic: {
    score: number;
    reason: string;
    primaryRelation: string;
    secondaryRelations: string[];
    semanticCluster: string;
  };

  selection: {
    category: "balanced" | "sound" | "semantic" | "fallback";
    fallbackStrategy?: "balanced" | "sound" | "semantic";
    rank: number;
  };

  feedback: {
    candidate: "like" | "dislike" | null;
    soundScore: "low" | "valid" | "high" | null;
  };
};
```

`rank` はresponse candidate orderに対応する1-based value。

`feedback` はcurrent-state read modelである。Feedback履歴は返さない。Initial Generation / Reroll直後の新規candidateは `candidate=null` / `soundScore=null`、Session QueryではDBのcurrent Feedbackを返す。

Browserへ以下は原則返さない。

- internal `candidateKey`
- raw Generation Result
- raw Semantic Result
- DB row型
- config JSON
- provider internal metadata
- Application error cause

必要なβ分析データはPersistenceへ保持し、通常API responseと分離する。

---

## 19. Session API DTO

概念:

```ts
type SessionApiDto = {
  sessionId: string;

  source: {
    surface: string;
    reading: string;
  };

  rounds: {
    roundId: string;
    roundNumber: number;
    candidates: ApiCandidate[];
  }[];
};
```

ordering:

```text
roundNumber ascending
candidate selection rank ascending
```

Session Queryでは各selected candidateのcurrent Feedback stateも返す。

```text
feedback.candidate:
  like | dislike | null

feedback.soundScore:
  low | valid | high | null
```

score / semantic / selection snapshotは再計算せず、Feedbackのみcurrent-state tableの現在値を反映する。

---

## 20. Feedback success DTO

Candidate Feedback:

```json
{
  "data": {
    "candidateResultId": "UUID",
    "value": "like"
  }
}
```

Sound Score Feedback:

```json
{
  "data": {
    "candidateResultId": "UUID",
    "value": "valid"
  }
}
```

M7 Serviceの保存成功後にのみ返す。

---

## 21. Public API error codes

Backend APIはApplication Errorをそのまま全公開せず、Browserが扱う意味へ縮約する。

```text
INVALID_REQUEST
UNSUPPORTED_MEDIA_TYPE
SOURCE_READING_UNRESOLVED
NO_EVALUABLE_CANDIDATES
NOT_FOUND
UPSTREAM_UNAVAILABLE
INTERNAL_ERROR
```

Application内部の、

```text
PERSISTENCE_FAILED
CONFIG_VERSION_CONFLICT
```

等はBrowserへそのまま公開しない。

---

## 22. HTTP error mapping

| Source | HTTP | API code |
| --- | ---: | --- |
| malformed JSON | 400 | INVALID_REQUEST |
| Zod request validation | 400 | INVALID_REQUEST |
| Application `INVALID_INPUT` | 400 | INVALID_REQUEST |
| invalid UUID syntax | 400 | INVALID_REQUEST |
| non-JSON POST body | 415 | UNSUPPORTED_MEDIA_TYPE |
| `SOURCE_READING_UNRESOLVED` | 422 | SOURCE_READING_UNRESOLVED |
| `NO_EVALUABLE_CANDIDATES` | 422 | NO_EVALUABLE_CANDIDATES |
| `SESSION_NOT_FOUND` | 404 | NOT_FOUND |
| `CANDIDATE_RESULT_NOT_FOUND` | 404 | NOT_FOUND |
| `READING_RESOLVER_FAILED` | 502 | UPSTREAM_UNAVAILABLE |
| `CANDIDATE_GENERATION_FAILED` | 502 | UPSTREAM_UNAVAILABLE |
| `SEMANTIC_EVALUATION_FAILED` | 502 | UPSTREAM_UNAVAILABLE |
| `PERSISTENCE_FAILED` | 500 | INTERNAL_ERROR |
| `CONFIG_VERSION_CONFLICT` | 500 | INTERNAL_ERROR |
| Beta user config failure | 500 | INTERNAL_ERROR |
| unexpected error | 500 | INTERNAL_ERROR |

M8ではretryを行わない。

---

## 23. Error masking

5xx responseでは内部causeをBrowserへ返さない。

例えば以下を禁止する。

```text
SQLite constraint text
C:\dev\lyrics-assist\...
stack trace
environment variable value
LLM provider raw payload
Drizzle internal error
```

server-side diagnosticとしてerrorを記録する場合も、秘密情報・request全bodyを不用意にlogしない。

M8では永続operation log tableを追加しない。

---

## 24. CORS / same-origin policy

v0.1 Backend APIは同一Next.js applicationのBrowser UIから呼ぶprivate APIである。

M8ではcross-origin API利用をsupportしない。

- `Access-Control-Allow-Origin` 等のCORS許可headerを追加しない
- POSTは `application/json` を要求する
- RerollもJSON `{}` を要求する

これは通常Browserからの偶発的なcross-origin mutationを減らすための境界である。

ただしFixedBetaUserResolverはauthenticationではないため、直接HTTP clientからのaccessを防ぐものではない。

public deployment securityはM8 scope外。

---

## 25. Route Handlerの薄さ

`route.ts` にApplication orchestrationやDomain ruleを埋め込まない。

Route Handlerの責務は概ね以下。

```text
request
↓
content-type / path / JSON validation
↓
beta user resolution
↓
Application Service call
↓
DTO mapping
↓
Response.json
```

共有できる処理はBackend API helperへ寄せる。

例:

```text
parseJsonBody
requireJsonContentType
mapApplicationError
jsonSuccess
jsonError
mapGeneratedRoundDto
```

抽象化しすぎたgeneric frameworkは作らない。

---

## 26. Expected file placement

概念上:

```text
src/
├─ app/
│  └─ api/
│     ├─ generations/route.ts
│     ├─ sessions/[sessionId]/route.ts
│     ├─ sessions/[sessionId]/reroll/route.ts
│     └─ feedback/
│        ├─ candidate/route.ts
│        └─ sound-score/route.ts
│
└─ server/
   ├─ api/
   │  ├─ schemas.ts
   │  ├─ responses.ts
   │  ├─ error-mapper.ts
   │  ├─ dto-mapper.ts
   │  └─ handlers/
   ├─ identity/
   │  └─ beta-user-resolver.ts
   ├─ composition.ts
   └─ fixtures/
      └─ development-stub-fixture.ts
```

既存repository structureへ合わせて最小限調整してよい。

Next-specific Route Handlerは `src/app/api` に置き、再利用可能なserver helperを `src/server` に置く。

---

## 27. Dependency rule

M8追加後の依存方向:

```text
Browser
↓
Route Handler / Backend API
↓
Application Services
↓
Domain / Application Ports

Server Composition Root
├─ Application
└─ Infrastructure
```

許容:

```text
Backend composition root -> Application
Backend composition root -> Infrastructure
```

禁止:

```text
Application -> src/server
Application -> src/app
Domain -> Backend API
Client Component -> SQLite / Infrastructure / server composition
```

---

## 28. Secrets / environment

v0.1でBrowserへ出してはいけないもの:

```text
future OPENAI_API_KEY
LYRICS_ASSIST_DB_PATH
server composition internals
raw provider response
```

`LYRICS_ASSIST_BETA_USER_ID` は秘密credentialではないが、Browser inputとして扱わずserver-side configに限定する。

M8 implementationでは `.env.example` 等へ変数名のみ追加してよい。

real secret valueやlocal `.env.local` はcommitしない。

---

## 29. Database lifecycle

M8はM6 migration policyを変更しない。

```text
schema change
↓
generate
↓
SQL review
↓
explicit migrate
```

Route Handler起動時にmigrationを自動実行しない。

M8でDB schema / migration変更は行わない。

既存 `LYRICS_ASSIST_DB_PATH` を継続使用する。

---

## 30. Zod dependency

Zodが未導入の場合、M8 implementationでdirect dependencyとして追加してよい。

要件:

- stable Zod 4
- regular `zod` package
- M8で追加する新direct dependencyは原則Zodのみ
- exact installed versionを完了報告に記載
- Zod以外のdependencyが必要なら停止して報告

Schema validation以外のために大規模API frameworkを追加しない。

---

## 31. Backend API test strategy

M8のtest責務はHTTP boundaryである。

```text
M7
  Application orchestration / real Persistence integration

M8
  HTTP request validation
  beta user injection
  status mapping
  public error shape
  DTO mapping
  Route Handler wiring
```

M7のSound / Selector / transaction testをM8で重複網羅しない。

---

## 32. Required M8 tests

### 32.1 Generation

- valid JSON -> 201
- Backend側beta userIdがApplicationへ渡る
- Browser-supplied `userId` はstrict validationで拒否
- empty / whitespace source -> 400
- malformed JSON -> 400
- wrong Content-Type -> 415
- generated candidate response mapping
- Generation / Reroll直後のcandidate feedbackは `null / null`
- internal candidateKey / raw snapshotがresponseへ出ない
- `Cache-Control: no-store`

### 32.2 Reroll

- valid UUID + `{}` -> 201
- invalid UUID -> 400
- unknown valid UUID -> 404
- extra body field -> 400
- wrong Content-Type -> 415
- beta userId injection

### 32.3 Session Query

- valid session -> 200
- orderingをApplication outputから維持
- selected candidate DTOのみ
- Feedback rowなし -> `candidate=null` / `soundScore=null`
- saved Like / Dislike current stateを返す
- saved Sound Feedback current stateを返す
- Feedback update後のlatest current stateを返す
- invalid UUID -> 400
- not found -> 404
- no-store header

### 32.4 Candidate Feedback

- like / dislike -> 200
- invalid enum -> 400
- invalid candidate UUID -> 400
- not found -> 404
- Browser-supplied userId拒否

### 32.5 Sound Score Feedback

- low / valid / high -> 200
- invalid enum -> 400
- not found -> 404

### 32.6 Error mapping

最低限、

```text
SOURCE_READING_UNRESOLVED -> 422
NO_EVALUABLE_CANDIDATES -> 422
READING_RESOLVER_FAILED -> 502
CANDIDATE_GENERATION_FAILED -> 502
SEMANTIC_EVALUATION_FAILED -> 502
PERSISTENCE_FAILED -> 500
CONFIG_VERSION_CONFLICT -> 500
unexpected -> 500
```

を確認する。

5xx responseに元error message / stack / pathが含まれないことを確認する。

### 32.7 Identity config

- valid server UUID
- missing env
- invalid env
- responseへbeta userIdを含めない

### 32.8 Route wiring

実Route Handlerが、

```text
runtime = nodejs
```

でbuild可能であり、handlerがserver compositionを経由してM7 Serviceへ接続できることを確認する。

可能ならtemporary SQLite + deterministic stubsによるAPI-level happy-path smoke testを1本追加する。

ただしM7 Integration Testを大量複製しない。

---

## 33. E2E

M8ではUI変更を行わないためPlaywright E2Eは必須としない。

M9でBrowserからBackend APIを利用する際に主要flowをE2E化する。

---

## 34. M8で意図的に返さないもの

通常API responseへ以下を含めない。

- evaluated unselected candidate pool
- raw generation result
- raw semantic result
- full config JSON
- DB migration/schema情報
- server userId
- provider secret / API key
- internal error cause
- Feedback history

current Feedback stateはM9 read-contract extensionとしてSession Query / ApiCandidateへ追加する。

それ以外が必要になった場合は、用途を確認してApplication/API contractを明示的に拡張する。

---

## 35. M8停止条件

以下の場合は独自判断で進めず停止して報告する。

- M7 Application contract変更が必要
- DB schema / migration変更が必要
- authenticationが必須
- public tester accessをM8でsupportする必要がある
- CORS許可が必要
- rate limitingが必要
- Zod以外の新direct dependencyが必要
- real LLM / Reading Resolverが必要
- M9 UI仕様を先に決めないとAPI contractを作れない
- current M7 DTOから安全なAPI responseを構成できない
- Product上の新しい入力制限が必要

---

## 36. M8完了条件

1. 5 Route Handlerを実装する。
2. 各RouteでNode.js Runtimeを明示する。
3. POST requestへJSON Content-Typeを要求する。
4. ZodでHTTP requestをstrict validationする。
5. BrowserからuserIdを受け取らない。
6. FixedBetaUserResolverでserver-side userIdを注入する。
7. `LYRICS_ASSIST_BETA_USER_ID` をserver-only configとして扱う。
8. Route HandlerからM7 Application Serviceを呼ぶ。
9. ApplicationErrorをHTTP / public API codeへmappingする。
10. 5xx内部情報をBrowserへ漏らさない。
11. Generation / Rerollで201を返す。
12. Session Query / Feedbackで200を返す。
13. 全API responseをno-storeとする。
14. selected candidateのみAPI DTOへmappingする。
15. internal candidateKey / raw snapshotを通常responseへ出さない。
16. current M7 stub adaptersをserver compositionで使用する。
17. DB schema / migrationを変更しない。
18. M8 API Integration Testを追加する。
19. lint / typecheck / test / buildを成功させる。
20. M9以降へ進まない。

---

## 37. M8後の状態

M8完了時点では、

```text
Browser HTTP contract
↓
Next.js Route Handlers
↓
M7 Application Services
↓
Stub External Adapters
↓
real SQLite Persistence
```

が成立する。

M9ではこのAPI contractを使用してWeb UIを接続する。

M10で、

```text
StubLlmAdapter -> Real LlmAdapter
StubReadingResolver -> Real ReadingResolver
```

を差し替え、β評価へ進む。

---

## 38. M9 Feedback read-contract extension

M9のUI要件として、reload後もDB current Feedbackと画面の選択状態を一致させる。

既存endpointは変更しない。

```text
POST /api/generations
POST /api/sessions/{sessionId}/reroll
GET  /api/sessions/{sessionId}
POST /api/feedback/candidate
POST /api/feedback/sound-score
```

変更するpublic response contractは `ApiCandidate.feedback` の追加のみ。

```ts
feedback: {
  candidate: "like" | "dislike" | null;
  soundScore: "low" | "valid" | "high" | null;
}
```

Generation / Reroll response:
- 新規CandidateResultなので `null / null`

Session GET:
- current Feedback tableから現在値を返す
- rowなしは `null`
- historyは返さない

M9ではBrowserからserver-only DTO moduleをimportしないため、public DTO型を `src/contracts/api/` 等のneutral layerへ移動・再exportしてよい。

server Zod schema、identity、HTTP status、error envelope、same-origin policy、no-store policyは変更しない。

DB schema / migration変更は行わない。
