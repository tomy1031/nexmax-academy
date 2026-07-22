# Codex 画像生成スキル — ネクマックス & あおぞらパスウェイのアセット

**目的**: このアプリのキャラクター・イラスト画像を、Codex の **image-gen-2** で生成する。
**最重要ルール**: キャラクターを手描きSVGで自作しない。キャラ画像はすべて本スキルの手順で生成する。
**正典（スタイルアンカー）**: `public/img/characters/nekumax/reference.png`（ネクマックス原画）
**原画の入手元**: <https://nextmake.site/wp-content/uploads/2025/08/N.D%E5%B7%A6.png>
（NEXT MAKE 公式サイトの画像。まだリポジトリに未配置なら、下記コマンドで取得して上記パスに保存する）

```bash
curl -L -o public/img/characters/nekumax/reference.png \
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
Character: "NekuMax", the official robot mascot of NEXT MAKE.
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

配置先は `public/img/characters/nekumax/<id>.png`。`src/components/nekumax.tsx` の registry と1対1。

| id | 役割 | 差分プロンプト（マスター記述の後に1行だけ足す） |
|---|---|---|
| `guide` | みちあんない | Pose: standing, one hand raised pointing upward cheerfully (same pose as the reference). |
| `hello` | あいさつ | Pose: waving one hand high in a friendly greeting, other arm relaxed. |
| `build` | ものづくり | Prop: wearing a tiny yellow hard hat tilted on the helmet, holding a small wrench. |
| `listen` | きく | Prop: wearing big round headphones over the ear pods, one hand cupped near the ear. |
| `cheer` | おうえん | Prop: holding two small pom-poms up, joyful open-mouth smile, tiny confetti around. |
| `book` | ものしり | Prop: round glasses resting on the face-screen, holding an open book with blank pages. |

追加バリアントを作るときは、この表に行を足し、`nekumax.tsx` の `NEKUMAX_FAMILY` にも同じ id で追加する（表と registry の同期が契約）。

## 5. 実行手順（Codex）

```bash
# 例: 「あいさつのネクマックス」を生成する
codex -i public/img/characters/nekumax/reference.png \
  "image-gen-2 でキャラクター画像を1枚生成してください。
   出力: 1024x1024 PNG, 白背景, キャラ中央・全身。
   保存先: public/img/characters/nekumax/hello.png
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

## 8. 権利と運用

- reference.png はユーザー提供の原画。アプリ・教材以外への流用はしない。
- 生成画像は上書きせず、差し替えは `hello_v2.png` のように版を付けてから registry を切り替える。
- 生成のたびに、使ったプロンプト差分を本ファイルの表に反映する（表が唯一の台帳）。
