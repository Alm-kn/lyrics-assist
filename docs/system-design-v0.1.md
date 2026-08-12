# 歌詞作成補助ツール システム設計書 v0.1.4 β

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
| LLM | 外部LLM APIをAdapter越しに利用。具体モデルは設計・PoCで選定 |
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
| LLM API | OpenAI Responses API + Structured Outputs | 候補生成・意味評価をJSON Schemaに沿う構造化データとして受け取りやすい。具体モデルは未固定。 |
| Package Manager | npm | Node.js同梱で追加導入が不要。初回環境構築を単純化する。 |
| Version Control | Git（GitHub Privateは推奨・任意） | ローカル変更履歴を必須とし、GitHubはバックアップ・共有・将来のPR運用に利用できる。 |

注: v0.1では上記を仮決定とする。特にDB・LLMモデル・Reading Resolver実装は、少人数試用やβ結果に応じて変更可能な境界を維持する。

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
                                 |-- Stub ReadingResolver
                                 |-- Stub / Real LLM Adapter
                                 `-- SQLite / Drizzle Persistence
                                           |
                                           +----> [ External LLM API ]
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
| Backend API | HTTP受付、validation、user識別、レスポンス整形 | Application Services |
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

日本語表記から比較に必要な確定readingを取得する能力は、Domain moduleではなくApplication所有のPortとして定義する。辞書・形態素解析・LLM等の具体方式はInfrastructure実装へ隔離する。

概念I/F:

```ts
type ResolveReadingRequest = {
  surface: string;
  readingHint?: string;
};

type ReadingResolution =
  | {
      status: "resolved";
      reading: ReadingResult;
    }
  | {
      status: "unresolved";
    };

interface ReadingResolver {
  resolve(request: ResolveReadingRequest): Promise<ReadingResolution>;
}
```

Candidate Generationが返す `readingHint` は補助情報であり、確定readingとして盲信しない。Resolverが最終的な `ReadingResult` を返す。

失敗時の扱い:

```text
source unresolved
  -> Generation Use Case失敗
  -> LLM Candidate Generationを呼ばない
  -> DB保存なし

candidate unresolved
  -> 該当candidateだけ後段から除外
  -> raw Generation Resultには残す

ReadingResolver system failure / throw
  -> Round全体失敗
  -> DB保存なし
```

M7ではfixture injection型のdeterministic `StubReadingResolver` のみ実装する。real providerはReal External Adapter接続Milestoneで実装する。

Rhyme NormalizerはReadingResolverを内部から呼ばず、確定済みReadingResultを受け取る責務分離を維持する。

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

M4ではfixture injection型のdeterministic Stubのみ実装し、実LLM接続は後続Milestoneで行う。

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
  }
}
```

候補とSemantic結果は配列indexではなく `candidateKey` で対応付ける。

詳細は `docs/llm-adapter-design-v0.1.md` を参照する。

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
- PreferenceProfile / reevaluation / operation log / performance timingはM6では実装しない。

詳細は `docs/persistence-design-v0.1.md` を参照する。

## 8.2 論理Entity

| Entity | 主なフィールド | 目的 |
| --- | --- | --- |
| User | id, created_at | owner / testerのデータ所有境界。v0.1では認証accountではない |
| GenerationSession | id, user_id, source_surface, source_reading, created_at | 一連のsource word探索単位 |
| GenerationRound | id, session_id, round_number, input条件, raw result snapshots, config versions | 初回/リロール1回分の完成した実験snapshot |
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

# 9. Backend API（論理I/F）

| Method | Path | 用途 |
| --- | --- | --- |
| POST | /api/generations | 新規キーワードからSession + Round 1生成 |
| POST | /api/sessions/{id}/reroll | 同一Sessionへ次Roundを追加 |
| GET | /api/sessions/{id} | Sessionと表示対象Roundを取得 |
| POST | /api/feedback/candidate | Like / Dislike保存 |
| POST | /api/feedback/sound-score | 低すぎる / 妥当 / 高すぎる保存 |

APIキー等のLLM秘密情報はBrowserへ渡さず、Backendのみで保持する。

# 10. UI状態設計

## 10.1 初期画面

```text
[ App Title ]

[ keyword input                         ]
                 Enter / Generate
```

説明や高度設定はv0.1では表示しない。

## 10.2 結果画面

```text
keyword

candidate 1     candidate 2
candidate 3     candidate 4
...
candidate 9     candidate 10

[ reroll ]                     [ detail ]
```

候補のselectionCategoryは通常画面では表示しない。ユーザーはまず候補を『言葉』として見る。

## 10.3 詳細画面

```text
Semantic 100
   |
   |      *       *   Balanced
   |  *
   |
   |              *   Sound
   | *
   +-------------------------- Sound 100
  0

Hover / Click:
- word
- sound score + short reason
- semantic score + short reason
- β sound-score feedback
```

XY散布図は結果説明に加え、Candidate Selectorが3方向へ適切に候補を散らせているか確認するβ検証UIとしても利用する。

# 11. βフィードバック設計

| FB | 質問 | 用途 |
| --- | --- | --- |
| Candidate Like/Dislike | この候補は作詞の発想として良いか | 将来Preference Profile |
| Sound Score Feedback | 語感点は低すぎる/妥当/高すぎるか | ScoringConfig調整 |

