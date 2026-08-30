# 報連相の 絵をつくる — 指示書（2026-08-30）

**この1枚だけで 作業できる**ように書いた。作るのは **15枚**（場面クイズ6枚・まんが9コマ）。
プロンプトは すでに 台帳に 入っているので、**書かなくてよい**。

- 作業する場所: **ローカル**（Codex の image-gen-2 が要る。Cloud のセッションでは作れない）
- ブランチ: `integration` から切る。PR も `integration` へ
- 台帳（そのまま流せる）: `scripts/images/soudan_kehai.json` / `scripts/images/renraku_manga.json`
- 元データ: `content/quizsets/soudan_kehai.json` / `content/manga/renraku_manga.json`
- 規律: `docs/skills/codex_image_generation.md` §2（一貫性の5つ）・§6.5（まんがのコマ）に従う。
  **手描きSVGで自作しない**（AGENTS.md 絶対規律7）

---

## 0. なぜ急ぐか

2026-08-30 のユーザー指定:

> 生徒は N4レベルに満たない子が多いので、理解設計に気を配ること。日本語には慣れてないので、
> 文章で理解することがむずかしい人もいる。**絵を使うことは有効で、絵で理解できる内容にする**

この15枚は **絵が本体**である。

- **場面クイズ**は「いま 話しかけて いい？」を、先輩の机のまわりの様子ごと読ませる問題。
  それを字で書き並べると、測っているのが場面の読みではなく **長い日本語を読む速さ**になる
- **まんが**は `/renraku` の **1番目**の教材。連絡ステージを開いた学習者が最初に見る絵

いまは どちらも 点線わく／「え は じゅんびちゅう」で 出ている（画面は 壊れていない）。

---

## 1. 先に用意するもの

```bash
# 参照画像（無ければ）。ニャムとヘンディの設定画は すでにリポジトリにある
ls public/img/characters/nyam/sheet.webp public/img/characters/hendy/sheet.webp

# 置き場を作る
mkdir -p public/img/quiz/soudan_kehai public/img/manga/renraku_manga

# 生成の窓口（別ターミナルで立てっぱなしにする）
npm run codex:bridge
```

`cwebp` が要る（PNG → WebP。`sips` は WebP を書けない）。

---

## 2. 流す

**1セッションで まとめて 流す**（セッションをまたぐと絵柄がぶれる — スキル §2-1）。
台帳の順に生成し、**1枚目が合格したら それが次からの参照になる**（絵柄アンカー）。

```bash
# ① 場面クイズ 6枚
node scripts/slides/gen_images.mjs scripts/images/soudan_kehai.json /tmp/kehai_png

# ② まんが 9コマ
node scripts/slides/gen_images.mjs scripts/images/renraku_manga.json /tmp/renraku_png
```

出力フォルダに すでにあるファイルは飛ばすので、途中で止まっても 再実行で続きから走る。

### WebP に変換して 置き場へ

```bash
for f in /tmp/kehai_png/*.png; do
  cwebp -q 84 "$f" -o "public/img/quiz/soudan_kehai/$(basename "${f%.png}").webp"
done
for f in /tmp/renraku_png/*.png; do
  cwebp -q 84 "$f" -o "public/img/manga/renraku_manga/$(basename "${f%.png}").webp"
done
```

PNG のまま置かない（1枚 850KB 前後。15枚で 12MB が 教室の回線に乗る）。

---

## 3. 何を作るのか（15枚）

### 3.1 場面クイズ「いま 話しかけて いい？」— 6枚

置き場: `public/img/quiz/soudan_kehai/<設問id>.webp`（1536×1024）

**6枚とも 同じ人・同じ机**であることが この教材の芯である。人物の記述は台帳の `style` に
逐語で入っていて、6枚で共有される——**書き換えない**。1枚だけ別人になると、
「同じ先輩の ちがう様子を読む」という問題が成り立たなくなる。

| #   | ファイル              | 何の絵か                                                                 |
| --- | --------------------- | ------------------------------------------------------------------------ |
| 1   | `k1_denwa.webp`       | 受話器を耳にあて、メモを取りながら話している。目は下向き                 |
| 2   | `k2_shuuchuu.webp`    | 大きなヘッドホン。画面に顔を近づけ、両手で速く打っている                 |
| 3   | `k3_hitoiki.webp`     | いすにもたれて のび。あたたかいお茶のカップ。画面は暗い                  |
| 4   | `k4_komarigao.webp`   | 画面をにらんで髪に手。肩が落ちている（明らかに困っている）               |
| 5   | `k5_isogu.webp`       | ノートPCをかかえて立ち、腕時計を見ながら机から急いで離れる               |
| 6   | `k6_asa.webp`         | 朝の光。着いたばかりで かばんを置き、PCはまだ起動中                      |

