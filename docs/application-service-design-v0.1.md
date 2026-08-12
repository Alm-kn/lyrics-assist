# Application Service 詳細設計 v0.1.2

更新日: 2026-08-12

> M9追補: Session Queryでcurrent Feedback stateを返し、reload後のUI状態をDBと一致させるread contractを追加した。DB schema / Feedback write policyは変更しない。
>
> M10追補: real Reading Resolver接続時のlatency / costを抑えるため、candidate readingをbatch resolveできるPort contractとprovenance metadataを追加する。Source readingの単体resolveは維持する。

## 1. 位置づけ

本書はM7 - Application Services / Pipeline Integrationの詳細設計を定義する。

M0〜M6では、Rhyme Normalizer、Sound Scorer、LLM Adapter Port / Stub、Candidate Selector、Persistenceを独立して実装した。

M7の目的は、これらを実際のユーザー操作単位へ編成し、

```text
Generate
Reroll
Feedback
Session Query
```

というApplication Use Caseとして接続することである。

Application層はDomain ruleを再実装せず、処理順序・Port呼出し・エラー境界・Persistence要求を管理する。

---

## 2. M7で追加するもの

M7では以下を実装する。

- ReadingResolver Application Port
- deterministic StubReadingResolver
- Persistence Application Ports
- M6 Persistence implementationとの接続
- Generation Service
- Reroll Service
- Feedback Service
- Session Query Service
- Application-level error contract
- Application pipeline Integration Test

M7では以下を実装しない。

- real Reading Resolver
- real LLM
- Backend API / Route Handler
- UI
- authentication
- Preference Service / PreferenceProfile
- automatic retry policy
- failed pipeline persistence
- operation log
- performance timing
- token / cost logging
- additional candidate generation for shortage
- parallel pipeline optimization

real Reading Resolverはreal External Adapter接続時に実装する。

---

## 3. Architecture

M7以降の依存方向は以下をSource of Truthとする。

```text
                 ┌──────────── Domain ────────────┐
                 │ Rhyme Normalizer               │
Application ────▶│ Sound Scorer                   │
                 │ Candidate Selector             │
                 └─────────────────────────────────┘
        │
        │ uses
        ▼
┌──────────── Application Ports ────────────┐
│ ReadingResolver                           │
│ LlmAdapter                                │
│ RoundPersistencePort                     │
│ SessionQueryPort                         │
│ FeedbackPersistencePort                  │
└───────────────────────────────────────────┘
        ▲
        │ implements
        │
Infrastructure
├─ StubReadingResolver
├─ StubLlmAdapter / future Real LlmAdapter
└─ SQLite / Drizzle Persistence
```

禁止する依存:

```text
Domain -> Application
Domain -> Infrastructure
Application -> concrete Infrastructure implementation
```

ApplicationはPort型のみを知り、Infrastructure側がApplication Portを実装する。

M6で実装済みRepositoryをM7 Portへ接続するための最小Adapter / interface alignmentは許容する。

---

## 4. Application Use Cases

M7では以下の4 Use Caseを実装する。

| Use Case | 目的 |
| --- | --- |
| Generation Service | 新規source wordからSession + Round #1を完成させる |
| Reroll Service | 既存Sessionへ次のGenerationRoundを追加する |
| Feedback Service | Candidate / Sound Score Feedbackの現在値を保存する |
| Session Query Service | 保存済みSession / Roundの当時の表示結果を取得する |

Preference ServiceはM7では作成しない。

---

## 5. User scope

Application Use Caseは、将来testerデータが混在しないよう `userId` をscopeとして受け取る。

v0.1ではauthenticationを実装しないが、Application contractとしてowner identityを明示する。

概念上:

```text
Generation:
  userId + sourceSurface

Reroll / Query:
  userId + sessionId

Feedback:
  userId + candidateResultId
```

Persistence側ではSession / CandidateResultのownerを、

```text
CandidateResult
-> GenerationRound
-> GenerationSession
-> User
```

から確認可能とする。

別User所有のresourceへアクセスした場合は、存在有無を外部へ漏らさないため `NOT_FOUND` 相当として扱う。

---

## 6. Reading Resolver Port

### 6.1 目的

Rhyme Normalizerは確定済みかなreadingを入力とする。

Reading providerはApplication-owned Portとして差し替え可能にし、Stub / real providerをInfrastructureへ隔離する。

M10ではreal providerが外部APIを利用するため、candidate 60件を1件ずつnetwork callしないようbatch capabilityを追加する。

### 6.2 Single resolve contract

Source word用の単体contractを維持する。

```ts
type ResolveReadingRequest = {
  surface: string;
  readingHint?: string;
};

type ReadingResolverMetadata = {
  resolverIdentifier: string;
  promptVersion: string;
  inferenceConfigVersion: string;
  providerResponseId?: string;
  durationMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

type ReadingResolution =
  | {
      status: "resolved";
      reading: ReadingResult;
      metadata: ReadingResolverMetadata;
    }
  | {
      status: "unresolved";
      metadata: ReadingResolverMetadata;
    };
```

`readingHint` はCandidate Generationから返された補助情報であり、確定readingとして扱わない。

