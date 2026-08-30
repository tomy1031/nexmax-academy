# 報連相 — 絵の 作り直し台帳

> **この ファイルは `node scripts/gen_image_handoff.mjs` が 作る。手で 直さない。**
> 直すのは `scripts/images/hourensou_*.json`（台帳）の ほう。

報連相3ステージの 絵を、**アプリの テイストに そろえて ぜんぶ 作り直す**ための 指示書。
2026-08-30 の 指定「漫画だけじゃなくて、全コンテンツの絵を新たにテイストに合わせて
作成し直す必要があります。報連相の画像は主に藤木取締役とヘンディさんです」に よる。

いま 画面に 出て いる 絵は、2026-08-29 の 移植で **旧アプリの スライドを そのまま 写した
当て画像**である。絵柄が 別系統（鉛筆テクスチャ・くすんだ グレー）で、実在の ロゴが
写り込んで いる ものも あり、**11枚は 720×405 しか なく 拡大しても 読めない**。

## 作業する 場所

**ローカル**。Codex の image-gen-2 が 要る ので、クラウドの セッションでは 作れない。
`cwebp` も クラウドには 無い。

```bash
# 別の ターミナルで 先に 立てる
npm run codex:bridge

# 台帳を 1つずつ 流す（出力は PNG。出力先に もう ある ファイルは 飛ばす）
node scripts/slides/gen_images.mjs scripts/images/hourensou_tomita.json .tmp-img/tomita
```

## 置き場所の 決まり

| 何の 絵                  | 置き場                                              |
| ------------------------ | --------------------------------------------------- |
| 講義・スキットの 絵      | `public/img/hourensou/<ステージ>/<名前>.webp`        |
| まんがの コマ            | `public/img/manga/renraku_manga/panel<n>.webp`       |
| 場面クイズ               | `public/img/quiz/soudan_kehai/<設問ID>.webp`         |
| 人物の 設定画            | `public/img/characters/<id>/sheet.webp`              |

PNG で 出る ので **WebP に 変換してから 置く**: `cwebp -q 84 in.png -o out.webp`

**`content/*.json` を 手で 直さない。** `scripts/gen_hourensou_content.mjs` が 作り直すので
消える。絵を **同じ パスに 上書き**すれば、データを 触らずに 画面が 変わる。

## いちばん 先に やる こと — ふりがなの 試作

2026-08-30 の 指定:「**ふりがなを 丁寧に 振るという 指示を 出せば ふりがなつきの 画像に
なります。規律2は 一旦 流して 見て。ダメそうなら 考えて**」。

これまでの 決めごとは 逆で、`src/content/schema.ts` には「ふりがなは 実例が ゼロで、
原理的にも 最も 壊れる」と 書いて ある。**今回は それを 横に 置いて 試す。**

> **関門: `hourensou_zukai` の 1枚目（報連相の 3つ）だけを 先に 作る。**
> できた 絵を **幅 390px に 縮めて** 見て、漢字の 上の ふりがなが 読めるか 確かめる。
>
> - 読めた → そのまま 残りを 流す
> - 潰れた → **文字を 焼くのを やめる**。台帳の `noText` を 文字なしの ものに 差しかえ、
>   `text` に 書いて ある ことばを 教材データ側（`cards` / `steps` ブロック）へ 移す

## 作る 順

1. **富田さんの 設定画**（0番）— これが 無いと 報告ステージの 絵が 始まらない
2. **場面クイズ6枚・まんが9コマ** — いま 絵が 無く、画面に 点線わくが 出て いる
3. **文字入りの 図**（`*_zukai`）— 720×405 で 読めない ものを 含む
4. **残りの 場面**

---

## 富田さん（報告の 相手・PM）

- 台帳: `scripts/images/hourensou_tomita.json`（8枚）
- 参照画像: `富田.jpg` ／ `public/img/characters/tomita/sheet.webp`
- 絵の 中の 文字: 焼かない
- まず 0番の 設定画を 作る。それが 以後 ぜんぶの 参照に なる

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_tomita.json .tmp-img/tomita
```

### 1. 富田さんの 設定画（三面図＋表情）

- **出力する 先** … `public/img/characters/tomita/sheet.webp`
- **書き込む 先** … content/characters/tomita.json の sheet。**これを 最初に 作る**
- **大きさ** … Output: one square character model sheet, 1024x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. Character model sheet for Tomita, a Japanese man in his thirties who works as a project manager. Build his face and hair from the attached reference photograph 富田.jpg, keeping the same face shape, hairline and eyes, but drawn in this anime style. HE HAS NO MOUSTACHE AND NO BEARD — his face is clean-shaven and completely smooth. Outfit: a soft grey-blue button-down shirt with the sleeves rolled to the elbow, dark navy chinos, brown leather belt. Calm, attentive expression with a small friendly smile. The sheet shows the same man three times on a plain white background — front view, side view and three-quarter view, full body, standing, with generous margins — and a row of four head-only expressions underneath: neutral, smiling, listening carefully, and slightly concerned. Output: one square character model sheet, 1024x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 2. 報告ステージの 表紙

- **出力する 先** … `public/img/hourensou/houkoku/top.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[0].image（hero）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. A young Southeast Asian junior engineer stands beside the desk of Tomita, the project manager, and reports to him while holding a small notebook. Tomita looks up from his laptop with a calm welcoming expression and gives a small nod. Bright morning light from a large window, a small potted plant on the desk. Waist-up two-shot from a natural standing angle, the two of them filling the frame. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 3. 報告する 場面（本文の さし絵）

