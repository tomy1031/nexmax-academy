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

作り直しの 方針: **説明の 骨は 旧アプリの 絵の まま 保ち**（2026-09-03 の 決まり
「前と同じ内容の画像に」）、英語の 副題と 説明文だけを 外す。絵に 書く ことばは 本文の
カードと 同じ 語だけに する。2026-10-21 に 9枚 作り直した。

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
PNG で 出る ので 変換してから 置く: `cwebp -q 82 -blend_alpha 0xffffff in.png -o out.webp`

**`scripts/gen_kaihatsu_content.mjs` は 走らせない。** 教材データより 古く、走らせると
あとから 直した 本文・読みが 元に 戻る（2026-10-21 に 確かめた）。教材データの `prompt` と
`refs` だけを 台帳から 写す（`scripts/lib/image_ledger.mjs` の `loadImageLedgers`）。

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
- 参照画像: `public/img/hourensou/houkoku/hourenso.webp` ／ `public/img/articles/yuurei_nexttalent/flow.webp`
- 絵の 中の 文字: **焼く**（ふりがな付き）
- 参照は 合格ずみの 図 2枚（絵柄だけ）。1枚目（7つの 工程）が 以後の 絵柄の アンカーに なる

```bash
node scripts/slides/gen_images.mjs scripts/images/kaihatsu_zukai.json .tmp-img/zukai
```

### 1. システム開発の 流れ（7つの 工程）

- **出力する 先** … `public/img/kaihatsu/dev_process.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json の hero と 1枚目の image（wide）の 2か所で 同じ 絵を 使う
- **絵の 中の 文字** … 「1」・「2」・「3」・「4」・「5」・「6」・「7」・「要件定義（ようけんていぎ）」・「見積もり（みつもり）」・「設計（せっけい）」・「開発（かいはつ）」・「テスト」・「デプロイ」・「保守運用（ほしゅうんよう）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: building a system is much more than programming — it moves through seven stages in a fixed order, from listening to the customer to looking after the finished system. A teaching diagram of seven rounded cream cards with sky-blue borders on a soft sky-blue background: four cards in the top row and three cards in the bottom row, the bottom row centred. Each card has a round coral badge in its top-left corner with its number in white (1 to 7), its Japanese name printed large across the top, and under the name one simple scene that shows what happens in that stage. Thick sky-blue arrows join the cards in number order: 1 → 2 → 3 → 4 along the top row, then one long arrow runs from card 4 down and back to card 5 like the next line of a book, then 5 → 6 → 7 along the bottom row. The seven scenes: (1) an engineer listens to the customer in a navy suit across a small table and writes notes; (2) an engineer with a calculator, a desk calendar and a small stack of coins works out time and cost; (3) an engineer draws boxes joined by lines on a whiteboard; (4) an engineer types code at a two-monitor desk, the screens full of coloured code bars; (5) an engineer holds a big magnifying glass over a screen and finds a tiny cute beetle (a bug) on it; (6) an engineer presses one big key and a parcel flies along an arrow into a server rack; (7) an engineer calmly watches steady graphs on a monitor next to a server rack, a wrench on the desk. The Japanese words in this picture are exactly: 1 / 2 / 3 / 4 / 5 / 6 / 7 / 要件定義（ようけんていぎ） / 見積もり（みつもり） / 設計（せっけい） / 開発（かいはつ） / テスト / デプロイ / 保守運用（ほしゅうんよう）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細 or スキルグラフ).
```

</details>

### 2. 設計の 2つの 段階（基本設計 → 詳細設計）

- **出力する 先** … `public/img/kaihatsu/design.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「3. 設計」の image（wide）
- **絵の 中の 文字** … 「基本設計（きほんせっけい）」・「詳細設計（しょうさいせっけい）」・「サーバーの 構成（サーバーの こうせい）」・「ワイヤーフレーム」・「フローチャート」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: design is done in two layers — first the big picture of the whole system, then the fine detail of each part, close enough that coding can start. One wide picture split into two equal halves by a soft cream gutter, with one thick sky-blue arrow crossing the gutter from the left half to the right half. LEFT HALF, on a pale sky-blue ground, label panel at the top: 基本設計. Two engineers stand at a large whiteboard. On the left of the board: three big boxes joined by thick lines — a screen, a server box and a database cylinder — showing how the whole system is built, with the small label サーバーの 構成 under it. On the right of the board: a sheet with a simple screen layout made of grey blocks (a header bar, a picture box, two buttons), with the small label ワイヤーフレーム under it. One engineer points at the boxes with a marker. RIGHT HALF, on a pale cream ground, label panel at the top: 詳細設計. One engineer sits close to a desk drawing a careful flow chart on a large sheet of paper — a rounded start shape, rectangles joined by arrows and one diamond that splits into two paths — with the small label フローチャート beside it, and an open laptop next to the sheet showing a few coloured code bars. The Japanese words in this picture are exactly: 基本設計（きほんせっけい） / 詳細設計（しょうさいせっけい） / サーバーの 構成（サーバーの こうせい） / ワイヤーフレーム / フローチャート. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細 or スキルグラフ).
```

