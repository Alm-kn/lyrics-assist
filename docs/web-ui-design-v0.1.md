# Web UI 詳細設計 v0.1

更新日: 2026-08-12

## 1. 位置づけ

本書は M9 - Web UI の詳細設計を定義する。

M8までに、Browserから利用可能なBackend APIとして以下が成立している。

```text
POST /api/generations
POST /api/sessions/{sessionId}/reroll
GET  /api/sessions/{sessionId}
POST /api/feedback/candidate
POST /api/feedback/sound-score
```

M9の目的は、このAPI上にv0.1 β向けの最小Web UIを構築し、

```text
keyword入力
↓
候補を見る
↓
reroll
↓
詳細Scatter Plot
↓
2種類のFeedback
```

をBrowserから一通り操作可能にすることである。

UIの完成度自体もβ feedbackの対象とし、v0.1では過度に作り込まない。

---

## 2. M9の設計原則

M9では以下を優先する。

1. 候補語そのものを主役にする。
2. 初期画面と結果画面を情報過多にしない。
3. β評価に必要なSound / Semantic情報は詳細画面へ寄せる。
4. reloadしてもDBのcurrent feedbackと画面表示を一致させる。
5. hoverだけに依存しない。
6. pending / error時に現在の有効な結果を不用意に消さない。
7. M8 API contractをBrowserからのみ利用し、Client Componentからserver / persistenceを直接importしない。
8. 新しいUI framework / chart library / state management libraryを導入しない。
9. CSS Modules + Global CSSで実装する。
10. UI文言・余白・色等の細部はβで更新可能なものとして扱う。

---

## 3. M9 scope

M9で実装する。

```text
Home
Session Result
Session Detail / XY Scatter Plot
Generation
Reroll
Candidate Like / Dislike
Sound Score Feedback
reload後のFeedback state復元
loading / pending / error UI
responsive layout
keyboard / pointer accessibility
Playwright E2E
```

M9では実装しない。

```text
real LLM
real Reading Resolver
authentication
account UI
history browser / session list
past Round selector
Preference Profile
weight slider
partial rhyme
phrase input
dark mode
theme selector
animation framework
toast library
chart library
component library
analytics SDK
public deployment security
```

---

## 4. Route design

M9では3画面を使用する。

| Path | 役割 |
| --- | --- |
| `/` | keyword入力 |
| `/sessions/[sessionId]` | Sessionの最新Round結果 |
| `/sessions/[sessionId]/detail` | 最新RoundのXY詳細 |

過去Roundの個別閲覧routeはv0.1では作らない。

Session GETは全Roundを返すが、通常UIでは最新Roundを表示する。

直接URLを開いた場合も、Session APIからcurrent persisted snapshotを復元する。

---

## 5. Server / Client Component boundary

Page / Layoutは可能な限りServer Componentのまま保つ。

state / event / Browser fetchが必要な部分のみClient Componentにする。

概念:

```text
app/page.tsx
  ↓
GenerationFormClient

app/sessions/[sessionId]/page.tsx
  ↓
SessionResultClient

app/sessions/[sessionId]/detail/page.tsx
  ↓
SessionDetailClient
```

dynamic pageの `params` はcurrent Next.js App Router contractに従いasyncに解決し、Server PageからClient Componentへ `sessionId` をprimitive stringとして渡す。

Client Componentから以下をimportしない。

```text
src/server
src/infrastructure
node:sqlite
Drizzle
server-only environment
```

---

## 6. Browser API client

M9ではBrowser専用の薄いAPI clientを用意する。

概念:

```text
src/client/api/
  client.ts
  error.ts
```

提供する操作:

```text
generate(sourceSurface)
getSession(sessionId)
reroll(sessionId)
submitCandidateFeedback(candidateResultId, value)
submitSoundScoreFeedback(candidateResultId, value)
```

requestはsame-origin relative URLへ `fetch` する。

Browserから `userId` は送らない。

GETも含め `cache: "no-store"` を明示してよい。

API clientはpublic error envelopeを `ApiClientError` 等へ変換し、UIはserver internal errorを知らない。

---

## 7. Shared public API contract types

M8のserver DTO型をClient Componentから直接importしない。

