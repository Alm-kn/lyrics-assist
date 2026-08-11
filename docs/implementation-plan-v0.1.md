# Implementation Plan v0.1 β

## 方針

Codexへ要件定義書と設計書を一度に渡して「全部実装」させない。
各Milestoneを1タスクとして実装し、テスト・差分確認・動作確認を挟んでから次へ進む。

レビューはコードを一行ずつ理解することを意味しない。各Milestoneで最低限、以下を確認する。

1. Codexが変更内容を要約できる。
2. 指定したテスト / lint / typecheck が通る。
3. 想定した振る舞いを簡単な入力例で確認できる。
4. 設計書からの逸脱がある場合、理由が明示されている。
5. 不明な差分は次Milestoneへ進む前にChatで確認する。

## Milestones

### M0 - Project bootstrap
- Next.js + TypeScript project
- npm
- lint / typecheck
- Vitest
- Playwright skeleton
- directory skeleton
- プロダクト機能は実装しない

### M1 - Domain types
- ReadingResult
- normalized rhyme representations
- SoundScoreResult
- SemanticResult
- SelectionResult
- version/config types

### M2 - Rhyme Normalizer
- 長音
- 促音 Q -> X
- 撥音 N -> X
- 拗音
- o+u -> o+o（暫定）
- e+i -> e+e（暫定）
- unit tests

### M3 - Sound Scorer
- mora length similarity
- normalized position match
- standard Levenshtein sequence similarity
- linear suffix-coverage ending bonus (0..10)
- versioned sound scoring config
- score breakdown / ending adjustment metrics
- symmetry / determinism / boundary unit tests

### M4 - LLM Adapter stub
- Application PortとしてLLM Adapter contractを定義
- `generateCandidates()` contract
- `evaluateSemantics()` contract
- candidateKeyによるcandidate対応付け
- generation / semantic metadata
- fixture injection型 deterministic Stub
- network / OpenAI SDK / API keyなし
- contract unit tests
- M5以降には着手しない

### M5 - Candidate Selector
- Balanced 4
- Sound-focused 3
- Semantic-focused 3
- duplicate filtering
- semantic diversity
- fallback allocation
- unit tests

### M6 - Persistence
- SQLite + Drizzle
- session / round / candidate snapshot / feedback / configs
- migration
- repository layer

### M7 - Application services
- Generation Service
- Reroll Service
- Feedback Service
- stub LLMを使ったintegration tests

### M8 - Backend API
- generation
- reroll
- session retrieval
- candidate feedback
- sound-score feedback

### M9 - Web UI
- initial screen
- result screen
- detail XY scatter plot
- reroll
- feedback

### M10 - Real LLM connection and beta evaluation
- OpenAI Responses API + Structured Outputs
- model via environment variable
- fixed keyword evaluation set
- latency / quality / cost observation

## Codex task rule

- 1つの依頼では原則1 Milestoneのみ扱う。
- 次Milestoneへ自動で進まない。
- 完了時に変更ファイル、実行した検証、残課題を報告する。
- 設計変更が必要なら実装で黙って吸収せず、提案として止める。