2種類のFBは意味が異なるため、同一フラグへ統合しない。β分析ではscoringConfigVersion単位で集計できるようにする。

# 12. 設定・バージョニング

| Version対象 | 例 | 変更時の意味 |
| --- | --- | --- |
| normalizerVersion | rhyme-v0.1 | 韻正規化ルール変更 |
| scoringConfigVersion | sound-v0.1 | 語感重み/補正変更 |
| selectionConfigVersion | selector-v0.1 | 4/3/3・多様性条件変更 |
| generationPromptVersion | candidate-v0.1 | 候補生成方針変更 |
| semanticPromptVersion | semantic-v0.1 | 意味評価基準変更 |
| modelIdentifier | provider/model-id | LLMモデル変更 |

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

- LLM APIキーはBackendのみで管理し、Browserへ埋め込まない。
- LLMへ送信する情報はキーワード・候補・評価に必要な最小限とする。
- Application Use Caseは `userId` でresource ownershipをscopeし、owner / testerデータの混在を防ぐ。v0.1ではauthentication自体はまだ実装しない。
- 公開範囲拡大時に認証・rate limit・利用規約等を再設計する。v0.1では先取りしない。
## 13.3 観測性

β調整のため、Session ID / Round / candidate pool size / selected / unselected、category allocation、fallback、version群等を後から追跡できるデータ構造を維持する。

LLM latency / failure / token usage / performance timing等のoperation-level観測性はM7でも永続化しない。Application pipeline完成後、実測されたbottleneckとβ分析需要を見て必要なstage timing / operation logを設計する。

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
| Session Query | 保存済みsnapshotをroundNumber / selectionRank順で返し、Scorer / Selectorを再実行しない |
| Feedback | Candidate Like/DislikeとSound Feedbackを別系統でcurrent-state保存し、user ownershipを確認する |
| Persistence failure | Applicationが成功responseを返さず、atomic rollbackされる |
| M6 Persistence | schema / FK / UNIQUE / CHECK / migration / transaction correctnessはM6 Integration Testで継続保証する |

M7の詳細test caseは `docs/application-service-design-v0.1.md` を参照する。

## 14.3 E2E / β検証

E2Eは初期/結果/詳細/リロール/FBの主要フローを少数ケースで確認する。LLM品質そのものは決定論的UTに含めず、別途固定キーワードセットを用いたβ評価として扱う。

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
| O-02 | 具体LLMモデル | 未決定。OpenAI Responses API + Structured Outputsを利用し、具体モデルはLLM Adapter越しに比較PoC後に選定。 |
| O-03 | Reading Resolver実装 | M7でApplication Port + deterministic Stubを実装。real providerはReal External Adapter接続Milestoneで実装。 |
| O-04 | Lyric Adjustment詳細 | 最大±10点枠のみ。β事例から追加 |
| O-05 | Balanced係数/cluster cap | 0.7/0.3、同cluster最大2をβ仮説として採用 |
| O-06 | relation taxonomy | 暫定集合を採用。実出力を見て統廃合 |
| O-07 | 性能目標 | generationTargetCount 60をv0.1 defaultとする。M7ではtimingを永続化せず、実pipeline完成後の実測を基にSLO / instrumentationを検討。 |

# 17. 実装への分解順

1. Domain skeleton: ReadingResult / normalized rhyme / score/result型を定義。

2. Rhyme Normalizer + Sound Scorerを実装し、UTで固定。

3. LLM Adapterのinterfaceとstubを実装。

4. Candidate Selectorをstub候補で実装し、4/3/3と多様性をUT。

5. Persistenceの論理モデルをSQLite + Drizzleへ落とす。

6. ReadingResolver Port / Stub、Persistence Ports、Generation / Reroll / Feedback / Session Query Application Servicesを結合し、Application Integration Testで固定。

7. Backend APIを公開。

8. 最小Web UI（初期→結果）を接続。

9. XY詳細 + 2種類のFBを追加。

10. Real LLM Adapter / Real Reading Resolverを接続し、固定キーワードセットでβ評価。

## 17.1 Codexへ渡すときの単位

実装開始時は本書全体を一度に『作って』と渡すより、上記1〜10を小さなマイルストーンとして順に実装・テストさせる。

特にM7では `docs/application-service-design-v0.1.md` を詳細Source of Truthとし、Applicationからconcrete Infrastructureへ直接依存しないこと、M8以降へ進まないことを停止条件として扱う。

# 18. 設計完了の判定

- v0.1の主要ユースケースがモジュールとデータフローへ割り当てられている。
- LLMと決定論的ロジックの境界が明確である。
- ReadingResolver / LlmAdapter / PersistenceがApplication Portとして分離され、Infrastructure差し替え境界が明確である。
- Candidate Selectorのv0.1ルール（4/3/3）が実装可能な粒度で定義されている。
- スコア・正規化・Selector・Prompt・Modelの各バージョンを追跡できる。
- 新規生成 / リロール / Feedback / Session QueryのApplication責務と保存データが定義されている。
- source / candidate reading failure、candidateKey reconciliation、候補不足、Persistence failureの扱いが定義されている。
- UT/ITの責務境界が定義されている。
- 未決定事項が実装を阻害するものと、後決め可能なものに分離されている。
