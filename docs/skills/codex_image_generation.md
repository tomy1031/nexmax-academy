# Codex 画像生成スキル — ネクマックス & あおぞらパスウェイのアセット

**目的**: このアプリのキャラクター・イラスト画像を、Codex の **image-gen-2** で生成する。
**最重要ルール**: キャラクターを手描きSVGで自作しない。キャラ画像はすべて本スキルの手順で生成する。
**正典（スタイルアンカー）**: `public/img/characters/nexmax/reference.png`（ネクマックス原画）
**原画の入手元**: <https://nextmake.site/wp-content/uploads/2025/08/N.D%E5%B7%A6.png>
（NEXT MAKE 公式サイトの画像。まだリポジトリに未配置なら、下記コマンドで取得して上記パスに保存する）

```bash
curl -L -o public/img/characters/nexmax/reference.png \
  "https://nextmake.site/wp-content/uploads/2025/08/N.D%E5%B7%A6.png"
```

---

## 1. ネクマックスとは

NEXT MAKE のナビゲーター・ロボット。**スマーフ・パターン**で運用する——1体のマスコットではなく、役割ちがいのネクマックスが多数登場する（ガイドの／あいさつの／ものづくりの…）。世界観の定義は `docs/design/04_ビジュアルテーマ.md` §6。

## 2. 一貫性を保つ5つの工夫（このスキルの核心）

生成AIは呼ぶたびに絵柄がぶれる。以下を**全部**守ることでシリーズの同一性を保つ。

1. **参照画像を必ず入力に渡す**。すべての生成で `reference.png` を image-gen-2 の入力画像に添付する。テキストだけで再現しようとしない。
2. **マスター記述ブロック（§3）を逐語コピーして使う**。要約・言い換え・翻訳をしない。プロンプト＝「マスター記述＋差分1つ」。
3. **差分は1回に1つだけ**。ポーズ変更とアイテム追加を同時にしない。うまくいった変種を次の参照に足してもよい（参照画像は増やせる）。
4. **描画仕様を固定する**: 1024×1024・キャラ中央・全身・白背景（切り抜き前提）・余白たっぷり。サイズや構図を都度変えない。
5. **受入チェック（§6）に落ちたら修正せず再生成**。部分修正は絵柄の崩れを蓄積させる。

## 3. マスター記述ブロック（逐語使用・変更禁止）

```text
Character: "NexMax", the official robot mascot of NEXT MAKE.
Style: hand-drawn sketchy black outline (slightly rough, warm line, approx 6-8px at 1024px),
flat cel colors with soft minimal shading, cute chibi proportion (big head, about 2 heads tall),
soft drop shadow under feet, plain white background, no readable text anywhere.
Anatomy (must match the reference image exactly):
- Rounded helmet-like head, wider than tall, light sky-blue (#A9D6F5) with soft shading (#7FB8E8).
- Two small rounded ear pods on the sides of the head.
- Large white rounded face-screen covering most of the face, with a soft notch dipping at the top center.
- Two black oval eyes, thin curved eyebrow marks on the helmet above the screen, small gentle smile.
- Small trapezoid torso in the same sky-blue, with the NEXT MAKE chest mark:
  a navy (#004F8D) double-peak "M" logo (two triangular mountain shapes).
- Segmented ball-joint arms with round elbows and mitten hands.
- Short segmented legs with rounded boots.
Mood: friendly, curious, encouraging. Kid-safe, e-learning mascot.
Never: realistic rendering, gradients, extra fingers, readable letters, dark horror tone, angry face.
```

## 4. バリアント一覧（差分プロンプト）

配置先は **`public/img/characters/nexmax/<id>.webp`**。`src/components/nexmax.tsx` の registry と1対1。

**拡張子に注意**: `nexmax.tsx` が読むのは `.webp` である（`${DIR}/${variant}.webp`）。
Codex が出すのは PNG なので、保存後に必ず `cwebp -q 82` で変換して PNG を消す。
PNG のままだと1枚 850KB 前後で、6枚で 5MB になる。`unoptimized` を付けているので
Next.js の最適化は効かず、そのままの重さが学習者の回線に乗る。
（`sips` は WebP を書けない。変換は `cwebp` を使う。）

