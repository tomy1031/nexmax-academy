import { WelcomeEntry } from "@/components/welcome-entry";

/**
 * はじめの案内（ネクマックス診断の 20問）。
 *
 * ## リクエストごとに 作らない（2026-08-26）
 *
 * ここは 直前まで `dynamic` だった——ヘッダとクッキーと DB を 読んで いたため。
 * `dynamic` な ページは **リクエストのたび Worker が Next の サーバ本体を
 * 読み込んで 描く**ので、冷えた Worker では それだけで 無料枠の CPU
 *（1リクエスト 10ms）を 超えて Error 1102 に なる（docs/deploy.md §0.10）。
 *
 * そして ここは **新しい 学習者が かならず 通る 画面**で、授業の 初日には
 * 20人が ほぼ 同時に 叩く。タイトル画面（#219）に つづいて、学習者の 道から
 * 最後の `dynamic` を 外す。
 *
 * 送り返す 条件（未ログインは タイトルへ・診断ずみは マップへ）も、なまえの
 * 下ごしらえも **前と 同じ**。決める 場所が ブラウザに 移っただけである
 *（`src/components/welcome-entry.tsx`）。
 *
 * ミドルウェアは これまでどおり 手前で 走るので、未ログインは そもそも
 * ここまで 来ない。
 */
export const dynamic = "force-static";

export default function WelcomePage() {
  return <WelcomeEntry />;
}
