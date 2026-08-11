# Rhyme Normalizer 詳細設計 v0.1

## 1. 位置づけ

本書は `docs/system-design-v0.1.md` を補足し、M2 - Rhyme Normalizer の詳細設計を定義する。

本書で定義する内容は、v0.1 βにおける暫定的な作詞用音韻モデルである。
正規化ルールはβ利用時のフィードバックに応じて変更可能とするが、変更時は `normalizerVersion` を更新し、過去結果を再現可能な状態を維持する。

M2の受入完了前に追加された外来語モーラ対応は、初期 `rhyme-v0.1` の仕様範囲に含める。

---

## 2. 責務境界

Rhyme Normalizer は、**読みが確定済みの日本語かな文字列**を入力として受け取り、音韻解析表現と作詞用比較表現を生成する。

Rhyme Normalizer は以下を行わない。

- 漢字から読みを推定しない
- 複数読みから正しい読みを選ばない
- 意味を評価しない
- LLMを呼び出さない
- 語感スコアを算出しない

責務の流れは以下とする。

```text
surface word
    |
    v
Reading Resolver      ※M2では未実装
    |
    | confirmed reading
    v
Rhyme Normalizer
    |
    +--> phonetic representation
    |
    `--> normalized rhyme representation
```

M2のテストでは、Reading Resolverの代わりに読み文字列をfixtureとして直接与える。

---

## 3. 3層の音韻表現

元情報を失わないため、以下の3層を明確に分離する。

### 3.1 Raw Reading

入力された読みをそのまま保持する。

例:

```text
うんどう
```

この層では作詞用の解釈を行わない。

### 3.2 Phonetic Representation

読みをモーラ単位で解析し、通常モーラ・特殊モーラ・長音を区別する。

例:

```text
う / ん / ど / う

↓ phonetic

[u] [N] [d+o] [u]
```

この層では、

- `っ` と `ん` を同一視しない
- `o + u` を `o + o` に変換しない
- `e + i` を `e + e` に変換しない
- 長音 `ー` を消去しない

元の音韻構造を保持する。

### 3.3 Normalized Rhyme Representation

作詞上の韻比較に使用する比較専用表現。

例:

```text
うんどう

phonetic:
[u] [N] [d+o] [u]

normalized:
[u] [X] [o] [o]
```

Sound Scorerは原則としてこのnormalized表現を比較に利用する。
ただし将来的な補正のため、phonetic表現も保持する。

---

## 4. 音韻トークン

### 4.1 Vowel

通常母音は以下の5種類とする。

```ts
type Vowel = "a" | "i" | "u" | "e" | "o";
```

### 4.2 PhoneticToken

概念上、音韻トークンは以下のdiscriminated unionとして扱う。

```ts
type PhoneticToken =
  | {
      kind: "mora";
      surface: string;
      consonant: string | null;
      vowel: Vowel;
    }
  | {
      kind: "sokuon";
      surface: "っ" | "ッ";
      symbol: "Q";
    }
  | {
      kind: "hatsuon";
      surface: "ん" | "ン";
      symbol: "N";
    }
  | {
      kind: "long";
      surface: "ー";
    };
```

実際のTypeScript定義はM1で作成済みの型との整合を優先し、必要であれば既存型を拡張する。
ただし、上記の意味上の区別を失ってはならない。

---

## 5. 通常モーラ

通常モーラは、少なくとも以下を保持する。

- 元の表記 (`surface`)
- 子音 (`consonant`)
- 母音 (`vowel`)

例:

```text
こ
=> consonant: k
=> vowel: o

び
=> consonant: b
=> vowel: i

あ
=> consonant: null
=> vowel: a
```

M2において子音はSound Scoreへ直接利用しないが、将来の頭韻・子音類似評価へ拡張可能な元情報として保持する。

---

## 6. 拗音

`きゃ / きゅ / きょ` 等の拗音は、2文字ではなく**1モーラ**として扱う。

例:

```text
きゃ
=> surface: "きゃ"
=> consonant: "ky"
=> vowel: "a"

きゅ
=> consonant: "ky"
=> vowel: "u"

