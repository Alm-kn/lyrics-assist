# Lyrics Assist

日本語の歌詞制作を補助する個人向けWebアプリのv0.1 β。

1つのキーワードから、以下の2軸をもとに候補語を10語提示する。

- 語感類似度
- 意味・文脈近接度

v0.1は完成品ではなく、候補選出とスコアリングの納得度を検証するβ版。

## Documentation

- `docs/requirements-v0.1.md` - 要件定義
- `docs/system-design-v0.1.md` - システム設計
- `docs/implementation-plan-v0.1.md` - Codex実装順
- `docs/decisions.md` - 設計判断
- `docs/roadmap.md` - 将来機能
- `docs/development-setup.md` - Windows開発環境準備

## Development status

M0 project bootstrap complete. Product features have not been implemented.

## Development

Prerequisites:

- Node.js 24 LTS
- npm 11

Common commands:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
```
