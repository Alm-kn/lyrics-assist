# LLM Adapter / Stub 詳細設計 v0.1

## 1. 位置づけ

本書は `docs/system-design-v0.1.md` を補足し、M4 - LLM Adapter Stub の詳細設計を定義する。

M4の目的は実LLMへ接続することではない。
Application層が将来どのLLM実装を使用しても変更を最小化できるよう、LLMとの境界契約（Port / Adapter contract）を先に固定し、deterministicなStub実装で検証可能にすることである。

実OpenAI Responses API接続はM10で扱う。

---

## 2. 設計原則

LLMは以下の役割に限定する。

1. Candidate Pool Generation
2. Semantic / Contextual Evaluation

LLMは最終候補選抜を行わない。

以下はアプリ側の決定論的責務として維持する。

- Reading Resolver
- Rhyme Normalizer
- Sound Scorer
- Candidate Selector
- Reroll除外保証
- DB保存
- Preference反映

LLMは素材生成および意味評価を担当するが、アプリ全体の最終判断者にはしない。

---

## 3. 依存方向

LLM AdapterのinterfaceはApplication側に置き、Infrastructure実装がそれを実装する。

推奨構造:

```text
src/
  application/
    ports/
      llm-adapter.ts

  infrastructure/
    llm/
      stub-llm-adapter.ts
```

依存方向:

```text
Application
    |
    | depends on contract
    v
LLM Adapter Port
    ^
    |
    | implements
Infrastructure
```

Application ServiceがInfrastructure固有実装へ直接依存してはならない。

---

## 4. LLM Adapter Contract

概念上、以下の2メソッドを持つ。

```ts
interface LlmAdapter {
  generateCandidates(
    request: GenerateCandidatesRequest
  ): Promise<GenerateCandidatesResult>;

  evaluateSemantics(
    request: EvaluateSemanticsRequest
  ): Promise<EvaluateSemanticsResult>;
}
```

M4のStub実装も将来の実LLM Adapterと同じasync contractを持つ。

---

## 5. Candidate Generation

### 5.1 目的

入力語から、後段のSound Scorer / Semantic Evaluator / Candidate Selectorが評価するための候補プールを生成する。

M4では実際の生成品質を検証しない。
Stubはfixtureを返すだけとする。

### 5.2 Request

最低限、以下を表現できる。

```ts
type GenerateCandidatesRequest = {
  source: {
    surface: string;
    reading: string;
  };

  targetCount: number;

  excludeTerms: readonly string[];
};
```

### 5.3 source.reading

Candidate Generatorには、Reading Resolver等で確定済みのreadingを渡す。

LLM自身に入力語の読みを推定させることを前提にしない。

M4ではReading Resolverは未実装のため、テストfixtureからreadingを直接与える。

### 5.4 targetCount

候補プール数はApplication側から指定できるようにする。

M4では60等の具体値をAdapter内部へ固定しない。

```text
targetCount: number
```

として受け取る。

### 5.5 excludeTerms

reroll等で既出候補を避けるため、生成hintとして `excludeTerms` を渡せるようにする。

ただし、LLMがexcludeTermsを守ることを最終保証にはしない。

```text
LLM Adapter:
  "これらを候補に含めないでほしい" という生成指示

Application / Selector:
  実際に除外されていることを保証
```

M4 Stubでも、excludeTermsを内部判断に使用するロジックは不要。
Stubはfixtureを契約どおり返す。

---

## 6. Generated Candidate

Candidate Generatorの出力候補は最低限以下を持つ。

```ts
type GeneratedCandidate = {
  candidateKey: string;
  surface: string;
  readingHint?: string;
};
```

### 6.1 candidateKey

`candidateKey` はgeneration round内で候補を一意に対応付けるためのcaller / fixture controlledなopaque keyとする。

DB IDである必要はない。

例:

```text
candidate-001
candidate-002
candidate-003
```

Semantic Evaluatorへ同じkeyを渡し、結果にも同じkeyを返させる。

配列indexだけをcandidate対応付けの根拠にしない。

### 6.2 readingHint

Candidate Generatorは必要に応じてreadingHintを返してよい。

ただしこれはReading Resolverの確定結果ではない。

```text
readingHint
= LLM由来の参考情報

confirmed reading
= Reading Resolverの責務
```

M4ではreadingHintの正しさを評価しない。

---

## 7. Candidate Generation Result

概念上:

```ts
type GenerateCandidatesResult = {
  candidates: readonly GeneratedCandidate[];

  metadata: {
    modelIdentifier: string;
    promptVersion: string;
  };
};
```

結果には、実際にその結果を生成したAdapter / model / prompt versionを追跡できるmetadataを保持する。

M4 Stubでは例として以下のような値を使用できる。

```text
modelIdentifier: "stub"
promptVersion: "generation-v0.1"
```

具体的な定数名は既存のM1 version型と整合させる。

---

## 8. Semantic Evaluation

### 8.1 目的

source termとcandidateの意味・文脈的近接度を評価する。

Sound Scoreとは独立した軸として扱う。

### 8.2 情報遮断

Semantic Evaluatorへ以下を渡さない。

- Sound Score
- Normalized rhyme sequence
- Phonetic similarity
- Sound Score breakdown

目的は、意味軸が音韻情報に引っ張られることを避けるため。

```text
X axis = Sound
Y axis = Semantic

両軸を意図的に独立評価する
```

---

## 9. Semantic Evaluation Request

概念上:

```ts
type EvaluateSemanticsRequest = {
  source: {
    surface: string;
  };

  candidates: readonly {
    candidateKey: string;
    surface: string;
  }[];
};
```

Semantic評価にはsurface情報のみを渡す。

v0.1 M4ではReading情報を必須にしない。

