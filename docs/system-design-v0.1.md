# 歌詞作成補助ツール システム設計書 v0.1.7 β

> v0.1の実装設計のSource of Truth。技術スタックはβ向け仮決定であり、製品挙動を変えない実装詳細はDecision Logを更新した上で変更可能。

要件定義書 v0.1 β / Roadmap / Decision Log を基に作成

| 位置づけ | 本書は小規模個人開発向けに、基本設計と詳細設計の境界を1冊に統合した設計書である。v0.1の採用技術スタックを明示しつつ、論理アーキテクチャ・責務・データ・I/F・テスト境界をSource of Truthとして定義する。 |
| --- | --- |

# 1. 文書の目的と設計スコープ

本書は、要件定義書 v0.1 βで定義された機能を実装可能な単位へ分解し、モジュール間の責務・データフロー・インターフェース・保存情報・テスト境界を定義する。

v0.1は個人利用を主目的とするWebアプリであり、将来的に少人数の試用者へ公開する可能性を考慮する。ただし本格的なアカウント管理・課金・大規模運用は対象外とする。

| 項目 | v0.1 方針 |
| --- | --- |
| 形態 | Webアプリ |
| 利用者 | 原則 owner 1名。tester追加を阻害しないデータ構造とする |
| LLM / Reading | OpenAI Responses APIをInfrastructure Adapter越しに利用。M10 initial defaultは `gpt-5.6-terra`。Stub modeをdefaultに維持し、real β時だけOpenAI modeへ切替 |
| 保存 | SQLite + Drizzleで生成履歴・評価内訳・FBを永続化。DBは当時の実験結果をsnapshotとして保持する |
| 設計方針 | 単一アプリケーションとして小さく構成し、内部責務のみ明確に分離 |

## 1.1 設計原則

- LLMに任せる曖昧な処理と、再現可能なアルゴリズム処理を分離する。
- 語感評価・韻正規化・候補選抜は独立モジュールとし、ルール変更の影響範囲を限定する。
- β検証のため、最終スコアだけでなく中間値・設定バージョン・LLMモデル/プロンプト版を保存する。
- UIは最小限に保ち、検証用情報は詳細画面または内部ログへ寄せる。
- 将来機能を先取り実装しない。ただし差し替え可能なI/Fと元データは保持する。
## 1.2 技術スタック（v0.1 仮決定）

v0.1 βの実装開始に必要な技術前提として、以下を採用する。β検証の速度と保守負荷を優先し、フロントエンドとバックエンドを単一リポジトリにまとめる。具体的なライブラリ細部やLLMモデルは、Adapter/I/Fを維持したまま後から変更可能とする。

| 領域 | 採用技術 | 採用理由 |
| --- | --- | --- |
| Runtime | Node.js 24 LTS | 安定運用向けLTS。npmを同梱し、Next.js/TypeScriptの開発基盤を一本化できる。 |
| Web / Frontend | Next.js App Router + React + TypeScript | 小規模WebアプリでUIとサーバー処理を一つのプロジェクトに集約しやすく、型でI/Fを明確化できる。 |
| Backend API | Next.js Route Handlers | 別バックエンドを立てず、APIキーをBrowserへ露出せずにLLM/DB処理をサーバー側へ閉じ込められる。 |
| UI Styling | CSS Modules / Global CSS | v0.1は極小UIのため大規模UIライブラリを先取りせず、依存を最小化する。 |
| Schema / Validation | Zod | API/LLM構造化出力の型とvalidationをTypeScript側で明示しやすい。 |
| Database | SQLite | 個人利用βでは運用負荷が小さく、生成履歴・FB保存に十分。公開規模拡大時は再評価する。 |
| ORM | Drizzle ORM `1.0.0-rc.4` / Drizzle Kit `1.0.0-rc.4`（exact pin） | `node:sqlite` 対応を公式手順に沿ってSmoke Gate確認済み。Product / Domain仕様はRC固有APIへ依存させない。 |
| Unit Test | Vitest | RhymeNormalizer / SoundScorer / CandidateSelector等の決定論的TypeScriptロジックを高速に検証しやすい。 |
| E2E Test | Playwright | Browser上の初期画面→生成→詳細→FB等の主要フローを自動検証できる。 |
| External AI API | OpenAI Responses API + Structured Outputs / official OpenAI JS SDK | Candidate Generation・Semantic Evaluation・Reading Resolutionをserver-side Adapterとして実装する。initial default modelは `gpt-5.6-terra`、task別env override可。 |
| Package Manager | npm | Node.js同梱で追加導入が不要。初回環境構築を単純化する。 |
| Version Control | Git（GitHub Privateは推奨・任意） | ローカル変更履歴を必須とし、GitHubはバックアップ・共有・将来のPR運用に利用できる。 |

注: v0.1では上記をβ向け決定とする。OpenAI model / Reading providerはInfrastructure境界に隔離し、β結果に応じて差し替え可能とする。DB・Domain・public APIをprovider固有contractへ依存させない。

# 2. システム全体アーキテクチャ

```text
[ Browser / Web UI ]
        |
        | HTTP / JSON
        v
[ Backend API ]
        |
        v
[ Application Services ]
   |-- Generation Service
   |-- Reroll Service
   |-- Feedback Service
   `-- Session Query Service
        |
        +------------------------------+
        |                              |
        v                              v
[ Domain Modules ]             [ Application Ports ]
   |-- Rhyme Normalizer           |-- ReadingResolver
   |-- Sound Scorer               |-- LlmAdapter
   `-- Candidate Selector         |-- RoundPersistencePort
                                  |-- SessionQueryPort
                                  `-- FeedbackPersistencePort
                                           ^
                                           |
                              [ Infrastructure Implementations ]
                                 |-- Stub / OpenAI ReadingResolver
                                 |-- Stub / OpenAI LlmAdapter
                                 `-- SQLite / Drizzle Persistence
                                           |
                                           +----> [ OpenAI Responses API ]
```

v0.1ではこれらを別サービスへ分割しない。デプロイ単位は原則1つとし、コード上のモジュール境界として分離する。

依存方向は以下を原則とする。

```text
Application -> Domain
Application -> Application Ports
Infrastructure -> Application Ports
Domain -X-> Application / Infrastructure
Application -X-> concrete Infrastructure implementation
```

## 2.1 レイヤ責務

