# Real External Adapter 詳細設計 v0.1

更新日: 2026-08-12

## 1. 位置づけ

本書は M10 - Real External Adapters / β Evaluation のうち、実OpenAI API接続とreal Reading Resolverの設計を定義する。

M9までに、以下はStub External AdapterでBrowserからend-to-end接続済みである。

```text
Web UI
↓
Backend API
↓
Application Services
↓
StubReadingResolver / StubLlmAdapter
↓
Domain
↓
SQLite Persistence
```

M10ではApplication Portを変更せずに済む範囲を最大化しつつ、Infrastructure側へreal implementationを追加する。

ただしReading Resolverについては、real providerで60候補を1件ずつ外部APIへ送るとlatency / costが過大になるため、M10でbatch resolution能力をPortへ最小追加する。

---

## 2. Provider

v0.1 real external providerはOpenAI APIを使用する。

利用API:

```text
OpenAI Responses API
Structured Outputs
official OpenAI JavaScript / TypeScript SDK
```

Chat Completions、Assistants、Agents SDK、Web Search、File Search等はM10では使用しない。

外部API呼出しはserver-side Infrastructureからのみ行う。

---

## 3. Default model

v0.1 βの初期default modelは以下とする。

```text
Generation:
  gpt-5.6-terra

Semantic Evaluation:
  gpt-5.6-terra

Reading Resolution:
  gpt-5.6-terra
```

理由:

- 候補生成品質がプロダクト価値へ直結する。
- Semantic Evaluationもrelation / clusterの品質が必要。
- Reading Resolutionも日本語の多義的な読みを扱うため、初期βではcost最小化より品質を優先する。
- 3 taskでmodel familyを揃え、初期βの変数を増やしすぎない。

Modelはserver-side environmentから個別にoverride可能にする。

```text
LYRICS_ASSIST_OPENAI_GENERATION_MODEL
LYRICS_ASSIST_OPENAI_SEMANTIC_MODEL
LYRICS_ASSIST_OPENAI_READING_MODEL
```

env未指定時は上記defaultを使用する。

実際に使用したmodel identifierは既存snapshot metadataへ保存する。

---

## 4. External Adapter mode

server compositionへ次のmodeを追加する。

```text
LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE
```

value:

```text
stub
openai
```

default:

```text
stub
```

理由:

- build / unit / integration / E2Eで意図せず有料APIを呼ばない。
- offline deterministic testを維持する。
- M10 βだけ明示的にreal adapterへ切り替える。
- Real Adapter障害時にもStubによる配線検証が可能。

`openai` modeでは `OPENAI_API_KEY` が必須。

unknown modeはserver configuration failureとする。

---

## 5. Environment contract

M10で使用するserver-side environment:

```text
OPENAI_API_KEY

LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE

LYRICS_ASSIST_OPENAI_GENERATION_MODEL
LYRICS_ASSIST_OPENAI_SEMANTIC_MODEL
LYRICS_ASSIST_OPENAI_READING_MODEL

LYRICS_ASSIST_BETA_USER_ID
LYRICS_ASSIST_DB_PATH
```

`OPENAI_API_KEY` へ `NEXT_PUBLIC_` prefixを付けない。

Browser response / public DTO / logへAPI keyを出さない。

M10で `.env.example` を新規追加してよい。

real valueを含む `.env.local` はGit管理しない。

---

## 6. OpenAI SDK

official OpenAI JavaScript / TypeScript SDKをdirect dependencyとして追加する。

実装開始時にstable版とのcompatibility gateを行い、採用versionをexact pinする。

pre-release版は明示承認なしに使用しない。

M10で新規追加してよいdirect dependencyは原則 `openai` のみ。

ZodはM8で導入済みのものを再利用する。

---

## 7. Responses API共通方針

real adapterはResponses APIを使用する。

Structured OutputsではZod schemaをOpenAI SDK helperへ渡し、parsed outputを利用する。

