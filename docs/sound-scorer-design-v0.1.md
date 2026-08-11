# Sound Scorer 詳細設計 v0.1

## 1. 位置づけ

本書は `docs/system-design-v0.1.md` を補足し、M3 - Sound Scorer の詳細設計を定義する。

v0.1 βにおけるSound Scoreは「語感の絶対的な正解」を定義するものではない。
説明可能かつ再現可能な初期仮説として実装し、β利用時のSound Score Feedbackを用いて設定値・評価式を調整する。

Sound ScorerはLLMを使用しない決定論的なDomainロジックとする。

---

## 2. 責務境界

Sound Scorerは、Rhyme Normalizerが生成済みの `RhymeRepresentations` を入力として受け取り、2語間のSound Scoreを計算する。

```text
confirmed reading
      |
      v
Rhyme Normalizer
      |
      v
RhymeRepresentations
      |
      v
Sound Scorer
      |
      v
SoundScoreResult
```

Sound Scorerは以下を行わない。

- 漢字から読みを推定しない
- Rhyme Normalizerを内部から呼び出さない
- 意味・文脈を評価しない
- LLMを呼び出さない
- 候補の採用・除外を判断しない
- 入力語そのものとの重複を減点しない
- 個人Preferenceを反映しない

入力語と候補語が同一語であっても、音が同一ならSound Scoreは100になり得る。
同一語・lexical duplicateの除外はCandidate Selectorの責務とする。

---

## 3. v0.1 Sound Score 全体式

v0.1では以下の4要素を使用する。

```text
SoundScore
 =
 0.40 × MoraLengthSimilarity
+0.25 × PositionMatchSimilarity
+0.25 × SequenceSimilarity
+EndingRhymeBonus
```

各Similarityは0〜100。

EndingRhymeBonusは0〜10。

したがって基本構成は、

```text
Mora Length          最大40点
Position Match       最大25点
Sequence Similarity  最大25点
Ending Rhyme Bonus   最大10点
--------------------------------
Total               最大100点
```

とする。

v0.1ではnegative adjustmentを使用しない。

---

## 4. 入力

概念上のI/Fは以下とする。

```ts
calculateSoundScore(
  source: RhymeRepresentations,
  candidate: RhymeRepresentations,
  config: SoundScoringConfig
): SoundScoreResult
```

Sound Scorerは比較に必要な音韻情報を入力として受け取る。
読み文字列を直接受け取ってRhyme Normalizerを実行してはならない。

### 4.1 入力の前提

source / candidateともに、少なくとも1モーラ以上の有効な音韻表現を持つこと。

空のPhonetic RepresentationまたはNormalized Rhyme RepresentationはSound Scorerの有効入力としない。
空入力に遭遇した場合は、0点として黙って処理せず明示的なinvalid inputとして扱う。

---

## 5. Mora Length Similarity

### 5.1 目的

単語全体の「歌ったときの尺」がどれくらい近いかを評価する。

### 5.2 長さの定義

Mora Lengthは **Phonetic Representationのモーラ/token数** を使用する。

例:

```text
コーヒー

phonetic:
[コ] [ー] [ヒ] [ー]

mora count = 4
```

拗音や外来語結合モーラはRhyme Normalizerによって1モーラへ解析済みであるため、1 tokenとして数える。

v0.1のNormalizerではPhonetic tokenとNormalized unitは原則1対1で対応するが、Mora Lengthの概念はNormalized変換から独立させるためPhonetic層を基準とする。

### 5.3 スコア

2語のモーラ数差の絶対値を求める。

```text
difference = abs(sourceMoraCount - candidateMoraCount)
```

v0.1初期値:

| Mora Difference | Score |
|---|---:|
| 0 | 100 |
| 1 | 70 |
| 2 | 35 |
| 3以上 | 0 |

この値は `SoundScoringConfig` に保持し、実装へ直接固定しない。

---

## 6. Position Match Similarity

### 6.1 目的

同じ位置に同じ作詞用比較音が現れる割合を評価する。

### 6.2 比較対象

`NormalizedRhymeRepresentation` のunit列を使用する。

比較対象には通常母音だけでなく特殊モーラクラス `X` も含む。

したがって名称上はVowel Position Matchと呼ぶ場合があっても、実際の比較単位は以下である。

```text
a / i / u / e / o / X
```

### 6.3 計算

先頭から同じindex同士を比較する。

```text
source:    a o a a
candidate: a o a i

matches = 3
maxLength = 4

positionScore = 3 / 4 × 100 = 75
```

長さが異なる場合、片方にしか存在しない位置は不一致として扱う。

```text
source:    a o a a
candidate: a o a a i

matches = 4
maxLength = 5

positionScore = 4 / 5 × 100 = 80
```

式:

```text
PositionMatchSimilarity
 =
 matchingPositionCount
 / max(sourceNormalizedLength, candidateNormalizedLength)
 × 100
```

---

## 7. Sequence Similarity

### 7.1 目的