server / client双方で参照可能なpublic contract型を、

```text
src/contracts/api/
```

等のneutral layerへ置く。

最低限:

```ts
type CandidateFeedbackValue = "like" | "dislike";
type SoundScoreFeedbackValue = "low" | "valid" | "high";

type CandidateFeedbackState = {
  candidate: CandidateFeedbackValue | null;
  soundScore: SoundScoreFeedbackValue | null;
};

type ApiCandidate = {
  candidateResultId: string;
  surface: string;
  reading: string;
  sound: ...;
  semantic: ...;
  selection: ...;
  feedback: CandidateFeedbackState;
};

type GeneratedRoundApiDto = ...;
type SessionApiDto = ...;
```

public contract型はserver-only moduleへ依存しない。

Zod request schemaをBrowser bundleへ共有する必要はない。

---

## 8. Feedback state read-contract extension

M9で承認済みのUX要件として、

> reload後もDBに保存されたcurrent feedbackを画面へ復元する。

これを実現するため、M7 / M8のread contractを最小拡張する。

DB schema変更は行わない。

### 8.1 Application

selected candidate viewへ以下を追加する。

```ts
feedback: {
  candidate: "like" | "dislike" | null;
  soundScore: "low" | "valid" | "high" | null;
}
```

Initial Generation / Reroll直後の新しいCandidateResultにはfeedback rowが存在しないため、両方 `null`。

Session QueryではPersistenceからcurrent stateを読み、値を設定する。

### 8.2 Persistence Query

Session Query用read modelで、

```text
candidate_feedback
sound_score_feedback
```

をcandidate_result_id単位で参照し、rowがなければ `null` とする。

Feedback tableのschema、PK、current-state upsert方針は変更しない。

### 8.3 Backend API

Generated Round / Sessionの `ApiCandidate` に同じ `feedback` objectを含める。

Browserへfeedback historyは返さない。

---

## 9. Home画面

目的は「1語入れて候補を探す」だけに絞る。

概念レイアウト:

```text
┌──────────────────────────────┐

          ことばを探す

      [ キーワード          ]
          [ 探す ]

└──────────────────────────────┘
```

表示要素:

```text
h1: ことばを探す
label: キーワード
placeholder: 例：夜
submit: 探す
```

固定Product brandを新たに決定しない。

説明文、高度設定、Sound / Semantic sliderは表示しない。

---

## 10. Generation interaction

form submit時:

```text
1. trim前の入力はそのままAPIへ送らず、UI側でもemptyを防ぐ
2. submit buttonをpending
3. inputを変更不可にして二重submitを防ぐ
4. POST /api/generations
5. successで /sessions/{sessionId} へrouter.push
6. failureなら同画面へerror表示
7. 入力値はerror時に維持
```

Enter submitを利用可能にする。

programmatic navigationが必要なGeneration successでは `useRouter().push(...)` を使用する。

通常の画面間navigationは `<Link>` を優先する。

---

## 11. Generation pending

pending中は大きなoverlayを出さず、formの位置関係を維持する。

概念:

```text
[ 夜                         ]
[ 探しています… ] disabled
```

`aria-live="polite"` でpending / error messageを通知する。

spinner dependencyは追加しない。

必要ならCSSのみの小さなindicatorを使用する。

---

## 12. Result画面

Session GET後、`roundNumber` が最大のRoundをlatestとして表示する。

概念:

```text
夜

[ もう一度探す ]           [ 詳細を見る ]

┌ 候補 ────────────────┐
│ 静寂                  │
│ [ Like ] [ Dislike ]  │
└──────────────────────┘

┌ 候補 ────────────────┐
│ ネオン                │
│ [ Like ] [ Dislike ]  │
└──────────────────────┘

...
```

候補数は最大10を前提にしつつ、0〜9件でも壊れない。

---

## 13. Result画面で表示しない情報

通常結果画面では以下を主表示しない。

```text
Sound score
Semantic score
Sound breakdown
Semantic reason
selectionCategory
fallbackStrategy
cluster
```

Candidate Selectorの内部戦略を先に見せると、ユーザーが「言葉として好きか」よりscoreを見て評価する可能性があるため。

詳細分析はDetail画面へ寄せる。

---