### 6.3 Batch resolve contract

candidate reading用:

```ts
type ResolveReadingBatchItem = {
  requestKey: string;
  surface: string;
  readingHint?: string;
};

type ResolveReadingBatchRequest = {
  items: readonly ResolveReadingBatchItem[];
};

type ReadingBatchItemResult =
  | {
      requestKey: string;
      status: "resolved";
      reading: ReadingResult;
    }
  | {
      requestKey: string;
      status: "unresolved";
      reading: null;
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

実コードでは既存Domain型へ合わせて最小調整してよい。

### 6.4 Source word

Initial Generationではsource wordを `resolve` へ渡す。

```text
resolved
-> source readingとして使用
-> source reading resolution snapshotをPersistenceへ渡す

unresolved
-> SOURCE_READING_UNRESOLVED
-> Candidate Generationを呼ばない
-> Session / Roundを保存しない

Resolver system failure
-> READING_RESOLVER_FAILED
-> Session / Roundを保存しない
```

Rerollでは従来どおりSession保存済みsource readingを再利用し、source Reading Resolverを再呼出ししない。

### 6.5 Candidate word

Generationのunique candidateKey filter後、candidate群を1つの `resolveBatch` requestへ渡す。

`requestKey` にはcandidateKeyを使用してよい。

batch resultをrequestKeyでreconcileする。

```text
unique matching resolved
-> Rhyme / Sound処理へ進む

item unresolved
-> 該当candidateのみ除外

missing / duplicate / unknown requestKey
-> 1対1対応できない該当candidateを除外

batch-level provider / parse / refusal failure
-> Round全体をREADING_RESOLVER_FAILED
```

candidate readingのraw batch result / metadataはcompleted RoundのPersistence snapshotへ残す。

### 6.6 StubReadingResolver

Stubはfixture injection型deterministic behaviorを維持し、`resolveBatch` も同じfixtureから決定論的に返す。

Stub metadataはreal providerと同じcontractへ合わせるが、network / random / LLM / environment dependencyを追加しない。

### 6.7 Real provider

M10のreal providerはInfrastructure `OpenAiReadingResolver` とする。

OpenAI API固有contract、model、prompt、Structured Outputsの詳細は `docs/external-adapter-design-v0.1.md` を参照する。

---

## 7. Generation Application Config

Candidate Generationのtarget countはApplication側の設定とする。

```ts
type GenerationApplicationConfig = {
  generationTargetCount: number;
};
```

v0.1 default:

```text
60
```

LLM Adapter自身がdefault 60というProduct判断を持たない。

実際に使用した値はGenerationRoundへ保存する。

---

## 8. Initial Generation Service I/F

概念I/F:

```ts
type GenerateInitialRoundInput = {
  userId: string;
  sourceSurface: string;
};

type CandidateFeedbackValue = "like" | "dislike";
type SoundScoreFeedbackValue = "low" | "valid" | "high";

type CandidateFeedbackState = {
  candidate: CandidateFeedbackValue | null;
  soundScore: SoundScoreFeedbackValue | null;
};

type GeneratedCandidateView = {
  candidateResultId: string;
  candidateKey: CandidateKey;
  surface: string;
  reading: string;
  sound: SoundScoreResult;
  semantic: SemanticResult;
  selection: SelectedCandidate;
  feedback: CandidateFeedbackState;
};

type GeneratedRoundView = {
  sessionId: string;
  roundId: string;
  roundNumber: number;
  source: {
    surface: string;
    reading: string;
  };
  candidates: readonly GeneratedCandidateView[];
};

interface GenerationService {
  generateInitialRound(
    input: GenerateInitialRoundInput,
  ): Promise<GeneratedRoundView>;
}
```

Application outputではUI / Feedbackが必要とするselected candidateのみ返す。

unselected evaluated candidateはDBへ保存するが、通常のApplication responseには含めない。

Initial Generation / Reroll直後の新規CandidateResultはfeedback未登録のため、`feedback.candidate` / `feedback.soundScore` はともに `null` とする。Session QueryではPersistenceからcurrent stateを復元する。

---

## 9. Initial Generation Pipeline

処理順を以下で固定する。

```text
1. basic input precondition
2. Source Reading Resolution
3. Source Rhyme Normalization
4. Candidate Generation
5. generation candidateKey ambiguity filter
6. Candidate Reading Batch Resolution
7. candidate reading result reconciliation
8. Candidate Rhyme Normalization
9. Sound Scoring
10. Semantic Evaluation
11. Semantic result reconciliation
12. Candidate Selector
13. Completed Round Snapshot assembly
14. Persistence Portへatomic save要求
15. persisted ID mappingとselected resultを結合
16. GeneratedRoundViewを返す
```

ApplicationはSound ScorerのformulaやCandidate Selectorの4/3/3 ruleを再実装しない。

---

## 10. Basic input precondition

M8のHTTP validationとは別に、Application Use Caseとして最低限以下を拒否する。

```text
userId = empty
sourceSurface.trim() = empty
```

Application層では過度な文字種validationは行わない。

API-specific validationはM8の責務。

---

## 11. Source processing

Initial Generation:

```text
sourceSurface
↓
ReadingResolver
↓
ReadingResult
↓
Rhyme Normalizer
↓
source RhymeRepresentations
```

Source Reading Resolutionが `unresolved` なら `SOURCE_READING_UNRESOLVED` として終了する。

ReadingResolverがthrowした場合は `READING_RESOLVER_FAILED` として終了する。

どちらもPersistenceは行わない。

---

## 12. Candidate Generation

既存M4 `LlmAdapter.generateCandidates` を使用する。

Request:

```text
source {
  surface
  reading
}

