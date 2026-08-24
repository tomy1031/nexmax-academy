# かいしゃステージ（STEP 01〜06）の 絵を Codex で 作る（依頼書）

**この文書は Codex セッションに そのまま 渡せる形**で書いてある。
生成は **Codex（ChatGPTの枠）が第一**（`docs/constraints.md` 2026-08-07）。
Gemini は控え。**この作業で Gemini を使わない。**

**チェック（絵に文字が入っていないか・説明と合っているか）は Claude がやる。**
できあがったら Claude が実際に絵を見て確かめ、PR にして STG まで運ぶ。

---

## 何が 変わったか（2026-08-25）

ユーザーが書いた授業の設計「**NEXT MAKEを しろう！ — 調査・報告・対話**」に
ステージの中身をそろえ直した（6つの STEP・8教材）。ページ教材2本の見出しが
入れかわったので、**さし絵も 作り直す**。

- ページ1 `kaisha_shirabekata` … STEP 1「会社の リサーチ方法を 学ぼう」（❶〜❼の 7つの ポイント）
- ページ2 `kaisha_nextmake_shirabe` … STEP 2「調査シートを うめよう」

**いま「え は じゅんびちゅう」の 点線枠が 出て いるのは 5枚**（`s2` `s3` `s7` `s10` `s12`）。
のこり 11枚は 前の 絵を 置いたままなので、**16枚を 1セッションで まとめて 撮り直す**と
絵柄がそろう（`docs/skills/codex_image_generation.md` §2）。

---

## なぜ Claude ではなく Codex なのか

Codex の組み込み `image_gen`（image-gen-2）は **ChatGPT のログインだけで動く**
（APIキー不要。`docs/codex-backend.md` §1 の実測）。Claude の実行環境には
その ログインが無いので、ここだけは Codex の出番になる。

---

## 作るもの（16枚・台帳は 2つ）

**プロンプトは 台帳に 書いてある。書き足さない・書き換えない。**
`dest` が そのまま 保存先（教材データの `src` と 同じ 文字列）。

| 台帳 | 参照入力 | 枚数 | 中身 |
| ---- | -------- | ---- | ---- |
| `scripts/images/kaisha_step_pages.json` | ネクマックス正典（絵柄そろえ用・**描かない**） | 13枚 | 図だけ（人を 描かない） |
| `scripts/images/kaisha_step_pages_people.json` | `hendy/sheet.webp`・`matsui/sheet.webp` | 3枚 | 人が 出る 絵 |

### 図だけ（`kaisha_step_pages.json`）

| out | 保存先 | 何の絵か |
| --- | ------ | -------- |
| `s3` | `public/img/articles/kaisha_shirabekata/s3.webp` | 見る ところを 決めてから ページを ひらく（**新規**） |
| `s4` | 同 `s4.webp` | オフィスは いくつかの 町に ある |
| `s5` | 同 `s5.webp` | 会社の あゆみ |
| `s6` | 同 `s6.webp` | 自分たちで 作って いる 5つの サービス |
| `s7` | 同 `s7.webp` | 3つの 特徴＝強み（**新規**） |
| `s8` | 同 `s8.webp` | 1つの 会社だけで 仕事を して いる わけでは ない |
| `s9` | 同 `s9.webp` | お客さまは いろいろな ところ |
| `s10` | 同 `s10.webp` | 6つの 大切な 考えかた（**新規**） |
| `s11` | 同 `s11.webp` | 学生の チームと 日本人の リーダー |
| `s12` | 同 `s12.webp` | 分からない ことばは 辞典で 調べる（**新規**） |
| `t2` | `public/img/articles/kaisha_nextmake_shirabe/t2.webp` | スマホの メニューを おす |
| `t3` | 同 `t3.webp` | やさしい 日本語と 日本語 |
| `t4` | 同 `t4.webp` | 調査シートの 6つの ブロック |

### 人が 出る（`kaisha_step_pages_people.json`）

| out | 保存先 | 何の絵か |
| --- | ------ | -------- |
| `s1` | `public/img/articles/kaisha_shirabekata/s1.webp` | この ステージの みち（4コマ） |
| `s2` | 同 `s2.webp` | 面接では 会社の ことを 聞かれる（**新規**） |
| `t1` | `public/img/articles/kaisha_nextmake_shirabe/t1.webp` | ヘンディさんが 調査シートを わたす |

---

## 手順

1. bridge を立てる（別ターミナル）:

   ```bash
   npm run codex:bridge
   ```

2. **台帳ごとに 1セッションで まとめて**生成する（セッションが変わると 絵の傾向が 変わる）:

   ```bash
   node scripts/slides/gen_images.mjs scripts/images/kaisha_step_pages.json /tmp/kaisha_step_png
   node scripts/slides/gen_images.mjs scripts/images/kaisha_step_pages_people.json /tmp/kaisha_step_png
   ```

   出力フォルダに すでに ある ファイルは 飛ばすので、途中で 止まっても 再実行で 続きから 走る。

3. PNG を webp にして、台帳の `dest` へ 置く（**寸法違いでは 作り直さない**——
   1536 指定で ずれた 数字が 返る ことが ある。中身は 変えずに そろえるだけ）:

   ```bash
   for f in /tmp/kaisha_step_png/*.png; do
     cwebp -q 82 "$f" -o "/tmp/kaisha_step_png/$(basename "${f%.png}").webp"
   done
   # そのあと 台帳の dest へ 1枚ずつ 置く
   ```

4. 新規の 5枚（`s2` `s3` `s7` `s10` `s12`）は、教材データの image ブロックを 直す:
   - `"status": "empty"` → `"status": "done"`
   - `"src": "/img/articles/<記事ID>/<out>.webp"` を 足す

   のこり 11枚は もう `src` が 入って いるので、**ファイルを 上書きするだけ**でよい。

5. `npm run gen:content && npm run lint:content` を 通す（エラー0で あること）。
6. `npm run check:size` で Worker の 大きさを 見る（2.8MiB 警告・3.0MiB で 失敗）。
7. ブランチを 切って push し、PR に する。**main へ 直接 入れない。**

---

## 受入（Codex 側で1枚ごとに見る）

- [ ] **絵の中に文字・数字が1つも無い**（ふりがなが効かないので、文字は本文側の仕事）
- [ ] あおぞらパスウェイの雰囲気（やわらかい線・パステル・クリーム地）から外れていない
- [ ] 台帳の `title` と 合って いる
- [ ] 崩れた手指・6本指が無い
- [ ] **国境線・国名・国旗が 出て いない**（絶対規律9）
- [ ] 人が 出る 3枚は、設定画（sheet）と 顔・髪・服が 同じ

1つでも落ちたら**その1枚だけ**撮り直す。

---

## できたら

Claude に「PR を出した」と伝える（またはこのリポジトリの PR を見る）。
**Claude が絵を実際に見て確かめ**、良ければ main へ入れて STG に反映する。
直しが要るときは、**台帳の `scene` を 直してから** 撮り直す
（プロンプトが正で、絵はその写し）。

---

## 補足: なぜ Gemini で作らなかったか（2026-08-16 の失敗の記録）

Claude が一度 Gemini（`/api/studio/image` と同じ生成器）で作ろうとして、
**HTTP 429（使いすぎ）で1枚も作れずに終わった**。制約どおり Gemini の無料枠は小さい。
そもそも「画像も Codex を第一」の制約に反していたので、その道は取り消した。