</details>

### 3. 3つの テスト（単体 → 結合 → 受け入れ）

- **出力する 先** … `public/img/kaihatsu/testing.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「5. テスト」の image（wide）
- **絵の 中の 文字** … 「単体テスト（たんたいテスト）」・「結合テスト（けつごうテスト）」・「受け入れテスト（うけいれテスト）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: there are three tests, each one checking a bigger piece than the last — one part on its own, several parts working together, and finally the customer checking the whole system. One wide picture of three equal rounded cream panels in a row, joined by two thick sky-blue arrows pointing right. Each panel has its Japanese name printed large across the top. LEFT PANEL: an engineer holds a big magnifying glass over ONE single large button on a screen — only that one part is being checked. MIDDLE PANEL: a big screen shows three parts joined by thick arrows — a login screen with two input bars, a database cylinder and a profile page with a round face picture — and a small glowing parcel of data travels along the arrows; two engineers follow it, one tracing the arrow with a finger. RIGHT PANEL: the customer in a navy suit sits in front of the finished app on a large screen, holding a clipboard checklist with ticks, and smiles and nods; an engineer stands beside the customer. The Japanese words in this picture are exactly: 単体テスト（たんたいテスト） / 結合テスト（けつごうテスト） / 受け入れテスト（うけいれテスト）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細 or スキルグラフ).
```

</details>

### 4. デプロイの 3つの 場面（準備 → 実行 → 稼働確認）

- **出力する 先** … `public/img/kaihatsu/deploy.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「6. デプロイ」の image
- **絵の 中の 文字** … 「デプロイ準備（デプロイじゅんび）」・「デプロイ実行（デプロイじっこう）」・「稼働確認（かどうかくにん）」・「本番環境（ほんばんかんきょう）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: deploying means moving the finished system onto the real server that users reach — get it ready, send it, then check that it really works. One wide picture of three equal rounded cream panels in a row, joined by two thick sky-blue arrows pointing right. Each panel has its Japanese name printed large across the top. LEFT PANEL: two engineers get ready — one sets up a server rack, the other packs the finished app (a small screen with coloured blocks) into a sturdy rounded box. MIDDLE PANEL: an engineer presses one big key on a keyboard; the box flies along a thick arrow into a large glowing server rack that carries a sign plate with the label 本番環境. RIGHT PANEL: an engineer holds up a smartphone and looks at a laptop — both show the same app home page working (a picture banner and two buttons) — and a large green circle with a white tick floats beside them. The Japanese words in this picture are exactly: デプロイ準備（デプロイじゅんび） / デプロイ実行（デプロイじっこう） / 稼働確認（かどうかくにん） / 本番環境（ほんばんかんきょう）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細 or スキルグラフ).
```

</details>

### 5. 保守運用の 4つの 仕事

- **出力する 先** … `public/img/kaihatsu/maintenance.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「7. 保守運用」の image（wide）
- **絵の 中の 文字** … 「システム監視（システムかんし）」・「障害対応（しょうがいたいおう）」・「システム更新（システムこうしん）」・「改善提案（かいぜんていあん）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: the work does not end when the system is finished — the team keeps watching it, fixes problems quickly, keeps it up to date and suggests ways to make it better. A teaching diagram of four large rounded cream cards in a two-by-two grid on a soft sky-blue background. Each card has its Japanese name printed large across the top. TOP LEFT: an engineer sits calmly watching a wall display of simple line graphs showing server load and visitors, all steady. TOP RIGHT: a screen flashes a red warning triangle; one engineer looks at the screen to find the cause while another quickly fixes a server rack with a wrench. BOTTOM LEFT: an engineer watches a progress bar fill on a laptop while a soft blue shield shape slides into the server rack — the system is being updated. BOTTOM RIGHT: an engineer shows the customer in a navy suit a rising bar graph and a sketch of a cleaner screen, and the customer smiles. The Japanese words in this picture are exactly: システム監視（システムかんし） / 障害対応（しょうがいたいおう） / システム更新（システムこうしん） / 改善提案（かいぜんていあん）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細 or スキルグラフ).
```

</details>

### 6. ウォーターフォールと アジャイルの ちがい