| レイヤ | 責務 | 依存の方向 |
| --- | --- | --- |
| Web UI | 入力、候補表示、XY詳細、リロール、FB | Backend APIのみ |
| Backend API | HTTP受付、Zod validation、server-side beta user識別、Application Error→HTTP変換、API DTO整形 | Application Services |
| Application | ユースケース進行、処理順制御、Port呼出し、completed Roundのatomic persistence要求 | Domain / Application Ports |
| Domain | 韻正規化・語感採点・候補選抜の決定論的ルール | 外部I/Oへ直接依存しない |
| Application Ports | Reading / LLM / Persistence等の外部能力をApplicationから利用する契約を定義 | Domain / Application DTO |
| Infrastructure | Reading / LLM / SQLite等の具体実装を提供し、Application Portを実装する | Application Ports / External I/O |
| Persistence | Session、Round、Candidate snapshot、FB、設定版を保存し、transactionのBEGIN / COMMIT / ROLLBACKを担う | DB / Application Port |

Application自身はDrizzleや `DatabaseSync` を直接利用しない。atomicな保存単位をPortへ要求し、具体transactionはInfrastructure Persistenceが実行する。

詳細は `docs/application-service-design-v0.1.md` を参照する。

# 3. 生成パイプライン

M7では、独立して実装済みのDomain / Adapter / PersistenceをApplication Serviceで以下の順序に接続する。

```text
keyword
  |
  v
1. Basic Input Precondition
  |
  v
2. Source Reading Resolution
  |
  v
3. Source Rhyme Normalization
  |
  v
4. Candidate Pool Generation -------- LLM Adapter
  |
  v
5. candidateKey Integrity Filter
  |
  v
6. Candidate Reading Resolution
  |
  v
7. Candidate Rhyme Normalization
  |
  v
8. Sound Scoring
  |
  v
9. Semantic Evaluation --------------- LLM Adapter
  |
  v
10. Semantic Result Reconciliation
  |
  v
11. Candidate Selector
  |
  v
12. Completed Round Snapshot Assembly
  |
  v
13. Atomic Persistence
  |
  v
14. persisted ID Mapping
  |
  v
15. Return selected candidates
```

Candidate Generationのtarget countはApplication設定値とし、v0.1 defaultは60件とする。LLM Adapter自身は「60件」というProduct判断を持たない。

Generation Result内で同一 `candidateKey` が複数存在する場合、そのkeyに属するcandidateは後段からすべて除外する。ただしraw Generation Resultには保持する。

Candidate Readingが `unresolved` の場合は該当candidateのみ除外する。Reading Resolver自体のsystem failureはRound全体の失敗として扱う。

Semantic Evaluationには `candidateKey` とsurfaceのみを渡し、reading / rhyme / Sound Scoreを渡さない。Semantic Resultのunknown / duplicate / missing keyはcandidate単位でreconcileし、安全に1対1対応できるcandidateのみevaluated poolへ進める。

evaluated poolが0件の場合はRoundを完成扱いにせず保存しない。1件以上存在する場合はSelectorを実行し、selectedが10件未満でもcompleted Roundとして保存する。candidate不足を理由とする追加生成はv0.1では行わない。

## 3.1 生成ユースケースの入出力

| 段階 | 入力 | 出力 |
| --- | --- | --- |
| Input | userId, sourceSurface | validated application input |
| Source Reading | source surface | ReadingResult |
| Normalize | ReadingResult | source RhymeRepresentations + normalizerVersion |
| Generate | source surface/reading, targetCount, excludeTerms | raw GenerateCandidatesResult |
| Candidate Processing | generation candidates | resolved reading / rhyme / SoundScoreResult |
| Semantic | source surface + candidateKey/surface | raw EvaluateSemanticsResult |
| Reconcile | sound-complete candidates + semantic results | safely evaluated candidate pool |
| Select | evaluated pool + config + excludeTerms | SelectionResult（最大10件、10件未満可） |
| Persist | completed snapshot + config/version metadata | sessionId / roundId / candidateResultId mapping |
| Return | selected result + persisted ID mapping | GeneratedRoundView |

詳細なI/F・error contract・保存挙動は `docs/application-service-design-v0.1.md` を参照する。

# 4. Domain / Core Processing設計

## 4.1 Reading Resolver（Application Port）

日本語表記から比較に必要な確定readingを取得する能力はApplication-owned Portとして定義し、具体providerをInfrastructureへ隔離する。

M10では、

```text
stub
openai
```

の2 implementationを持つ。

Source wordは単体resolve。

Candidate poolは外部APIを1 candidate = 1 callで呼ばず、batch resolveする。

概念I/F:

```ts
interface ReadingResolver {
  resolve(
    request: ResolveReadingRequest,
  ): Promise<ReadingResolution>;

  resolveBatch(
    request: ResolveReadingBatchRequest,
  ): Promise<ResolveReadingBatchResult>;
}
```

candidate batchでは `candidateKey` をrequestKeyとしてidentityを維持する。

```text
item unresolved / missing / duplicate
-> 該当candidateだけ後段から除外

batch-level provider / parse / refusal failure
-> Round全体失敗
```

`readingHint` は補助情報であり確定readingとして盲信しない。

M10 real providerはOpenAI Responses API + Structured Outputsを使用する。candidate 60件を原則1 batch callで処理し、latency / costの爆発を避ける。

Reading結果にはresolver identifier / prompt version / inference config / provider usage / duration等のprovenance metadataを持たせる。

Source readingの多義性はv0.1の既知制約。manual reading override UIはM10では追加せず、βで必要性を観測する。

Rhyme NormalizerはReadingResolverを内部から呼ばず、確定済みReadingResultを受け取る責務分離を維持する。

詳細は `docs/application-service-design-v0.1.md` および `docs/external-adapter-design-v0.1.md` を参照する。


## 4.2 Rhyme Normalizer

元の読みを上書きせず、音韻解析表現と作詞用比較表現を別に生成する。

```text
raw reading
   -> mora / phonetic parse
   -> lyric rhyme normalization
   -> normalized rhyme pattern
```

| 対象 | 内部保持 | v0.1比較ルール |
| --- | --- | --- |
| 通常母音 | a/i/u/e/o | そのまま |
| 長音 ー | long mark | 直前母音を継承 |
| 促音 っ | Q | 比較時 X |
| 撥音 ん | N | 比較時 X |
| 拗音 | 1モーラ | ゃ/ゅ/ょに対応する母音 |
| o + u | raw列も保持 | 暫定的に o + o |
| e + i | raw列も保持 | 暫定的に e + e |

