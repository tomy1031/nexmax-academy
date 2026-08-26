import { TitleScreen } from "@/components/title-screen";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * 最初の画面。**ログインしてはじめて中に入れる**（願い #13）。
 *
 * ログインの画面を別に持たず、タイトル画面のボタンをログインにする。
 *
 * ## リクエストごとに 作らない（2026-08-26）
 *
 * ここは **全員が いちばん 最初に 開く 画面**で、授業では 20人が 同時に 叩く。
 * それまでは ヘッダとクッキーを 読む dynamic なページだったので、
 * **リクエストのたびに Worker が Next のサーバ本体を 読み込んで 描いて いた**。
 * 冷えた Worker では その 読み込みだけで 無料枠の CPU（1リクエスト 10ms）を
 * 超え、Error 1102（つながらない）に なる。2026-08-25 の 20人同時プレイと
 * 2026-08-26 の 授業で 実発生した（docs/deploy.md §0.10）。
 *
 * `force-static` に すると 作りおきの 横取り（`enableCacheInterception`）で
 * 返せるので、**Next のサーバは 一度も 起きない**。
 *
 * 引きかえに「ログインずみか」「つづきから を 出すか」「どこへ 戻すか」は
 * サーバでは 決められない。**同じ 判定を ブラウザで 行う**——見る ものは
 * これまでと 同じ クッキーと DB で、変わったのは 見に行く 場所だけである
 *（`src/components/title-screen.tsx` の `useTitleEntry`）。
 *
 * ミドルウェアは これまでどおり 手前で 走る。未ログインを ここへ 返すのも、
 * OAuth の `?code=` を 拾うのも 変わらない。
 */
export const dynamic = "force-static";

export default function Home() {
  return <TitleScreen authReady={isSupabaseConfigured} />;
}
