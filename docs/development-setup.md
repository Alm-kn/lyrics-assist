# Development Setup (Windows) - v0.1

## 現在の前提

- ChatGPT Desktop: installed
- Git: `git --version` が成功するため導入済み
- Node.js / npm: 未導入想定

## 1. Gitの状態確認

Git Bash または PowerShell で:

```bash
git --version
git config --global user.name
git config --global user.email
```

`git --version` が表示されればGit本体は利用可能。
`user.name` / `user.email` が空でも現段階では異常ではない。最初のcommit前に設定する。

## 2. Node.jsをインストール

v0.1では **Node.js 24 LTS** を使用する。
Windows用の公式Node.jsインストーラーからLTS版をインストールする。
npmはNode.jsに同梱されるため、npmを別途インストールしない。

インストール後、新しいGit BashまたはPowerShellを開き直して:

```bash
node --version
npm --version
```

確認目安:

- `node --version` -> `v24.x.x`
- `npm --version` -> バージョン番号が表示される

## 3. 現時点では不要

以下はまだ実施しなくてよい。

- `git init`
- Next.jsプロジェクト生成
- OpenAI API key設定
- SQLiteの個別インストール
- Drizzle / Vitest / Playwrightの個別インストール
- Codex worktree設定

これらはリポジトリ作成フェーズまたはCodexのM0で行う。

## 4. GitHub

GitHubはCodex Local利用の必須条件ではない。
ただしバックアップ、Private repository、将来のbranch/PR運用のため利用を推奨する。

初回は以下だけ準備すればよい。

1. GitHub personal accountを作成
2. メールアドレスをverify
3. 2FAを設定（推奨）
4. repository作成はローカルproject作成時に行う

GitHub repositoryの作成・local Gitとの接続は次工程で行う。
