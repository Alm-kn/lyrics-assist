# Candidate Selector 詳細設計 v0.1

## 1. 位置づけ

本書は `docs/system-design-v0.1.md` を補足し、M5 - Candidate Selector の詳細設計を定義する。

Candidate Selectorの目的は、評価済みcandidate poolから単純な総合点上位10件を選ぶことではない。

v0.1では以下の3方向を意図的に混在させ、作詞上の発見を作る。

```text
Balanced-focused   4
Sound-focused      3
Semantic-focused   3
```

4 / 3 / 3 はprimary targetであり、絶対的なhard quotaではない。
候補不足時はfallbackを行い、最終的に最大10語を返す。

---

## 2. 責務境界

Candidate Selectorは、Sound ScoreおよびSemantic Evaluationが完了済みのcandidate群を入力として受け取り、最終候補を決定論的に選抜する。

Candidate Selectorは以下を行わない。

- LLMを呼び出さない
- Readingを解決しない
- Rhyme Normalizationを行わない
- Sound Scoreを再計算しない
- Semantic Scoreを再評価しない
- DBへ保存しない
- API/UI処理を行わない
- Preference学習を行わない

M5はpure / deterministicなDomainロジックとして実装する。

---

## 3. 入力candidate

概念上、各candidateは最低限以下の情報を持つ。

```ts
type EvaluatedCandidate = {
  candidateKey: string;
  surface: string;
  sound: SoundScoreResult;
  semantic: {
    score: number;
    reason: string;
    primaryRelation: string;
    secondaryRelations: readonly string[];
    semanticCluster: string;
  };
};
```

実際のTypeScript定義は既存M1〜M4型を可能な限り再利用する。

---

## 4. General Filter

### 4.1 Hard exclusion

以下はfallbackでも解除しない。

- input source wordと同一のcanonical surface
- reroll等で `excludeTerms` に含まれるcanonical surface
- candidate pool内のcanonical duplicate
- Selector入力として必要な評価情報を持たないcandidate
- 同一 `candidateKey` による曖昧なcandidate

### 4.2 Canonical Surface

Literal duplicate判定用にsurfaceをcanonicalizeする。

v0.1では以下を行う。

1. leading / trailing whitespaceを除去
2. Unicode NFKC normalization
3. Latin alphabetをlowercase
4. カタカナを対応するひらがなへ正規化

内部の空白や句読点を積極的に削除する等の強い正規化は行わない。

```text
コンビニ
こんびに
```

は同一canonical surfaceとして扱う。

一方、

```text
橋
箸
```

はreadingが同じでもsurfaceが異なるため、別candidateとして扱う。

reading一致だけをduplicate判定に使用してはならない。

### 4.3 candidate pool内duplicate

同一canonical surfaceが複数存在する場合、1件だけ残す。

v0.1ではscoreによる事前選別を避け、deterministicな代表選択として `candidateKey` の安定した昇順で最初の1件を保持する。

---

## 5. Literal Duplicate と Semantic Redundancy

v0.1では以下を別概念として扱う。

```text
Literal Duplicate
= 同じ語・表記揺れ
= canonicalSurface equality

Semantic Redundancy
= 別語だが意味方向が偏っている
= semanticCluster / primaryRelationで構成を調整
```

v0.1では候補間の文字列編集距離、embedding cosine similarity、候補同士のSound Score、LLM pairwise similarityは導入しない。

---

## 6. Balanced Selection

### 6.1 Target

```text
4 slots
```

### 6.2 Balanced Score

```text
minScore = min(soundScore, semanticScore)
meanScore = (soundScore + semanticScore) / 2

balancedScore
 = 0.7 * minScore
 + 0.3 * meanScore
```

計算途中で整数へ丸めない。

### 6.3 Semantic Cluster Cap

primary Balanced selectionでは、

```text
same semanticCluster max 2
```

とする。

これはhard exclusionではなく、fallback時には必要に応じて緩和可能。

### 6.4 Tie-break