| id | 役割 | 差分プロンプト（マスター記述の後に1行だけ足す） | 生成 |
|---|---|---|---|
| `guide` | みちあんない | Pose: standing, one hand raised pointing upward cheerfully (same pose as the reference). | 2026-08-06 |
| `hello` | あいさつ | Pose: waving one hand high in a friendly greeting, other arm relaxed. | 2026-08-06 |
| `build` | ものづくり | Prop: wearing a tiny yellow hard hat tilted on the helmet, holding a small wrench. | 2026-08-06 |
| `listen` | きく | Prop: wearing big round headphones over the ear pods, one hand cupped near the ear. | 2026-08-06 |
| `cheer` | おうえん | Prop: holding two small pom-poms up, joyful open-mouth smile, tiny confetti around. | 2026-08-06 |
| `book` | ものしり | Prop: round glasses resting on the face-screen, holding an open book with blank pages. | 2026-08-06 |

追加バリアントを作るときは、この表に行を足し、`nexmax.tsx` の `NEXMAX_FAMILY` にも同じ id で追加する（表と registry の同期が契約）。

`hello` を先に1体だけ撮って受入チェックに通し、**残り5体はその hello.png も参照入力に足して1セッションで**撮った。
合格した変種を参照に足せる（§2-3）ので、2体目以降のぶれが減る。

## 5. 実行手順（Codex）

```bash
# 例: 「あいさつのネクマックス」を生成する
codex -i public/img/characters/nexmax/reference.png \
  "image-gen-2 でキャラクター画像を1枚生成してください。
   出力: 1024x1024 PNG, 白背景, キャラ中央・全身。
   保存先: public/img/characters/nexmax/hello.png
   プロンプトは以下（逐語使用）:
   <§3のマスター記述ブロックを貼る>
   Pose: waving one hand high in a friendly greeting, other arm relaxed."
```

- 1セッションで全バリアントをまとめて生成する（セッションが変わると傾向が変わるため）。
- 生成後は `npm run dev` で TOP／ログイン／チュートリアルを開き、並んだときの統一感を目視確認する。

## 6. 受入チェックリスト（1枚ごと）

- [ ] 頭部シルエットが reference と同じ（横長のヘルメット型＋耳ポッド）
- [ ] フェイススクリーンの形（上中央のくぼみ）と目・口の様式が同じ
- [ ] 胸の NEXT MAKE ロゴ（紺のダブルピークM）が正しく入っている
- [ ] 体色が水色（#A9D6F5系）・ロゴが紺（#004F8D系）で、余計な色が増えていない
- [ ] 線が手描き風の黒アウトラインで、太さの印象が揃っている
- [ ] 読める文字・実在ロゴ（NEXT MAKEマーク以外）・崩れた手指がない
- [ ] 白背景・全身・中央配置・1024×1024
- [ ] 表情が友好的（怒り・恐怖・嘲笑がない — 01ガイド R8）

1つでも落ちたら**再生成**（プロンプトの差分行を具体化して撮り直す）。

## 6.5 まんがの登場人物（ネクマックス以外の人間キャラ）