## 4.3 Sound Scorer

語感スコアは決定論的に算出する。v0.1では以下をβ仮説値として採用し、FBに応じて設定値・評価式を変更できるようにする。

| 構成 | 初期重み/補正 | 概要 |
| --- | --- | --- |
| Mora Length | 40% | Phoneticモーラ数差。差0=100 / 1=70 / 2=35 / 3以上=0 |
| Position Match | 25% | 同位置の正規化unit（a/i/u/e/o/X）一致率 |
| Sequence Similarity | 25% | 正規化列の標準Levenshtein距離を0〜100へ変換 |
| Ending Rhyme Bonus | 0〜10点 | 共通末尾unit数 / 2語の長い方のNormalized length をcoverageとし、coverage × 10を線形加算 |

```text
SoundScore
 =
 0.40 × MoraLengthSimilarity
+0.25 × PositionMatchSimilarity
+0.25 × SequenceSimilarity
+EndingRhymeBonus
```

v0.1ではnegative adjustmentを使用しない。Ending Bonusは語尾一致がPosition Match / Sequence Similarityにも一部反映されることを承知した上で、作詞上の語尾一致感を最大10点だけ追加評価するヒューリスティックとして扱う。

Sound ScorerはRhyme Normalizerを内部から呼ばず、正規化済みの `RhymeRepresentations` を入力として受け取る。子音およびPhonetic層のQ/N差はv0.1のSound Scoreには使用しない。

```text
SoundScoreResult {
  finalScore: 0..100
  breakdown: {
    moraLengthScore
    positionMatchScore
    sequenceSimilarityScore
  }
  endingAdjustment: {
    commonSuffixLength
    suffixCoverage
    bonus
  }
  scoringConfigVersion
  normalizerVersion
}
```

最終表示用 `finalScore` のみ最後に四捨五入し、中間値はβ分析のため保持する。

詳細は `docs/sound-scorer-design-v0.1.md` を参照する。

## 4.4 Semantic Evaluator

意味・文脈近接度はLLMを主に利用し、候補プールを一括評価する。候補ごとに点数だけでなく、選抜に使う連想情報を構造化して返す。

```text
SemanticResult {
  word
  semanticScore: 0..100
  reason: string
  primaryRelation
  secondaryRelations[]
  semanticCluster
}
```

primaryRelationの暫定候補: synonym / emotion / scene / visual / sound / action / object / time / place / metaphor / cause_effect / abstract_association。taxonomyはβ運用で統合・追加可能とする。

# 5. LLMインターフェース設計

## 5.1 Adapter方針

Application層は具体的なLLM SDKへ直接依存せず、Application所有の `LlmAdapter` Portを利用する。Infrastructure側がPortを実装する。

```text
Application
    |
    v
LlmAdapter Port
    ^
    |
Infrastructure Adapter
    |
    v
External LLM API
```

ReadingResolverおよびPersistenceも同じ原則でApplication Portとして所有し、Infrastructureが具体実装を提供する。Applicationから具体的なSDK・DB driver・Repository実装へ直接依存しない。

v0.1 contract:

```text
LlmAdapter
  generateCandidates(request) -> GenerateCandidatesResult
  evaluateSemantics(request)  -> EvaluateSemanticsResult
```

M4ではfixture injection型Stubを実装した。M10ではInfrastructure `OpenAiLlmAdapter` を追加し、server compositionの `stub | openai` modeで切り替える。Application Port contractは維持する。

## 5.2 Candidate Generation I/F

概念上のrequest:

```text
GenerateCandidatesRequest {
  source {
    surface
    reading
  }
  targetCount
  excludeTerms[]
}
```

result:

```text
GenerateCandidatesResult {
  candidates: [
    {
      candidateKey
      surface
      readingHint?
    }
  ]

  metadata {
    modelIdentifier
    generationPromptVersion
    inferenceConfigVersion
    providerResponseId?
    durationMs
    usage?
  }
}
```

`candidateKey` はgeneration round内でcandidateを追跡するopaque keyであり、DB永続IDではない。

候補生成時点では10語への順位付けをLLMへ委ねない。LLMは探索範囲の広いcandidate poolを提供する役割とする。

## 5.3 Semantic Evaluation I/F

Semantic EvaluationへSound Score、reading、rhyme情報を渡さない。Sound軸とSemantic軸を独立させる。

概念上のrequest:

```text
EvaluateSemanticsRequest {
  source {
    surface
  }

  candidates: [
    {
      candidateKey
      surface
    }
  ]
}
```

result:

```text
EvaluateSemanticsResult {
  results: [
    {
      candidateKey
      score
      reason
      primaryRelation
      secondaryRelations[]
      semanticCluster
    }
  ]

  metadata {
    modelIdentifier
    semanticPromptVersion
    inferenceConfigVersion
    providerResponseId?
    durationMs
    usage?
  }
}
```

候補とSemantic結果は配列indexではなく `candidateKey` で対応付ける。

詳細は `docs/llm-adapter-design-v0.1.md` を参照する。


## 5.4 M10 OpenAI implementation

v0.1 real adapter:

```text
Provider:
  OpenAI

API:
  Responses API

Output:
  Structured Outputs

SDK:
  official OpenAI JavaScript / TypeScript SDK

Initial model:
  gpt-5.6-terra

Reasoning:
  effort = none

Responses state:
  store = false

Streaming:
  off

Tools:
  none
```

task別model override:

```text
LYRICS_ASSIST_OPENAI_GENERATION_MODEL
LYRICS_ASSIST_OPENAI_SEMANTIC_MODEL
LYRICS_ASSIST_OPENAI_READING_MODEL
```

External Adapter mode:

```text
LYRICS_ASSIST_EXTERNAL_ADAPTER_MODE=stub|openai

default = stub
```

build / test / E2EではStubをdefaultとし、意図せず有料network callを発生させない。

`openai` mode失敗時のautomatic Stub fallbackやmodel fallbackは行わない。βデータの由来を曖昧にしないためである。

Prompt version initial:

```text
candidate-openai-v0.1
semantic-openai-v0.1
reading-openai-v0.1
```

Provider behavior version:

```text
openai-responses-v0.1
```

candidateKeyはmodelへ生成させず、OpenAI Adapterがraw surface + readingHintからNode標準cryptoでdeterministicに生成する。