- **出力する 先** … `public/img/hourensou/houkoku/houkoku.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[8]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. Tomita is working at his laptop, focused. The young junior engineer has stopped a step away from the desk, standing straight with both hands at his sides, waiting politely for Tomita to look up. Tomita is just turning his head towards him with a friendly, unhurried expression. Medium shot from the side, both of them filling the frame. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 4. 「今、お時間 よろしいですか」と 声を かける

- **出力する 先** … `public/img/hourensou/houkoku/ask_time.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[13]（steps）の images[0]
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. Close two-shot. The junior engineer leans very slightly forward with an open, polite gesture of one hand, asking for a moment of time. Tomita has taken his hands off the keyboard and turned fully towards him, smiling, giving his full attention. Warm daylight, the laptop screen blank. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 5. Q1 最初に かける ことば

- **出力する 先** … `public/img/hourensou/houkoku/q1.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[11]（cards）items[0].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. The junior engineer stands beside Tomita's desk with his mouth just opening to speak, one hand raised in a small polite gesture. Tomita is still looking at his laptop, busy. The moment before the first word. Medium shot, warm office light. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 6. Q2 報告の しかた

- **出力する 先** … `public/img/hourensou/houkoku/q2.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[11]（cards）items[1].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. The junior engineer is speaking clearly, counting points off on the fingers of one hand. Tomita nods along and writes a short note. Both are relaxed and engaged. Medium shot across the corner of the desk. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 7. Q3 ほかの 報告

- **出力する 先** … `public/img/hourensou/houkoku/q3.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[11]（cards）items[2].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. The junior engineer sits at his own desk, resting his chin on one hand, thinking, with a calm curious expression. Around him the office continues: a blank whiteboard, a colleague walking past in the background, a mug of tea. Medium shot. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 8. 報告スキットの 表紙

- **出力する 先** … `public/img/hourensou/houkoku/skit.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_skit の cover
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. A friendly two-shot of the junior engineer and Tomita facing each other across the desk in mid conversation — the junior engineer speaking, Tomita listening with a warm smile and an open hand gesture. Bright, welcoming, plenty of clean space around them. Wide medium shot. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 富田さんの 図（文字あり）

- 台帳: `scripts/images/hourensou_tomita_zukai.json`（1枚）
- 参照画像: `富田.jpg` ／ `public/img/characters/tomita/sheet.webp`
- 絵の 中の 文字: **焼く**（ふりがな付き）
- 文字を 焼く ので 台帳が 別

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_tomita_zukai.json .tmp-img/tomita_zukai
```

### 9. 報告の 3つの パターン

- **出力する 先** … `public/img/hourensou/houkoku/petterns.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[13]（steps）の images[2]
- **絵の 中の 文字** … 「終わった 報告（おわった ほうこく）」・「困って いる 報告（こまって いる ほうこく）」・「気づいた ことの 報告（きづいた ことの ほうこく）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture divided into three equal panels by thin cream gutters. In every panel the same two people appear: the young Southeast Asian junior engineer on the left and Tomita the project manager on the right at his desk. LEFT PANEL: the junior engineer smiles and holds up a finished document. MIDDLE PANEL: he points at his laptop with a troubled, honest face. RIGHT PANEL: he holds a sticky note and points at it thoughtfully. Tomita listens warmly in all three. Above each panel sits a rounded cream label panel carrying the Japanese words given here. The Japanese words in this picture are exactly: 終わった 報告（おわった ほうこく） / 困って いる 報告（こまって いる ほうこく） / 気づいた ことの 報告（きづいた ことの ほうこく）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 奥田さん（相談の 相手・先輩）

- 台帳: `scripts/images/hourensou_okuda.json`（4枚）
- 参照画像: `public/img/characters/okuda/sheet.webp`
- 絵の 中の 文字: 焼かない
- もとの「鈴木先輩」から 置きかえた 人

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_okuda.json .tmp-img/okuda
```

### 10. 相談ステージの 表紙

- **出力する 先** … `public/img/hourensou/soudan/slide1.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[0].image（hero）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. The young junior engineer has rolled his chair over to Okuda's desk and points at his own laptop screen with a slightly troubled but hopeful face. Okuda turns towards him, one hand on the back of his chair, listening carefully with a calm kind smile. The screen shows only soft abstract grey shapes. Warm afternoon light, a plant between the desks. Wide medium two-shot. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 11. 相談する 前に「何を したか」を 伝える