ネクマックスと違い、**正典の原画は無い**。かわりに `content/characters/<id>.json` の
`looks` が正典になる。だから `looks` はあいまいに書かない（「青いシャツ」ではなく
「そで を ひじまで まくった 水色(#A9D6F5)のボタンダウン」）。

1. **設定画（model sheet）を先に1枚作る** → `public/img/characters/<id>/sheet.webp`。
   プロンプトは手書きせず `buildCharacterSheetPrompt()`（`src/lib/manga-prompt.ts`）が
   出したものを逐語で使う。画面の「AIで つくる」と同じ文字列になり、あとで先生が
   作り直しても同じ絵柄に戻る。
   - 三面図（正面T字・側面・背面）＋表情6種、白背景、グリッド線、**文字なし**
   - 出力は 1536×1024。`cwebp -q 84` で変換する
2. **コマ絵は設定画を毎回参照入力に渡す。** ここが一貫性のほぼ全て。
   さらに **1コマ前の絵も参照に足す**と、部屋・光・服がそろう。
   （panel2 では sheet2枚＋panel1、panel3 では sheet2枚＋panel2 …）
3. **コマ絵に文字を描かせない。** セリフはアプリが下に重ねる（`manga-slides.tsx`）。
   作り直してよいのは「読める文字が描かれた」ときだけ。色ムラでは作り直さない。

実績: `hendy` / `nyam` の設定画と、`m2-asakai-manga` の4コマを 2026-08-06 に生成。
4コマとも1回ずつの生成で、服・髪・部屋がそろった（作り直しゼロ）。

## 6.6 立ち絵（対話ゲームの 舞台に 立つ 人）

対話ゲーム（`meeting.talkGame`・願い #177）は **背景＋立ち絵**で 場を 作る。
コマ絵と ちがい、**背景を 抜いた 1人**が 要る。

- 参照入力は **設定画（`sheet.webp`）＋本人の 参考写真**。`looks` は
  `content/characters/<id>.json` から **逐語**で 写す（§6.5 と 同じ 正）。
- 出力は **1024×1536 の PNG・アルファ付き**（`transparent background (alpha)` と
  明記する）。書けて いるかは `file *.png` が `RGBA` と 言うかで 見る——
  **`RGB` で 返って くる ことが ある**ので、その 1枚だけ 消して 撮り直す（実発生）。
- **撮り直しても RGB の ままの ことが ある**（2026-08-28・ヘンディの 立ち絵で 3回 連続）。
  1回目は 透明の つもりで **市松模様を 絵として 描いて きた**——プロンプトを どれだけ
  強めても 抜けられなかった。そのときは 白い 背景で 撮って、機械で 切りぬく:

  ```bash
  node scripts/images/cutout_white.mjs <入力.png> <出力.png>   # 既定の しきい値 236
  cwebp -q 84 -alpha_q 90 <出力.png> -o public/img/characters/<id>/stand_*.webp
  ```

  **色で 抜くのでは なく へりから 塗りつぶす**ので、白い ワイシャツは 残る（人物の 中の
  白は 濃い 線で 囲まれて いて、画像の へりから つながって いない）。仕上がりは
  マゼンタの 板に 重ねて 目で 見る。
- 変換は `cwebp -q 84 -alpha_q 90`（アルファを 落とさない）。1枚 80KB 前後。
- 台帳は `scripts/images/<id>_<用途>.json`。生成は
  `node scripts/slides/gen_images.mjs <台帳> <出力フォルダ>`
  （台帳の `refs` で 参照入力を、`scenes[].output` で 1枚ごとの 形を 決められる）。

| 保存先 | 差分（ポーズ・表情） | 生成 |
|---|---|---|
| `public/img/characters/matsui/stand_neutral.webp` | 立って 正面。腕は 下ろす。おだやかに 聞いて いる | 2026-08-24 |
| `public/img/characters/matsui/stand_smile.webp` | 少し 前へ。手のひらを 胸の 高さに 開いて、うれしそうに 笑う | 2026-08-24 |
| `public/img/characters/matsui/stand_think.webp` | 手を あごに 当てて、少し 首を かしげて 考える | 2026-08-24 |
| `public/img/scenes/office_president.webp` | 社長室（人を 描かない・**右3分の1を 空ける**＝立ち絵の 居場所） | 2026-08-24 |
| `public/img/characters/hendy/stand_neutral.webp` | 立って 正面。腕は 下ろす。おだやかに 聞いて いる | 2026-08-28 |
| `public/img/characters/hendy/stand_smile.webp` | 少し 前へ。胸の 高さで 小さく サムズアップし、うれしそうに 笑う | 2026-08-28 |
| `public/img/characters/hendy/stand_think.webp` | 手を あごに 当てて、少し 首を かしげて 考える | 2026-08-28 |

ヘンディの 3枚は 台帳 `scripts/images/hendy_talkgame.json`。**絵は あるが、画面に 出す
配線は まだ 無い**——ふつうの ミーティング（`talkGame` の 無い 教材）は 背景と 立ち絵を
スキーマで 持って いないので、`schema.ts` を 触る 横断変更に なる（別タスク）。

## 6.7 ページ教材（article）の さし絵

説明ページの image ブロック。**アイコン図は 使わない**（2026-08-25 の 指定
「アイコン画像ではなく、全てイラスト画像にすること」「余白の多い大きなアイコン画像は つかわない」）。

- 絵は **場面**を 描く。人が いて、机・窓・植木の ある 本物の 部屋で、画面の はしまで うめる。
  ピクトグラムを 余白に 浮かべた 図は、説明の 理解を 助けない。
- 参照入力は **人の 写って いない まんがのコマ**（`public/img/manga/hajimari_manga/p1c2.webp`）。
  絵柄だけを 借りる ため。人物（ヘンディ・松井社長）が 出る 絵は 設定画を 参照に 渡す 別台帳に する。
- **松井社長は 本人の 参考写真（`matsui/reference.jpg`）も 参照に 渡す**（同 指定）。
- 学習者役の 学生は **1枚目を 絵柄アンカー**に して 顔と 服を そろえる
  （`gen_images.mjs` が 自動で そうする）。
- **キャプションは 画面に 出さない**（`article-view.tsx`）。データの `caption` は `alt` に だけ 使う。
- てじゅん（steps）の 絵は **正方形 1024x1024**（サムネイルが 正方形で 切られる）。
  本文の さし絵は 横長 1536x1024。

| 台帳 | 中身 | 生成 |
|---|---|---|
| `scripts/images/kaisha_step1_scenes.json` | 会社を知る STEP1 の ページ 23枚（学生・オフィス） | 2026-08-25 |
| `scripts/images/kaisha_step1_people.json` | 同 2枚（ヘンディ・松井社長が 画面に 出る） | 2026-08-25 |
| `scripts/images/kaisha_step1_opening.json` | 同 1枚（ページの 表紙 `hero` の 絵） | 2026-08-28 |
| `scripts/images/kaisha_junbi_scenes.json` | 準備ページの カード 3枚（学生だけ） | 2026-08-28 |
| `scripts/images/kaisha_junbi_nexmax.json` | 同 1枚（ネクマックスが 出る） | 2026-08-28 |
| `scripts/images/kaisha_junbi_people.json` | 同 2枚（A/B の 分かれ道。松井社長＋吹き出しの ネクマックス） | 2026-08-28 |
| `scripts/images/kaisha_junbi_matsui.json` | 同 1枚（松井社長に 質問する） | 2026-08-28 |
| `scripts/images/kaisha_junbi_hendy.json` | 同 1枚（ヘンディさんが 出る） | 2026-08-28 |

**学習者役を 毎回 同じ 顔に しない**（2026-08-28 の 指摘「同じ女性を使いすぎ」「背景にもバリエーションが
欲しい」）。§6.7 は「学習者役の 学生は 1枚目を 絵柄アンカーに して 顔と 服を そろえる」と 書いて いるが、
それは **1つづきの 場面**（同じ 人が 順に 進む ページ）の 話。**別々の 例を 並べる カード**では、
1枚ごとに 別の 学生・別の 部屋に する —— そこで `g1` を 参照に 渡すと 顔が そろって しまうので、
**渡さない**。そろえるのは 絵柄だけ（人が 写って いない コマ 1枚）。

**手は 崩れる。** 両手を 開いて 話す 姿勢は 指が からまりやすい（j1 で 実発生）。
「片手は 開き、もう 片手は 机や ものの 上に 置く」と 書き、`exactly five fingers each,
no tangled or merged fingers` を 足すと 直った。

**「つないで いる」絵は 差し口まで 書く。** 「a cable runs between them」だけだと
**ケーブルが 宙で 終わる**（j3 で 実発生）。`BOTH ENDS ARE CLEARLY PLUGGED IN` と、
差した ところの 見え方（コネクタが 奥まで 入り、すきまが 無い）まで 書く。

**人物ごとに 台帳を 分ける**（2026-08-28）。1つの 台帳に 松井社長と ヘンディさんの 設定画を
両方 渡すと 顔が 混ざる。ネクマックスも 別に する——ほかの 台帳は negative で
`robots, mascots` を 禁じて いるので、同じ 台帳に 入れると 出したい 絵にも 出ない。

**ネクマックスを 場面の 中に 描く ときは `reference.png` だけでは 足りない**（同日 実発生）。
原画だけを 渡すと 頭が 卵形に なり、白い 顔面が 小さく なった。**合格ずみの バリアント
（`build.webp` など）も 参照に 足す**と、横長ヘルメットと 大きな 顔面が 戻る。

## 7. シーン・背景イラスト（任意の強化アセット）

キャラ以外の装飾（雲・太陽・紙ひこうき）は軽量なインラインSVGのままでよい。より豪華にしたい場合のみ生成する:

| 保存先 | 内容 | サイズ |
|---|---|---|
| `public/img/scenes/hero_sky.png` | 淡い空と雲、遠くに小さく東京タワー。テキストなし | 1600×900 |
| `public/img/og.png` | ネクマックス（guide）＋青空＋道。SNSカード用 | 1200×630 |

シーン生成時もマスター記述の Style 節（線・色・禁止事項）を流用して統一する。

## 7.1 まなびマップのエリアタイル（`/map` の背景）

`/map` は縦スクロールで**エリアを上から順に積む**。1エリア＝画像1枚で、割り当ては
`src/content/areas.ts`（`MAP_AREAS`）が唯一の台帳。ここの表と `MAP_AREAS` の同期が契約。

**国名を出さない（厳守）**: 画面の表示名は景色の名前だけにする。**生成プロンプトにも国名・国旗・
実在の固有名詞を書かず、「風景としてのみ描く」と明記する**。国は今後の情勢で差し替える前提。
とくに**「タイ」は使用禁止**（`AGENTS.md` の絶対規律）。

**継ぎ目の契約**: 各タイルは 1024×1536 の縦長で、**四辺すべてが海**。上端10%と下端10%は
海だけにして、島・建物・船を置かない。色は `#2E9FD6`（RGB 46,159,214）に寄せる。

**シーム色の厳密さは求めない（重要）**: 実際の継ぎ目は `CloudBand` の雲海が完全に覆うので、
上下端に多少のグラデーションが乗っていても問題ない。**生成プロンプトには「色ムラを理由に
再生成しないでください」と明記する** — これを書かないと、Codex が単色チェックに落ちたと判断して
延々と作り直し、いつまでも保存されない（実際に発生した）。作り直すのは構図が崩れたときだけ。

| # | 保存先 | 表示名 | 主題（差分プロンプト） |
|---|---|---|---|
| 1 | `public/img/scenes/area1_cambodia.webp` | アンコールワット | アンコールワット風の五塔石造寺院＋熱帯雨林・砂糖椰子・高床の家 |
| 2 | `public/img/scenes/area_riverside_capital.webp` | プノンペン | 川沿いの首都。金の尖塔の王宮＋ガラスの高層ビル＋遊歩道と係留船＋パステルの街並み |
| 3 | `public/img/scenes/area3_vietnam.webp` | うみの いわやま | ハロン湾風の石灰岩の岩山群＋ジャンク船・棚田・提灯の村 |
| 4 | `public/img/scenes/area5_taiwan.webp` | かいだんの まち | 九份風の階段街＋赤提灯・茶畑の段々・霧の山 |
| 5 | `public/img/scenes/area_misty_peaks.webp` | きりの やまなみ | 水墨画風の霧の岩峰＋瓦屋根の城下町・多層の塔・石橋・茶畑 |
| 6 | `public/img/scenes/area_palace_town.webp` | みやこの まち | 瓦屋根の宮殿と旧市街＋紅葉・露店、奥に現代のビル群 |
| 7 | `public/img/scenes/japan_goal.webp` | 日本（ゴール） | 富士山・桜・東京のスカイライン・鳥居（**横長 1536×1024**。地図の最下部の帯） |

- 7枚目だけは役割が違う（縦に積むタイルではなくゴール帯）ので、横長のまま据え置く。
- 縦タイルは**1セッションでまとめて生成**する（セッションをまたぐと絵柄がぶれる）。
- 配置後は `.webp` に変換する（`cwebp -q 82`。`.png` のままだと1枚3MB前後になり重い）。

## 7.2 スライド教材の挿絵（`scripts/slides/<教材ID>/img/`）

スライド教材（`kind: "slides"`）の紙芝居用シーン絵。1枚のスライド＝1枚の横長イラスト
（1536×1024）で、**文字・数字・グラフは絵に入れない**（HTML組版側が描く。
組版は `scripts/slides/render_pdf.mjs`）。

- 置き場は `scripts/slides/<教材ID>/img/`。**JPEG（1080px・q72 目安）に変換して置く**。
  PDF は JPEG をそのまま抱き込むが、webp/PNG は可逆ビットマップ化されて
  10MB 超になる（ai_jidai で実測 22MB→3MB）。アプリが読まない組版素材なので
  `public/img/` には置かない
- プロンプトの台帳は **`scripts/slides/<教材ID>/prompts.json`**（Style節＋シーン差分）。
  再生成は `node scripts/slides/gen_images.mjs <prompts.json> <出力フォルダ>`
  （bridge 起動が前提。途中で止まっても再実行で続きから走る）
- ネクマックスが登場するシーンは reference.png を参照入力に渡し、1枚目の合格画像を
  以後の参照に足して1セッションで撮る（§2 と同じ）
- 受入基準はクイズ絵（`docs/design/07_性格タイプ設計_MBTI16.md` §9.2）と同じ
  （読める文字・実在ロゴが1つでもあれば再生成）

| 教材ID | 枚数 | 生成 |
|---|---|---|
| `ai_jidai`（AIの 時代 — プログラマーから PMへ） | 15枚（s01〜s22 の絵スライド分） | 2026-08-17 |
| `it_orientation`（日本で エンジニアに なる ために） | 13枚＋4枚（t22〜t25） | 2026-08-17 / 2026-08-19 |

**感情の いる 1枚は `negative` を ゆるめる（2026-08-19）**: 既定の negative は
「angry or crying faces」を 禁じている。おかげで **どの 絵も おだやかで、
「通じないと どうなるか」の 山場が 平らに なった**（ユーザー指摘「感情の きびが 伝わらない」）。
困っている お客さまなど**感情が 教材の 中身そのもの**の 1枚だけは、その節を 外した
台帳で 撮る（`t25_trouble`）。外すのは 人間の 登場人物だけで、**ネクマックスは
いつも 友好的**（§6 の 受入チェック）。

同じ 手を 2026-08-28 に ページ教材でも 使った（`kaisha_junbi_people.json`）。
「どちらの 学生と もっと 話したいですか」と **選ばせる 2枚**では、社長の 気もちが
問いの 中身その ものに なる——両方 おだやかに 描くと 選ぶ 意味が 消える。
外したのは **悲しさ まで**で、怒り・こわい 顔・涙は 禁じた ままに して ある。

## 8. 権利と運用

- reference.png はユーザー提供の原画。アプリ・教材以外への流用はしない。
- 生成画像は上書きせず、差し替えは `hello_v2.png` のように版を付けてから registry を切り替える。
- 生成のたびに、使ったプロンプト差分を本ファイルの表に反映する（表が唯一の台帳）。