## 14. Candidate card

Candidate cardの主情報:

```text
surface
reading（必要に応じて補助的に小さく表示）
Like
Dislike
```

readingはsurfaceと同じ情報量にならないようsecondary styleにする。

Like / Dislikeはnative `<button>` を使用する。

selected stateは色だけでなく、

```text
aria-pressed
文字 / border / shapeの差
```

でも表現する。

---

## 15. Candidate Feedback interaction

Candidate Feedbackはcurrent stateであり、neutralへ戻すAPIは存在しない。

UI behavior:

```text
null
  -> Like
  -> Dislike

Like
  -> Like再押下: no-op
  -> Dislike: Dislikeへ更新

Dislike
  -> Dislike再押下: no-op
  -> Like: Likeへ更新
```

選択済みボタンを押してneutralへ戻すUIは作らない。

feedback request中はそのcandidateのLike / Dislike pairのみdisableする。

成功response後にlocal stateを更新する。

失敗時はDBとUIの不一致を避けるため、以前の表示状態を維持しinline errorを出す。

v0.1ではoptimistic updateを必須にしない。


## 16. Reroll interaction

Reroll button:

```text
もう一度探す
```

押下時:

```text
1. current latest Roundを画面に残す
2. reroll buttonのみpending / disabled
3. POST /api/sessions/{sessionId}/reroll
4. successで返ったnew RoundをSession local stateへ追加
5. new Roundをlatestとして表示
6. failureなら旧Roundをそのまま表示
```

reroll中に旧候補を空画面へ置き換えない。

同一Session URLを維持する。

成功後に別Sessionを作らない。

---

## 17. Empty selected Round

evaluated candidateは存在するがselected 0件のcompleted RoundもM7で許容されている。

UIは例外扱いで壊れず、

```text
今回は表示できる候補がありませんでした。
```

等の短いmessageを表示する。

同一Sessionで再度reroll可能にする。

0件を「通信失敗」として扱わない。

---

## 18. Detail navigation

Result画面から、

```text
詳細を見る
```

を `<Link>` で、

```text
/sessions/{sessionId}/detail
```

へ遷移させる。

Detail画面には、

```text
結果へ戻る
```

を `<Link>` で用意する。

Browser backも自然に利用できる。

---

## 19. Detail画面

Detailは最新Roundのselected candidateを分析する画面。

概念:

```text
夜
[ 結果へ戻る ]

Semantic
100 ┤          ●
    │   ●
    │              ●
    │ ●
  0 └────────────────── 100 Sound

[ 静寂 ] [ ネオン ] [ ... ]

────────────────────────

静寂
Sound      82
Semantic   67

意味:
夜の静けさと関連する...

Sound breakdown:
...

語感点は？
[ 低すぎる ] [ 妥当 ] [ 高すぎる ]
```

---

## 20. Scatter Plot data

Plotするのは最新Roundのselected candidateのみ。

通常0〜10点。

座標:

```text
x = sound.finalScore
y = semantic.score
```

axis range:

```text
0 .. 100 fixed
```

x:

```text
left 0
right 100
```

y:

```text
bottom 0
top 100
```

data rangeに合わせてauto scaleしない。

Round間・Session間で位置の意味を一貫させる。

---

## 21. Scatter Plot implementation

新しいchart libraryは追加しない。

SVG + React + CSSで実装する。

最低限:

```text
axis
0 / 50 / 100程度の補助tick
candidate point
active point state
```

を持つ。

装飾的なgridやanimationを増やしすぎない。

point位置へvisual jitterを加えない。

同score候補が重なった場合も実座標を維持し、候補legendから個別に選択可能にする。

---

## 22. Scatter interaction

Desktop:

```text
hover
focus
click
```

Mobile / touch:

```text
tap
```

でactive candidateを切り替える。

hoverだけを唯一の操作手段にしない。

SVG pointとlegendは同じactive candidate stateを共有する。

active pointは他pointより視覚的に強調する。

tooltipだけに情報を閉じ込めず、下部のdetail panelにも同じ主要情報を表示する。

---

## 23. Scatter accessibility

候補legendはnative `<button>` で実装し、keyboardから必ずcandidateを選択できるようにする。