- **出力する 先** … `public/img/hourensou/soudan/slide7.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[22]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. One wide picture split into two equal panels by a thin cream gutter. LEFT: the junior engineer stands at Okuda's desk with empty open hands and a lost expression; Okuda tilts his head, wanting to help but with nothing to work from. RIGHT: the same two people, but now the junior engineer holds out an open notebook and points at his own notes while speaking; Okuda leans in with a bright understanding smile and reaches towards the notebook. The notebook pages show only soft abstract handwriting lines. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 12. 自分なりの アイデアを 持つ

- **出力する 先** … `public/img/hourensou/soudan/slide8.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[25]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. The junior engineer holds up a tablet towards Okuda. On the tablet, two large rounded blank cards sit side by side, one glowing slightly brighter than the other — he has already made a choice and is explaining why. He gestures at the brighter card with his free hand and looks straight at Okuda with a confident face. Okuda strokes his chin, impressed, nodding. Medium two-shot. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 13. 相談スキットの 表紙（動画の ポスターも 兼ねる）

- **出力する 先** … `public/img/hourensou/soudan/slide10.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[30] の poster ＋ soudan_skit の cover
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. A warm, inviting two-shot of the junior engineer and Okuda sitting at right angles at the same desk, in the middle of a good conversation — the junior engineer speaking and gesturing at his notebook, Okuda listening with his chin on his hand and a genuine smile. Bright office, big window, plants. Plenty of clean space at the top of the frame. Wide shot. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 奥田さんの 図（文字あり）

- 台帳: `scripts/images/hourensou_okuda_zukai.json`（1枚）
- 参照画像: `public/img/characters/okuda/sheet.webp`
- 絵の 中の 文字: **焼く**（ふりがな付き）
- 文字を 焼く ので 台帳が 別

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_okuda_zukai.json .tmp-img/okuda_zukai
```

### 14. 相談で よく 使う 日本語 4つ

- **出力する 先** … `public/img/hourensou/soudan/slide9.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[27]（image）
- **絵の 中の 文字** … 「今、お時間 よろしいですか（いま、おじかん よろしいですか）」・「◯◯で 困って います（◯◯で こまって います）」・「◯◯を 調べました（◯◯を しらべました）」・「ありがとう ございます」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A teaching diagram of four rounded cream cards in a two by two grid on a soft sky-blue background. In each card a small waist-up drawing shows the junior engineer speaking to Okuda at the moment that phrase is used: first he raises a hand to ask for a moment of time; second he points at his laptop to state the fact; third he holds up his notebook to say what he already checked; fourth he presses his palms together in thanks. Under each little drawing the card carries the Japanese phrase given here. The Japanese words in this picture are exactly: 今、お時間 よろしいですか（いま、おじかん よろしいですか） / ◯◯で 困って います（◯◯で こまって います） / ◯◯を 調べました（◯◯を しらべました） / ありがとう ございます. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## ヘンディ先輩（連絡・チーム）

- 台帳: `scripts/images/hourensou_hendy.json`（3枚）
- 参照画像: `public/img/characters/hendy/sheet.webp`
- 絵の 中の 文字: 焼かない
- 設定画が いちばん しっかり ある 人

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_hendy.json .tmp-img/hendy
```

### 15. 連絡ステージの 表紙

- **出力する 先** … `public/img/hourensou/renraku/renraku.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_lecture blocks[0].image（hero）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. Hendy sits at his desk and types a short message on his laptop, calm and focused, a small confident smile. Beside the laptop a mug and a notebook. Behind him two colleagues at their own desks look up at their screens at the same moment — the message has reached them. The chat window on every screen is blank with soft abstract grey bars only, and carries no logo. Wide medium shot. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 16. チームワーク（なぜ 報告を するの？）

- **出力する 先** … `public/img/hourensou/houkoku/teamwork.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[5]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. Four colleagues stand together around a low table in a bright open office, working as one team: Hendy on the left points at a large blank whiteboard, a young woman colleague holds a laptop, a young man places a blank sticky note on the board, and a fourth colleague hands over a mug. Everyone looks relaxed and involved. Warm daylight from a big window, plants nearby. Wide shot filling the frame. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 17. スタンプは「読みました」の 合図

- **出力する 先** … `public/img/hourensou/renraku/reaction.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_lecture blocks[16]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. Split scene in one frame, no divider line. On the left Hendy leans back in his chair looking at his laptop with a relieved, pleased smile. On the right, three colleagues at their own desks each tap once on their screen with one finger. Floating between them, three large soft rounded reaction bubbles drawn as simple friendly pictures only — a pair of eyes, a raised thumb, two hands pressed together. The bubbles carry no letters. Wide shot. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 藤木取締役（会社の 階級）

- 台帳: `scripts/images/hourensou_fujiki.json`（1枚）
- 参照画像: `public/img/characters/fujiki/sheet.webp` ／ `public/img/characters/fujiki/reference.jpg`
- 絵の 中の 文字: **焼く**（ふりがな付き）
- 文字あり。ほうれい線を 描かない

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_fujiki.json .tmp-img/fujiki
```