balancedScore同点時:

1. 現在のBalanced selected内で出現数が少ない `semanticCluster`
2. `min(soundScore, semanticScore)` が高いcandidate
3. `(soundScore + semanticScore) / 2` が高いcandidate
4. canonicalSurfaceのdeterministicな昇順
5. candidateKeyのdeterministicな昇順

---

## 7. Sound-focused Selection

### 7.1 Target

```text
3 slots
```

### 7.2 Rank

```text
rank = soundScore
```

Semantic Scoreを減点要素として使用しない。

### 7.3 Semantic diversity

Sound-focused selectionでは `primaryRelation` / `semanticCluster` による制約を設けない。

### 7.4 Tie-break

soundScore同点時:

1. Ending Rhyme Bonusが高いcandidate
2. Mora Length Similarityが高いcandidate
3. canonicalSurfaceのdeterministicな昇順
4. candidateKeyのdeterministicな昇順

---

## 8. Semantic-focused Selection

### 8.1 Target

```text
3 slots
```

### 8.2 Rank

基本rankは `semanticScore`。

Sound Scoreを減点要素として使用しない。

### 8.3 Diversity

primary selectionでは、

```text
same semanticCluster max 1
```

とする。

可能な限り異なる `primaryRelation` を持つcandidateを優先する。

### 8.4 Tie-break

semanticScore同点時:

1. selected内で未使用の `primaryRelation`
2. selected内で出現数が少ない `semanticCluster`
3. canonicalSurfaceのdeterministicな昇順
4. candidateKeyのdeterministicな昇順

---

## 9. Primary Selection Order

v0.1では以下の順でprimary targetを選抜する。

```text
1. Balanced  up to 4
2. Sound     up to 3
3. Semantic  up to 3
```

candidateは一度選択された時点でremaining poolから除外する。

同じcandidateを複数categoryへ重複選択してはならない。

---

## 10. Fallback

### 10.1 Priority

primary 4/3/3が不足した場合、以下をround-robinする。

```text
Balanced
  ↓
Sound
  ↓
Semantic
  ↓
Balanced
  ↓
...
```

1回のstrategy turnにつき最大1件だけ追加する。

### 10.2 Diversity relaxation

hard exclusionはfallbackでも解除しない。

#### Balanced fallback

まず `semanticCluster max 2` を維持する。

該当candidateが存在しない場合のみcluster capを解除してbest remaining Balanced candidateを選択できる。

#### Semantic fallback

段階的に緩和する。

```text
primary:
  semanticCluster max 1

fallback first relaxation:
  semanticCluster max 2

still unavailable:
  cluster capを解除
```

`primaryRelation` diversityはtie-break上の優先事項だが、fallbackを完全に阻止するhard constraintにはしない。

#### Sound fallback

Semantic diversity constraintは設けない。

### 10.3 Fallback tracking

fallbackで選ばれたcandidateは既存 `SelectionCategory` の `"fallback"` を利用する。

さらに、どのranking strategyで選ばれたかを保持する。

```ts
{
  category: "fallback",
  fallbackStrategy: "balanced" | "sound" | "semantic"
}
```

既存M1型にfieldがなければ、M5で最小限拡張してよい。

### 10.4 Termination

以下のいずれかで終了する。

- selected countが10件に達した
- remaining valid candidateが0件
- B -> Sound -> Semantic の1周で1件も追加できなかった

valid candidate自体が不足している場合は10件未満を返してよい。

---

## 11. Selection Result Order

`SelectionResult.selected` は実際の選抜順を保持する。

```text
Balanced primary
Sound primary
Semantic primary
Fallback
```

M5ではrandom shuffleしない。

---

## 12. Selection Score

選抜時に使用したscoreを保持する。

```text
Balanced:
  balancedScore

Sound:
  soundScore

Semantic:
  semanticScore

Fallback:
  fallbackStrategyに対応するscore
```

ranking用scoreは途中で丸めない。

---

## 13. Selection Config