概念:

```ts
client.responses.parse({
  model,
  input,
  text: {
    format: zodTextFormat(schema, schemaName),
  },
  store: false,
});
```

実際のSDK APIは採用versionのofficial contractをcompatibility gateで確認する。

M10では以下を使用しない。

```text
streaming
background mode
previous_response_id
conversation state
tools
web search
file search
MCP
hosted shell
code interpreter
```

各requestはstateless。

---

## 8. Data retention方針

Responses API requestでは明示的に、

```text
store: false
```

を設定する。

目的:

- OpenAI側のResponses application state保存を不要にする。
- 本アプリ自身のSQLite snapshotを実験記録のsource of truthとする。

ただしOpenAI API provider側のabuse monitoring retention等はOpenAI側policyに従う。

アプリDBへ保存するのは、既存Application Adapter Resultと必要なprovider metadataのみ。

OpenAI SDKのfull raw response objectはそのままDB保存しない。

---

## 9. Inference Config version

Model / Prompt以外のprovider behaviorも分析可能にするため、Adapter metadataへ次を追加する。

```ts
inferenceConfigVersion: string
```

M10 initial:

```text
openai-responses-v0.1
```

このversionは最低限次を意味する。

```text
Responses API
Structured Outputs
store = false
reasoning effort = none
no tools
non-streaming
limited retry
request timeout policy
```

上記provider behaviorを変更する場合はversionを更新する。

Model identifierとは分離する。

---

## 10. Reasoning effort

v0.1では3 taskとも、

```text
reasoning.effort = none
```

を初期値とする。

理由:

- 本taskは複雑な多段推論より、候補生成・分類・読み判定が中心。
- latency / output costを抑えながらβ品質を確認する。
- reasoning effort自体を固定し、β途中で無言変更しない。

品質不足が確認された場合のみ、`inferenceConfigVersion` を更新して比較する。

---

## 11. Retry / timeout

Adapterはlimited retryを扱う。

初期方針:

```text
1 initial attempt
+ retryable failureへの最大1 retry
```

retry対象:

```text
temporary network failure
rate limit
retryable provider 5xx
```

retryしない:

```text
invalid API key / permission
invalid request
Structured Output schema conflict
model refusal
application-level identity mismatch
```

1 requestあたりtimeout目安:

```text
60 seconds
```

SDKの具体timeout / retry optionは採用versionのofficial contractへ合わせる。

Application Service自身でOpenAI retryを追加しない。

---

## 12. Provider metadata

Generation / Semantic / Reading Adapter resultへ、可能な範囲で以下を保持する。

```ts
type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type ProviderCallMetadata = {
  provider: "openai";
  providerResponseId?: string;
  modelIdentifier: string;
  promptVersion: string;
  inferenceConfigVersion: string;
  durationMs: number;
  usage?: ProviderUsage;
};
```

SDK responseに存在しない項目を推測しない。

`durationMs` はAdapter境界でwall-clock measurementする。

token単価 / 金額はDBへ固定保存しない。

価格は変更され得るため、β report時点の価格で別途算出する。

---

# 13. Real LlmAdapter

Infrastructureへ、

```text
OpenAiLlmAdapter
```

を実装する。

既存Application-owned `LlmAdapter` Portを実装する。

公開contract:

```text
generateCandidates
evaluateSemantics
```

は維持する。

Application / DomainからOpenAI SDKをimportしない。

---

## 14. Candidate Generation Structured Output

OpenAIへcandidateKey生成を委ねない。

Model output schemaは概念上:

```ts
type OpenAiGeneratedCandidates = {
  candidates: {
    surface: string;
    readingHint: string | null;
  }[];
};
```

Structured Outputsのfieldはrequiredにし、optional相当はnullableで表現する。

`readingHint` はひらがなreadingが判断できる場合に返し、不確実なら `null`。

Adapterがparsed outputからApplication `GenerateCandidatesResult` へmappingする。