詳細は `docs/external-adapter-design-v0.1.md` を参照する。

# 6. Candidate Selector v0.1

| 決定 | 最終10語の目標配分を Balanced 4 / Sound-focused 3 / Semantic-focused 3 とする。これは固定された真理ではなく、β検証用の selection_config としてバージョン管理する。 |
| --- | --- |

## 6.1 3カテゴリの定義

| カテゴリ | 枠 | 利用価値 | 主評価 |
| --- | --- | --- | --- |
| Balanced | 4 | 語感・意味の双方が近く、直接使いやすい候補 | 両軸が高いこと |
| Sound-focused | 3 | 意味が遠くても韻・響きとして使える候補 | soundのみ |
| Semantic-focused | 3 | 語感が遠くても語彙・情景・連想を補う候補 | semantic + 連想多様性 |

## 6.2 選抜前フィルタ

General Filterでは以下をfallbackでも解除しないhard exclusionとして扱う。

- source word自身
- reroll等の `excludeTerms`
- canonical duplicate
- 必要な評価情報を持たないcandidate
- duplicate `candidateKey` により対応が曖昧なcandidate

canonical surfaceはv0.1で以下を適用する。

1. leading / trailing whitespace除去
2. Unicode NFKC
3. Latin lowercase
4. カタカナを対応するひらがなへ正規化

reading一致だけではduplicate扱いしない。候補間のedit similarity / embedding / pairwise LLM similarity等はM5では導入しない。

## 6.3 Balanced 4枠

弱い側の軸を重視したβ用rankingを採用する。

```text
minScore  = min(soundScore, semanticScore)
meanScore = (soundScore + semanticScore) / 2

balancedScore =
  0.7 * minScore
+ 0.3 * meanScore
```

primaryでは同一 `semanticCluster` 最大2。

同点時は、現在のBalanced selected内で少ないcluster、minScore、meanScore、canonicalSurface、candidateKeyの順に安定tie-breakする。

## 6.4 Sound-focused 3枠

```text
soundRank = soundScore
```

Semantic Scoreを減点に使用しない。`primaryRelation` / `semanticCluster` によるdiversity constraintも設けない。

同点時はEnding Rhyme Bonus、Mora Length Similarity、canonicalSurface、candidateKeyの順に比較する。

## 6.5 Semantic-focused 3枠

```text
semanticRank = semanticScore
```

Sound Scoreを減点に使用しない。

primaryでは同一 `semanticCluster` 最大1。

semanticScore同点時は、未使用 `primaryRelation`、selected内で少ない `semanticCluster`、canonicalSurface、candidateKeyの順に多様性を優先する。`primaryRelation` はhard constraintではない。

## 6.6 選抜順序と枠不足

primary selectionは以下の順で行う。

```text
Balanced  up to 4
↓
Sound     up to 3
↓
Semantic  up to 3
```

一度選択されたcandidateはremaining poolから除外し、複数categoryへ重複選択しない。

10件未満の場合は、

```text
Balanced -> Sound -> Semantic -> Balanced -> ...
```

のround-robin fallbackを行い、1 strategy turnにつき最大1件追加する。

- hard exclusionはfallbackでも解除しない
- Balancedはcluster max2を維持し、候補がなければcapを解除
- Semanticはprimary max1 -> fallback max2 -> unrestrictedの順で緩和
- Soundはsemantic diversity constraintを追加しない
- valid candidateが不足する場合は10件未満を返す
- v0.1ではabsolute score thresholdを設けない

詳細は `docs/candidate-selector-design-v0.1.md` を参照する。

## 6.7 Selector出力

M5までの生成・評価・選抜pipelineではcandidateを `candidateKey` で追跡する。DB永続IDはM6以降、CandidateResult保存時に付与する。

```text
SelectedCandidate {
  candidateKey
  selectionCategory   // balanced | sound | semantic | fallback
  fallbackStrategy?   // category = fallback の場合のみ必須
  selectionScore
}

SelectionResult {
  selected[]          // 最大targetTotal件。10件未満を許容
  selectionConfigVersion
  shortageEvents[]
}
```

表示・永続化時の順序は `selected` の実際の選抜順を使用する。

# 7. セッション / リロール設計

```text
GenerationSession
  |-- Round 1
  |-- Round 2
  `-- Round n
```

リロールは新規Sessionではなく、同一GenerationSessionへ次のGenerationRoundを追加する。

Reroll Application Serviceは `userId + sessionId` でSession contextを取得し、保存済みの `sourceSurface / sourceReading` を利用する。source readingをReadingResolverへ再問い合わせしない。

一方、以下はRound時点のcurrent versionを使用する。

```text
Rhyme Normalizer
ScoringConfig
SelectionConfig
```

したがって同一Session内で、

```text
Round 1: sound-v0.1 / selector-v0.1
Round 2: sound-v0.2 / selector-v0.2
```

のようなversion差を許容する。source Rhyme Representationもcurrent Normalizerで再生成する。

## 7.1 excludeTerms

`excludeTerms` は「過去に表示済みなので次Roundで再提示しない語」を表し、明示的なDislikeとは別概念として扱う。

同一Sessionの過去全Roundについて、実際にselectedされたcandidate surfaceのみから構築する。

```text
roundNumber ascending
  -> selectionRank ascending