- **出力する 先** … `public/img/kaihatsu/waterfall_agile.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「ウォーターフォールと アジャイル」の image（wide）
- **絵の 中の 文字** … 「ウォーターフォール」・「アジャイル」・「1 要件定義（ようけんていぎ）」・「2 見積もり（みつもり）」・「3 設計（せっけい）」・「4 開発（かいはつ）」・「5 テスト」・「6 デプロイ」・「設計（せっけい）」・「開発（かいはつ）」・「テスト」・「スプリント」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: waterfall finishes each stage once, from top to bottom like water falling down stairs, and never goes back; agile builds a small piece, gives it to the customer, and goes round the same circle again and again. One wide picture split into two equal halves by a soft cream gutter. LEFT HALF, on a pale sky-blue ground, label panel at the top: ウォーターフォール. A staircase of six wide steps goes down from the top left to the bottom right, with clear water flowing gently down over the steps like a waterfall. On the front of each step sits a small cream tag with its number and name, in order from the top step to the bottom step: 1 要件定義, 2 見積もり, 3 設計, 4 開発, 5 テスト, 6 デプロイ. One engineer walks down the steps facing forward, and at the bottom he hands one large finished app on a screen to the customer in a navy suit. RIGHT HALF, on a pale cream ground, label panel at the top: アジャイル. A big ring made of four thick sky-blue arrows that ALL run CLOCKWISE, each arrow with exactly ONE arrowhead — no double-headed arrows and no extra arrows inside the ring. Around the ring sit four places in clockwise order: at the top the 設計 station, where two engineers sketch boxes on a whiteboard; at the right the 開発 station, where an engineer types code; at the bottom the テスト station, where an engineer checks a screen with a magnifying glass; and at the left the customer in a navy suit, receiving one small finished piece (a small screen) from an engineer, already holding two earlier small pieces and smiling. Then the ring carries on clockwise back up to 設計 again. In the centre of the ring the word スプリント. The Japanese words in this picture are exactly: ウォーターフォール / アジャイル / 1 要件定義（ようけんていぎ） / 2 見積もり（みつもり） / 3 設計（せっけい） / 4 開発（かいはつ） / 5 テスト / 6 デプロイ / 設計（せっけい） / 開発（かいはつ） / テスト / スプリント. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細 or スキルグラフ).
```

</details>

---

## 文字入りの 図（3枚）

- 台帳: `scripts/images/kaihatsu_scenes.json`（3枚）
- 参照画像: `public/img/hourensou/houkoku/hourenso.webp` ／ `public/img/articles/yuurei_nexttalent/flow.webp` ／ `public/img/kaihatsu/dev_process.webp`
- 絵の 中の 文字: **焼く**（ふりがな付き）
- zukai の 1枚目を public/img/kaihatsu/ に 置いて から 流す（refs の 3枚目が それを アンカーに する）

```bash
node scripts/slides/gen_images.mjs scripts/images/kaihatsu_scenes.json .tmp-img/scenes
```

### 7. 要件定義の 2つの 段階（要求定義 → システム要件定義）

- **出力する 先** … `public/img/kaihatsu/youken_teigi.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「1. 要件定義」の image
- **絵の 中の 文字** … 「要求定義（ようきゅうていぎ）」・「システム要件定義（システムようけんていぎ）」・「機能要件（きのうようけん）」・「非機能要件（ひきのうようけん）」・「ログイン」・「決済（けっさい）」・「セキュリティ」・「処理速度（しょりそくど）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: requirements definition has two steps — first listen to what the customer wants to do with the system, then turn that wish into the list of things the system must have. One wide picture split into two equal halves by a soft cream gutter, with one thick sky-blue arrow crossing the gutter from the left half to the right half. LEFT HALF, on a pale sky-blue ground, label panel at the top: 要求定義. The customer in a navy suit sits at a meeting table explaining with one open hand, and an engineer sits facing the customer, listening and writing on a notepad. Behind them a board shows the customer's wish as a simple picture: a small shop and a smartphone with a shopping basket on its screen. RIGHT HALF, on a pale cream ground, label panel at the top: システム要件定義. An engineer sits at a desk, and above the desk float two large rounded cream panels side by side. The first panel is titled 機能要件 and holds two simple screen pictures, each with its small label: a login screen with two input bars and a button (ログイン) and a payment screen with a bank card (決済). The second panel is titled 非機能要件 and holds two simple pictures, each with its small label: a big padlock (セキュリティ) and a speedometer with its needle far to the right (処理速度). The Japanese words in this picture are exactly: 要求定義（ようきゅうていぎ） / システム要件定義（システムようけんていぎ） / 機能要件（きのうようけん） / 非機能要件（ひきのうようけん） / ログイン / 決済（けっさい） / セキュリティ / 処理速度（しょりそくど）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細, スキルグラフ, or the seven stage names of the third picture).
```

</details>

### 8. 見積もりの 流れ（作業を 洗い出す → 工数を 計算する → 費用と スケジュール）