SVG pointをfocusableにする場合も、legendをkeyboard操作の確実なfallbackとする。

色だけでcandidateを区別しない。

各candidate point / legendのaccessible labelには少なくとも、

```text
surface
Sound score
Semantic score
```

を含める。

---

## 24. Active candidate

Detailを開いた時:

```text
selected candidate >= 1
-> selectionRank 1のcandidateをactive

selected candidate = 0
-> active candidateなし
```

active candidateを変更してもURLは変更しない。

v0.1ではcandidateごとのdeep linkは作らない。

---

## 25. Detail candidate panel

active candidateについて表示する。

```text
surface
reading

Sound final score
mora length score
position match score
sequence similarity score
common suffix / suffix coverage / ending bonus

Semantic score
reason
primary relation
secondary relations
semantic cluster

selection category
fallback strategy（存在時のみ）
selection rank

Sound Score Feedback
```

分析画面なのでselection metadataはここでは表示してよい。

raw provider metadata、candidateKey、raw snapshotは表示しない。

---

## 26. Sound Score Feedback interaction

表示ラベル:

```text
低すぎる
妥当
高すぎる
```

API value:

```text
low
valid
high
```

Candidate Like / Dislikeとは独立state。

current-state rule:

```text
同じ値を再押下
-> no-op

別値
-> current valueを更新
```

neutralへ戻すUIは作らない。

request中は3buttonをdisableする。

成功後にlocal state更新。

失敗時は以前のstateを維持しinline errorを表示する。

---

## 27. Feedback reload behavior

Session GET後、

```text
candidate.feedback.candidate
candidate.feedback.soundScore
```

をUI initial stateとして使用する。

したがって、

```text
Like保存
↓
reload
↓
Like selected表示を復元
```

および、

```text
Sound = valid保存
↓
detail reload
↓
妥当 selected表示を復元
```

を保証する。

Browser localStorageをfeedbackのsource of truthにしない。

DB current stateがsource of truth。

---

## 28. Session loading

Session / Detail direct access時はClientから、

```text
GET /api/sessions/{sessionId}
```

を実行する。

loading中:

```text
結果を読み込んでいます…
```

等の短いstatusを表示する。

空のCandidate cardを大量に並べるskeleton UIはv0.1では必須としない。

---

## 29. Session error behavior

public API error codeを日本語UIへ変換する。

例:

```text
INVALID_REQUEST
-> リクエストを確認できませんでした。

SOURCE_READING_UNRESOLVED
-> 読みを判定できませんでした。別の表記で試してください。

NO_EVALUABLE_CANDIDATES
-> 候補を評価できませんでした。もう一度試してください。

NOT_FOUND
-> このセッションは見つかりませんでした。

UPSTREAM_UNAVAILABLE
-> 生成処理を利用できませんでした。少し後で試してください。

INTERNAL_ERROR
-> 処理中に問題が発生しました。
```

内部causeは表示しない。

network failureは、

```text
通信に失敗しました。
```

等の別messageにしてよい。

---

## 30. Error placement

Generation error:

```text
Home form直下
```

Session load error:

```text
page main area
+ Homeへ戻るLink
+ retry button（network / recoverable error）
```

Reroll error:

```text
reroll control付近
```

Feedback error:

```text
該当candidate control付近
```

全体toast systemは導入しない。

---

## 31. UI state ownership

global state libraryは使用しない。

概念:

```text
Home:
  input
  generation pending/error

SessionResultClient:
  SessionApiDto
  load pending/error
  reroll pending/error
  per-candidate feedback pending/error

SessionDetailClient:
  SessionApiDto
  active candidate
  load pending/error
  per-candidate sound feedback pending/error
```

必要ならshared hook / reducerを作ってよいが、アプリ全体storeは作らない。

---

## 32. Session canonical state

Browser reloadのcanonical sourceはSession API。

Reroll POST成功responseはPersistence完了後のnew Roundなので、current pageではSession local stateへappendしてよい。

不要な追加GETを必須にしない。

ただしBrowser reload / direct navigationでは必ずSession GETから復元する。

---

## 33. Public DTO ordering

M8 / M7 contractのorderingをUIでも維持する。

```text
rounds:
  roundNumber ascending

candidates:
  selectionRank ascending
```

