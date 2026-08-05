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

配置先は `public/img/characters/nexmax/<id>.png`。`src/components/nexmax.tsx` の registry と1対1。

| id | 役割 | 差分プロンプト（マスター記述の後に1行だけ足す） |
|---|---|---|
| `guide` | みちあんない | Pose: standing, one hand raised pointing upward cheerfully (same pose as the reference). |
| `hello` | あいさつ | Pose: waving one hand high in a friendly greeting, other arm relaxed. |
| `build` | ものづくり | Prop: wearing a tiny yellow hard hat tilted on the helmet, holding a small wrench. |
| `listen` | きく | Prop: wearing big round headphones over the ear pods, one hand cupped near the ear. |
| `cheer` | おうえん | Prop: holding two small pom-poms up, joyful open-mouth smile, tiny confetti around. |
| `book` | ものしり | Prop: round glasses resting on the face-screen, holding an open book with blank pages. |

追加バリアントを作るときは、この表に行を足し、`nexmax.tsx` の `NEXMAX_FAMILY` にも同じ id で追加する（表と registry の同期が契約）。

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

## 8. 権利と運用

- reference.png はユーザー提供の原画。アプリ・教材以外への流用はしない。
- 生成画像は上書きせず、差し替えは `hello_v2.png` のように版を付けてから registry を切り替える。
- 生成のたびに、使ったプロンプト差分を本ファイルの表に反映する（表が唯一の台帳）。

## 9. マップのステージ背景（map_step<N>）

マップは「STEP 6 からは 1ステージ = 1枚の絵」。`public/img/scenes/map_step<N>_<slug>.webp`
を置くだけでマップが伸び、その STEP のピンが絵のまんなかに立つ（コード変更不要。
仕組みは `src/lib/map-segments.ts`、先生向け手順は `public/img/scenes/README.md`）。

**正典（スタイルアンカー）**: 元の3枚組
`map_seg1_cambodia.webp` / `map_seg2_ocean.webp` / `map_seg3_coast.webp`。
生成時は **3枚とも参照入力に渡す**（1枚だけだと色調が寄りすぎる）。

### 9.1 描画仕様（固定）

- **1024×1536 PNG**（縦長）→ `cwebp -q 82` で webp に変換して配置（sips は webp を書けない）
- **上端と下端は開けた海で終わらせる**。帯は縦に積まれるので、端に陸がかかると
  上下の絵とつながらず「割れた地図」になる
- **島（そのステージの土地）は中央付近に1つ**。ピンが絵のまんなかに立つため
- 読める文字・ロゴ・UIを描き込まない（ルビ合成の規律と同じ。文字は必ずアプリ側で出す）

### 9.2 マスター記述ブロック（逐語使用・変更禁止）

```text
Top-down 3/4 aerial view game map illustration, vertical 1024x1536.
Style: exactly match the reference images — bright saturated cel colors,
cute cozy game-map look (Animal-Crossing-like), soft painterly texture,
turquoise tropical sea with lighter shallow-water rings around every island,
tiny white wave dashes on open water, warm sunlight from the upper left.
Composition: ONE main island centered vertically and horizontally,
surrounded by open sea; a few tiny satellite islets allowed near corners.
The TOP EDGE and BOTTOM EDGE of the image must be plain open sea only
(no land touching the top or bottom edge), so the image can tile vertically
with the other map segments.
Never: readable text, letters, signs, logos, UI elements, humans, photo-realism,
dark or horror tone.
```

### 9.3 差分（1回に1行だけ足す）

そのステージの土地柄を1行で書く。例:

```text
Main island: a small modern IT office campus — a few low white-and-glass
buildings with sky-blue roofs, tiny server racks visible through windows,
a little plaza with trees, a tiny pier with a moored boat.
```

### 9.4 実行手順（Codex）

```bash
codex exec --skip-git-repo-check \
  -i public/img/scenes/map_seg1_cambodia.webp \
  -i public/img/scenes/map_seg2_ocean.webp \
  -i public/img/scenes/map_seg3_coast.webp \
  "image-gen-2 で背景画像を1枚生成してください。
   出力: 1024x1536 PNG。保存先: /tmp/map_step6.png
   プロンプトは以下（逐語使用）:
   <§9.2のマスター記述ブロックを貼る>
   <§9.3の差分1行を貼る>"

cwebp -q 82 /tmp/map_step6.png -o public/img/scenes/map_step6_<slug>.webp
```

### 9.5 受入チェックリスト（1枚ごと）

- [ ] 上端・下端が開けた海だけで終わっている（陸が端に触れていない）
- [ ] 島が中央付近にあり、ピンを置ける「開けた場所」がある
- [ ] 海の色・浅瀬の輪・波の点線が元の3枚と同じ調子
- [ ] 読める文字・ロゴ・人物がない
- [ ] 1024×1536・webp 変換後もにじんでいない

落ちたら**再生成**（§2 の規律と同じ。部分修正はしない）。

### 9.6 台帳（生成したステージ背景）

| ファイル | STEP | 差分プロンプト要約 |
|---|---|---|
| `map_step6_office-island.webp` | 6 | ITオフィスの島（白とガラスの低層ビル・青い屋根・広場と桟橋） |