targetCount = GenerationApplicationConfig.generationTargetCount

excludeTerms = []
```

Initial GenerationではexcludeTermsは空。

Rhyme / Sound情報をCandidate Generation Adapter contractへ追加しない。

Adapterがthrowした場合は `CANDIDATE_GENERATION_FAILED`。

Persistenceは行わない。

ApplicationでLLM retryを追加しない。retry / timeout policyはAdapter責務。

---

## 13. Generation candidateKey integrity

raw Generation Resultはそのまま保持する。

一方、後段pipelineでは `candidateKey` が一意に追跡可能でなければならない。

同じcandidateKeyがGeneration Result内に複数存在する場合、そのkeyに属する候補をすべて後段から除外する。

どれか1件を推測で代表採用しない。

raw `GenerateCandidatesResult` には元の重複を残す。

このfilterはM5 Selectorのduplicate-key hard exclusionより前に行う。

理由はSemantic Evaluation結果をcandidateKeyで安全に対応付ける必要があるため。

---

## 14. Candidate Reading / Sound processing

generation candidateKey integrityを通過したcandidateをまとめてReadingResolverへ渡す。

```text
[
  candidateKey
  surface
  readingHint?
]
↓
ReadingResolver.resolveBatch
↓
requestKey(candidateKey) reconciliation
```

candidate 1件ごとのreal external callを行わない。

valid resolved candidateのみ、

```text
ReadingResult
↓
Rhyme Normalizer
↓
Sound Scorer(source rhyme, candidate rhyme)
```

へ進める。

item-level `unresolved` / missing / duplicate responseはそのcandidateを除外する。

batch-level system failure / refusal / parse failureはRound全体を `READING_RESOLVER_FAILED` とする。

Sound ScorerはM3実装をそのまま使用し、Application側でSound Scoreを再計算・補正しない。

raw candidate Reading batch resultは、completed Roundとなる場合Persistence snapshotへ渡す。

---

## 15. Semantic Evaluation

Semantic Evaluationへ送るcandidateは、

> candidateKeyが一意で、Reading / Rhyme / Sound処理まで完了したcandidate

のみ。

Requestへ渡す情報:

```text
source {
  surface
}

candidates [
  {
    candidateKey
    surface
  }
]
```

以下をSemantic Evaluatorへ渡さない。

- reading
- rhyme
- soundScore
- Sound Score breakdown

Sound / Semantic軸の独立性を維持する。

Adapterがthrowした場合は `SEMANTIC_EVALUATION_FAILED`。

Persistenceは行わない。


## 16. Semantic result reconciliation

raw `EvaluateSemanticsResult` はそのままRound snapshotとして保持する。

CandidateResultへ進めるためのmappingではcandidateKey integrityを確認する。

### 16.1 unknown result key

Generation / pre-semantic poolに存在しないcandidateKeyのSemantic ResultはCandidateResultへprojectionしない。

raw Semantic Resultには残す。

### 16.2 duplicate semantic key

同一candidateKeyについて複数Semantic Resultが存在する場合、そのcandidateは曖昧なのでCandidateResultへ進めない。

### 16.3 missing semantic result

pre-semantic candidateに対応するSemantic Resultが存在しない場合、そのcandidateをCandidateResultへ進めない。

### 16.4 valid candidate

以下を満たすcandidateのみevaluated poolへ入る。

```text
unique generation candidateKey
resolved reading
valid rhyme
SoundScoreResultあり
exactly one matching SemanticResult
```

M7では新しいpairwise similarityやembedding checkを追加しない。

---

## 17. Zero-candidate / shortage policy

### 17.1 zero evaluated candidates

Semantic reconciliation後にCandidateResultへ進められるcandidateが0件の場合:

```text
NO_EVALUABLE_CANDIDATES
```

としてRoundを失敗させる。

DBへSession / Roundを保存しない。

M6ではfailed pipeline logを意図的に作っていないため、失敗したraw Adapter resultはDBへ残らない。

必要性がβで確認された場合にfailed operation persistenceを別途設計する。

### 17.2 evaluated candidates >= 1

1件以上evaluated candidateがあればCandidate Selectorを実行する。

Selector結果が10件未満でも正常なcompleted Roundとして扱う。

### 17.3 selected = 0

evaluated pool自体は存在するが、source/exclude等のhard exclusionによりSelector結果が0件になる場合も、completed Roundとして保存してよい。

これは特にrerollでLLMがexcludeTermsを無視した場合の分析に有用。

### 17.4 additional generation

10件不足を理由として追加Candidate Generationを行わない。

```text
8 selected
-> 8件でcompleted Round
```

とする。

---

## 18. Candidate Selector integration

M5 Candidate Selectorへ渡す。

```text
source
evaluated candidates
excludeTerms
SelectionConfig
```

Initial Generationでは `excludeTerms = []`。

Rerollでは `excludeTerms = prior selected surfaces`。

Applicationは、

- 4/3/3
- Balanced formula
- cluster cap
- fallback
- canonical duplicate

を再実装しない。

Selector resultをそのままselection source of truthとして使用する。

---

## 19. Completed Round Snapshot

Persistenceへ渡す前にApplicationでRoundの意味上の結果を完成させる。

Snapshotは概念上以下を含む。

```text
User / Session context
Round conditions