```

未選抜candidateは含めない。重複surfaceは最初の出現だけを残してよい。

同じexcludeTermsを、

```text
Candidate Generation
Candidate Selector
```

の両方へ渡す。

Candidate Generation側では探索hint、Candidate Selector側ではhard exclusionとして機能する。LLMが既出語を再生成してもraw Generation Resultには保持できるが、Selectorで再表示を防ぐ。

v0.1ではsource自身・reroll `excludeTerms`・canonical duplicate等のhard exclusionをfallbackでも解除しない。valid candidateが不足する場合は10件未満を返し、既出語やdummy candidateで無理に10件へ合わせない。

## 7.2 Reroll concurrency

v0.1では同一Sessionへの完全同時rerollに対する自動retry / lock戦略を追加しない。

DBの `UNIQUE(session_id, round_number)` を最終整合性ガードとし、競合時はPersistence failureとして扱う。必要性が実測された段階で再設計する。

詳細は `docs/application-service-design-v0.1.md` を参照する。

# 8. Persistence / 論理データモデル

## 8.1 Persistence方針

v0.1 persistenceにはSQLite + Drizzleを使用する。Runtime driverはNode built-in `node:sqlite` を使用し、`drizzle-orm@1.0.0-rc.4` / `drizzle-kit@1.0.0-rc.4` をexact pinする。Node.js 24.19.0上でSmoke Gateにより接続、Foreign Key enforcement、migration生成・fresh DB適用、query、integrity checkを確認済み。RC固有APIはInfrastructureへ隔離し、Product / Domain仕様へ波及させない。

Persistenceは「現在の正解状態」ではなく、当時の生成・評価・選抜結果をimmutable experiment snapshotとして保存する。

- Sound / Semantic評価済みcandidate pool全体を保存し、selected 10件だけに限定しない。
- GenerationSession / GenerationRound / CandidateResultを分離する。
- Candidate Generation / Semantic Evaluation / Selection等のraw result JSONと、分析用scalar projectionを併存させる。
- CandidateFeedback / SoundScoreFeedbackは履歴ではなくcurrent stateとして保持する。
- ScoringConfig / SelectionConfigはversioned immutable snapshotとして保存する。
- DB永続IDとgeneration round内の `CandidateKey` を分離する。
- FK delete actionはv0.1では原則 `RESTRICT` とする。
- completed Roundの永続化はtransactionでatomicに行い、途中状態を残さない。
- PreferenceProfile / reevaluation / generic operation logは実装しない。M10ではReading / LLM Adapter result内のprovider usage / duration provenanceだけを追加する。

詳細は `docs/persistence-design-v0.1.md` を参照する。

## 8.2 論理Entity

| Entity | 主なフィールド | 目的 |
| --- | --- | --- |
| User | id, created_at | owner / testerのデータ所有境界。v0.1では認証accountではない |
| GenerationSession | id, user_id, source_surface, source_reading, source_reading_resolution_json?, created_at | 一連のsource word探索単位。M10以降はsource Reading provenanceを保持 |
| GenerationRound | id, session_id, round_number, input条件, raw result snapshots, candidate_reading_resolution_result_json?, config versions | 初回/リロール1回分の完成した実験snapshot |
| CandidateResult | id, round_id, candidate_key, word/reading/rhyme, sound/semantic, selected, selection情報 | 評価済みcandidate pool全体のsnapshot |
| CandidateFeedback | candidate_result_id, like/dislike, timestamps | 候補そのものへの最終嗜好 |
| SoundScoreFeedback | candidate_result_id, low/valid/high, timestamps | Sound Scoreへの最終納得度 |
| ScoringConfig | version, config_json | Sound Scorer条件のimmutable version |
| SelectionConfig | version, config_json | Candidate Selector条件のimmutable version |

PreferenceProfileは将来概念として残すが、M6ではtableを作成しない。

## 8.3 CandidateResultはスナップショットとして保持

ルール変更後も『当時なぜその候補がその点数だったか』を再現できるよう、CandidateResultには計算結果だけでなく入力値・内訳・バージョンを保存する。

selected / unselectedを問わず、Sound / Semantic評価まで完了したcandidate pool全体を保存する。

```text
CandidateResult {
  id                  // DB永続ID
  roundId
  candidateKey        // generation round内identity
  generationIndex

  surface
  reading
  readingResult
  rhymeRepresentation

  soundScore
  soundBreakdown
  semanticScore
  semanticReason
  primaryRelation
  secondaryRelations
  semanticCluster

  selected
  selectionCategory?
  fallbackStrategy?
  selectionScore?
  selectionRank?

  semanticModelIdentifier
  semanticPromptVersion
}
```

Normalizer / ScoringConfig / SelectionConfig / Generation model / Prompt等のRound共通metadataはGenerationRound側にもsnapshotする。

将来新しいScorer / Selectorで過去データを再評価しても、元CandidateResultをUPDATEしない。再評価結果の永続化が必要になった場合は別entityとして追加する。


M10ではReading provenance用に次のnullable JSON columnをadditive migrationで追加する。

```text
generation_sessions.source_reading_resolution_json
generation_rounds.candidate_reading_resolution_result_json
```

M6〜M9のexisting rowはNULLのまま保持し、後付け推測値でbackfillしない。

Drizzle migrationがSQLite table rebuild / destructive SQLを生成する場合は停止してreviewする。

詳細は `docs/persistence-design-v0.1.md` を参照する。

# 9. Backend API

M8ではNext.js App RouterのRoute HandlerをBrowser / Application間のHTTP境界として実装する。

```text
Browser
  ↓ HTTP / JSON
Backend API
  - Content-Type / JSON validation
  - Zod strict schema validation
  - server-side beta user resolution
  - Application Service invocation
  - ApplicationError -> HTTP / public API error mapping
  - API DTO mapping
  ↓
Application Services
```

SQLiteは `node:sqlite` を使用するため、各Route Handlerは `runtime = "nodejs"` を明示する。Route HandlerでDomain ruleやDrizzle queryを直接実装しない。

| Method | Path | 用途 | Success |
| --- | --- | --- | ---: |
| POST | `/api/generations` | 新規キーワードからSession + Round 1生成 | 201 |
| POST | `/api/sessions/{sessionId}/reroll` | 同一Sessionへ次Roundを追加 | 201 |
| GET | `/api/sessions/{sessionId}` | Sessionとselected候補を取得 | 200 |
| POST | `/api/feedback/candidate` | Like / Dislike保存 | 200 |
| POST | `/api/feedback/sound-score` | low / valid / high保存 | 200 |

POST endpointは `application/json` を要求し、request objectはZodでstrict validationする。Rerollも `{}` JSON bodyを要求する。

v0.1ではBrowserから `userId` を受け取らない。Backend側の `FixedBetaUserResolver` がserver-only環境変数 `LYRICS_ASSIST_BETA_USER_ID` から固定UUIDを解決し、M7 Application Serviceへ注入する。Browserから送られた未定義 `userId` fieldはvalidation errorとする。

この固定identityはauthenticationではなく、M8のdeployment assumptionはowner-only / localまたはprivateな利用である。tester公開・public deploymentの前にAuthenticatedUserResolverへ差し替える。

通常API responseはselected candidateに必要な表示情報だけを返し、raw Generation / Semantic snapshot、unselected pool、internal `candidateKey`、DB row、server userId、内部error causeを返さない。

M9のreload復元要件により、selected candidateのpublic DTOにはcurrent Feedback state（Candidate Like/Dislike、Sound low/valid/high、未登録はnull）を含める。Feedback historyは返さない。

API responseは `Cache-Control: no-store` とし、v0.1ではcross-origin APIをsupportせずCORS許可headerを追加しない。

Application ErrorはHTTP境界で以下の意味へ縮約する。

```text
400 INVALID_REQUEST
404 NOT_FOUND
415 UNSUPPORTED_MEDIA_TYPE
422 SOURCE_READING_UNRESOLVED / NO_EVALUABLE_CANDIDATES
502 UPSTREAM_UNAVAILABLE
500 INTERNAL_ERROR
```

DB error、stack trace、filesystem path、provider raw error等の内部情報をBrowserへ露出しない。

M8時点ではserver compositionも `StubReadingResolver` / `StubLlmAdapter` を使用し、real external adaptersには進まない。任意keywordへの実用生成はM10の責務とする。

詳細なrequest / response schema、identity、error mapping、test boundaryは `docs/backend-api-design-v0.1.md` を参照する。

# 10. Web UI設計

M9ではUIそのものもβ検証対象とし、最小構成でBrowserから主要flowを操作可能にする。

Route:

```text
/
  keyword入力