### 18. 会社の ポジション（階級）の 図

- **出力する 先** … `public/img/hourensou/listening/houkoku_hierarchy.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[15]（image）
- **絵の 中の 文字** … 「社長（しゃちょう）」・「取締役（とりしまりやく）」・「部長（ぶちょう）」・「課長（かちょう）」・「社員（しゃいん）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A clear teaching diagram of the levels of a Japanese company, drawn as five rounded cream panels stacked as a gentle pyramid on a soft sky-blue background, each panel holding one waist-up character and one label. From the top: a friendly company president in a dark suit; then Fujiki the director, taken from the attached character sheet, in his navy blazer over a white T-shirt, smiling brightly; then a department manager; then a section manager; then two ordinary staff members side by side at the bottom, one of them the young junior engineer. Thin soft arrows run down the left side. Each panel carries the Japanese label given below, printed on the cream panel beside the person. The Japanese words in this picture are exactly: 社長（しゃちょう） / 取締役（とりしまりやく） / 部長（ぶちょう） / 課長（かちょう） / 社員（しゃいん）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 人物を 特定しない 図（文字あり）

- 台帳: `scripts/images/hourensou_zukai.json`（7枚）
- 参照画像: なし（1枚目が 絵柄の アンカーに なる）
- 絵の 中の 文字: **焼く**（ふりがな付き）
- 参照画像なし。1枚目が 絵柄の アンカーに なる

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_zukai.json .tmp-img/zukai
```

### 19. 報連相の 3つ

- **出力する 先** … `public/img/hourensou/houkoku/hourenso.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[3]（image）
- **絵の 中の 文字** … 「報告（ほうこく）」・「連絡（れんらく）」・「相談（そうだん）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A teaching diagram of three large rounded cream cards side by side on a soft sky-blue background. In the first card a junior engineer hands a finished document to a senior colleague. In the second, a colleague types a short message while two others look up from their desks. In the third, a junior engineer and a senior sit side by side looking at one laptop together, thinking. Each card carries its Japanese label printed across the top of the card. The Japanese words in this picture are exactly: 報告（ほうこく） / 連絡（れんらく） / 相談（そうだん）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 20. 報告の 型（順番）

- **出力する 先** … `public/img/hourensou/houkoku/keypoint.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs houkoku_lecture blocks[13]（steps）の images[1]
- **絵の 中の 文字** … 「件（けん）」・「結論（けつろん）」・「事実（じじつ）」・「お願い（おねがい）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A teaching diagram showing an order of four steps, drawn as four rounded cream panels in a row connected by soft coral arrows. In each panel a small simple drawing of the same junior engineer speaking to a senior shows that step: raising a hand for attention; saying the topic; showing a document of facts; bowing slightly to make a request. Each panel carries its Japanese label under the drawing. The Japanese words in this picture are exactly: 件（けん） / 結論（けつろん） / 事実（じじつ） / お願い（おねがい）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 21. 連絡は 事実だけで いい（対比）

- **出力する 先** … `public/img/hourensou/renraku/s1.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_lecture blocks[3]（image）
- **絵の 中の 文字** … 「気持ち（きもち）」・「事実（じじつ）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture split into two equal halves by a soft vertical cream gutter. LEFT HALF, on a warm pale coral ground: a young engineer at his desk waves both hands in a flustered, apologetic way while his team leader tilts his head, unsure how to help. RIGHT HALF, on a pale sky-blue ground: the same engineer sits calmly and points at one clear line on his blank screen, and the leader gives a confident thumbs up. A rounded cream label panel sits at the top of each half carrying the Japanese words given here. The Japanese words in this picture are exactly: 気持ち（きもち） / 事実（じじつ）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 22. 短い 時間で 伝わる コツ 2つ

- **出力する 先** … `public/img/hourensou/renraku/s3.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_lecture blocks[8]（image）
- **絵の 中の 文字** … 「具体的な 数字（ぐたいてきな すうじ）」・「結論から 書く（けつろんから かく）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A teaching diagram of two large rounded cream cards side by side on a soft sky-blue background. In the first card a colleague holds up a small blank card with a large soft clock face drawn on it, showing an exact amount of time. In the second card a colleague points at the very first line of a long blank message on a screen while a busy teammate reads only that line and nods. Each card carries its Japanese label across the top. The Japanese words in this picture are exactly: 具体的な 数字（ぐたいてきな すうじ） / 結論から 書く（けつろんから かく）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 23. メールは【 】で 読みやすく する

