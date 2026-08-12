# β Evaluation 詳細設計 v0.1

更新日: 2026-08-12

## 1. 目的

M10のβ Evaluationは、v0.1を「完成品」として証明するためではなく、

```text
Reading
Candidate Generation
Semantic Evaluation
Sound Score
Candidate Selection
Reroll
Feedback
Latency / usage
```

について、次の設計判断に進めるだけの実データを得ることを目的とする。

数値閾値を事前に「合格ライン」として固定しすぎない。

まず分布・失敗パターン・ユーザーの感覚とのズレを観察する。

---

## 2. M10 βで答えたい問い

### Reading

```text
source readingは実用上十分か
candidate reading errorはどの程度あるか
readingHintは有効か
多読語でどのような誤りが起きるか
```

### Candidate Generation

```text
60件要求で実際に何件 usable candidateが残るか
duplicate / exclude violation / unresolved readingはどの程度か
rerollで探索範囲が広がるか
```

### Sound Score

```text
low / valid / high Feedbackはどこに集中するか
mora / position / sequence / ending bonusのどこでズレるか
```

### Semantic

```text
高semantic scoreはLikeとある程度対応するか
relation / clusterが候補多様性へ役立っているか
semantic scoreが同義語だけへ偏っていないか
```

### Selector

```text
Balanced / Sound / Semanticの各カテゴリが実際に価値を持つか
fallback頻度は高すぎないか
4/3/3が候補体験として偏っていないか
```

### Operation

```text
1 Roundのlatencyは実用上どの程度か
どのexternal stageが支配的か
token usageはどの程度か
provider failure / refusalは発生するか
```

---

## 3. 評価しないもの

M10 initial βでは以下を最適化しない。

```text
統計的有意差
大規模A/B test
automatic weight tuning
Preference Profile学習
fine-tuning
embedding導入
pairwise LLM reranking
自動prompt optimizer
public tester cohort analysis
```

M10は「観測して次の仮説を作る」段階。

---

## 4. 評価phase

β Evaluationを3段階に分ける。

```text
Phase A
Real Adapter technical smoke

Phase B
Fixed keyword baseline

Phase C
Natural personal usage
```

Phase Aで技術的に通らない状態のままPhase Bへ進まない。

---

# 5. Phase A - Technical smoke

少数inputで、

```text
OpenAI API auth
source reading
candidate generation
candidate reading batch
semantic evaluation
selection
persistence
Browser response
```

を確認する。

推奨smoke keyword:

```text
夜
雨
ネオン
```

最初は1語ずつでよい。

この段階では品質評価を細かく行わない。

確認:

```text
500 / 502で失敗しない
selected candidateが表示される
readingが表示される
Detail Scatterが表示される
DBへmodel / prompt metadataが残る
OpenAI resultとStub resultが自動混在しない
```

---

# 6. Phase B - Fixed keyword baseline

初期baseline set:

```text
夜
雨
光
心
夢
孤独
永遠
東京
ネオン
さよなら
明日
空
```

意図:

```text
短い一般語
抽象語
情景語
感情語
かな表記
カタカナ
固有名詞
複数読みを持ち得る語
```

`明日` / `空` はreading ambiguity probeとして扱う。

これらについて「唯一の正解reading」を機械的に要求せず、ユーザー意図との一致を見る。

---

## 7. Baseline実行単位

各keywordについて最低1 Initial Round。

```text
12 keyword × 1 Round
```

をinitial baselineとする。

Reroll評価は全12語へ必須にせず、少なくとも3 keywordで1回ずつ実施する。

推奨:

```text
夜
孤独
ネオン
```

理由:

```text
情景
抽象
カタカナ
```

の異なるタイプを見るため。

---

# 8. Human Feedback入力

Candidate Like / Dislikeは、selected候補について可能な範囲で入力する。

判断軸:

```text
「実際の歌詞発想として、この候補が出てきたら嬉しいか」
```