---

## 10. Semantic Evaluation Result

候補ごとに最低限以下を返す。

```ts
type SemanticEvaluationItem = {
  candidateKey: string;

  score: number;

  reason: string;

  primaryRelation: string;

  secondaryRelations: readonly string[];

  semanticCluster: string;
};
```

### 10.1 score

意味・文脈近接度を0〜100で表す。

M4 Stubではfixture値をそのまま返す。

runtime validationはM4では行わない。

### 10.2 relation taxonomy

relation taxonomyはv0.1時点でopen vocabularyとする。

以下は例であり、閉じたenumにはしない。

```text
synonym
emotion
scene
visual
sound
action
object
time
place
metaphor
cause_effect
abstract_association
```

将来tag追加可能なstringとして扱う。

### 10.3 semanticCluster

Candidate Selectorが意味軸候補を多様化するために使用できるcluster label。

M4ではcluster生成ロジックを持たず、fixture値を返す。

---

## 11. Semantic Evaluation Metadata

概念上:

```ts
type EvaluateSemanticsResult = {
  results: readonly SemanticEvaluationItem[];

  metadata: {
    modelIdentifier: string;
    promptVersion: string;
  };
};
```

Semantic側のprompt versionはGeneration側と別管理する。

例:

```text
generation-v0.1
semantic-v0.1
```

既存M1型に `GenerationPromptVersion` / `SemanticPromptVersion` が存在する場合はそれを利用する。

---

## 12. Stub LLM Adapter

### 12.1 目的

M4 Stubは「AIらしく振る舞う偽物」ではない。

目的は、

```text
Applicationが期待するLLM契約を
networkなし・deterministicにテストできる
```

こと。

### 12.2 fixture injection

推奨:

```ts
new StubLlmAdapter({
  generationResult: ...,
  semanticResult: ...
});
```

または同等のfixture注入方式。

避ける実装:

```ts
if (keyword === "夜") {
  return ["月", "星", ...];
}
```

Stub内部に単語別の擬似生成ロジックを持たせない。

### 12.3 deterministic

同じfixtureを与えたStubは常に同じ結果を返す。

randomnessを入れない。

### 12.4 network access

Stubは以下を行わない。

- HTTP request
- OpenAI SDK call
- environment variable reading
- API key access

---

## 13. M4で追加しない依存

M4では新しいnpm依存関係を追加しない。

以下もまだ導入しない。

- OpenAI SDK
- Zod runtime validation
- retry library
- timeout library
- schema generation library

M4の契約・Stubは標準TypeScriptのみで実装する。

---

## 14. Error Handling

M4 Stubはテストfixtureとして与えられた結果を返すことを基本とする。

LLM固有の以下はM4対象外。

- timeout
- rate limit
- network error
- retry
- malformed JSON
- schema violation
- token limit
- moderation / safety response
- API authentication failure

これらは実LLM Adapter導入時に設計する。

ただし、fixture自体が明らかに契約不整合である場合にどう扱うかは、M4実装で必要最小限の型安全性に従う。
runtime validation frameworkは追加しない。

---

## 15. Promptの扱い

M4ではprompt本文を実装しない。

以下のみ型・metadataとして追跡可能にする。

```text
GenerationPromptVersion
SemanticPromptVersion
ModelIdentifier
```

具体的なprompt本文・system instructions・model selectionは実LLM接続時に定義する。

---

## 16. Candidate Countについて

M4では候補数のproduct defaultを固定しない。

Adapter contractとして、

```text
targetCount: number
```

を受け取れる状態にする。

v0.1 Application Serviceでは将来的に60程度をdefault候補とする想定だが、そのpolicyはAdapterではなくApplication configの責務とする。

---

## 17. M4 Unit Test

最低限以下を確認する。

### 17.1 Candidate Generation

- `generateCandidates()` がPromiseで結果を返す
- fixture候補をそのまま返す
- candidateKeyを保持する
- readingHintを保持できる
- metadataを保持する
- 同じfixtureならdeterministic
- network accessを必要としない

### 17.2 Semantic Evaluation

- `evaluateSemantics()` がPromiseで結果を返す
- candidateKeyを保持する
- score / reason / primaryRelation / secondaryRelations / semanticClusterを保持する
- metadataを保持する
- 配列順に依存せずcandidateKeyで対応可能
- 同じfixtureならdeterministic

### 17.3 Contract Boundary

- StubはSound Scoreを要求しない
- StubはRhyme Normalizerを呼ばない
- StubはOpenAI SDKやAPI keyへ依存しない
- 新規npm dependencyがない

---

## 18. M4で実装しないもの

以下はM4対象外。

- OpenAI Responses API
- Structured Outputs
- OpenAI modelの具体選定
- prompt本文
- Semantic score rubric詳細
- retry / timeout / rate limit
- token / cost tracking
- runtime schema validation
- API key/env integration
- Reading Resolver
- Sound Scorer変更
- Candidate Selector
- DB
- API
- UI
- Preference
- Application generation pipeline

---

## 19. M4完了条件

以下を満たした時点でM4完了とする。

1. Application側にLLM Adapter Port/interfaceが存在する。
2. `generateCandidates()` contractが定義される。
3. `evaluateSemantics()` contractが定義される。
4. candidateKeyによるcandidate対応付けが可能である。
5. generation / semanticそれぞれのmetadataを保持できる。
6. Infrastructure側にdeterministicなStub実装が存在する。
7. Stubはfixture injection方式である。
8. Stubはnetwork / SDK / API keyへ依存しない。
9. M4 unit testが成功する。
10. `npm run lint`、`npm run typecheck`、`npm test` が成功する。
11. M5 Candidate Selector以降へ着手しない。