- **出力する 先** … `public/img/hourensou/renraku/s4.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_lecture blocks[12]（image）
- **絵の 中の 文字** … 「【重要】（じゅうよう）」・「【相談】（そうだん）」・「【共有】（きょうゆう）」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. A teaching diagram. A large rounded cream panel in the centre is drawn as a simple mail window: one bold subject line at the top and, below it, three or four soft grey abstract bars standing for the body text, with no readable writing in them. Three rounded coral tags float above the subject line, each carrying one of the Japanese words given here. On the right a colleague scans the tags and nods, understanding at a glance which mail to open first. The Japanese words in this picture are exactly: 【重要】（じゅうよう） / 【相談】（そうだん） / 【共有】（きょうゆう）. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 24. 連絡の ケーススタディ（2つの 場面）

- **出力する 先** … `public/img/hourensou/renraku/s2.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_lecture blocks[20]（image）
- **絵の 中の 文字** … 「ケース A」・「ケース B」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture split into two equal panels by a thin cream gutter, each panel a small workplace scene. LEFT PANEL: an engineer at his desk turns to a wall clock and then types a short message — a schedule has changed. RIGHT PANEL: an engineer holds up a tablet to show a teammate something useful he has found, and the teammate smiles. A rounded cream label panel sits at the top of each panel carrying the Japanese words given here. The Japanese words in this picture are exactly: ケース A / ケース B. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 25. 30分ルールの 3つの えらび方

- **出力する 先** … `public/img/hourensou/soudan/slide6.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[14]（image）
- **絵の 中の 文字** … 「A」・「B」・「C」
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. This one is a teaching diagram: few large elements, generous spacing, each label sitting on a soft cream panel with a rounded border, arranged so the eye reads it in one pass. One wide picture divided into three equal vertical panels by thin cream gutters. LEFT PANEL: a young engineer sits alone at his desk, shoulders low, staring at his screen for a very long time, the office around him dim. MIDDLE PANEL: the same engineer thinks for a short while with a small clock on the desk, then turns and raises a hand towards a senior colleague, who turns to him — bright and balanced. RIGHT PANEL: the engineer immediately spins his chair to the senior without looking at his own screen at all, and the senior looks a little surprised. A large rounded cream label panel sits at the top of each panel carrying only the single letter given here. The Japanese words in this picture are exactly: A / B / C. Output: one landscape illustration, 1536x1024. Japanese lettering — read this part carefully. The picture contains ONLY the Japanese words listed in the scene above, and no other writing at all. Print each word LARGE and horizontally in a rounded gothic Japanese font, with generous space around it. Directly above every kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height, so that the kanji and the furigana both stay sharp and easy to read at a glance. Words written only in hiragana or katakana take no furigana. Spell every character exactly as given. No other letters, numbers, logos or watermarks anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 人物を 特定しない 場面（文字なし）

- 台帳: `scripts/images/hourensou_scenes.json`（5枚）
- 参照画像: なし（1枚目が 絵柄の アンカーに なる）
- 絵の 中の 文字: 焼かない
- 本文が ことばを 持って いるので 絵は 場面だけ

```bash
node scripts/slides/gen_images.mjs scripts/images/hourensou_scenes.json .tmp-img/scenes
```

### 26. エラーが 出た とき どう する（3つ）

- **出力する 先** … `public/img/hourensou/soudan/slide2.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[3]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. One wide picture divided into three equal vertical panels by thin cream gutters. LEFT: a young engineer sits alone at his desk with his chin on his fist, thinking hard at a blank screen. MIDDLE: the same engineer leans over to a friend at the next desk and they look at one laptop together. RIGHT: the engineer types a search into a blank browser window, one hand on the mouse, curious. Same office, same warm light in all three. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 27. 相談すると 答えが 見つかる

- **出力する 先** … `public/img/hourensou/soudan/slide3.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[5]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. A junior engineer and a senior colleague sit side by side at one desk, both looking at the same laptop. The senior points at the screen and the junior's face lights up with understanding — the moment the answer appears. Warm daylight, a plant behind them, two mugs on the desk. Medium two-shot filling the frame. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 28. 一人で 悩む と チームで 考える

- **出力する 先** … `public/img/hourensou/soudan/slide4.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[7]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. One wide picture split into two equal halves by a soft vertical cream gutter. LEFT HALF, cool and dim: one engineer sits very small and alone in a large empty office, surrounded by too much space, head down. RIGHT HALF, warm and bright: four colleagues stand close together around one desk, all leaning in towards the same laptop, relaxed and involved. The contrast is made with light and spacing only. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 29. 相談する ばめん ①〜④