/sessions/{sessionId}
  latest Round結果
  Candidate Like / Dislike
  reroll

/sessions/{sessionId}/detail
  latest Round XY Scatter Plot
  Sound Score Feedback
```

Page / Layoutは可能な限りServer Componentのまま保ち、Browser fetch / state / eventが必要な箇所だけClient Componentとする。Clientから `src/server` / `src/infrastructure` をimportしない。

public API DTO型はserver/client双方から参照可能なneutral contract layerへ置く。

## 10.1 初期画面

```text
        ことばを探す

[ キーワード                         ]
               [ 探す ]
```

説明、高度設定、Sound/Semantic重みsliderはv0.1では表示しない。

Generation中はformをpendingにして二重submitを防ぎ、失敗時は入力を維持する。

成功後はprogrammatic navigationで同Sessionの結果URLへ移動する。

## 10.2 結果画面

最新Roundのみを通常表示する。

```text
keyword

[ もう一度探す ]             [ 詳細を見る ]

candidate card
  surface
  reading
  [ Like ] [ Dislike ]

...
```

候補はselectionRank順。0〜10件を許容する。

Sound / Semantic score、selectionCategory等は通常画面で前面表示しない。

Reroll中は現在の有効な結果を残し、buttonのみpendingにする。成功したnew Roundを同一Sessionのlatestとして表示する。

Candidate Feedbackはcurrent stateとして表示し、同じ値の再押下はno-op、反対値で更新する。neutralへ戻すUIはv0.1では作らない。

## 10.3 詳細画面

最新Roundのselected candidateをXY Scatter Plotへ表示する。

```text
x = Sound finalScore
y = Semantic score

range = 0..100 fixed
```

SVG + CSSで実装し、chart libraryは追加しない。

hoverだけに依存せず、

```text
hover
focus
tap / click
candidate legend button
```

からactive candidateを選択できる。

visual jitterは使わず、同座標candidateはlegendから個別に選べる。

active candidateにはSound / Semantic詳細、Semantic reason、selection metadata、Sound Score Feedbackを表示する。

Sound Feedback label:

```text
低すぎる
妥当
高すぎる
```

## 10.4 reload / canonical state

Session / Detailのreload時は、

```text
GET /api/sessions/{sessionId}
```

から保存済み状態を復元する。

score / semantic / selectionは当時のsnapshot。

FeedbackはDB current state。

```text
DB Like
-> reload
-> Like selected表示

DB sound = valid
-> detail reload
-> 妥当 selected表示
```

Browser localStorageをFeedbackのsource of truthにしない。

## 10.5 UI技術方針

```text
React 19
Next.js App Router
CSS Modules / Global CSS
native semantic HTML
Playwright
```

新しいchart / UI / state management / animation libraryは追加しない。

デザイン方向はneutral / quiet / editorialとし、候補語を主役にする。細かな色・余白・copyはβ feedbackを見て変更可能とする。

詳細は `docs/web-ui-design-v0.1.md` を参照する。

# 11. βフィードバック設計

| FB | 質問 | 用途 |
| --- | --- | --- |
| Candidate Like/Dislike | この候補は作詞の発想として良いか | 将来Preference Profile |
| Sound Score Feedback | 語感点は低すぎる/妥当/高すぎるか | ScoringConfig調整 |

2種類のFBは意味が異なるため、同一フラグへ統合しない。β分析ではscoringConfigVersion単位で集計できるようにする。

FeedbackはM6方針どおりcurrent state。

```text
Candidate:
  null -> like / dislike
  like <-> dislike

Sound:
  null -> low / valid / high
  low / valid / high間で更新
