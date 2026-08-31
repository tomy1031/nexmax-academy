# 開発の 工程 — 絵の 作り直し台帳

> **この ファイルは `node scripts/gen_image_handoff.mjs` が 作る。手で 直さない。**
> 直すのは `scripts/images/kaihatsu_*.json`（台帳）の ほう。

「開発の 工程」の レクチャーの 絵 9枚を、**アプリの テイストに そろえて 作り直す**ための 指示書。
報連相の 台帳（`hourensou_絵の作り直し台帳.md`）と 同じ 読み方で 使える。

## なぜ 作り直すのか

いま 出て いるのは 2026-08-31 の 移植で **旧アプリの スライドを 縮めて 写した 当て画像**。
絵柄が 別系統（鉛筆テクスチャ・くすんだ グレー）な うえに、**英語の 副題と 説明文が
びっしり 入って いる**。元が 1800px でも 本文の 幅 1048px に 縮めると どれも 読めない——
`dev_process.webp` は 7つの 工程に 日本語・英語・説明文が 全部 入って いて、
**テスト／デプロイ／保守運用の 名前が 上下 2回 くり返されて いる**。
同じ 絵の 開発の コマには **Git の ロゴ**（実在の ブランドマーク）も 写り込んで いる。

作り直しの 方針は 1つ: **名前だけ 大きく、中身は 絵で 見せる。** 説明文は 教材の
カードが すでに 持って いるので、絵に 二重に 書かない。

## 作業する 場所

**ローカル**。Codex の image-gen-2 が 要る ので、クラウドの セッションでは 作れない。
`cwebp` も クラウドには 無い。

```bash
# 別の ターミナルで 先に 立てる
npm run codex:bridge

# 文字入りの 図 → 場面 の 順に 流す
node scripts/slides/gen_images.mjs scripts/images/kaihatsu_zukai.json .tmp-img/kaihatsu_zukai
```

## 置き場所の 決まり

9枚 ぜんぶ `public/img/kaihatsu/<名前>.webp` に **同じ 名前で 上書き**する。
PNG で 出る ので 変換してから 置く: `cwebp -q 84 in.png -o out.webp`

**`content/articles/kaihatsu_lecture.json` を 手で 直さない。**
`scripts/gen_kaihatsu_content.mjs` が 作り直すので 消える。絵を 同じ パスに 上書きすれば、
データを 触らずに 画面が 変わる。

## いちばん 先に やる こと — ふりがなの 試作

報連相と **同じ 関門**を 通す（2026-08-30 の 指定「ふりがなを 丁寧に 振るという 指示を
出せば ふりがなつきの 画像に なります。規律2は 一旦 流して 見て」）。

> **`kaihatsu_zukai` の 1枚目（7つの 工程）だけを 先に 作る。**
> できた 絵を **幅 390px に 縮めて** 見て、漢字の 上の ふりがなが 読めるか 確かめる。
>
> - 読めた → そのまま 残りを 流す
> - 潰れた → **文字を 焼くのを やめる**。台帳の `noText` を 文字なしの ものに 差しかえ、
>   `text` の ことばは 教材データ側（`cards` ブロック）が すでに 持って いるので 移さなくて よい
>
> 報連相の 関門を 先に 通して あれば、その 結果を そのまま 使って よい（同じ 指示文）。

---

## 文字入りの 図（6枚）

- 台帳: `scripts/images/kaihatsu_zukai.json`（6枚）
- 参照画像: なし（1枚目が 絵柄の アンカーに なる）
- 絵の 中の 文字: **焼く**（ふりがな付き）
- 参照画像なし。1枚目（7つの 工程）が 以後の 絵柄の アンカーに なる

```bash
node scripts/slides/gen_images.mjs scripts/images/kaihatsu_zukai.json .tmp-img/zukai
```

### 1. システム開発の 流れ（7つの 工程）