単にsemantic scoreが高いかでは判断しない。

Sound Score FeedbackはDetail画面で、

```text
低すぎる
妥当
高すぎる
```

を評価する。

全candidateへのFeedback入力を必須としない。

「評価疲れ」で雑な回答になるより、意味のあるsubsetを優先する。

---

# 9. Reading evaluation

v0.1にはReading専用Feedback UIを追加しない。

Phase Bではsource / selected candidateのreadingを目視し、重大な誤読を別メモへ残す。

最低分類:

```text
correct
acceptable variant
wrong
ambiguous / user-intent dependent
```

将来Reading Feedback UIが必要かは、この頻度を見て判断する。

---

# 10. Quantitative summary

M10ではlocal DBからβ summaryを生成するscriptを追加してよい。

概念command:

```text
npm run beta:report
```

network callは行わない。

出力はstdoutを基本とし、必要ならMarkdown file pathをexplicit optionで指定する。

DBを書き換えない。

---

## 11. beta:reportで集計するもの

最低限:

```text
Session count
Round count

generated target count
evaluated candidate count
selected count

selected category count
fallback count

Candidate Like / Dislike count
Like rate by selectionCategory

Sound Feedback:
  low
  valid
  high

model identifiers
prompt versions
inference config versions

provider call duration
input tokens
output tokens
total tokens

Reading unresolved count
Reading batch item count
```

legacy / missing metadataは `unknown` / `not recorded` として扱う。

---

# 12. Reportで算出しないもの

初期reportでは以下を「自動正解判定」しない。

```text
semantic score accuracy
reading correctness
lyric usefulness
relation taxonomy correctness
```

これらにはhuman judgmentが必要。

---

# 13. Cost observation

DBへ金額を固定保存しない。

保存するのはtoken usage等のprovider usage metadata。

β report時点で必要ならcurrent pricingを使って概算する。

価格変更後もhistorical token usage自体は意味を維持する。

---

# 14. Latency observation

Adapter metadataの `durationMs` を使用する。

少なくとも、

```text
source reading
candidate generation
candidate reading batch
semantic evaluation
```

のcall durationを確認可能にする。

initial βではP50 / P95等の高度な統計を必須にしない。

sampleが増えたら検討する。

---

# 15. Candidate pool analysis

Raw snapshotを使って以下を確認可能にする。

```text
Generation output count
duplicate candidateKey
canonical duplicate
excludeTerms再出現
candidate reading unresolved
semantic missing / duplicate / unknown
evaluated pool size
selected count
```

raw model outputを人間向けreportへ全件dumpしない。

必要時にSession / Roundを指定して確認する。

---

# 16. Selector analysis

category単位で、

```text
selected count
Like
Dislike
Sound Feedback
fallback
```

を集計する。

4/3/3を事前に「成功」とみなさない。

例えば、

```text
Sound-focusedが一貫してDislike
```

ならSelectionConfig変更候補となる。

ただしM10 implementation中に自動変更しない。

---

# 17. Semantic analysis

Semantic ScoreとCandidate Feedbackの関係を見る。

例:

```text
semantic 80以上でもDislikeが多い
semantic 40前後でもLikeが多い
```

等。

これはSemantic Evaluatorだけの問題とは限らない。

Candidate usefulnessは、

```text
Sound
Semantic
Selector category
relation
cluster
word itself
```

の複合結果なので、単一原因へ即断しない。

---

# 18. Sound analysis

Sound Feedbackと、

```text
finalScore
moraLengthScore
positionMatchScore
sequenceSimilarityScore
endingBonus
```

の関係を見る。

例:

```text
high feedbackがEnding Bonus高値に集中
```

ならEnding Bonus過大の仮説になる。

β前に閾値を固定しない。

---

# 19. Reading ambiguity

source readingがユーザー意図と違う場合、Sound Score全体が意味を失う可能性がある。