```

v0.1ではFeedback historyとneutralへ戻すdelete操作を作らない。

M9ではSession Queryがcurrent stateを読み取り、reload後もDBと画面の選択状態を一致させる。Feedback table / schemaは変更しない。

# 12. 設定・バージョニング

| Version対象 | 例 | 変更時の意味 |
| --- | --- | --- |
| normalizerVersion | rhyme-v0.1 | 韻正規化ルール変更 |
| scoringConfigVersion | sound-v0.1 | 語感重み/補正変更 |
| selectionConfigVersion | selector-v0.1 | 4/3/3・多様性条件変更 |
| generationPromptVersion | candidate-openai-v0.1 | 候補生成方針変更 |
| semanticPromptVersion | semantic-openai-v0.1 | 意味評価基準変更 |
| readingPromptVersion | reading-openai-v0.1 | Reading Resolver prompt変更 |
| inferenceConfigVersion | openai-responses-v0.1 | Responses API / reasoning / retry / timeout等provider behavior変更 |
| modelIdentifier | gpt-5.6-terra 等 | taskで使用したactual model変更 |

# 13. エラー・セキュリティ・観測性

## 13.1 エラー方針

- 入力不正: Applicationで最低限のpreconditionを確認し、Backend APIでは追加validationを行う。入力不正時はLLMを呼ばない。
- source reading unresolved: Generationを開始せず失敗。Candidate Generationを呼ばず、Session / Roundも保存しない。
- candidate reading unresolved: 該当candidateのみ後段から除外する。candidate不足を理由とする追加生成はv0.1では行わない。
- Reading Resolver system failure: source / candidateを問わずRound全体を失敗として扱い、completed Roundを保存しない。
- LLM timeout / provider failure / schema failure: Adapter責務で限定的なretry / validationを扱う。Adapterが失敗を返した場合、ApplicationではRound全体を失敗として扱う。
- duplicate generation candidateKey: 同一keyに属するcandidateを後段からすべて除外し、raw Generation Resultには保持する。
- Semantic Resultのunknown / duplicate / missing candidateKey: 安全に1対1対応できない該当candidateをevaluated poolから除外し、raw Semantic Resultには保持する。
- evaluated candidate 0件: `NO_EVALUABLE_CANDIDATES` 相当としてRoundを保存しない。
- 候補不足: evaluated poolが1件以上ならSelectorを実行し、10件未満でも正常なcompleted Roundとして保存・返却する。追加生成やdummy補填は行わない。
- DB保存失敗: Infrastructure transactionをrollbackし、UIへ成功レスポンスを返さない。
- Session / CandidateResult ownership不一致: 外部へ存在有無を漏らさないためNOT_FOUND相当として扱う。

Application-level error codeと保存挙動の詳細は `docs/application-service-design-v0.1.md` を参照する。

## 13.2 セキュリティ / プライバシー

- `OPENAI_API_KEY` はBackend Infrastructureのみで管理し、Browser / DB / Git / public errorへ埋め込まない。OpenAI Project keyを使用する。
- OpenAIへ送信する情報はsource / candidate / reading判断 / semantic評価に必要な最小限とする。Responses requestは `store=false` を明示する。
- Application Use Caseは `userId` でresource ownershipをscopeする。
- M8ではBrowserから `userId` を受け取らず、server-side `FixedBetaUserResolver` が固定UUIDを注入する。
- `LYRICS_ASSIST_BETA_USER_ID` は `NEXT_PUBLIC_` を付けず、Browserへ返さない。
- M8の固定beta userはauthenticationではないため、owner-only / localまたはprivate deploymentを前提とする。
- POST APIはJSON Content-Typeを要求し、cross-origin CORS許可は行わない。ただしこれはauthenticationの代替ではない。
- tester公開・public deploymentの前にauthentication / authorization / rate limit等を再設計する。

## 13.3 観測性

β調整のため、Session ID / Round / candidate pool size / selected / unselected、category allocation、fallback、version群等を後から追跡できるデータ構造を維持する。

M10ではreal external callの `durationMs` / input-output-total token usage / model / prompt / inference config / provider response id（利用可能な場合）をAdapter result provenanceとして保存する。金額はpricing変更の影響を受けるためDBへ固定保存せず、β report時にcurrent pricingで概算する。generic operation / failed pipeline log tableは引き続き作らない。

# 14. テスト設計

今回の規模では『基本設計書/詳細設計書を分けること』と『UT/ITを分けること』は別問題として扱う。文書は1冊でも、テスト境界はモジュール責務に沿って明確に分ける。

## 14.1 Unit Test (UT)

| 対象 | 主な検証 |
| --- | --- |
| RhymeNormalizer | ー、っ/Q、ん/N、拗音、o+u、e+i、元情報保持 |
| SoundScorer | 各サブスコア、重み、補正、0〜100 clamp、同一設定で再現可能 |
| CandidateSelector | 4/3/3、重複除外、Balanced cluster cap、Semantic多様性、枠不足fallback |
| Reroll exclusion | 過去Round候補の除外集合生成 |
| Config/version | 設定版が結果へ必ず保存される |

## 14.2 Integration Test (IT)

| 結合 | 主な検証 |
| --- | --- |
| Application Pipeline | Stub ReadingResolver + Stub LLM + real Domain + temporary SQLiteでInitial Generationをend-to-end接続 |
| Generation -> Persistence | selected / unselectedを含むevaluated pool全件、raw snapshot、candidateResultId mappingが一貫して保存される |
| Reading failure boundary | source unresolvedは外部生成前に停止、candidate unresolvedはcandidate単位除外、Resolver system failureはRound全体失敗 |
| candidateKey reconciliation | Generation duplicate、Semantic unknown / duplicate / missing keyを安全に処理する |
| Semantic independence | Semantic requestへreading / rhyme / Sound Scoreを渡さない |
| Reroll | stored sourceReading再利用、current Normalizer / Config、過去selected由来excludeTerms、同一SessionへのRound追加 |
| Session Query | 保存済みsnapshotをroundNumber / selectionRank順で返し、Scorer / Selectorを再実行しない。selected candidateへcurrent Feedback stateを付与する |
| Feedback | Candidate Like/DislikeとSound Feedbackを別系統でcurrent-state保存し、user ownershipを確認する |
| Persistence failure | Applicationが成功responseを返さず、atomic rollbackされる |
| M6 Persistence | schema / FK / UNIQUE / CHECK / migration / transaction correctnessはM6 Integration Testで継続保証する |
| Backend API boundary | JSON/Zod validation、固定beta user注入、HTTP status/error mapping、DTO masking、Feedback current-state DTO、Route Handler wiringを確認する |
| Web UI | Browser API client、latest Round表示、Feedback state、Scatter Plot interaction、responsive/accessibilityを確認する |
| Real Adapter contract | OpenAI Structured Output schema / mapping / candidateKey / reading batch / metadata / error mappingをnetworkなしで確認する |
| Reading provenance migration | 2 nullable JSON columnのadditive migration、legacy NULL、round-trip、destructive SQLなしを確認する |

M7のApplication test詳細は `docs/application-service-design-v0.1.md`、M8のAPI test詳細は `docs/backend-api-design-v0.1.md` を参照する。

## 14.3 E2E / β検証

M9ではPlaywrightでBrowser主要flowを確認する。

```text
Home -> Generation -> Session Result
Candidate Like / Dislike -> reload復元
Detail -> Scatter interaction
Sound Feedback -> reload復元
Reroll -> same Session new latest Round
direct reload / not found
keyboard操作
```

E2Eは専用temporary SQLite DBと固定beta userを使用し、production/local DBを汚さない。

通常PlaywrightはStub modeを維持し、LLM品質を決定論的E2Eに含めない。M10ではopt-in OpenAI smoke testを別commandで実施し、固定キーワードセット + personal usageを `docs/beta-evaluation-design-v0.1.md` に従って評価する。

# 15. 設計書の粒度（今回の進め方）

一般的なウォーターフォールでは、基本設計（外から見た振る舞い・全体構造）と詳細設計（内部ロジック・データ・I/F）を分けることがある。一方、文書を分割すること自体に品質上の必然性はない。

| 観点 | 今回の判断 |
| --- | --- |
| 規模 | 個人・小規模なので分割文書の同期コストが相対的に大きい |
| 要件変化 | β検証で評価式や正規化が変わるため、1冊の方が更新しやすい |
| 実装担当 | 当面は少人数。引き継ぎ境界より、責務とI/Fの明確さを優先 |
| UT/IT | モジュール/API/DB境界で分離可能。設計書ファイルを分ける必要はない |
| 将来 | チーム化・外部委託・公開規模拡大時に基本/詳細または仕様書群へ分割可能 |

したがってv0.1では本書を『基本+詳細の統合設計書』として運用し、実装が始まった後の細かな判断はDecision Logへ追加する。テストケースが増えた段階でTest Planを別文書化するのが適切である。

# 16. 未決定・設計中の項目

| ID | 項目 | 現状の扱い |
| --- | --- | --- |
| O-01 | 具体技術スタック | v0.1仮決定済み。Node.js 24 LTS / Next.js App Router / TypeScript / SQLite / Drizzle / Vitest / Playwright / OpenAI Responses API / npm / Git。 |
| O-02 | 具体LLMモデル | M10 initial defaultを `gpt-5.6-terra` に決定。Generation / Semantic / Readingをtask別envでoverride可能。β結果で再評価する。 |
| O-03 | Reading Resolver実装 | M10でOpenAI Responses APIによるreal providerを追加。candidateはbatch resolve。将来辞書/形態素解析providerへ差し替え可能。 |
| O-04 | Lyric Adjustment詳細 | 最大±10点枠のみ。β事例から追加 |
| O-05 | Balanced係数/cluster cap | 0.7/0.3、同cluster最大2をβ仮説として採用 |
| O-06 | relation taxonomy | 暫定集合を採用。実出力を見て統廃合 |
| O-07 | 性能目標 | generationTargetCount 60を維持。M10からexternal call duration / token usageをprovenanceとして記録し、βでlatency / costを実測する。固定SLOはまだ置かない。 |
| O-08 | User authentication | M8ではserver-side固定beta userを使用。authenticationではない。tester/public公開前にAuthenticatedUserResolverへ差し替えて設計する。 |
| O-09 | UI visual polish | M9でminimal UIを実装するが、copy / spacing / visual detailはβ feedback対象。v0.1で固定ブランド・design systemを作り込まない。 |
| O-10 | Source reading ambiguity | 多読語でResolverがユーザー意図と異なる可能性あり。M10ではmanual override UIを追加せず、固定baselineとpersonal βで必要性を観測する。 |

# 17. 実装への分解順

1. Domain skeleton: ReadingResult / normalized rhyme / score/result型を定義。

2. Rhyme Normalizer + Sound Scorerを実装し、UTで固定。

3. LLM Adapterのinterfaceとstubを実装。

4. Candidate Selectorをstub候補で実装し、4/3/3と多様性をUT。

5. Persistenceの論理モデルをSQLite + Drizzleへ落とす。

6. ReadingResolver Port / Stub、Persistence Ports、Generation / Reroll / Feedback / Session Query Application Servicesを結合し、Application Integration Testで固定。

7. Next.js Route Handlers + ZodでBackend APIを公開し、server-side固定beta user、HTTP error mapping、API DTO境界を実装。

8. Web UI（初期→結果→詳細、Reroll、2種類のFeedback、reload復元）を接続し、Playwright E2EでBrowser flowを固定。

9. OpenAI Responses API + Structured OutputsでReal LLM Adapter / batch Real Reading Resolverを接続し、Reading provenance migration・opt-in smoke・固定キーワードbaseline・personal β評価を実施。

## 17.1 Codexへ渡すときの単位

実装開始時は本書全体を一度に『作って』と渡すより、上記1〜9を小さなマイルストーンとして順に実装・テストさせる。

M7では `docs/application-service-design-v0.1.md` を詳細Source of Truthとする。

M8では `docs/backend-api-design-v0.1.md` を詳細Source of Truthとし、BrowserからuserIdを受け取らないこと、Route HandlerへDomain/Persistence ruleを埋め込まないこと、DB schemaを変更しないこと、M9以降へ進まないことを停止条件として扱う。

M9では `docs/web-ui-design-v0.1.md` を詳細Source of Truthとする。reload後のFeedback current-state復元のためM7/M8 read contractを最小拡張するが、DB schemaを変更しないこと、新しいUI/chart/state dependencyを追加しないこと、M10へ進まないことを停止条件として扱う。


M10では `docs/external-adapter-design-v0.1.md` と `docs/beta-evaluation-design-v0.1.md` を詳細Source of Truthとする。OpenAI SDK / Responses API compatibility gate、candidate Reading batch化、provenance用additive migrationを行う。default automated tests / E2EはStub modeのまま維持し、有料network callはopt-in smokeだけとする。

# 18. 設計完了の判定

- v0.1の主要ユースケースがモジュールとデータフローへ割り当てられている。
- LLMと決定論的ロジックの境界が明確である。
- ReadingResolver / LlmAdapter / PersistenceがApplication Portとして分離され、Infrastructure差し替え境界が明確である。
- Candidate Selectorのv0.1ルール（4/3/3）が実装可能な粒度で定義されている。
- スコア・正規化・Selector・Prompt・Modelの各バージョンを追跡できる。
- 新規生成 / リロール / Feedback / Session QueryのApplication責務と保存データが定義されている。
- source / candidate reading failure、candidateKey reconciliation、候補不足、Persistence failureの扱いが定義されている。
- UT/ITの責務境界が定義されている。
- Backend APIのvalidation、server-side beta user identity、HTTP error mapping、公開DTO境界が定義されている。
- Web UIのroute、Browser state、Feedback reload復元、Scatter Plot、accessibility、E2E境界が定義されている。
- OpenAI real adapter、batch Reading、provider provenance、Stub/OpenAI mode、opt-in smokeの境界が定義されている。
- β評価で見るReading / Generation / Sound / Semantic / Selector / latency / usageの問いと固定baselineが定義されている。
- 未決定事項が実装を阻害するものと、後決め可能なものに分離されている。