Result / Detailのlatest Round:

```text
最後のRound
```

Candidate cardをUI側でSound / Semantic score順へ並べ替えない。

---

## 34. Visual design direction

v0.1は「分析ツール」より「言葉を探す道具」に見えることを優先する。

方向性:

```text
neutral
quiet
editorial
one accent color
wide whitespace
clear typography
scoreはDetailで初めて前面化
```

派手なgradient、glass effect、3D、過剰なanimationは使わない。

system font stackを使用し、Web font dependencyを追加しない。

---

## 35. Layout

Home:

```text
narrow centered column
```

Result:

```text
medium centered column
desktop: candidate card 2 columns
mobile: 1 column
```

Detail:

```text
wider centered column
plot
legend
detail panel
```

具体pxはimplementation時にCSS上で調整してよい。

UI設計上の意味を変えない範囲でresponsive breakpointはCodexが適切に選んでよい。

---

## 36. Responsive behavior

minimum target:

```text
mobile narrow viewport
tablet
desktop
```

横scrollを通常layoutで発生させない。

Scatter Plotはcontainer widthへ追従し、viewBoxでscaleする。

button / inputはtouchでも操作しやすい大きさを確保する。

---

## 37. CSS architecture

既存方針どおり、

```text
Global CSS
CSS Modules
```

を使用する。

Global:

```text
reset / base
font
background
CSS custom properties
focus-visible
```

Component:

```text
layout
card
form
plot
feedback control
```

Tailwind、CSS-in-JS library、component libraryは追加しない。

---

## 38. Semantic HTML / Accessibility

最低限:

```text
label + input
native button
nav / main / section等の適切なlandmark
heading hierarchy
aria-live for async status / error
aria-pressed for toggle-like feedback buttons
focus-visible
keyboard operability
```

buttonを`div onClick`で代用しない。

Like / Dislike、Sound Feedbackは色だけでstateを示さない。

---

## 39. Motion

v0.1ではmotionを最小限にする。

feedback state、hover、focus等へ短いCSS transitionは使用してよい。

`prefers-reduced-motion` を尊重する。

ページ遷移animation frameworkは追加しない。

---

## 40. No client-side secrets

Client bundleへ以下をimport / exposeしない。

```text
LYRICS_ASSIST_BETA_USER_ID
LYRICS_ASSIST_DB_PATH
future OPENAI_API_KEY
server composition
Persistence
raw provider result
```

BrowserはM8 public APIのみを利用する。

---

## 41. M9 cross-layer change: Feedback read model

M9実装ではUIだけでなく、reload state復元のため次の最小cross-layer変更を行う。

```text
M7:
Session Query candidate viewへcurrent feedback追加

M8:
ApiCandidateへfeedback追加
Generated Roundはnull/null
Session GETはDB current state

M9:
response stateをcontrolsへ反映
```

禁止:

```text
DB schema変更
feedback history追加
neutral delete endpoint追加
new feedback type追加
```

このcross-layer extensionはM9 scopeとして明示承認済みとする。

---

## 42. Test layering

```text
M7
Application / Persistence read model
current feedback state取得

M8
public DTOへfeedback state mapping

M9
Browser interaction / reload / navigation / visual state
```

同じassertionを全層で大量重複させない。

---

## 43. M7/M8 regression tests to update

M9のfeedback read extensionに伴い最低限更新する。

Application Integration Test:

```text
Session Query returns candidateFeedback current state
Session Query returns soundScoreFeedback current state
missing feedback row -> null
Like -> Dislike update後Query -> dislike
sound low -> valid update後Query -> valid
other user ownership behavior unchanged
```

Backend API Integration Test:

```text
Generation / Reroll candidate feedback -> null/null
Session GET saved feedbackをpublic DTOへ返す
candidateKey等の非公開fieldは引き続き返さない
```

DB schema migration testは変更不要。

---

## 44. Playwright E2E

M9では既存Playwrightを使用する。

新しいtesting dependencyは原則追加しない。

E2Eはproduction/local DBを使わず、専用temporary SQLite DBを使う。

既存M6 migration workflowを利用してtest DBへ明示migrationする。

server processへtest用:

```text
LYRICS_ASSIST_DB_PATH
LYRICS_ASSIST_BETA_USER_ID
```

を与える。

deterministic M8 stub fixtureでUI flowを検証する。

---

## 45. Required E2E cases

最低限:

### Home -> Result

```text
Home表示
label / input / button
known stub keyword入力
submit
pending
Session URLへ遷移
latest selected candidates表示
```

### Candidate Feedback reload

```text
Like
-> success表示
-> page reload
-> Like状態復元

Dislikeへ変更
-> reload
-> Dislike状態復元
```

### Detail

```text
Detail Link
-> scatter plot
-> selected candidate count相当のpoints / legend
-> default active candidate
-> legend selection
-> Sound / Semantic info
```

### Sound Feedback reload

```text
妥当
-> success
-> reload
-> 妥当状態復元

高すぎる等へ変更
-> reload
-> current state復元
```

### Reroll

```text
reroll
-> old result remains while pending
-> same session path
-> new latest round表示
```

### Direct reload / error

```text
Session direct reload
Detail direct reload
invalid / unknown sessionのuser-facing error
```

keyboard操作は少なくとも、

```text
input submit
Link navigation
feedback buttons
legend candidate selection
```

を確認する。

---

## 46. Visual test philosophy

M9ではpixel-perfect screenshot regressionを必須にしない。

βでレイアウト自体を更新する可能性が高いため、

```text
role
text
state
navigation
data restoration
```

をE2Eの主要assertionとする。

必要なら開発確認用screenshotを取得してよいが、固定visual snapshot dependencyは追加しない。

---

## 47. No new direct dependency

M9は現在の、

```text
React
Next.js
CSS Modules
Zod（server）
Playwright
Vitest
```

で実装可能とする。

以下を追加しない。

```text
chart library
UI component library
icon library
state manager
React Query / SWR
animation library
testing-library
```

どうしても新direct dependencyが必要な場合は停止して報告する。

---

## 48. M9 stop conditions

以下の場合は独自判断でProduct仕様を追加せず停止する。

```text
M7/M8 feedback read contract拡張にDB schema変更が必要

Feedback current stateをSession Queryで取得できない

M8 public DTO変更が既存endpoint semanticsを壊す

neutral feedback解除endpointが必要

past Round閲覧UIが必須

real LLM / Reading Resolverが必要

authenticationが必要

chart libraryが必須

new direct dependencyが必要

APIへ新endpointが必要

public deployment security対応が必要

M10 scopeへ踏み込む必要がある
```

---

## 49. M9 completion criteria

1. HomeからGeneration可能。
2. Generation successでSession Resultへ遷移する。
3. Session direct reloadで結果を復元する。
4. latest Roundの0〜10候補を表示できる。
5. Candidate Like / Dislikeを保存できる。
6. Candidate Feedbackがreload後も復元される。
7. Reroll中も旧結果を維持する。
8. Reroll successで同一Sessionのnew latest Roundを表示する。
9. Detail routeを表示できる。
10. x=Sound / y=Semantic固定0〜100 Scatter Plotを表示する。
11. hover / focus / tap / legendでcandidateを選択できる。
12. active candidateの分析情報を表示する。
13. Sound Score Feedbackを保存できる。
14. Sound Feedbackがreload後も復元される。
15. public API errorをuser-facing messageへ変換する。
16. pending / error stateがaccessibleに通知される。
17. Clientからserver / infrastructureをimportしない。
18. DB schema / migrationを変更しない。
19. chart / UI / state libraryを追加しない。
20. M7 Application testのfeedback read caseが通る。
21. M8 API testのfeedback DTO caseが通る。
22. Playwright主要flowが通る。
23. lint / typecheck / unit+integration test / build / E2Eが成功する。
24. M10へ進まない。

---

## 50. M9後の状態

M9完了時点:

```text
Web UI
↓
M8 Backend API
↓
M7 Application Services
↓
Stub Reading / Stub LLM
↓
Domain
↓
SQLite Persistence
```

がBrowserからend-to-endで操作可能になる。

この時点でUI / UXそのものもβ feedback対象となる。

M10ではExternal Adapterをreal implementationへ差し替え、実際の候補品質・latency・cost・feedback傾向を評価する。
