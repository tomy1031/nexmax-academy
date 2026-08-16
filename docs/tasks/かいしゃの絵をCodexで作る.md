# かいしゃステージの 絵を Codex で 作る（依頼書）

**この文書は Codex セッションに そのまま 渡せる形**で書いてある。
生成は **Codex（ChatGPTの枠）が第一**（`docs/constraints.md` 2026-08-07）。
Gemini は控え。**この作業で Gemini を使わない。**

**チェック（絵に文字が入っていないか・説明と合っているか）は Claude がやる。**
できあがったら Claude が実際に絵を見て確かめ、PR にして STG まで運ぶ。

---

## なぜ Claude ではなく Codex なのか

Codex の組み込み `image_gen`（image-gen-2）は **ChatGPT のログインだけで動く**
（APIキー不要。`docs/codex-backend.md` §1 の実測）。Claude の実行環境には
その ログインが無いので、ここだけは Codex の出番になる。

実績: ネクマックス6体・登場人物シート2枚・まんが4コマ＝計12枚を**作り直しゼロ**で生成
（同 §1）。

---

## 作るもの（3枚）

N5・N4 の両方の検収で「**ここが いちばん わかりにくい**」と挙がった箇所。
いまは「え は じゅんびちゅう」の点線枠が出ている。

| # | 保存先 | 何の絵か | プロンプト（**逐語で使う**） |
| - | ------ | -------- | ---------------------------- |
| 1 | `public/img/articles/kaisha_shirabekata/b18.webp` | 受託開発／自社開発／客先常駐 の ちがい | `content/articles/kaisha_shirabekata.json` の `blocks[18].prompt` |
| 2 | `public/img/articles/kaisha_nextmake_shirabe/b5.webp` | スマホの メニュー（≡）の 押し方 | `content/articles/kaisha_nextmake_shirabe.json` の `blocks[5].prompt` |
| 3 | `public/img/articles/m2-asakai-article/b1.webp` | 朝会は 立ったまま みじかく | `content/articles/m2-asakai-article.json` の `blocks[1].prompt` |

**プロンプトは教材データに すでに 書いてある。書き足さない・書き換えない**
（絵の指示は教材データ側が正。スキルの「マスター記述は逐語使用」と同じ考え方）。

---

## 手順

1. **1セッションで3枚まとめて**作る（セッションが変わると絵の傾向が変わる）。
2. 各プロンプトの末尾に、体裁だけ足す:

   ```
   Output: a single square illustration, soft cream background,
   no letters or numbers anywhere.
   ```

3. 実行のしかた（`docs/skills/codex_image_generation.md` §5 と同じ形）:

   ```bash
   codex -s workspace-write \
     "image-gen-2 で 画像を 1枚 生成してください。
      出力: 1024x1024 PNG。
      保存先: public/img/articles/kaisha_shirabekata/b18.png
      プロンプトは以下（逐語使用）:
      <content/articles/kaisha_shirabekata.json の blocks[18].prompt をそのまま>
      Output: a single square illustration, soft cream background, no letters or numbers anywhere."
   ```

4. PNG を webp にする（`cwebp -q 84`、または `sharp`）。**寸法違いでは作り直さない**
   （1024 指定で 1254 が返ることがある。中身は変えずに揃えるだけ — `docs/codex-backend.md` §1）。
5. 教材データを直す。3枚それぞれの image ブロックで:
   - `"status": "empty"` → `"status": "done"`
   - `"src": "/img/articles/<記事ID>/b<番号>.webp"` を足す
6. `npm run gen:content && npm run lint:content` を通す（エラー0であること）。
7. ブランチを切って push し、PR にする。**main へ直接入れない。**

---

## 受入（Codex 側で1枚ごとに見る）

- [ ] **絵の中に文字・数字が1つも無い**（ふりがなが効かないので、文字は本文側の仕事）
- [ ] あおぞらパスウェイの雰囲気（やわらかい線・パステル・クリーム地）から外れていない
- [ ] キャプションの説明と合っている
  - 1 … 「① お客さまの ために 作る ② 自分の 会社の ものを 作る ③ お客さまの 会社の 中で はたらく」の3つが**見分けられる**
  - 2 … スマホの上に「≡」があり、そこを押すと分かる
  - 3 … 立ったまま・みじかく の感じ
- [ ] 崩れた手指・6本指が無い

1つでも落ちたら**その1枚だけ**撮り直す。

---

## できたら

Claude に「PR を出した」と伝える（またはこのリポジトリの PR を見る）。
**Claude が絵を実際に見て確かめ**、良ければ main へ入れて STG に反映する。
直しが要るときは、教材データの `prompt` を直してから撮り直す
（プロンプトが正で、絵はその写し）。

---

## 補足: なぜ Gemini で作らなかったか（2026-08-16 の失敗の記録）

Claude が一度 Gemini（`/api/studio/image` と同じ生成器）で作ろうとして、
**HTTP 429（使いすぎ）で1枚も作れずに終わった**。制約どおり Gemini の無料枠は小さい。
そもそも「画像も Codex を第一」の制約に反していたので、その道は取り消した。