挿入・削除による位置ずれを含め、Normalized列全体の並びがどれくらい近いかを評価する。

### 7.2 アルゴリズム

標準Levenshtein distanceを使用する。

v0.1では以下の操作コストをすべて1とする。

- insertion = 1
- deletion = 1
- substitution = 1

`X`も通常の1 unitとして扱う。
Q/Nの区別はPhonetic層に保持するが、v0.1 Sound ScorerではNormalized `X` 同士として比較する。

### 7.3 0〜100変換

```text
distance = levenshtein(sourceUnits, candidateUnits)

SequenceSimilarity
 =
 (1 - distance / maxLength) × 100
```

例:

```text
distance = 1
maxLength = 4

sequenceScore
= (1 - 1/4) × 100
= 75
```

---

## 8. Ending Rhyme Bonus

### 8.1 目的

作詞上、語尾から連続して一致する音が単語全体の大きな割合を占めるほど「韻が強い」と感じやすい、というv0.1 β仮説を表現する。

単純な一致モーラ数ではなく、**単語長に対する共通suffixのcoverage**を使用する。

### 8.2 Common Suffix Length

2つのNormalized列を末尾から比較し、連続して完全一致するunit数を数える。

例:

```text
source:    a X a i
candidate: o X a i

common suffix:
X a i

commonSuffixLength = 3
```

途中で不一致になった時点で終了する。

### 8.3 Suffix Coverage

分母には2語のNormalized lengthのうち長い方を使用する。

```text
suffixCoverage
 =
 commonSuffixLength
 / max(sourceNormalizedLength, candidateNormalizedLength)
```

これにより、短い語全体が長い語の末尾に一致する場合でも自動的に100% coverageとはしない。

例:

```text
source length = 4
candidate length = 6
commonSuffixLength = 4

suffixCoverage = 4 / 6 ≒ 0.667
```

### 8.4 Bonus

v0.1では線形変換を使用する。

```text
endingBonus
 =
 suffixCoverage × maxEndingBonus
```

初期値:

```text
maxEndingBonus = 10
```

したがって、

```text
coverage 100% -> +10
coverage  75% -> +7.5
coverage  50% -> +5
coverage  25% -> +2.5
coverage   0% -> +0
```

段階的なbucketや非線形カーブはv0.1では使用しない。

### 8.5 例: たんたい / もんだい

```text
たんたい
=> a X a i

もんだい
=> o X a i
```

```text
commonSuffixLength = 3
maxLength = 4
suffixCoverage = 3 / 4 = 0.75
endingBonus = 7.5
```

他の構成要素:

```text
Mora Length Score = 100
Position Match Score = 75
Sequence Similarity Score = 75
```

したがって、

```text
base
= 100 × 0.40
+ 75 × 0.25
+ 75 × 0.25
= 77.5

final raw score
= 77.5 + 7.5
= 85
```

最終Sound Scoreは85となる。

---

## 9. Ending Bonusと他指標の重複

Ending Bonusで評価するsuffix一致は、Position Match / Sequence Similarityにも一部反映される。

v0.1ではこれは意図的な設計とする。

理由:

- Position Matchは単語全体の同位置一致を見る。
- Sequence Similarityは列全体の編集距離を見る。
- Ending Bonusは「一致領域が語尾からどれだけ単語全体を覆うか」を作詞用ヒューリスティックとして追加評価する。

ただし影響を最大10点に限定する。

β利用でEnding Bonusが過大・過小と判断された場合は、Sound Score Feedbackを基に `maxEndingBonus` または変換関数を変更する。

---

## 10. Q / N と子音の扱い

### 10.1 Q / N

Phonetic層では、

```text
促音 = Q
撥音 = N
```

を区別して保持する。

v0.1 Sound ScorerではNormalized層の、

```text
Q -> X
N -> X
```

をそのまま比較する。

したがって、Q/N差による減点は行わない。

将来的にはPhonetic層を利用し、

```text
Q vs Q
N vs N
Q vs N
```

へ異なる類似度を与える可能性があるが、v0.1対象外とする。

### 10.2 子音

Phonetic Representationに保持しているconsonant情報はv0.1 Sound Scoreへ使用しない。

子音一致・頭韻等は将来の評価候補とし、β初期段階では母音/特殊モーラ中心の評価を分離して検証する。

このため、異なる単語でもNormalized patternが完全一致する場合、Sound Scoreが100になることがある。

これはv0.1では意図した挙動とする。

---

## 11. Final Scoreと丸め

### 11.1 Intermediate Values

以下の中間値は計算途中で整数へ丸めない。

- moraLengthScore
- positionMatchScore
- sequenceSimilarityScore
- weighted contributions
- commonSuffixLength
- suffixCoverage
- endingBonus
- raw final score

β解析と再現性のため、可能な限り数値として保持する。

### 11.2 Final Score

最終表示用 `finalScore` のみ、

1. 0〜100へclamp
2. 四捨五入して整数化

する。

```text
finalScore
 =
 round(clamp(rawScore, 0, 100))
```