- **出力する 先** … `public/img/kaihatsu/dev_process.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture blocks[0]（hero）と blocks[2]（image・wide）の 2か所で 同じ 絵を 使う
- **絵の 中の 文字** … 「要件定義（ようけんていぎ）」・「見積もり（みつもり）」・「設計（せっけい）」・「開発（かいはつ）」・「テスト」・「デプロイ」・「保守運用（ほしゅうんよう）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A teaching diagram of seven large rounded cream cards laid out as a grid on a soft sky-blue background — four cards across the top row and three across the bottom row — connected in reading order by soft coral arrows that flow left to right along the top row and then left to right along the bottom row. Each card holds one simple drawing of that stage and its Japanese name printed across the top of the card: an engineer and a customer talking across a desk; an engineer at a desk with a calculator and a wall calendar; an engineer drawing boxes and lines on a whiteboard; an engineer typing at a two-monitor desk; an engineer holding a checklist beside a screen showing a large tick; an engineer pressing a key while a server rack lights up; an engineer watching graphs on a wall display at night. Same office, same warm light in every card. The Japanese words in this picture are exactly: 要件定義（ようけんていぎ） / 見積もり（みつもり） / 設計（せっけい） / 開発（かいはつ） / テスト / デプロイ / 保守運用（ほしゅうんよう）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 2. 設計の 2つの 段階

- **出力する 先** … `public/img/kaihatsu/design.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「3. 設計」の image（wide）
- **絵の 中の 文字** … 「基本設計（きほんせっけい）」・「詳細設計（しょうさいせっけい）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture split into two equal halves by a soft vertical cream gutter. LEFT HALF, on a pale sky-blue ground: two engineers stand at a large whiteboard on which big simple boxes are joined by thick lines, sketching the shape of the whole system, and one of them holds a marker and steps back to look at the whole board. RIGHT HALF, on a pale cream ground: one engineer sits close to a desk drawing a small careful flow chart of rounded shapes on paper, a ruler beside the sheet, leaning in to work on the fine detail. A rounded cream label panel sits at the top of each half carrying the Japanese words given here. The Japanese words in this picture are exactly: 基本設計（きほんせっけい） / 詳細設計（しょうさいせっけい）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 3. 3つの テスト

- **出力する 先** … `public/img/kaihatsu/testing.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「5. テスト」の image（wide）
- **絵の 中の 文字** … 「単体テスト（たんたいテスト）」・「結合テスト（けつごうテスト）」・「受け入れテスト（うけいれテスト）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture divided into three equal vertical panels by thin cream gutters. LEFT: an engineer holds a magnifying glass over one single large button drawn on a screen, checking that one part on its own. MIDDLE: two engineers stand either side of a screen on which three large rounded boxes are joined by thick arrows, following how the pieces work together, one of them tracing the arrow with a finger. RIGHT: a customer in a jacket sits in front of the finished screen with an engineer standing beside her, and the customer smiles and gives a small nod of approval. Same office, same warm light in all three. A rounded cream label panel sits at the top of each panel carrying the Japanese words given here. The Japanese words in this picture are exactly: 単体テスト（たんたいテスト） / 結合テスト（けつごうテスト） / 受け入れテスト（うけいれテスト）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 4. デプロイの 3つの 場面

- **出力する 先** … `public/img/kaihatsu/deploy.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「6. デプロイ」の image
- **絵の 中の 文字** … 「デプロイ準備（デプロイじゅんび）」・「デプロイ実行（デプロイじっこう）」・「稼働確認（かどうかくにん）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture divided into three equal vertical panels by thin cream gutters. LEFT: two engineers carefully pack a finished piece of work into a large rounded box beside a server rack, getting it ready to move. MIDDLE: one engineer presses a single large key on a keyboard while the server rack beside her lights up warmly and a soft arrow rises from it. RIGHT: two engineers look at a browser window on a big screen where a large tick sits in the middle, and one of them raises a thumb. Same office, same warm light in all three. A rounded cream label panel sits at the top of each panel carrying the Japanese words given here. The Japanese words in this picture are exactly: デプロイ準備（デプロイじゅんび） / デプロイ実行（デプロイじっこう） / 稼働確認（かどうかくにん）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 5. 保守運用の 4つの 仕事

