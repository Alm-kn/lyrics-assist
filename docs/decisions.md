# 歌詞作成補助ツール Decision Log

更新日: 2026-08-11

## D-001 プロダクトの目的
**決定:** 類語辞典や韻検索ではなく、「言葉の発想を広げる作詞支援ツール」とする。

## D-002 v0.1 の位置づけ
**決定:** 個人利用向けβ版。評価関数の正解を最初から固定せず、実際の出力への納得度FBをもとに改善する。

## D-003 評価軸
**決定:** 語感類似度 / 意味・文脈近接度の2軸。v0.1では同価値（50:50）。

## D-004 語感評価
**決定:** LLM主観採点ではなく、再現可能な音韻アルゴリズム + 作詞向け補正のハイブリッド方式とする。

**v0.1初期仮説:**

```text
SoundScore
 =
 0.40 × MoraLengthSimilarity
+0.25 × PositionMatchSimilarity
+0.25 × SequenceSimilarity
+EndingRhymeBonus
```

- Mora Length: 40%
- Position Match: 25%
- 標準Levenshtein由来のSequence Similarity: 25%
- Ending Rhyme Bonus: 0〜10点
- negative adjustmentはv0.1では使用しない

Ending Rhyme Bonusは、Normalized列の共通末尾unit数を2語の長い方のNormalized lengthで割った `suffixCoverage` を用い、`suffixCoverage × 10` の線形補正とする。

**備考:** 上記はβ検証用の仮説であり、各中間値・config versionを保存してSound Score Feedbackから調整する。

## D-005 意味・文脈評価
**決定:** 曖昧性が高いためLLMを主に利用。類義だけでなく情景、感情、因果、連想、比喩を含める。

## D-006 10語選抜
**決定:** 総合点上位10件にはせず、意味・連想クラスタの重複を抑えて候補集合全体の多様性を確保する。

## D-007 作詞用韻正規化
**決定:** 元の読み / 音韻解析 / 作詞用正規化の3層で保持し、ルール変更後も再計算可能にする。
**暫定:** ー=直前母音、っ=Q、ん=N、比較時Q/N→X、拗音1モーラ、o+u→o+o、e+i→e+e。

## D-008 フィードバック
**決定:** 「候補が好きか」と「語感スコアに納得できるか」を別データとして扱う。

## D-009 個人チューニング
**決定:** 保存形式は数値・構造化データを基本とし、Fine-tuningは初期段階では行わない。

## D-010 将来機能の管理
**決定:** v0.1要件と将来構想を分離し、将来案は roadmap.md に置く。

## D-011 v0.1 技術スタックを単一TypeScript Webアプリ構成とする

**決定:** v0.1 βでは以下を仮採用する。

- Node.js 24 LTS
- Next.js App Router + React + TypeScript
- Next.js Route Handlers
- CSS Modules / Global CSS
- Zod
- SQLite
- Drizzle ORM
- Vitest
- Playwright
- OpenAI Responses API + Structured Outputs
- npm
- Git（GitHub Privateは推奨・任意）

**理由:** 個人開発βでの環境構築・デプロイ・保守負荷を抑えつつ、UI / Backend / Domainを一つのリポジトリに置けるため。LLM・DB・Reading Resolverは差し替え可能なI/Fを維持する。

**状態:** Accepted for v0.1 beta. β結果や少人数公開要件に応じて再評価する。

## D-012 作詞用音韻表現をRaw / Phonetic / Normalizedの3層に分離する

**決定:** Rhyme Normalizerでは、読みを以下の3層で保持する。

1. Raw Reading
2. Phonetic Representation
3. Normalized Rhyme Representation

Phonetic層では促音を `Q`、撥音を `N` として区別する。
Normalized層ではv0.1の韻比較上、両者を特殊モーラクラス `X` として扱う。

通常モーラは子音と母音を保持し、拗音は1モーラとして解析する。
長音 `ー` はPhonetic層で保持し、Normalized層で直前母音を継承する。

v0.1 βの暫定ルールとして以下を適用する。

- `o + u -> o + o`
- `e + i -> e + e`

これら以外の異母音列は一般化して変換しない。

**理由:** 作詞上の韻判定と日本語の元の音韻情報を分離し、v0.1で簡潔な比較を行いつつ、将来的な特殊モーラ・子音・歌唱発音の評価変更を可能にするため。