---

## 15. CandidateKey生成

`candidateKey` はInfrastructure Adapterが生成する。

Modelへopaque key生成を依頼しない。

要件:

```text
deterministic
input array orderに依存しない
same raw surface + same readingHintならsame key
different surfaceは通常different key
network / randomなし
```

概念:

```text
candidateKey =
  stable hash(
    raw surface
    + separator
    + readingHint-or-empty
  )
```

Node標準 `crypto` を使用し、新dependencyを追加しない。

同一surface / same hintがmodel output内で重複した場合、同一candidateKeyになり、既存M7 duplicate-key safety logicで両方除外される。

canonical duplicate判定自体は引き続きM5 Candidate Selectorの責務。

---

## 16. Candidate Generation prompt

Prompt version:

```text
candidate-openai-v0.1
```

目的:

> source wordから、歌詞の発想に使える広いcandidate poolを生成する。

指示の中心:

```text
- targetCountを目標に候補を広く出す
- synonymだけへ寄せない
- scene / emotion / image / action / object / time / place / metaphor等へ広げる
- 音の近さだけに寄せない
- 最終順位を付けない
- source自身を出さない
- excludeTermsを再提示しない
- 可能ならreadingHintをひらがなで返す
- explanationは返さない
```

LLMへ4/3/3 selection ruleを担当させない。

Sound Score計算も担当させない。

---

## 17. Generation target count

Applicationから既存 `targetCount` を受け取る。

v0.1 default:

```text
60
```

PromptではtargetCountを目標として明示する。

ModelがtargetCount未満を返してもAdapterでdummy補填しない。

Modelが異常に大量のcandidateを返した場合は、Structured Output / Adapter boundaryで安全な上限を設定してよいが、Product targetを独自変更しない。

raw Application Adapter Resultには実際に採用した候補を保持する。

---

## 18. Generation excludeTerms

`excludeTerms` はPromptへ渡す。

意味:

```text
previously displayed candidate
avoid next generation
```

Dislikeとは扱わない。

LLMがexcludeTermsを無視しても、既存Candidate Selectorのhard exclusionが最終防御となる。

---

# 19. Semantic Evaluation Structured Output

Model input:

```text
source.surface

candidates:
  candidateKey
  surface
```

のみ。

以下を渡さない。

```text
reading
readingHint
rhyme
Sound Score
Sound breakdown
selection category
feedback
```

Sound / Semantic独立性を維持する。

Output schema概念:

```ts
type OpenAiSemanticOutput = {
  results: {
    candidateKey: string;
    score: number;
    reason: string;
    primaryRelation: string;
    secondaryRelations: string[];
    semanticCluster: string;
  }[];
};
```

---

## 20. Semantic prompt

Prompt version:

```text
semantic-openai-v0.1
```

Semantic Score:

```text
0 = 文脈上ほぼ無関係
100 = sourceと非常に近い意味・文脈で自然に置換/連想できる
```

ただし単純synonym scoreにしない。

歌詞制作での、

```text
emotion
scene
visual
sound-as-concept
action
object
time
place
metaphor
cause/effect
abstract association
```

等の近接も評価対象。

`reason` は短い日本語。

`primaryRelation` はopen string contractを維持する。

`semanticCluster` はcandidate群内で近い連想群を示す短いlabel。

---

## 21. Semantic identity

ModelへcandidateKeyをechoさせる。

Applicationでは既存M7 reconciliationを維持する。

```text
unknown key
duplicate key
missing key
```

は既存ruleに従ってcandidate単位で除外する。

OpenAI Adapter側で勝手にcandidateをsurface推測で再対応付けしない。

---

# 22. Real Reading Resolver

Infrastructureへ、

```text
OpenAiReadingResolver
```

を実装する。

v0.1ではOpenAI APIをReading providerとして使用する。

理由:

- 新しい日本語形態素解析 / dictionary runtime dependencyを増やさない。
- candidate generation由来の造語・新語・固有名詞にも対応しやすい。
- ReadingResolver Portにより後から辞書型providerへ差し替え可能。
- βで実際のreading errorを観測してからprovider再設計できる。

Rhyme Normalizer / Sound Scorerは引き続き決定論的であり、OpenAI SDKへ依存しない。

---

## 23. Reading batch capability

既存 `ReadingResolver.resolve(...)` はsource reading用に維持する。

candidate 60件を1件ずつAPI callしないため、Portへbatch methodを追加する。

概念:

```ts
type ResolveReadingBatchItem = {
  requestKey: string;
  surface: string;
  readingHint?: string;
};

type ResolveReadingBatchRequest = {
  items: readonly ResolveReadingBatchItem[];
};

type ReadingBatchItemResult = {
  requestKey: string;
  status: "resolved" | "unresolved";
  reading: ReadingResult | null;
};

type ResolveReadingBatchResult = {
  results: readonly ReadingBatchItemResult[];
  metadata: ReadingResolverMetadata;
};

interface ReadingResolver {
  resolve(
    request: ResolveReadingRequest,
  ): Promise<ReadingResolution>;

  resolveBatch(
    request: ResolveReadingBatchRequest,
  ): Promise<ResolveReadingBatchResult>;
}
```

実際の既存型へ合わせて最小調整してよい。

StubReadingResolverにもdeterministic batch implementationを追加する。

---

## 24. Reading metadata

source単体resolutionにもmetadataを付与する。

概念:

```ts
type ReadingResolverMetadata = {
  resolverIdentifier: string;
  promptVersion: string;
  inferenceConfigVersion: string;
  providerResponseId?: string;
  durationMs?: number;
  usage?: ProviderUsage;
};
```

OpenAI real resolver:

```text
resolverIdentifier =
  openai/{actual model id}

promptVersion =
  reading-openai-v0.1
```

Stub:

```text
resolverIdentifier =
  stub-reading-resolver
```

---

## 25. Reading batch identity

Candidate batch requestでは `candidateKey` を `requestKey` として使用してよい。

Model outputはrequestKeyを必ずechoする。

Application側で、

```text
unknown key
duplicate key
missing key
```

をreconcileする。

候補単位のidentity mismatchはそのcandidateを `unresolved` 相当として後段から除外し、batch raw resultは保存する。

provider network / refusal / parse failure等、batch自体が成立しない場合はReadingResolver system failureとしてRound全体を失敗させる。

---

## 26. Reading Structured Output

概念schema:

```ts
type OpenAiReadingBatchOutput = {
  results: {
    requestKey: string;
    status: "resolved" | "unresolved";
    reading: string | null;
  }[];
};
```

全field required。

`reading` はnullable。

`status=resolved` なのにreadingがnull / invalidの場合は、そのitemをunresolved扱いにする。

`status=unresolved` なのにreadingが存在する場合もunresolvedを優先する。

---

## 27. Reading prompt

Prompt version:

```text
reading-openai-v0.1
```

指示:

```text
- 日本語surfaceの最も自然な単独語としての読みを返す
- output readingは原則ひらがな
- 長音記号が自然な外来語等では既存Normalizerが扱える形を使用
- readingHintは参考情報であり、そのまま無条件採用しない
- surfaceとhintが矛盾する場合はsurfaceを優先して判断する
- 複数読みがある場合、歌詞中の単独語として最も一般的な読みを1つ選ぶ
- 判断できない場合はunresolved
- 複数候補の読みを1 stringへ併記しない
```

---

## 28. Source reading ambiguity

v0.1 UIにはsource reading correction機能がない。

したがって、

```text
空
明日
今日
生
```

等の多読語では、Resolverが選んだ読みとユーザー意図が異なる可能性がある。

M10ではこれを隠さずβ limitationとして扱う。

