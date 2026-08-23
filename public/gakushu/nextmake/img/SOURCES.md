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

| ファイル             | 使う ページ | 元の URL                                                                                   |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `hero_home.webp`     | ホーム      | `/wp-content/themes/nextmake-future-theme/assets/images/future/hero-ecosystem.webp`        |
| `hero_about.webp`    | 会社紹介    | `/wp-content/themes/nextmake-future-theme/assets/images/future/mission-vision-v2.webp`     |
| `hero_vietnam.webp`  | ベトナム    | `/wp-content/themes/nextmake-future-theme/assets/images/future/cocreation-network-v2.webp` |
| `hero_services.webp` | 事業        | `/wp-content/themes/nextmake-future-theme/assets/images/future/internship-lab-card.webp`   |
| `hero_making.webp`   | つくる仕事  | `/wp-content/themes/nextmake-future-theme/assets/images/future/pathway-development.webp`   |
| `hero_cambodia.webp` | カンボジア  | `/wp-content/themes/nextmake-future-theme/assets/images/future/pathway-class.webp`         |
| `hero_works.webp`    | 実績        | `/wp-content/themes/nextmake-future-theme/assets/images/future/works-archive-hero-v1.webp` |
| `honmachi.webp`      | 会社紹介    | `/wp-content/uploads/2025/12/honmachi2.jpg`（大阪本社の 入る ビル）                        |

いずれも `https://nextmake.site` からの 相対パス。