**責務境界:** Rhyme Normalizerは読みが確定済みのかな文字列のみを扱う。漢字からの読み推定はReading Resolverの責務とし、LLM・意味評価・Sound Score計算には依存しない。

**状態:** Accepted for v0.1 beta.

## D-013 LLMとの境界をApplication Portとして定義する

**決定:** Application層はOpenAI等の具体SDKへ直接依存せず、LLM Adapter Portを介してCandidate GenerationとSemantic Evaluationを利用する。

Infrastructure側がこのPortを実装する。

M4ではfixture injection型のdeterministic Stubのみ実装し、実LLM接続は行わない。

Semantic EvaluationにはSound Scoreや音韻類似情報を渡さず、意味・文脈軸をSound軸から独立して評価する。

候補とSemantic結果の対応付けには配列indexではなく `candidateKey` を使用する。

**理由:** LLM provider / model / prompt変更からApplicationロジックを分離し、Sound軸とSemantic軸の独立性、テスト再現性、将来のAdapter差し替え可能性を保つため。

## D-014 v0.1 Candidate Selector

**決定:** D-006の10語選抜方針を、v0.1 Candidate Selectorの具体ルールとして以下の通り定義する。

- Primary targetはBalanced 4 / Sound 3 / Semantic 3。
- Balanced rankは `0.7 * min(sound, semantic) + 0.3 * mean(sound, semantic)`。
- Balanced primaryでは同一semanticCluster最大2。
- Sound-focusedではSemantic情報による減点を行わない。
- Semantic-focused primaryでは同一semanticCluster最大1とし、relation / cluster diversityを優先する。
- literal duplicateとsemantic redundancyを別概念として扱う。
- duplicate判定はcanonical surfaceを基準とし、reading一致だけでは除外しない。
- 不足時はBalanced -> Sound -> Semanticのround-robin fallbackを行う。
- hard exclusionはfallbackでも解除せず、diversity constraintだけを必要時に緩和する。
- v0.1ではabsolute score thresholdを設定しない。βデータ取得後に実測score distributionを基に検討する。

**理由:** 単純な総合点上位ではなく、音・意味・両立の3方向を保ちつつ、候補集合全体の多様性と再現性を確保するため。

**状態:** Accepted for v0.1 beta.

## D-015 v0.1 Persistenceをimmutable experiment snapshotとして保存する

**決定:** v0.1ではSQLite + DrizzleをPersistence layerとして使用し、
GenerationSession / GenerationRound / CandidateResultを当時の生成・評価・選抜結果のsnapshotとして保存する。

Sound / Semantic評価済みcandidate poolはselected / unselectedを問わず保存する。
後に評価基準が変更されても、過去のscore / selectionを新しい値で上書きしない。

Candidate Generation / Semantic Evaluation / Selectionの完全resultはJSON snapshotとして保持し、
主要なscore / relation / selection情報は分析用columnへprojectionする。

CandidateFeedback / SoundScoreFeedbackは履歴ではなくcurrent stateとして保持する。
ScoringConfig / SelectionConfigはversioned immutable configとして保存する。

M6ではPreferenceProfile、再評価履歴、LLM call log、failed pipeline log、performance timingを実装しない。

**理由:** v0.1 βの目的は、その時点の評価ロジックとユーザー反応を後から比較・分析し、
Sound / Semantic / Selection基準を実測データから改善することにあるため。
過去データを「現在の正解」へ書き換えると当時の挙動を復元できなくなるため、
実験記録としての履歴保存を優先する。

**状態:** Accepted for v0.1 beta.

## D-016 M6ではDrizzle RCをexact pinしてNode SQLiteを利用する

**決定:** M6では `node:sqlite` とDrizzleの互換性確認結果に基づき、
`drizzle-orm@1.0.0-rc.4` / `drizzle-kit@1.0.0-rc.4` をexact versionで採用する。

RC Smoke Gateにより、Node.js 24.19.0上でDB接続、Foreign Key enforcement、
migration generation / application、query、integrity checkが成立することを確認した。

Product / Domain仕様はRC版へ依存させない。
Drizzleのstable版でNode SQLite workflowが利用可能になった時点で、
import path、migration、schema snapshot互換性を再確認した上で移行を検討する。

**理由:** stable版では今回必要なNode SQLite integrationが利用できず、
公式Node SQLiteガイドもRC版を案内しているため。

**状態:** Accepted for v0.1 beta.