raw GenerateCandidatesResult
raw Candidate Reading Batch Result
raw EvaluateSemanticsResult

source Reading Resolution + metadata
source Reading / Rhyme
evaluated candidates:
  ReadingResult
  RhymeRepresentations
  SoundScoreResult
  SemanticResult

SelectionResult

ScoringConfig
SelectionConfig
Normalizer version
generation target count
excludeTerms
```

ApplicationはDB row型を作らない。

Application Port用のDomain-oriented snapshot contractを定義し、Infrastructure PersistenceがM6 row / JSONへmappingする。

---

## 20. Persistence Application Ports

M7ではPersistenceをApplication Port越しに利用する。

概念上3 Portへ分ける。

### 20.1 RoundPersistencePort

```ts
interface RoundPersistencePort {
  saveInitialRound(
    input: CompletedInitialRoundSnapshot,
  ): Promise<PersistedRoundReferences>;

  saveRerollRound(
    input: CompletedRerollRoundSnapshot,
  ): Promise<PersistedRoundReferences>;
}
```

Persistence側がtransactionを実行する。

Application Service自身がDrizzle transactionを開始しない。

### 20.2 PersistedRoundReferences

保存後、ApplicationがFeedback可能なIDへ変換できるよう以下を返す。

```ts
type PersistedRoundReferences = {
  sessionId: string;
  roundId: string;
  candidateResults: readonly {
    candidateKey: CandidateKey;
    candidateResultId: string;
  }[];
};
```

`candidateKey` と `candidateResultId` は別identity。

ApplicationはこのmappingをSelectionResultと結合してresponseを構築する。

### 20.3 SessionQueryPort

```ts
interface SessionQueryPort {
  findSessionContext(input: {
    userId: string;
    sessionId: string;
  }): Promise<SessionContext | null>;

  getSessionView(input: {
    userId: string;
    sessionId: string;
  }): Promise<PersistedSessionView | null>;
}
```

`SessionContext` はrerollに必要な最小情報。

概念上:

```text
sessionId
userId
sourceSurface
sourceReading
priorRounds:
  roundNumber
  selected candidates in selectionRank order
```

`PersistedSessionView` は通常表示用のselected candidate snapshotに加えて、各CandidateResultのcurrent Feedback stateを含む。

概念:

```text
selected candidate:
  persisted score / semantic / selection snapshot
  feedback:
    candidate: like | dislike | null
    soundScore: low | valid | high | null
```

Infrastructureは `candidate_feedback` / `sound_score_feedback` をcandidate_result_id単位で参照し、rowが存在しない場合は `null` として返す。

Feedback履歴は返さない。Infrastructure rowをApplicationへ返さない。

### 20.4 FeedbackPersistencePort

```ts
interface FeedbackPersistencePort {
  upsertCandidateFeedback(input: {
    userId: string;
    candidateResultId: string;
    value: "like" | "dislike";
  }): Promise<"saved" | "not_found">;

  upsertSoundScoreFeedback(input: {
    userId: string;
    candidateResultId: string;
    value: "low" | "valid" | "high";
  }): Promise<"saved" | "not_found">;
}
```

Infrastructureはuser ownershipをDB relationから確認する。

別User所有の場合も `"not_found"`。

M6 Feedback tableへ `user_id` を追加しない。

---

## 21. Persistence transaction responsibility

責務は以下。

```text
Application:
  completed Roundをatomicに保存してほしい

Infrastructure Persistence:
  BEGIN
  INSERT / ensure
  COMMIT / ROLLBACK
```

Applicationは `db.transaction(...)` を直接呼ばない。

M6で実装済みのConfig ensure、Initial Round transaction、Reroll transaction、rollbackを再利用する。

Persistenceが失敗した場合、Applicationは成功responseを返さない。

---

## 22. Reroll Service I/F

概念I/F:

```ts
type RerollInput = {
  userId: string;
  sessionId: string;
};