結果画面にはsource readingが既に表示されるため、ユーザーは誤読を認識できる。

M10ではmanual override UIを追加しない。

必要性がβで確認された場合、future requirementとして設計する。

---

# 29. Persistence provenance

M6の「実験ノート」方針に合わせ、Reading Resolverのprovider / prompt / usageを後から追跡可能にする。

既存candidate `reading_result_json` はresolved `ReadingResult` を保持し続ける。

追加でraw reading resolution snapshotを保存する。

---

## 30. Persistence schema extension

M10では次のadditive columnを追加する。

### generation_sessions

```text
source_reading_resolution_json TEXT NULL
```

内容:

```text
source ReadingResolution
+ resolver metadata
```

existing legacy rowはNULLを許容する。

M10以降に新規作成するSessionでは値を保存する。

### generation_rounds

```text
candidate_reading_resolution_result_json TEXT NULL
```

内容:

```text
candidate batch raw result
+ resolver metadata
```

existing legacy rowはNULLを許容する。

M10以降の新規Roundでは値を保存する。

---

## 31. Migration safety

M10 migrationはadditive migrationとする。

期待:

```text
ADD nullable TEXT columns
DROPなし
table rebuildなし
existing row削除なし
```

Drizzle生成SQLをreviewする。

SQLite / Drizzleが上記条件を満たさずtable rebuildを生成する場合は停止して報告する。

migrationは起動時自動適用しない。

従来どおり、

```text
generate
SQL review
explicit migrate
```

を維持する。

---

# 32. LLM metadata persistence

既存:

```text
generation_result_json
semantic_evaluation_result_json
```

へAdapter metadata extensionを含める。

追加scalar columnは作らない。

保持する:

```text
model identifier
prompt version
inference config version
provider response id if available
durationMs
usage tokens if available
```

金額そのものは保存しない。

---

# 33. Server composition

M10 server composition:

```text
mode = stub
  -> StubReadingResolver
  -> StubLlmAdapter

mode = openai
  -> OpenAiReadingResolver
  -> OpenAiLlmAdapter
```

Application Service / Route Handler / Browser API contractはmodeを知らない。

mode変更でAPI endpointを変更しない。

---

## 34. OpenAI client lifecycle

OpenAI SDK clientはserver-side compositionでlazy singleton相当としてreuseしてよい。

Browser bundleへ含めない。

build時に `OPENAI_API_KEY` を必須にしない。

`openai` modeでreal requestが必要になった時点でconfiguration validationする。

---

# 35. Error mapping

OpenAI Adapter内部errorはexisting Application errorへ変換される。

```text
Reading real adapter failure
-> READING_RESOLVER_FAILED
-> Backend 502 UPSTREAM_UNAVAILABLE

Generation real adapter failure
-> CANDIDATE_GENERATION_FAILED
-> Backend 502 UPSTREAM_UNAVAILABLE

Semantic real adapter failure
-> SEMANTIC_EVALUATION_FAILED
-> Backend 502 UPSTREAM_UNAVAILABLE
```

API key missing / invalid configurationはserver configuration failureとして500 INTERNAL_ERRORへmaskしてよい。

provider raw error / request id / API keyをBrowserへ返さない。

---

# 36. Refusal / incomplete output

Structured Outputsでもmodel refusal / incomplete responseを明示的に扱う。

Generation / Semantic:

```text
refusal
parsed outputなし
incomplete output
schema parse failure
-> Adapter failure
```

Reading batch:

```text
batch-level refusal / parse failure
-> Resolver system failure

valid batch内のitem-level unresolved
-> candidate単体除外可能
```

---

# 37. Prompt source

Prompt textはInfrastructure内の小さなprompt moduleへ分離する。

概念:

```text
src/infrastructure/openai/prompts/
  candidate-prompt.ts
  semantic-prompt.ts
  reading-prompt.ts
```

Prompt version constantとprompt builderを近くに置く。