- **出力する 先** … `public/img/hourensou/soudan/slide5-1.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[10]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. One wide picture divided into four equal panels in a single row by thin cream gutters, each a small workplace vignette of the same young engineer. 1: he looks between two laptops, one showing a calm blank screen and the other a screen with a soft red glow — it works on one machine but not the other. 2: he holds up two blank rounded cards and looks from one to the other, choosing. 3: he points at a blank page in a thick document and looks up, having found something missing. 4: he watches a slow spinning circle on his screen, chin on hand, wanting a better way. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

### 30. 相談する ばめん ⑤〜⑧

- **出力する 先** … `public/img/hourensou/soudan/slide5-2.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_lecture blocks[11]（image）
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … B

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Warm modern anime illustration, like a friendly Japanese educational manga — clean confident black linework, flat cel shading with gentle light, bright natural daylight, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. A tidy contemporary Japanese software office with real desks, chairs, windows, plants, mugs and laptops. People are drawn as real human beings with natural proportions, warm friendly faces and exactly five fingers on each hand. Every picture is a REAL PLACE seen from a natural camera angle, and the subject FILLS THE WHOLE FRAME. One wide picture divided into four equal panels in a single row by thin cream gutters, each a small workplace vignette of the same young engineer. 5: two soft abstract branching lines on his screen have crossed and tangled, and he looks at them carefully. 6: he sits in front of a laptop with a soft red glow while an open manual lies beside it, comparing the two. 7: he holds a large tablet in landscape and a small phone side by side, and the layout that fits the tablet clearly does not fit the phone. 8: he looks at an empty checklist on his screen with a pen in hand, not yet knowing what to write. Output: one landscape illustration, 1536x1024. No text, no letters, no kanji, no kana, no numbers anywhere in the image. Screens, papers, whiteboards, books and signs are blank or show only soft abstract shapes and simple pictures. No watermark, no signature, no logo, no speech balloons, no floating symbols such as question marks, exclamation marks, arrows, light bulbs, stars or hearts. Never: photo-realistic rendering, harsh shadows, extra or merged fingers, distorted hands, dark or scary mood, angry or crying faces, watermarks, real company logos or brand marks of any kind, national flags, country outlines, maps with borders, tiny cluttered text, paragraphs of text, 3D render, flat vector icon art, pictograms floating on an empty background, robots, mascots.
```

</details>

---

## 場面クイズ「いま 話しかけて いい？」

- 台帳: `scripts/images/soudan_kehai.json`（6枚）
- 参照画像: `public/img/characters/okuda/sheet.webp`
- 絵の 中の 文字: 焼かない
- **いま 絵が 無い**（点線わく）。急ぐ

```bash
node scripts/slides/gen_images.mjs scripts/images/soudan_kehai.json .tmp-img/soudan_kehai
```

### 31. 電話中（受話器を 耳に あてて メモ）

- **出力する 先** … `public/img/quiz/soudan_kehai/k1_denwa.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_kehai の questions[0].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Anime illustration, no readable text. A bright modern software office, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Same character in every image: Okuda the senior engineer, drawn from the attached character sheet: a Japanese man in his mid twenties, wavy messy black hair with volume, black rectangular thick-rimmed glasses, a dark green pullover hoodie with drawstrings and no writing on it at his desk with a laptop and a small potted plant. Viewed from a coworker's standing viewpoint a few steps away. No text, no letters, no numbers, no speech bubbles. Scene: Okuda holds a phone to his ear, taking notes on a notepad, eyes down, mid-conversation. Output: one landscape illustration, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 32. ヘッドホンで 超集中（速く 打って いる）

- **出力する 先** … `public/img/quiz/soudan_kehai/k2_shuuchuu.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_kehai の questions[1].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Anime illustration, no readable text. A bright modern software office, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Same character in every image: Okuda the senior engineer, drawn from the attached character sheet: a Japanese man in his mid twenties, wavy messy black hair with volume, black rectangular thick-rimmed glasses, a dark green pullover hoodie with drawstrings and no writing on it at his desk with a laptop and a small potted plant. Viewed from a coworker's standing viewpoint a few steps away. No text, no letters, no numbers, no speech bubbles. Scene: Okuda wears big headphones, leaning close to the screen, both hands typing fast, several code windows open, an energy drink beside the keyboard. Output: one landscape illustration, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 33. お茶で 一息（のびを して いる）

- **出力する 先** … `public/img/quiz/soudan_kehai/k3_hitoiki.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_kehai の questions[2].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Anime illustration, no readable text. A bright modern software office, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Same character in every image: Okuda the senior engineer, drawn from the attached character sheet: a Japanese man in his mid twenties, wavy messy black hair with volume, black rectangular thick-rimmed glasses, a dark green pullover hoodie with drawstrings and no writing on it at his desk with a laptop and a small potted plant. Viewed from a coworker's standing viewpoint a few steps away. No text, no letters, no numbers, no speech bubbles. Scene: Okuda leans back in his chair, stretching, holding a warm cup of tea, relaxed small smile, screen dimmed. Output: one landscape illustration, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 34. 困り顔（画面を にらんで 髪に 手）