interface RerollService {
  reroll(input: RerollInput): Promise<GeneratedRoundView>;
}
```

Output形はInitial Generationと同じ `GeneratedRoundView` を再利用する。

---

## 23. Reroll pipeline

```text
1. SessionContext load
2. sourceSurface / sourceReading取得
3. next roundNumber決定
4. prior selected candidateからexcludeTerms構築
5. source readingを再解決せずstored sourceReadingを使用
6. current Rhyme Normalizerでsource再正規化
7. Candidate Generation
8. Initial Generationと同じcandidate processing
9. current ScoringConfig / SelectionConfigで評価・選抜
10. Completed Reroll Snapshot assembly
11. Persistence Portへatomic save要求
12. GeneratedRoundView返却
```

---

## 24. Reroll config version

Session内でConfig versionを固定しない。

例:

```text
Round #1
  sound-v0.1
  selection-v0.1

Round #2
  sound-v0.2
  selection-v0.2
```

を許容する。

各Roundはその時点のcurrent configをsnapshotする。

M6 Persistenceはreroll transaction内で新しいConfig versionをensure可能であることを前提とする。

---

## 25. Reroll source reading

RerollではReadingResolverへsource wordを再問い合わせしない。

GenerationSessionに保存済みの、

```text
sourceSurface
sourceReading
```

を使用する。

ただしRhyme RepresentationはそのRoundのcurrent Normalizer versionで再生成する。

これにより、

```text
同じsource reading
+
Normalizer version変更
```

をRound単位で比較できる。

---

## 26. Reroll excludeTerms

excludeTermsは同一Sessionの過去全Roundで実際にselectedされたcandidate surfaceから構築する。

順序:

```text
Round number ascending
  ↓
selectionRank ascending
```

exact duplicateは最初の出現だけを残してよい。

未選抜candidateはexcludeTermsへ含めない。

意味:

```text
excludeTerms
= 既に表示したので次Roundでは再提示しない語

excludeTerms
!= explicit Dislike
```

同じexcludeTermsを、

```text
LLM Candidate Generation
Candidate Selector
```

の両方へ渡す。

LLM側ではgeneration hint、Selector側ではhard exclusionとして機能する。

---

## 27. Reroll session not found / ownership

`userId + sessionId` でSessionが見つからない場合:

```text
SESSION_NOT_FOUND
```

別User所有のSessionも同じ扱い。

Persistenceは行わない。

---

## 28. Reroll concurrency

v0.1ではowner中心の小規模βのため、同一Sessionへ完全同時に複数rerollするケースの自動retryは実装しない。

DBの、

```text
UNIQUE(session_id, round_number)
```

を最終整合性ガードとする。

concurrent conflictが発生した場合はPersistence failureとして扱う。

必要性が実測された時点でretry / lockingを設計する。

---

## 29. Feedback Service I/F

概念I/F:

```ts
interface FeedbackService {
  submitCandidateFeedback(input: {
    userId: string;
    candidateResultId: string;
    value: "like" | "dislike";
  }): Promise<void>;

  submitSoundScoreFeedback(input: {
    userId: string;
    candidateResultId: string;
    value: "low" | "valid" | "high";
  }): Promise<void>;
}
```

Feedbackはcurrent state。

Applicationは履歴eventを作らない。

Persistence Portが `"not_found"` を返した場合:

```text
CANDIDATE_RESULT_NOT_FOUND
```

として扱う。

M8でHTTPへmappingする。

---

## 30. Session Query Service I/F

概念I/F:

```ts
interface SessionQueryService {
  getSession(input: {
    userId: string;
    sessionId: string;
  }): Promise<SessionView>;
}
```

概念output:

```ts
type SessionView = {
  sessionId: string;
  source: {
    surface: string;
    reading: string;
  };
  rounds: readonly {
    roundId: string;
    roundNumber: number;
    candidates: readonly GeneratedCandidateView[];
  }[];
};
```

通常Queryではselected candidateのみ返す。

unselected candidate poolは分析用Persistence dataであり、通常UI responseへ含めない。

各selected candidateにはcurrent Feedback stateを付与する。

```text
feedback.candidate:
  like | dislike | null

feedback.soundScore:
  low | valid | high | null