見る人の目線は「数歩はなれたところに立っている同僚」。**顔だけでなく 机のまわり**
（電話・ヘッドホン・お茶・かばん）が見える引きで。

### 3.2 まんが「連絡が なかった 日」— 9コマ

置き場: `public/img/manga/renraku_manga/panel<n>.webp`

- **セリフを絵に描かせない**（`speechInImage: false`）。アプリが絵の下に出す。
  だから台帳の style にある **「Keep empty space at the top of the frame」を外さない**
- 参照は ニャム・ヘンディの設定画。**1コマ撮るたびに 直前のコマも参照に足す**と
  部屋・光・服がそろう（スキル §6.5-2）

| #   | ページ        | コマ                    | 大きさ    |
| --- | ------------- | ----------------------- | --------- |
| 1   | 金曜日の夕方  | 付せんを見て考える      | 1024×1024 |
| 2   | 金曜日の夕方  | チャットで手が止まる    | 1024×1024 |
| 3   | 金曜日の夕方  | 夜のオフィス・赤いランプ | 1536×1024 |
| 4   | その夜        | 家でエラーに首をかしげる | 1024×1024 |
| 5   | その夜        | 頭をかかえる            | 1024×1024 |
| 6   | 月曜日の朝    | 頭を下げる／おだやかな顔 | 1536×1024 |
| 7   | 月曜日の昼    | 二人で1台のPCをのぞく   | 1024×1024 |
| 8   | 月曜日の昼    | 送信キーを押す          | 1024×1024 |
| 9   | 月曜日の昼    | スタンプ3つ・笑いあう   | 1536×1024 |

---

## 4. 受入チェック（1枚ごと・落ちたら**直さず撮り直す**）

- [ ] **読める文字が1つもない**（看板・画面の文字・吹き出し・数字）。ここだけは絶対
- [ ] 場面クイズ6枚: **同じ人**に見える（髪・メガネ・紺のカーディガン・机まわり）
- [ ] まんが: 服・髪・部屋が 前のコマとつながっている
- [ ] まんが: **上に余白**がある（セリフが顔にかぶらない）
- [ ] 手指が崩れていない・怒った顔や怖い雰囲気がない（設計01 R8）
- [ ] 大きさが表のとおり

色ムラ・線のゆれでは撮り直さない（スキル §6.5-3）。

---

## 5. 差しこむ（ここが いちばん まちがえやすい）

> ⚠ **`content/*.json` を手で直しても、次に生成スクリプトを走らせると消える。**
> 報連相のデータは `scripts/gen_hourensou_content.mjs` が作っている。**直すのはこちら。**

### 5.1 場面クイズ

`scripts/gen_hourensou_content.mjs` の `kehaiImg()` を、`src` を受け取れるようにする:

```js
const kehaiImg = (scene, src) => ({
  prompt: `${scene} ${KEHAI_STYLE}`,
  refs: [],
  ...(src ? { src, status: "done" } : { status: "empty" }),
});
```

各設問の呼び出しに 2つ目の引数を足す:

```js
image: kehaiImg(
  "Suzuki holds a phone to his ear, ...",
  "/img/quiz/soudan_kehai/k1_denwa.webp",
),
```

### 5.2 まんが

同じく `mangaSlot()` に `src` を足す:

```js
const mangaSlot = (scene, src) => ({
  prompt: `Anime manga panel, no readable text. ${scene} ${MANGA_STYLE}`,
  refs: CHAR_SHEETS,
  ...(src ? { src, status: "done" } : { status: "empty" }),
});
```

コマの順に `"/img/manga/renraku_manga/panel1.webp"` … `panel9.webp` を渡す。

### 5.3 作り直して 焼き込む

```bash
node scripts/gen_hourensou_content.mjs   # content/*.json を作り直す
npm run gen:content                      # 焼き込みモジュール（これを忘れると画面は変わらない）
npm run lint:content                     # エラー0 であること
```

---

## 6. 確かめる

```bash
node scripts/check_fast.mjs
E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  npx playwright test tests/e2e/hourensou.spec.ts
```

e2e の「ステージの 教材が ぜんぶ ひらく」は、**空の絵わくの数がデータと合っているか**を
見ている。絵を入れれば期待値も自動で減るので、**絵を入れたのに画面が変わっていない**
（＝`gen:content` の忘れ）ときに ここが落ちる。

画面で見るなら `/soudan` の「👀 いま 話しかけて いい？」と `/renraku` の 1番目。
点線わくと「え は じゅんびちゅう」が 消えていれば よい。

## 7. 台帳

- 願い #258（この作業）
- 関連 #259（ミーティング2本の作り置き音声。別作業）