- **出力する 先** … `public/img/quiz/soudan_kehai/k4_komarigao.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_kehai の questions[3].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Anime illustration, no readable text. A bright modern software office, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Same character in every image: Okuda the senior engineer, drawn from the attached character sheet: a Japanese man in his mid twenties, wavy messy black hair with volume, black rectangular thick-rimmed glasses, a dark green pullover hoodie with drawstrings and no writing on it at his desk with a laptop and a small potted plant. Viewed from a coworker's standing viewpoint a few steps away. No text, no letters, no numbers, no speech bubbles. Scene: Okuda frowns at the screen with one hand in his hair, shoulders slumped, clearly stuck and troubled. Output: one landscape illustration, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 35. 急いで いる（PCを かかえて 時計を 見る）

- **出力する 先** … `public/img/quiz/soudan_kehai/k5_isogu.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_kehai の questions[4].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Anime illustration, no readable text. A bright modern software office, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Same character in every image: Okuda the senior engineer, drawn from the attached character sheet: a Japanese man in his mid twenties, wavy messy black hair with volume, black rectangular thick-rimmed glasses, a dark green pullover hoodie with drawstrings and no writing on it at his desk with a laptop and a small potted plant. Viewed from a coworker's standing viewpoint a few steps away. No text, no letters, no numbers, no speech bubbles. Scene: Okuda stands, laptop under one arm, glancing at his wristwatch, walking quickly away from the desk. Output: one landscape illustration, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 36. 朝いちばん（かばんを 置いた ところ）

- **出力する 先** … `public/img/quiz/soudan_kehai/k6_asa.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs soudan_kehai の questions[5].image
- **大きさ** … Output: one landscape illustration, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Anime illustration, no readable text. A bright modern software office, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Same character in every image: Okuda the senior engineer, drawn from the attached character sheet: a Japanese man in his mid twenties, wavy messy black hair with volume, black rectangular thick-rimmed glasses, a dark green pullover hoodie with drawstrings and no writing on it at his desk with a laptop and a small potted plant. Viewed from a coworker's standing viewpoint a few steps away. No text, no letters, no numbers, no speech bubbles. Scene: Morning light through the window. Okuda has just arrived, putting his bag down beside the desk, computer still starting up, jacket half off. Output: one landscape illustration, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

---

## まんが「連絡が なかった 日」

- 台帳: `scripts/images/renraku_manga.json`（9枚）
- 参照画像: `public/img/characters/nyam/sheet.webp` ／ `public/img/characters/hendy/sheet.webp`
- 絵の 中の 文字: 焼かない
- **いま 絵が 無い**（点線わく）。急ぐ

```bash
node scripts/slides/gen_images.mjs scripts/images/renraku_manga.json .tmp-img/renraku_manga
```

### 37. 金曜日の 夕方 — オフィス / 金曜日の 夕方です。ニャムさんは 検証サーバーの

- **出力する 先** … `public/img/manga/renraku_manga/panel1.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[0].panels[0].image
- **大きさ** … Output: one manga panel, 1024x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. A bright modern software office in the late afternoon, warm orange light through the window. a young Southeast Asian junior engineer man (Nyam, short black hair swept up off the forehead, coral cardigan over a cream button-down shirt) sits at his desk looking at a sticky note on his monitor, thinking, one hand on his chin. Output: one manga panel, 1024x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 38. 金曜日の 夕方 — オフィス / 連絡は…… あとで いいか。

- **出力する 先** … `public/img/manga/renraku_manga/panel2.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[0].panels[1].image
- **大きさ** … Output: one manga panel, 1024x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. Close shot on a young Southeast Asian junior engineer man (Nyam, short black hair swept up off the forehead, coral cardigan over a cream button-down shirt) at the same desk, one hand hovering over the keyboard, a chat app open as abstract blurred bubbles on the screen, his eyes glancing away with a slightly guilty look. Output: one manga panel, 1024x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 39. 金曜日の 夕方 — オフィス / 20時。検証サーバーが 止まりました。だれも 知

- **出力する 先** … `public/img/manga/renraku_manga/panel3.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[0].panels[2].image
- **大きさ** … Output: one landscape manga panel, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. Wide shot of the office at night, dark blue palette, only one desk lamp on where a young Southeast Asian junior engineer man (Nyam, short black hair swept up off the forehead, coral cardigan over a cream button-down shirt) works alone. By the wall, a small server rack with one status light glowing red instead of green. Output: one landscape manga panel, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 40. その 夜 と 月曜日の 朝 / 同じ ころ。ヘンディさんは 家で 確認作業を し

- **出力する 先** … `public/img/manga/renraku_manga/panel4.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[1].panels[0].image
- **大きさ** … Output: one manga panel, 1024x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. Night at a home desk with a warm lamp. Hendy the senior engineer, drawn from the attached character sheet: a Japanese man in his late twenties, slim, short slightly tousled black hair, gentle smile, at home in a casual grey hoodie instead of his suit, no lanyard and no glasses, looking at a laptop that shows an abstract empty error dialog, confused expression, tilting his head. Output: one manga panel, 1024x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 41. その 夜 と 月曜日の 朝 / 保存する 前に 止まった……。きょうの 作業が 

- **出力する 先** … `public/img/manga/renraku_manga/panel5.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[1].panels[1].image
- **大きさ** … Output: one manga panel, 1024x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. Same home desk at night. Hendy the senior engineer, drawn from the attached character sheet: a Japanese man in his late twenties, slim, short slightly tousled black hair, gentle smile, at home in a casual grey hoodie instead of his suit, no lanyard and no glasses, leans back with both hands on his head, looking at the ceiling, tired, the laptop screen dim. Output: one manga panel, 1024x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 42. その 夜 と 月曜日の 朝 / すみません。金曜の 夜、わたしが サーバーを 止