```

score / semantic / selectionは「当時のsnapshot」を返す一方、Feedbackはcurrent-state tableの現在値を返す。これはFeedbackが履歴ではなく現在値として設計されているためである。

Roundは `roundNumber` ascending。

Candidateは `selectionRank` ascending。

Query時にRhyme Normalizer、Sound Scorer、Semantic Evaluation、Candidate Selectorを再実行しない。

Sessionが存在しない、または別User所有の場合は `SESSION_NOT_FOUND`。


## 31. Application Error Contract

M7ではApplication-levelの識別可能なerror codeを定義する。

最低限:

```text
INVALID_INPUT
SOURCE_READING_UNRESOLVED
READING_RESOLVER_FAILED
CANDIDATE_GENERATION_FAILED
SEMANTIC_EVALUATION_FAILED
NO_EVALUABLE_CANDIDATES
SESSION_NOT_FOUND
CANDIDATE_RESULT_NOT_FOUND
PERSISTENCE_FAILED
CONFIG_VERSION_CONFLICT
```

M8 Backend APIはこのcodeをHTTP status / responseへmappingする。

M7ではHTTP statusを決定しない。

Errorには必要に応じて元errorをcauseとして保持してよい。

APIへ内部stack / DB detailを露出する設計にはしない。

---

## 32. Error / Persistence behavior matrix

| Error | Round保存 | Session保存 | Retry |
| --- | --- | --- | --- |
| invalid input | なし | なし | なし |
| source unresolved | なし | なし | なし |
| ReadingResolver system failure | なし | なし | Applicationではしない |
| Candidate Generation failure | なし | なし | Adapter責務 |
| candidate単体 unresolved | 他candidate継続 | completed時のみ | なし |
| duplicate generation candidateKey | 該当key除外 | completed時のみ | なし |
| Semantic Adapter failure | なし | なし | Adapter責務 |
| missing / duplicate Semantic result | 該当candidate除外 | completed時のみ | なし |
| zero evaluated candidates | なし | なし | なし |
| selected < 10 | completed Round保存 | Initialなら保存 | なし |
| selected = 0 / evaluated > 0 | completed Round保存 | Initialなら保存 | なし |
| Persistence failure | rollback | rollback | なし |
| reroll session not found | なし | 既存DB変更なし | なし |
| Feedback target not found | なし | 既存DB変更なし | なし |

failed pipeline自体をDBへ記録する機能はM7では作らない。

---

## 33. Runtime integrity boundary

M4 Adapter contractはTypeScript型を持つが、M7ではcandidateKey mapping integrityをApplication側でも確認する。

対象:

- duplicate generation candidateKey
- unknown semantic candidateKey
- duplicate semantic candidateKey
- missing semantic candidateKey

deep object schema validationをApplication全体へ広げない。

real LLM Structured Output validationはReal Adapter側の責務としてM10で実装する。

M7 Stub / Applicationではpipeline identityと必須数値の有限性等、Persistenceへ不正値を渡さないための最小guardに留める。

---

## 34. Pipeline concurrency / performance

M7では正しさと再現性を優先し、Sound / Semantic処理の並列化を要件にしない。

実装はsequentialでもよい。

将来、

```text
Sound Scoring
Semantic Evaluation
```

を並行化してもProduct結果が変わらないよう、Application contractを設計する。

performance timing instrumentationはM7の実pipelineが完成した後の将来作業として扱い、M7では保存しない。

---

## 35. Integration Test strategy

M7以降のApplication Integration Testは本物のDomain module + Stub external adapter + temporary SQLite Persistenceで接続する。M10でもdefault testはStubのままnetworkを使用しない。

```text
Application Service
├─ StubReadingResolver
├─ StubLlmAdapter
├─ real Rhyme Normalizer
├─ real Sound Scorer
├─ real Candidate Selector
└─ temporary SQLite / M6 Persistence
```

networkは使用しない。

test DBは本番local DBと分離する。

---

## 36. M7 Integration Test cases

### 36.1 Initial Generation happy path

- source ReadingResolver成功
- Candidate Generation成功
- candidate reading解決
- Sound / Semantic評価
- Selector実行
- Initial Round transaction保存
- selected candidate response
- response candidateResultIdがDB rowへ対応
- DBにはselected / unselectedを含むevaluated pool全件保存
- raw Generation / Semantic snapshot保存

### 36.2 Generation target count

- default `generationTargetCount = 60`
- generateCandidates requestへ60が渡る
- Round snapshotにも実値60が保存される
- Stubが実際に60候補返す必要はない

### 36.3 Source reading unresolved

- source unresolved
- LLM Adapterを呼ばない
- DB変更なし
- `SOURCE_READING_UNRESOLVED`

### 36.4 Source ReadingResolver failure

- Resolver throw
- LLM Adapterを呼ばない
- DB変更なし
- `READING_RESOLVER_FAILED`

### 36.5 Candidate unresolved / batch reconciliation

- candidate batchは1回の `resolveBatch` call
- unresolved candidateだけevaluated poolから除外
- missing / duplicate / unknown requestKeyを安全にreconcile
- raw Generation Resultには残る
- completed Roundではraw Reading batch snapshotも残す
- 他candidateでRound完成

### 36.6 Candidate ReadingResolver system failure

- batch-level resolver throw / failure
- Round全体失敗
- DB変更なし

### 36.7 Duplicate generation candidateKey

- duplicate keyに属する候補をすべて後段除外
- raw Generation Resultにはduplicateを保持
- Semantic requestへ曖昧keyを送らない

### 36.8 Candidate Generation Adapter failure

- Application-level generation error
- DB変更なし

### 36.9 Semantic request independence

Semantic requestに以下が含まれないことを固定する。

- reading
- rhyme
- sound score
- sound breakdown

### 36.10 Semantic unknown key

- unknown resultはprojectionしない
- raw Semantic Resultには保持
- valid candidateでRound継続

### 36.11 Semantic duplicate key

- duplicate result key candidateを除外
- raw Semantic Resultには保持

### 36.12 Semantic missing key

- responseなしcandidateを除外
- valid subsetでRound継続

### 36.13 Semantic Adapter failure

- DB変更なし
- `SEMANTIC_EVALUATION_FAILED`

### 36.14 Zero evaluated candidates

- `NO_EVALUABLE_CANDIDATES`
- Session / Roundを保存しない

### 36.15 Fewer than 10 selected

- 1〜9 selectedでもcompleted Round
- DB保存
- responseも同数
- dummy / additional generationなし

### 36.16 Zero selected with evaluated candidates

- evaluated candidateは存在
- Selector hard exclusion等でselected 0
- Roundはcompletedとして保存
- response candidatesは空配列

### 36.17 Reroll happy path

- same SessionへRound #2追加
- source ReadingResolverを再呼出ししない
- source readingはSession snapshotを使用
- current Normalizerでsource rhyme再生成
- new Round保存

### 36.18 Reroll excludeTerms

Round #1 / #2 selected surfacesから、

```text
roundNumber asc
selectionRank asc
```

でexcludeTermsを構築。

同じexcludeTermsがCandidate GenerationとCandidate Selectorへ渡る。

unselected candidateは含めない。

### 36.19 LLM ignores excludeTerms

- Generation raw resultには既出語を残せる
- Selector hard exclusionによりselectedへ復活しない
- completed Roundとして分析可能

### 36.20 Reroll new Config version

- Session内でcurrent ScoringConfig / SelectionConfigへ変更可能
- new versionをRoundへ保存
- same-version different-contentはerror
- failure時Configもtransaction rollback

### 36.21 Reroll not found / ownership

- unknown sessionId
- other user session
- どちらも `SESSION_NOT_FOUND`
- DB変更なし

### 36.22 Session Query

- persisted score / semantic / selection snapshotを返す
- roundsはroundNumber順
- candidatesはselectionRank順
- selected candidatesのみ
- Scorer / Selectorを再実行しない
- Feedback rowなしは `candidate=null` / `soundScore=null`
- Like保存後Queryで `like`
- Like -> Dislike更新後Queryで `dislike`
- Sound `low` -> `valid` 更新後Queryで `valid`
- Candidate Feedback / Sound Feedbackを独立してcurrent stateとして返す

### 36.23 Candidate Feedback

- Like保存
- Like -> Dislikeでcurrent state更新
- valid user ownership確認
- unknown / other-user candidateは `CANDIDATE_RESULT_NOT_FOUND`

### 36.24 Sound Score Feedback

- low / valid / high保存
- current state更新
- Candidate Like/Dislikeとは独立

### 36.25 Persistence failure

- fake / failing Persistence Portでsave failure
- Application成功responseなし
- `PERSISTENCE_FAILED`
- transaction rollback詳細はM6 Integration Testに委ねる

---

## 37. Test layering

M7では同じ内容を全層で重複testしない。

```text
M2 / M3 / M5
  Domain formula / rule correctness