したがって多読語では、

```text
Resolverが技術的にreadingを返した
```

だけで成功扱いしない。

`明日` / `空` 等を意図的にbaselineへ含める。

manual reading overrideの必要性はM10 β後に判断する。

---

# 20. Reroll evaluation

Rerollでは、

```text
previous selected candidateが再表示されないか
意味領域が広がるか
候補品質が急落しないか
selected 0件が頻発しないか
```

を見る。

`excludeTerms` をDislike学習として評価しない。

---

# 21. Failure observation

以下が発生した場合はSession / Round contextを記録する。

```text
SOURCE_READING_UNRESOLVED
READING_RESOLVER_FAILED
CANDIDATE_GENERATION_FAILED
SEMANTIC_EVALUATION_FAILED
NO_EVALUABLE_CANDIDATES
UPSTREAM_UNAVAILABLE
```

M10ではfailed pipeline persistence tableを追加しない。

DBにcompleted Roundがないfailureは、必要に応じて手動メモ / server logで確認する。

頻度が高ければfuture operation log設計を検討する。

---

# 22. Prompt iteration rule

Prompt変更は、

```text
candidate-openai-v0.1
semantic-openai-v0.1
reading-openai-v0.1
```

を上書きしない。

意味のあるprompt変更時はversionを増やす。

例:

```text
candidate-openai-v0.2
```

古いRoundを再解釈して上書きしない。

---

# 23. Model iteration rule

model変更時はenv変更だけで可能だが、model identifierをRound metadataへ必ず保存する。

baseline比較中に複数modelを無秩序に混ぜない。

比較する場合:

```text
baseline A
model X

baseline B
model Y
```

のように意図的に分ける。

---

# 24. Inference config iteration

reasoning effort / retry / Responses API behaviorを変更した場合、

```text
inferenceConfigVersion
```

を更新する。

model / promptだけで変更履歴を表現しない。

---

# 25. 初期βの判定方法

M10終了時に、

```text
GO
CONDITIONAL GO
REVISE
```

のような大きな判断は可能。

ただし数値だけで自動判定しない。

見るもの:

```text
実際に使いたい候補が出るか
reading errorが致命的か
latencyが我慢できるか
API costが現実的か
Sound Scoreが感覚と大きくズレるか
Semantic軸が候補多様性へ効いているか
UIからFeedbackを無理なく入れられるか
```

---

# 26. M10で変更しないProduct rule

β結果を見る前に以下を自動変更しない。

```text
Sound formula
4/3/3
Balanced 0.7 / 0.3
cluster cap
fallback
Semantic taxonomy
generation target 60
```

変更提案はβ結果を根拠に次Decisionとして扱う。

---

# 27. β data isolation

M8までのStub開発データとreal β dataを混同しない。

推奨:

```text
real beta用SQLite DBを別pathで開始
```

例:

```text
data/lyrics-assist-beta.db
```

実際のfilenameはGit管理しない。

`LYRICS_ASSIST_DB_PATH` で切り替える。

migrationを明示適用してから使用する。

---

# 28. API project isolation

OpenAI API側でも可能なら本アプリ用Projectを分ける。

目的:

```text
usage把握
spend control
key rotation
将来staging / production分離
```

M10 personal βでは1 projectで十分。

---

# 29. M10 evaluation completion criteria

1. Real Adapter technical smokeが成功する。
2. Fixed baseline setを実行できる。
3. Candidate / Sound Feedbackをreal resultへ保存できる。
4. Reading ambiguityを目視確認できる。
5. model / prompt / inference config metadataを追跡できる。
6. token usage / durationをβ reportで確認できる。
7. Stub dataとreal β dataを区別できる。
8. Rerollの既出候補除外をreal providerで確認できる。
9. β結果を根拠なしにScoring / Selectorへ自動反映しない。
10. 次の改善仮説を作れるだけの記録が残る。