- **出力する 先** … `public/img/kaihatsu/maintenance.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「7. 保守運用」の image（wide）
- **絵の 中の 文字** … 「システム監視（システムかんし）」・「障害対応（しょうがいたいおう）」・「システム更新（システムこうしん）」・「改善提案（かいぜんていあん）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A teaching diagram of four large rounded cream cards in a two-by-two grid on a soft sky-blue background. TOP LEFT: an engineer sits watching a wall display of large simple line graphs, calm and steady. TOP RIGHT: an engineer hurries to a server rack with a toolbox while a small warning lamp glows softly amber. BOTTOM LEFT: an engineer plugs a fresh part into the rack, and a soft shield shape glows behind it. BOTTOM RIGHT: two engineers sit side by side at one laptop pointing at a rising graph and talking happily about an idea. Each card carries its Japanese label printed across the top of the card. The Japanese words in this picture are exactly: システム監視（システムかんし） / 障害対応（しょうがいたいおう） / システム更新（システムこうしん） / 改善提案（かいぜんていあん）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 6. ウォーターフォールと アジャイルの ちがい

- **出力する 先** … `public/img/kaihatsu/waterfall_agile.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「ウォーターフォールと アジャイル」の image（wide）
- **絵の 中の 文字** … 「ウォーターフォール」・「アジャイル」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture split into two equal halves by a soft vertical cream gutter. LEFT HALF, on a pale sky-blue ground: six broad steps descend from the top left to the bottom right like a wide staircase with water flowing gently down them, and one engineer walks down the steps one at a time, never turning back, each step finished behind him. RIGHT HALF, on a pale cream ground: a wide circular track with four rounded stations around it, and a small team of three engineers walks the circle together handing a small finished piece to a smiling customer each time they pass her, then setting off around the circle again. A rounded cream label panel sits at the top of each half carrying the Japanese words given here. The Japanese words in this picture are exactly: ウォーターフォール / アジャイル. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 場面の 絵（3枚・文字なし）

- 台帳: `scripts/images/kaihatsu_scenes.json`（3枚）
- 参照画像: なし（1枚目が 絵柄の アンカーに なる）
- 絵の 中の 文字: 焼かない
- 本文と カードが ことばを 持つので 絵は 場面だけ

```bash
node scripts/slides/gen_images.mjs scripts/images/kaihatsu_scenes.json .tmp-img/scenes
```

### 7. 要件定義の ようす（お客様に 聞く）

- **出力する 先** … `public/img/kaihatsu/youken_teigi.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「1. 要件定義」の image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. A bright meeting room with a wide window. A customer in a jacket sits on one side of the table talking with open hands, clearly explaining what she wants, while two engineers sit facing her — one leaning in and listening closely, the other writing on a notepad. A large blank whiteboard stands behind them and a mug sits on the table. Warm daylight, an easy friendly mood. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 8. 見積もりの ようす（時間と お金を 出す）

- **出力する 先** … `public/img/kaihatsu/estimation.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「2. 見積もり」の image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. An engineer sits at a tidy desk working out how long the work will take. One hand rests on a calculator, the other points at a large blank wall calendar beside the desk, and a colleague standing next to him counts something off on his fingers as they talk it through. Sticky notes in soft coral and sky blue are grouped in neat columns on the wall. Warm daylight from the window, a calm and careful mood. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 9. 開発の ようす（手分けして 作る）

- **出力する 先** … `public/img/kaihatsu/development.webp`
- **書き込む 先** … scripts/gen_kaihatsu_content.mjs kaihatsu_lecture 「4. 開発」の image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. Three engineers work side by side at a long shared desk of two-monitor workstations, each on their own part of the same job. The one in the middle turns to the one on her right to check something on his screen and he points at it, while the third keeps typing. A blank board on the wall behind them carries a neat row of small cards moved into three columns. Mugs and a small plant on the desk, warm daylight, a busy but relaxed mood. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 絵と 本文が 食い違って いた ところ（直しずみ）

当て画像の `deploy.webp` は **4つ**の 場面（デプロイ準備・デプロイ実行・稼働確認・
デプロイ完了）を 描いて いるのに、下の カードは **3つ**しか 無かった。
作り直しでは **3つに そろえる**（キャプションも「デプロイの 3つの 場面」に 直した）。

## 差しかえた あとの 確かめ

```bash
node scripts/gen_kaihatsu_content.mjs   # 教材データを 作り直す
npm run gen:content                     # 焼き込みモジュール（忘れると 画面が 変わらない）
npm run lint:content                    # スキーマ・ふりがな・焼き込みずれ
npm run e2e                             # 通しの 自動検証
```

絵の 数: **9枚**（内訳 — 文字入りの 図（6枚） 6 ／ 場面の 絵（3枚・文字なし） 3）