M4
  LLM Adapter contract / Stub

M6
  SQL schema / transaction / Persistence correctness

M7
  Use Case orchestration / Port connection / failure behavior
```

M7 Integration TestではM3の計算式そのものを再度網羅しない。

既存moduleが正しい前提で、正しい順序とデータで接続されることを確認する。

---

## 38. Existing type reuse

M1〜M6の既存型を可能な限り再利用する。

特に:

```text
ReadingResult
CandidateKey
GenerateCandidatesResult
EvaluateSemanticsResult
RhymeRepresentations
SoundScoreResult
SemanticResult
SelectionResult
SelectedCandidate
ScoringConfig
SelectionConfig
ModelIdentifier
GenerationPromptVersion
SemanticPromptVersion
```

同義のApplication型を重複作成しない。

Application-specific Use Case DTO / Port DTOのみ新設する。

Infrastructure row型をApplicationへ漏らさない。


## 39. Expected file placement

概念上:

```text
src/
├─ application/
│  ├─ errors/
│  ├─ ports/
│  │  ├─ reading-resolver.ts
│  │  ├─ llm-adapter.ts        # existing
│  │  ├─ round-persistence.ts
│  │  ├─ session-query.ts
│  │  └─ feedback-persistence.ts
│  └─ services/
│     ├─ generation-service.ts
│     ├─ reroll-service.ts
│     ├─ feedback-service.ts
│     └─ session-query-service.ts
│
└─ infrastructure/
   ├─ reading/
   │  └─ stub-reading-resolver.ts
   └─ persistence/
      └─ existing M6 implementation + minimal Port adaptation