内部breakdownまで表示用丸め値だけに置き換えてはならない。

---

## 12. Breakdown / Adjustmentの保存

SoundScoreResultには、最終点だけでなく計算根拠を保持する。

最低限以下を保存可能にする。

```text
moraLengthScore
positionMatchScore
sequenceSimilarityScore

commonSuffixLength
suffixCoverage
endingBonus

rawScore
finalScore

scoringConfigVersion
normalizerVersion
```

Ending Bonusを既存 `SoundScoreAdjustment` で表現する場合でも、説明文字列だけでなく、

- commonSuffixLength
- suffixCoverage
- delta / bonus

を数値として後から分析可能な形で保持する。

必要であればM1の型を最小限拡張する。

---

## 13. SoundScoringConfig

初期設定は概念上以下とする。

```ts
{
  version: "sound-v0.1",

  weights: {
    moraLength: 0.40,
    positionMatch: 0.25,
    sequenceSimilarity: 0.25
  },

  moraLengthScores: {
    difference0: 100,
    difference1: 70,
    difference2: 35,
    difference3Plus: 0
  },

  endingBonus: {
    maxPoints: 10,
    mode: "linear-suffix-coverage"
  }
}
```

実際のフィールド名はM1で定義済みの `SoundScoringConfig` との整合を優先する。

ただし具体値をSound Scorer本体へ散在させず、versioned configとして一元化する。

### 13.1 Config invariant

v0.1 default configでは、

```text
100 × (0.40 + 0.25 + 0.25) + 10 = 100
```

となる。

不正なconfigによって100点上限を超える設計を黙って許容しない。
M3では少なくともdefault configの整合性をunit testで固定する。

将来DB/APIから任意configを受け取る際のschema validationは、その責務を持つMilestoneで追加してよい。

---

## 14. 決定論性・対称性

Sound Scoreは同じ入力・同じconfigに対して常に同じ結果を返す。

またv0.1の評価式は対称である。

```text
score(A, B) == score(B, A)
```

これをunit testで固定する。

---

## 15. M3で実装しないもの

以下はv0.1 M3対象外。

- 子音similarity
- 頭韻bonus
- Q/N差による部分減点
- weighted Levenshtein
- 歌唱発音推定
- phrase / partial rhyme
- Preferenceによる個人重み
- Semantic Scoreとの統合
- lexical duplicate penalty
- Candidate Selector
- negative lyric adjustment
- 非線形Ending Bonus
- Ending Bonusのbucket化

また「adjustment hook」のための汎用plugin framework等を先取り実装しない。
M3ではEnding Rhyme Bonusという具体的な1つのadjustmentだけを実装する。

---

## 16. 代表unit test

最低限、以下を固定する。

### 16.1 Mora Length

- difference 0 -> 100
- difference 1 -> 70
- difference 2 -> 35
- difference 3以上 -> 0

### 16.2 Position Match

```text
a o a a
a o a i
=> 75
```

長さ違い:

```text
a o a a
a o a a i
=> 80
```

### 16.3 Sequence Similarity

Levenshtein距離1、maxLength 4:

```text
=> 75
```

挿入・削除による位置ずれも確認する。

### 16.4 Ending Bonus

```text
a X a i
o X a i

commonSuffixLength = 3
coverage = 0.75
bonus = 7.5
```

長さ6に対し共通suffix 3の場合:

```text
coverage = 0.5
bonus = 5
```

suffixなし:

```text
bonus = 0
```

### 16.5 総合例

```text
たんたい / もんだい

length = 100
position = 75
sequence = 75
ending bonus = 7.5
final = 85
```

### 16.6 完全Normalized一致

異なるsurface wordであってもNormalized列が完全一致する場合:

```text
base = 90
ending bonus = 10
final = 100
```

Q/NがPhonetic層で異なっていてもNormalized列が同一なら、v0.1では完全一致として扱えることを確認する。

### 16.7 Invariants

- 同一入力 + 同一config -> 同一結果
- `score(A, B) == score(B, A)`
- finalScoreは常に0〜100
- 空の音韻表現は明示的エラー
- Scorer単体テストはRhyme Normalizerを呼ばずfixtureで実行可能

---

## 17. M3完了条件

以下を満たした時点でM3完了とする。

1. Mora Length Similarityを計算できる。
2. Position Match Similarityを計算できる。
3. 標準LevenshteinによるSequence Similarityを計算できる。
4. linear suffix coverageによるEnding Rhyme Bonusを計算できる。
5. Sound Score全体をversioned configから決定論的に算出できる。
6. 中間値・Ending Bonusの数値根拠・versionを保持できる。
7. finalScoreのみ最後に四捨五入し0〜100へclampする。
8. 対称性・決定論性・境界値をunit testで固定する。
9. M1型の変更が必要な場合はSound Score分析に必要な最小限に留める。
10. `npm run lint`、`npm run typecheck`、`npm test` が成功する。
11. M4以降へ着手しない。