きょ
=> consonant: "ky"
=> vowel: "o"
```

同様に、しゃ・しゅ・しょ、ちゃ・ちゅ・ちょ等も1モーラとして解析する。

---

## 7. 外来語モーラ

### 7.1 方針

現代日本語の歌詞・候補語では外来語が頻出するため、v0.1のRhyme Normalizerは代表的な外来語向け結合モーラを扱う。

外来語モーラは、複数のかな文字から構成されていても**1モーラ**として解析する。

実装は推測的な一般則ではなく、**明示的なマッピングテーブル**として管理する。

目的は以下。

- 対応範囲をレビュー可能にする
- 未定義の表記を勝手に推測しない
- β利用で必要になったモーラを段階的に追加できるようにする
- 元のsurfaceを保持したまま、子音・母音情報を構造化する

### 7.2 v0.1 対応マッピング

最低限、以下を対応対象とする。

| Surface | Consonant | Vowel |
|---|---|---|
| ファ | f | a |
| フィ | f | i |
| フェ | f | e |
| フォ | f | o |
| ティ | t | i |
| トゥ | t | u |
| ディ | d | i |
| ドゥ | d | u |
| ウィ | w | i |
| ウェ | w | e |
| ウォ | w | o |
| ヴァ | v | a |
| ヴィ | v | i |
| ヴ | v | u |
| ヴェ | v | e |
| ヴォ | v | o |
| シェ | sh | e |
| ジェ | j | e |
| チェ | ch | e |
| ツァ | ts | a |
| ツィ | ts | i |
| ツェ | ts | e |
| ツォ | ts | o |
| テュ | ty | u |
| デュ | dy | u |
| フュ | fy | u |

ひらがな相当表記が入力された場合も、同一の音韻情報として扱ってよい。
ただしRaw Reading上の表記は入力値を保持する。

### 7.3 外来語モーラの例

```text
ファ
=> surface: "ファ"
=> consonant: "f"
=> vowel: "a"

ティ
=> surface: "ティ"
=> consonant: "t"
=> vowel: "i"

ヴォ
=> surface: "ヴォ"
=> consonant: "v"
=> vowel: "o"
```

### 7.4 未定義の小書き文字

v0.1の明示マッピングに存在しない小書き母音・特殊結合を、推測で通常モーラへ変換してはならない。

例:

```text
未定義の外来語結合
特殊な小書きかな
歴史的・非標準的なかな表記
```

これらは明示的なunsupported inputとして扱う。

β利用中に必要な表記が確認された場合は、

1. 対応ルールを設計へ追加
2. テストケースを追加
3. 必要に応じて `normalizerVersion` を更新

の順で対応する。

---

## 8. 特殊モーラ

### 8.1 促音

```text
っ / ッ
```

Phonetic層:

```text
Q
```

Normalized層:

```text
X
```

### 8.2 撥音

```text
ん / ン
```

Phonetic層:

```text
N
```

Normalized層:

```text
X
```

したがってv0.1では、韻比較上、

```text
Q ≒ N
```

を同一の特殊モーラクラス `X` として扱う。

ただしPhonetic層では `Q` と `N` を別々に保持する。

これにより将来、

```text
Q vs Q = 100
N vs N = 100
Q vs N = 85
```

のような細分化へ変更可能とする。

---

## 9. 長音

長音記号:

```text
ー
```

Phonetic層では `long` tokenとして保持する。

Normalized層では、直前の母音を継承する。

例:

```text
コーヒー

phonetic:
[ko] [long] [hi] [long]

normalized:
[o] [o] [i] [i]
```

直前に継承可能な母音が存在しない等、通常の日本語読みとして想定外のケースについては、M2で独自ルールを追加して推測しない。
実装上判断が必要になった場合はunsupported inputとして扱い、必要に応じて未決定事項として報告する。

---

## 10. 長母音相当の正規化

以下はv0.1 βにおける**暫定ルール**とする。

### 10.1 o + u

隣接するPhonetic層の通常モーラ母音列が、

```text
o + u
```

の場合、韻比較上、

```text
o + o
```

として正規化する。

例:

```text
どう
phonetic vowel sequence: o u
normalized: o o