```

実際の既存repository structureに合わせて最小限調整してよい。

M7のためにgeneric DI container / frameworkを追加しない。

constructor injection等の単純なdependency injectionで十分。

---

## 40. Docs update points

M7 Document commitでは最低限以下を同期する。

### system-design

- Application PortsをArchitecture上に明示
- ReadingResolverをApplication Portとして定義
- LLM AdapterをDomain module扱いしない
- Applicationがconcrete Persistenceへ依存しない
- Preference ServiceをM7/v0.1実装対象から外す
- Generation / Reroll pipelineをM7実装順へ更新
- Candidate Generation / Semantic I/FをM4 contractへ同期
- failure時のRound persistence方針を反映

### implementation-plan

M7へ以下を明記。

- ReadingResolver Port + Stub
- Generation Service
- Reroll Service
- Feedback Service
- Session Query Service
- Persistence Port
- Application Integration Test
- no API / UI / real external adapters

### roadmap

real Reading Resolverをreal External Adapter接続Milestoneへ含める。

---

## 41. M7で新しいdependency

原則追加しない。

M7は既存TypeScript / Domain / Persistence / Vitestで実装可能である。

新しいnpm dependencyが必要になった場合は停止して報告する。

---

## 42. M7実装時の停止条件

以下の場合は独自判断でProduct仕様を決定せず停止する。

- ReadingResolver contractでは表現できない新しいReading要件が必要
- Semantic result reconciliationについてcandidate単体除外では安全に処理できない
- M6 Persistence Port化にDB schema変更が必要
- M8 API仕様を先に決めないとApplication contractを作れない
- new npm dependencyが必要
- failed pipeline persistenceが必須になる
- additional candidate generationが必須になる
- current Domain型とM7 snapshotを接続できずProduct意味の変更が必要

---

## 43. M7完了条件

1. ReadingResolver Application Portを定義する。
2. deterministic StubReadingResolverを実装する。
3. PersistenceをApplication Port越しに利用する。
4. Initial Generation Use Caseを接続する。
5. Reroll Use Caseを接続する。
6. Feedback Serviceを接続する。
7. Session Query Serviceを接続する。
8. source unresolved時に外部生成を呼ばない。
9. candidate unresolvedをcandidate単位で除外できる。
10. duplicate generation candidateKeyをSemantic前に除外する。
11. Semantic resultをcandidateKeyで安全にreconcileする。
12. Sound情報をSemantic Evaluatorへ渡さない。
13. evaluated pool 0件時はRoundを保存しない。
14. 10件未満selectionを正常Roundとして保存できる。
15. reroll excludeTermsを過去selected candidateから構築する。
16. Session内でRoundごとにcurrent config versionを利用できる。
17. PersistenceからcandidateResultId mappingを受け取れる。
18. Feedback current-stateをApplication経由で保存できる。
19. Session Queryが保存済みsnapshotを再計算せず返し、current Feedback stateをcandidateごとに復元する。
20. M7 Integration Testが成功する。
21. 新しいnpm dependencyを追加しない。
22. M8以降へ進まない。
23. lint / typecheck / test / buildを壊さない。

---

## 44. M7後に残るもの

M7完了時点では、

```text
Stub ReadingResolver
Stub LLM Adapter
real Domain
real Persistence
```

による完全なserver-side Application pipelineが成立する。

その後:

```text
M8
Backend API

M9
Web UI

M10
Real External Adapters
- Real LLM
- Real Reading Resolver
+ β evaluation
```

へ進む。

---

## 45. M9 read-contract extension

M9でのUI要件として、reload後もDBのcurrent Feedbackと画面表示を一致させることを採用した。

このためM9実装時に、本書のSession Query read contractを次の範囲だけ拡張する。

```text
GeneratedCandidateView.feedback
SessionQueryPort / PersistedSessionViewのfeedback read
SessionQueryServiceのfeedback projection
Application Integration Test
```

Initial Generation / Reroll直後は新しいCandidateResultにFeedback rowがないため `null / null`。

Session QueryではM6の既存Feedback current-state tableから値を取得する。

変更しないもの:

```text
DB schema
Feedback table PK
Feedback upsert semantics
Feedback history方針
user ownership
CandidateResult identity
Generation / Reroll orchestration
```

この追補はM9のWeb UIを成立させるためのread-model拡張であり、M7のDomain / orchestration意味を変更しない。

---

## 46. M10 Real Reading Resolver extension

M10では `ReadingResolver` のPort ownershipを維持したままreal providerを接続する。

主なApplication変更は以下に限定する。

```text
single source resolve
  -> metadata付きReadingResolution

candidate reading
  -> resolveBatchへ変更
  -> candidateKey/requestKey reconciliation

completed Initial Round
  -> source reading resolution snapshot保存
  -> candidate reading batch snapshot保存

completed Reroll
  -> stored sourceReadingを再利用
  -> candidate reading batch snapshot保存
```

### 46.1 Source provenance

Initial Generationのsource Reading resolutionには、

```text
resolverIdentifier
promptVersion
inferenceConfigVersion
providerResponseId?
durationMs?
usage?
```

を保持し、Persistence Portへ渡す。

Rerollはsource Reading Resolverを再呼出ししないため、新しいsource provider call metadataは発生しない。

### 46.2 Candidate provenance

candidate batch resolution raw resultは、resolved / unresolved双方とprovider metadataを保持する。

CandidateResultへ保存されるのは引き続き正常に評価まで進んだcandidateのみ。

Reading段階で除外されたcandidateの情報はRound-level raw reading snapshotで分析可能にする。

### 46.3 Failure persistence

既存方針を維持する。

```text
source unresolved / resolver failure
-> completed Session/Roundなし

candidate batch provider failure
-> completed Roundなし

candidate item unresolved
-> candidate単体除外
-> valid candidateが残ればcompleted Round保存
```

M10でもfailed operation tableは作らない。

### 46.4 No Domain dependency

Application / DomainへOpenAI SDK型を導入しない。

OpenAI-specific response objectはInfrastructure内でApplication-owned Reading / LLM resultへmappingする。