- **出力する 先** … `public/img/manga/renraku_manga/panel6.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[1].panels[2].image
- **大きさ** … Output: one landscape manga panel, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. Monday morning in the bright office. a young Southeast Asian junior engineer man (Nyam, short black hair swept up off the forehead, coral cardigan over a cream button-down shirt) bows apologetically beside a desk. Hendy the senior engineer, drawn from the attached character sheet: a Japanese man in his late twenties, slim, short slightly tousled black hair, gentle smile, navy single-breasted suit jacket over a crisp white dress shirt with a navy necktie, no lanyard and no glasses turns from his chair with a calm, kind expression, soft morning light through the window. Output: one landscape manga panel, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 43. 月曜日の 昼 — 二人で 連絡 / いっしょに 連絡の 文を 作りましょう。いつ・何

- **出力する 先** … `public/img/manga/renraku_manga/panel7.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[2].panels[0].image
- **大きさ** … Output: one manga panel, 1024x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. Hendy the senior engineer, drawn from the attached character sheet: a Japanese man in his late twenties, slim, short slightly tousled black hair, gentle smile, navy single-breasted suit jacket over a crisp white dress shirt with a navy necktie, no lanyard and no glasses and a young Southeast Asian junior engineer man (Nyam, short black hair swept up off the forehead, coral cardigan over a cream button-down shirt) sit side by side at one laptop. Hendy points at the screen with a pen, Nyam nods holding a small notebook. Output: one manga panel, 1024x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 44. 月曜日の 昼 — 二人で 連絡 / あしたの 18時から 19時まで、検証サーバーを

- **出力する 先** … `public/img/manga/renraku_manga/panel8.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[2].panels[1].image
- **大きさ** … Output: one manga panel, 1024x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. Close-up of the laptop screen showing a chat compose box as abstract blurred lines, a young Southeast Asian junior engineer man (Nyam, short black hair swept up off the forehead, coral cardigan over a cream button-down shirt) pressing the enter key with one finger, focused hopeful face. Output: one manga panel, 1024x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

### 45. 月曜日の 昼 — 二人で 連絡 / スタンプが ならびました。「読みました」の 合図

- **出力する 先** … `public/img/manga/renraku_manga/panel9.webp`
- **書き込む 先** … scripts/gen_hourensou_content.mjs renraku_manga の pages[2].panels[2].image
- **大きさ** … Output: one landscape manga panel, 1536x1024.
- **優先度** … A

<details><summary>プロンプト全文（そのまま 貼る）</summary>

```text
Medium shot, clean line art, flat cel shading, soft pastel palette of sky blue, cream and coral, rounded friendly shapes. Keep empty space at the top of the frame. No text, no letters, no numbers, no signage, no speech bubbles, no readable text. Anime manga panel, no readable text. The chat window on a laptop screen with one abstract message bubble and three colorful round reaction icons floating beside it: an eye icon, a thumbs-up icon, and folded hands icon. Behind the laptop, a young Southeast Asian junior engineer man (Nyam, short black hair swept up off the forehead, coral cardigan over a cream button-down shirt) and Hendy the senior engineer, drawn from the attached character sheet: a Japanese man in his late twenties, slim, short slightly tousled black hair, gentle smile, navy single-breasted suit jacket over a crisp white dress shirt with a navy necktie, no lanyard and no glasses smile at each other, bright cheerful light. Output: one landscape manga panel, 1536x1024. Absolutely no readable text, letters, numbers, logos or speech bubbles anywhere in the picture. Never: photo-realistic rendering, harsh shadows, extra fingers, distorted hands, dark or scary mood, angry faces, watermarks.
```

</details>

---

## 動画の ポスター 3枚（生成しない）

`poster_30min_a/b/c.webp` は `soudan/slide6.webp` を たてに 3つへ 切った もの。
slide6 を 作り直したら、同じように 切り出して 置きかえる（生成は 要らない）。

## 差しかえた あとの 確かめ

```bash
npm run gen:content      # 焼き込みモジュールを 作り直す（忘れると 画面が 変わらない）
npm run lint:content     # スキーマ・ふりがな・焼き込みずれ
npm run e2e              # 通しの 自動検証
```

絵の 数: **45枚**（内訳 — 富田さん（報告の 相手・PM） 8 ／ 富田さんの 図（文字あり） 1 ／ 奥田さん（相談の 相手・先輩） 4 ／ 奥田さんの 図（文字あり） 1 ／ ヘンディ先輩（連絡・チーム） 3 ／ 藤木取締役（会社の 階級） 1 ／ 人物を 特定しない 図（文字あり） 7 ／ 人物を 特定しない 場面（文字なし） 5 ／ 場面クイズ「いま 話しかけて いい？」 6 ／ まんが「連絡が なかった 日」 9）