うんどう
phonetic: u N o u
normalized: u X o o
```

### 10.2 e + i

隣接するPhonetic層の通常モーラ母音列が、

```text
e + i
```

の場合、韻比較上、

```text
e + e
```

として正規化する。

例:

```text
せい
phonetic vowel sequence: e i
normalized: e e
```

### 10.3 変換判定の基準

`o + u` / `e + i` の判定は、**正規化前のPhonetic Representation**を基準に行う。

正規化済みの結果を入力として再評価し、連鎖的な変換を発生させてはならない。

### 10.4 外来語への適用

v0.1では、外来語モーラを含む場合でも既存の `o + u` / `e + i` 暫定ルール自体は変更しない。

したがって、Phonetic層で通常モーラとして隣接した母音が `e + i` または `o + u` となる場合は、カタカナ語であっても同じ正規化を行う。

これは**作詞用の暫定ヒューリスティック**であり、常に音声学的に正しいとみなすものではない。

β利用で不自然なケースが確認された場合は、Raw / Phonetic情報を保持したまま、適用条件を再設計する。

例:

```text
メディア

phonetic vowels:
e i a

v0.1 normalized:
e e a
```

### 10.5 適用しない例

上記以外の異母音列を、直前母音へ自動的に寄せない。

例:

```text
あう
=> a u

かう
=> a u
```

v0.1では `a + u -> a + a` のような一般化は行わない。

---

## 11. Normalized Rhyme Unit

v0.1の比較単位は以下とする。

```ts
type NormalizedRhymeUnit =
  | "a"
  | "i"
  | "u"
  | "e"
  | "o"
  | "X";
```

Normalized層では子音を比較単位に含めない。

子音情報はPhonetic層に保持し、将来の追加評価に備える。

---

## 12. 代表テストケース

M2では最低限、以下をunit testで固定する。

### 12.1 通常語

```text
さよなら
=> a o a a
```

### 12.2 特殊モーラ

```text
のっぴき
=> o X i i

コンビニ
=> o X i i
```

この2語はv0.1のnormalized rhyme pattern上、完全一致する。

### 12.3 長音

```text
コーヒー
=> o o i i
```

### 12.4 o + u

```text
うんどう
=> u X o o
```

### 12.5 e + i

```text
せい
=> e e
```

### 12.6 拗音

```text
きゃく
=> a u
```

### 12.7 非変換ケース

```text
あう
=> a u

かう
=> a u
```

### 12.8 外来語モーラ

最低限、以下を固定する。

```text
ファイル
=> a i u

ティアラ
=> i a a

メディア
=> e e a

ヴォーカル
=> o o a u

シェア
=> e a
```

`メディア` の `e e a` は、v0.1の `e + i -> e + e` 暫定ルールを外来語にも適用した結果である。

### 12.9 外来語モーラのPhonetic確認

少なくとも以下を確認する。

```text
ファ
=> consonant: f
=> vowel: a

ティ
=> consonant: t
=> vowel: i

ヴォ
=> consonant: v
=> vowel: o
```

---

## 13. 未対応ケース

v0.1では以下を推測で対応しない。

- 先頭など、継承可能な母音が存在しない位置の長音
- 本書の外来語モーラ表に存在しない特殊な小書きかな結合
- 歴史的かな
- 非標準的・特殊な発音表記
- かな表記だけでは一意に歌唱発音を決められないケース

これらは黙って近似変換せず、明示的なunsupported inputとして扱う。

---

## 14. 実装上の原則

- deterministicな純粋ロジックとして実装する
- LLMへ依存しない
- I/OやDBへ依存しない
- 入力readingを破壊・上書きしない
- raw / phonetic / normalizedの各表現を保持する
- normalization ruleはversionedとする
- 外来語モーラは明示mappingとして管理する
- v0.1で定義していない例外ルールを推測で追加しない
- 未対応ケースが見つかった場合、設計変更として報告する

---

## 15. M2完了条件

以下を満たした時点でM2完了とする。

1. 読み文字列からPhonetic Representationを生成できる。
2. Phonetic RepresentationからNormalized Rhyme Representationを生成できる。
3. 特殊モーラ `Q / N` の元情報を保持したまま、比較時に `X` へ正規化できる。
4. 長音を直前母音へ展開できる。
5. `o + u -> o + o` を適用できる。
6. `e + i -> e + e` を適用できる。
7. 拗音を1モーラとして解析できる。
8. 本書で定義した代表的な外来語モーラを1モーラとして解析できる。
9. 未定義の外来語結合を推測変換せず、unsupported inputとして扱える。
10. 代表テストケースがすべて成功する。
11. `npm run lint`、`npm run typecheck`、`npm test` が成功する。
12. M3 Sound Scorerの実装には着手しない。