- **出力する 先** … `public/img/kaihatsu/estimation.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「2. 見積もり」の image
- **絵の 中の 文字** … 「作業を 洗い出す（さぎょうを あらいだす）」・「WBS」・「工数を 計算する（こうすうを けいさんする）」・「DB設計 10時間（DBせっけい 10じかん）」・「環境構築 5時間（かんきょうこうちく 5じかん）」・「費用と スケジュール（ひようと スケジュール）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: an estimate is made in three steps — list every piece of work, count how many hours each piece takes, then turn the hours into a cost and a schedule for the customer. One wide picture of three equal rounded cream panels in a row, joined by two thick sky-blue arrows pointing right. Each panel has its Japanese name printed large across the top. LEFT PANEL: an engineer sticks small cards onto a whiteboard in a tree shape — one box at the top branching into three boxes, each branching into smaller boxes — and the small label WBS sits at the top of the tree. MIDDLE PANEL: an engineer at a desk with a calculator and a round clock; two cream tags hang on the board beside the desk, each with its words: DB設計 10時間 and 環境構築 5時間 — EVERY kanji on these tags gets furigana, including じかん above 時間 on both tags. RIGHT PANEL: the engineer hands one document to the customer in a navy suit; the document shows a small stack of coins and a calendar page, and the customer reads it with interest. Furigana sit ONLY above kanji: never above hiragana such as を, と, い, す, never above katakana, Latin letters or digits. The Japanese words in this picture are exactly: 作業を 洗い出す（さぎょうを あらいだす） / WBS / 工数を 計算する（こうすうを けいさんする） / DB設計 10時間（DBせっけい 10じかん） / 環境構築 5時間（かんきょうこうちく 5じかん） / 費用と スケジュール（ひようと スケジュール）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細, スキルグラフ, or the seven stage names of the third picture).
```

</details>

### 9. 開発の 3つの 仕事（コーディング・バージョン管理・進捗管理）

- **出力する 先** … `public/img/kaihatsu/development.webp`
- **書き込む 先** … content/articles/kaihatsu_lecture.json 「4. 開発」の image
- **絵の 中の 文字** … 「コーディング」・「バージョン管理（バージョンかんり）」・「進捗管理（しんちょくかんり）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This is a TEACHING picture, not a mood picture: what each person is doing must be readable from the picture alone. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded sky-blue border, arranged so the eye reads it in one pass. Roles are told apart by clothes, the same in every picture: ENGINEERS wear light sky-blue shirts or soft green cardigans; the CUSTOMER always wears a dark navy business suit and is the only person in a suit. Screens show only simple shapes — grey bars, coloured blocks, simple buttons, simple graphs — never readable writing. The attached pictures show the drawing style of this app: match their linework, colours, rounded cream label panels and lettering style exactly. THE ONE IDEA THIS PICTURE MUST MAKE OBVIOUS: in development the engineers split the work and write code, keep a record of who changed what, and check together how far they have got. One wide picture of three equal rounded cream panels in a row. Each panel has its Japanese name printed large across the top. LEFT PANEL: three engineers sit side by side at a long desk, each typing on their own monitor, and each screen shows a different colour of code bars — each person is building a different part. MIDDLE PANEL: an engineer points at a big screen that shows one long horizontal timeline with a row of dots on it and one short branch that splits off and joins back; next to each dot sits a tiny round face picture of the person who made that change. RIGHT PANEL: two engineers stand at a board with three columns of small coloured cards (cards moving from the left column to the right column) and one long progress bar under the columns, about two thirds full; they talk it over with a mug in hand. The Japanese words in this picture are exactly: コーディング / バージョン管理（バージョンかんり） / 進捗管理（しんちょくかんり）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Each word is given with its reading in brackets: the bracket is NOT printed — the reading is printed as small hiragana furigana directly above the kanji it belongs to, centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana, and neither do Latin letters or digits. Spell every character exactly as given. No English words or subtitles anywhere. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, English captions or subtitles under the Japanese, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots. THE ATTACHED PICTURES ARE ONLY DRAWING-STYLE GUIDES — never copy their layout, their objects, their people or ANY of their words (never write 報告, 連絡, 相談, 学生検索, 学生詳細, スキルグラフ, or the seven stage names of the third picture).
```

</details>

---

## 絵と 本文が 食い違って いた ところ（直しずみ）

当て画像の `deploy.webp` は **4つ**の 場面（デプロイ準備・デプロイ実行・稼働確認・
デプロイ完了）を 描いて いるのに、下の カードは **3つ**しか 無かった。
作り直しでは **3つに そろえる**（キャプションも「デプロイの 3つの 場面」に 直した）。

## 差しかえた あとの 確かめ

```bash
npm run gen:content                     # 焼き込みモジュール（忘れると 画面が 変わらない）
npm run lint:content                    # スキーマ・ふりがな・焼き込みずれ
npm run e2e                             # 通しの 自動検証
```

絵の 数: **9枚**（内訳 — 文字入りの 図（6枚） 6 ／ 文字入りの 図（3枚） 3）