v0.1 default configは概念上以下。

```ts
{
  version: "selection-v0.1",

  targetTotal: 10,

  targetCounts: {
    balanced: 4,
    sound: 3,
    semantic: 3
  },

  balanced: {
    minWeight: 0.7,
    meanWeight: 0.3,
    semanticClusterMax: 2
  },

  semantic: {
    primaryClusterMax: 1,
    fallbackClusterMax: 2
  },

  fallbackPriority: [
    "balanced",
    "sound",
    "semantic"
  ]
}
```

具体値をSelector本体へ散在させず、versioned SelectionConfigから参照する。

---

## 14. Score Threshold

v0.1ではSound / Semantic / Balancedのabsolute minimum thresholdを設定しない。

```text
sound >= 50
semantic >= 50
```

のような根拠の薄い境界は導入しない。

βサンプル収集後、必要であれば以下を検討する。

- percentile
- z-score / standard score
- keywordごとのscore distribution
- categoryごとのdistribution
- user feedbackとの相関

閾値は実測分布を確認してから決定する。

---

## 15. Determinism

同一candidate pool・同一excludeTerms・同一SelectionConfigに対して、常に同じSelectionResultを返す。

random selectionは行わない。

最終tie-breakまで同点の場合はcanonicalSurface / candidateKeyのdeterministic orderを使用し、input array orderへ依存しない。

---

## 16. M5 Unit Test

最低限以下を固定する。

### General Filter

- source word自身を除外
- reroll excludeTermsを除外
- カタカナ/ひらがな表記揺れをcanonical duplicateとして除外
- Latin case differenceをcanonical duplicateとして除外
- readingだけ同じ異表記語は除外しない
- candidate pool内duplicateは1件へcollapse
- hard exclusionはfallbackでも復活しない

### Balanced

- target 4
- balancedScore式
- same semanticCluster max2
- tie時に少数clusterを優先

### Sound

- target 3
- soundScoreのみでrank
- semanticScoreが低くても減点しない
- tie時にEnding Bonus -> Mora Length
- Semantic cluster制約を受けない

### Semantic

- target 3
- semanticScoreを基本rankに使用
- Sound Scoreを減点しない
- primary semanticCluster max1
- relation / cluster diversity tie-break

### Category uniqueness

- 一度選ばれたcandidateは他categoryへ再選択されない

### Fallback

- B -> S -> Semanticのround-robin
- 1 strategy turnにつき最大1件
- Balanced cluster constraintを必要時のみ緩和
- Semantic cluster max1 -> max2 -> unrestricted
- fallback strategyを記録
- valid candidate不足時は10件未満
- hard exclusionを解除しない

### Determinism

- 同一入力 + 同一config -> 同一結果
- input array orderを変えても同一poolなら同一結果
- selected count <= targetTotal

---

## 17. M5で実装しないもの

- score threshold
- percentile / z-score threshold
- embedding similarity
- pairwise candidate LLM evaluation
- candidate同士のSound Similarity penalty
- Preference personalization
- DB
- API
- UI
- real LLM
- Application generation pipeline
- reroll session管理
- random result ordering

---

## 18. M5完了条件

1. General Filterがhard exclusionを適用できる。
2. Balanced 4 target selectionを実装する。
3. Sound-focused 3 target selectionを実装する。
4. Semantic-focused 3 target selectionを実装する。
5. candidateのcategory重複選抜がない。
6. semantic diversity constraintをprimary selectionで適用する。
7. B -> Sound -> Semantic round-robin fallbackを実装する。
8. fallback時にdiversity constraintを段階的に緩和できる。
9. valid candidate不足時は10件未満を返せる。
10. selection strategy / score / config versionを分析可能に保持する。
11. deterministic unit testが成功する。
12. M1型変更が必要な場合はM5分析に必要な最小限へ留める。
13. 新しいnpm依存関係を追加しない。
14. `npm run lint`、`npm run typecheck`、`npm test` が成功する。
15. M6以降へ着手しない。