巨大なprompt management frameworkは導入しない。

OpenAI dashboard hosted prompt機能はM10では使用しない。

Git管理されたpromptをsource of truthとする。

---

# 38. Test strategy

default automated testではreal networkを呼ばない。

Real Adapter testは、

```text
prompt builder
schema
mapping
candidateKey generation
metadata mapping
error mapping
reading batch reconciliation
```

をfake/injected OpenAI clientまたはpure helperで検証する。

既存Stub Application / API / E2E testは維持する。

---

## 39. Real OpenAI smoke test

real provider smoke testはopt-in。

通常の、

```text
npm test
npm run test:e2e
```

には含めない。

概念script:

```text
npm run test:openai-smoke
```

実行には明示的に、

```text
OPENAI_API_KEY
LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE=openai
```

が必要。

誤課金防止のため、envが揃わない場合はnetwork callせずskip / fail-fastする。

smokeではtargetCountを小さくし、最低限:

```text
source reading
candidate generation
candidate batch reading
semantic evaluation
Structured Output parse
```

を確認する。

本番β用targetCount 60自体はApplication manual smoke / β evaluationで確認する。

---

# 40. Default E2E

Playwright E2Eは引き続きStub mode。

理由:

```text
deterministic
offline
free
repeatable
CI-safe
```

M10 real adapter導入後も既存M9 E2Eを有料network testへ変えない。

---

# 41. No automatic fallback to Stub

`openai` modeでprovider failureした際、

```text
Real Adapter failure
-> 自動でStubへfallback
```

は行わない。

理由:

- ユーザーにreal結果だと誤認させない。
- βデータへStub結果を混入させない。
- provider障害を観測可能にする。

明示mode変更時のみStubを使用する。

---

# 42. No automatic prompt/model fallback

real adapterで、

```text
Terra failure
-> Lunaへ自動変更
```

等のmodel fallbackは行わない。

model変更はenvironment / configとして明示し、metadataに残す。

---

# 43. Security

API keyを以下へ含めない。

```text
Git
docs example actual value
Browser
public response
DB
log
error message
test fixture
screenshot
```

OpenAI Project keyを使用する。

個人間でAPI keyを共有しない。

---

# 44. M10 stop conditions

以下の場合は独自判断で進めず停止する。

```text
OpenAI SDK stable版でResponses.parse / Structured Outputsが利用できない

Zod 4とのcompatibilityに追加dependencyが必要

Real Reading Resolver batch化にApplication意味変更が必要

Reading provenance保存にadditive migration以外の危険なtable rebuildが必要

M5 Sound / Semantic independenceを崩す必要がある

real adapter導入のためBrowserへAPI keyを渡す必要がある

new API endpointが必要

authenticationが必要

OpenAI以外のprovider dependencyが必要

automatic model fallbackが必要

M10内でScoring / Selector tuningを先に行う必要がある
```

---

# 45. M10 adapter completion criteria

1. official OpenAI SDKをstable exact versionで導入する。
2. Responses API + Structured Outputsを使用する。
3. `store=false` を全real Responses callで明示する。
4. `OpenAiLlmAdapter`を実装する。
5. `OpenAiReadingResolver`を実装する。
6. candidate readingを1件ずつAPI callせずbatch resolveする。
7. StubReadingResolverもbatch contractへ対応する。
8. candidateKeyをAdapter側でdeterministic生成する。
9. SemanticへSound / readingを渡さない。
10. model / prompt / inference config / usage / duration metadataを保持する。
11. Reading provenanceをadditive migrationで保存する。
12. `stub | openai` composition switchを実装する。
13. default automated testsはnetworkを呼ばない。
14. opt-in OpenAI smoke testを実装する。
15. BrowserへAPI key / provider detailを漏らさない。
16. DB内のStub / OpenAI結果を混在させるautomatic fallbackを行わない。
17. lint / typecheck / test / build / E2Eを維持する。
