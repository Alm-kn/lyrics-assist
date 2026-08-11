# Rhyme Normalizer 詳細設計 v0.1

## 1. 位置づけ

本書は `docs/system-design-v0.1.md` を補足し、M2 - Rhyme Normalizer の詳細設計を定義する。

本書で定義する内容は、v0.1 βにおける暫定的な作詞用音韻モデルである。
正規化ルールはβ利用時のフィードバックに応じて変更可能とするが、変更時は `normalizerVersion` を更新し、過去結果を再現可能な状態を維持する。

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

## 7. 特殊モーラ

### 7.1 促音

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

### 7.2 撥音

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

## 8. 長音

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
実装上判断が必要になった場合は未決定事項として報告する。

---

## 9. 長母音相当の正規化

以下はv0.1 βにおける**暫定ルール**とする。

### 9.1 o + u

隣接する母音列が、

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

### 9.2 e + i

隣接する母音列が、

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

### 9.3 適用しない例

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

## 10. Normalized Rhyme Unit

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

## 11. 代表テストケース

M2では最低限、以下をunit testで固定する。

### 11.1 通常語

```text
さよなら
=> a o a a
```

### 11.2 特殊モーラ

```text
のっぴき
=> o X i i

コンビニ
=> o X i i
```

この2語はv0.1のnormalized rhyme pattern上、完全一致する。

### 11.3 長音

```text
コーヒー
=> o o i i
```

### 11.4 o + u

```text
うんどう
=> u X o o
```

### 11.5 e + i

```text
せい
=> e e
```

### 11.6 拗音

```text
きゃく
=> a u
```

### 11.7 非変換ケース

```text
あう
=> a u

かう
=> a u
```

---

## 12. 実装上の原則

- deterministicな純粋ロジックとして実装する
- LLMへ依存しない
- I/OやDBへ依存しない
- 入力readingを破壊・上書きしない
- raw / phonetic / normalizedの各表現を保持する
- normalization ruleはversionedとする
- v0.1で定義していない例外ルールを推測で追加しない
- 未対応ケースが見つかった場合、設計変更として報告する

---

## 13. M2完了条件

以下を満たした時点でM2完了とする。

1. 読み文字列からPhonetic Representationを生成できる。
2. Phonetic RepresentationからNormalized Rhyme Representationを生成できる。
3. 特殊モーラ `Q / N` の元情報を保持したまま、比較時に `X` へ正規化できる。
4. 長音を直前母音へ展開できる。
5. `o + u -> o + o` を適用できる。
6. `e + i -> e + e` を適用できる。
7. 拗音を1モーラとして解析できる。
8. 代表テストケースがすべて成功する。
9. `npm run lint`、`npm run typecheck`、`npm test` が成功する。
10. M3 Sound Scorerの実装には着手しない。
