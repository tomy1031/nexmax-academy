# 画像の 出どころ

学習用サイト（`public/gakushu/nextmake/`）で 使って いる 画像の 一覧。

## 借りて いる 根拠

すべて **株式会社ネクストメイク 自身の Web サイト**（<https://nextmake.site/>）の 素材で、
**同社の 学習教材として 使う** 許可を 2026-08-23 にユーザー（tomy1031）から得ている
（「画像素材は nextmake の web サイトのものを そのまま つかって OK。同じ会社なので」
「DL して使う」。人物が写ったものを含めてよい、も同日に確認ずみ）。

外の サイトへ 直リンクせず、**この リポジトリに 取りこんで 配る**。教室の 回線が 細く、
本家の サイトが 落ちて いる ときに 画像だけ 出ないのを 避ける ため。

## 取りこみの 手順（次に 足す 人へ）

`sips` は **WebP を 書けない**。縮小は `sips`、変換は `cwebp` と 分ける。

```bash
curl -sSL "<URL>" -o /tmp/x.webp
dwebp -quiet /tmp/x.webp -o /tmp/x.png      # 元が webp のとき
sips -Z 1400 /tmp/x.png                     # 長辺を 1400px に
cwebp -quiet -q 78 /tmp/x.png -o public/gakushu/nextmake/img/<name>.webp
```

上限は **1枚 120KB・合計 1MB**。`public/` は Worker の バンドル（gzip 3MiB）に
入らない（`scripts/check_worker_size.mjs` は `.open-next/worker.js` だけを 測る）ので
デプロイは 止まらないが、リポジトリの 重さは そのまま 効く。

## 一覧（取得日: 2026-08-23）

元の URL は すべて `https://nextmake.site` からの 相対パス。
`T/` は `/wp-content/themes/nextmake-future-theme/assets/images/` の 略。

### 事業の 5枚（トップの スライド と 事業ページの カードで **共用**）

同じ 絵を 2つの 大きさで 持たない。1枚を 1200px で 置いて 両方から 指す。

| ファイル           | 名前                    | 元の URL                                  |
| ------------------ | ----------------------- | ----------------------------------------- |
| `svc_nmclaw.webp`  | NMClaw                  | `T/future/business-nmclaw.webp`           |
| `svc_tourism.webp` | 観光DX                  | `T/future/business-tourism-dx.webp`       |
| `svc_verify.webp`  | Verify                  | `T/future/verify-hero-blockchain-qr.webp` |
| `svc_drone.webp`   | セキュリティドローン    | `T/future/business-security-drone.webp`   |
| `svc_lab.webp`     | NEXTMAKE Internship Lab | `T/future/internship-lab-card.webp`       |

**`business-nmclaw.webp` は 名前が `.webp` でも 中身は PNG。** 拡張子を 信じて
`dwebp` に かけると `BITSTREAM_ERROR` で 止まる。`file -b --mime-type` で 見分ける。

### ページの あたまの 絵

| ファイル             | 使う ページ    | 元の URL                                      |
| -------------------- | -------------- | --------------------------------------------- |
| `hero_cambodia.webp` | カンボジア教育 | `T/cambodia/cambo-top/cambo-top__desktop.png` |
| `hero_vietnam.webp`  | グループ会社   | `T/future/cocreation-network-v2.webp`         |
| `hero_services.webp` | 事業           | `T/future/internship-lab-card.webp`           |
| `hero_making.webp`   | つくる仕事     | `T/future/pathway-development.webp`           |
| `hero_works.webp`    | 実績           | `T/future/works-archive-hero-v1.webp`         |

ホームと 会社紹介には **あたまの 絵を 置かない**（2026-08-23 の 指定）。
ホームは スライドが 入口に なり、会社紹介は すぐ 下の ビルの 写真が 主役。
`hero_about.webp`（`T/future/mission-vision-v2.webp`）は 使い道が 無く なった ので 置かない。
ホームで 使って いた `hero-ecosystem.webp` は **事業の あたま**に 回した——
`internship-lab-card.webp` を あたまに 置くと、同じ ページの 5つめの カード
（Internship Lab）と **同じ 絵が 2回 出る**。

### ページの 中の 絵

| ファイル                | 使う ところ              | 元の URL                                           |
| ----------------------- | ------------------------ | -------------------------------------------------- |
| `honmachi.webp`         | 会社紹介（本社ビル）     | `/wp-content/uploads/2025/12/honmachi2.jpg`        |
| `pathway_signing.webp`  | カンボジア教育（調印式） | `T/future/jp_pathway_1.webp`（中身は JPEG）        |
| `pathway_class.webp`    | カンボジア教育（教室）   | `T/cambodia/cambo-third/cambo-third_auppclass.png` |
| `pathway_students.webp` | カンボジア教育（学生）   | `T/future/jp-pathway-2-optimized.webp`             |

この 3枚は **作った 絵では なく 本当の 写真**。年表の 出来事に 顔と 場所が つくと、
学習者は「よその 会社の 話」では なく 自分の 学校で 起きた こととして 読める。

### しるし

| ファイル   | 使う ところ     | 元の URL                | 備考                          |
| ---------- | --------------- | ----------------------- | ----------------------------- |
| `logo.png` | サイトの あたま | `T/common/nextlogo.png` | 361×43・素の まま（縮めない） |

ロゴは **青い 字の 透過 PNG**。紺の 帯の 上では 読めない ので、CSS で 白い 台に のせる
（`.brand-logo`）。`sips -Z` を かけると 色数が 増えて かえって 太る（1,990B → 11,257B）。

タブの 絵（favicon）は **アプリと 同じ**ものを 使う（`/favicon.ico`・`/icon.png`）。
`src/app/` の file-based icon を アプリが 配って いる ので、ここには 置かない。
