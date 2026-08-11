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

注: Decision Logに既存の番号重複がある場合は、今回の更新では新しいDecision番号を追加せず、既存D-004の内容更新だけに留める。

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