import Link from "next/link";
import type { Metadata } from "next";
import { NexMax } from "@/components/nexmax";

/**
 * 見つからなかった ページの 受け皿（404）
 *
 * ## なぜ 置くか
 * 置かないと Next の 既定の画面（英語で "This page could not be found"）が 出る。
 * そこには **行き先が 1つも 無い**——学習者は カンボジアの 学生なので、英語の
 * 行き止まりに 落ちると、ブラウザの 戻るを 知らない かぎり アプリから 出られない。
 * 500 の 受け皿（`global-error.tsx`）だけ あって 404 が 無かったのを そろえる。
 *
 * ## ここに 来る 道
 * `notFound()` は 9つの ルートから 呼ばれる（ステージ・教材・まんが・もんだい 他）。
 * それに 加えて、**どのルートにも 当たらない URL 全部**も ここに 来る
 *（Next 13.3 以降。node_modules/next/dist/docs の not-found.js）。よくあるのは:
 *  - 授業の 資料に 貼った URL が 古い（教材の ID が 変わった）
 *  - `/[stage]` は 作りおきなので、新しい ステージの 404 が デプロイまで 残る
 *    （AGENTS.md「URLの決まり」— 次の デプロイで 直る）
 *
 * ## 行き先を 2つ 出す わけ
 * ここへ 来られるのは **ログインずみの人だけ**（`src/middleware.ts` が 通すのは
 * `/`・`/auth/`・`/api/` だけ）。だから まなびマップを 本命に する。
 * さいしょの 画面も 残すのは、鍵ゼロの デモモードでは 関所が 無く、
 * ログインしていない人も ここに 来られるため。
 *
 * サーバコンポーネントのまま 置く（状態を 持たない）。ここに `use client` を 足すと、
 * 404 の ためだけの かたまりが バンドルに 増える（デプロイ §罠5）。
 */
export const metadata: Metadata = { title: "ページが 見つかりません" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
      <section className="card-island p-6 text-center sm:p-8">
        <NexMax variant="guide" size={112} bob className="mx-auto" />

        <h1 className="text-navy mt-3 text-2xl font-black">この ページは ありません</h1>
        {/*
          英語を 1行 添える（500 の 受け皿と 同じ 組み方）。日本語だけだと、
          まだ 読めない 学習者が 何が 起きたのか 分からないまま 止まる。
        */}
        <p className="text-ink-soft mt-1 text-sm font-bold">This page was not found.</p>

        {/*
          漢字は **ルビで 覆う**（規律2 — 読みにくいからと ひらがなに 開かない。
          docs/constraints.md 「画面の ことばも 漢字＋ふりがな」）。
        */}
        <p className="text-ink mt-4 text-sm leading-relaxed font-bold">
          アドレスが{" "}
          <ruby>
            古<rt>ふる</rt>
          </ruby>
          いのかも しれません。
          <br />
          <ruby>
            下<rt>した</rt>
          </ruby>
          の ボタンから、つづきに もどれます。
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            prefetch={false}
            href="/map"
            className="btn-game w-full px-6 py-3 [--btn-face:#f26fa7] [--btn-shadow:#d94d84]"
          >
            ▶ まなびマップへ もどる
          </Link>
          {/*
            さいしょの 画面は **弱い 見た目**にする。ログインずみの人が ここを 押すと
            マップから 遠ざかるので、本命と 同じ 強さで 並べない。
          */}
          <Link
            prefetch={false}
            href="/"
            className="text-ink-soft hover:text-navy text-sm font-extrabold"
          >
            さいしょの{" "}
            <ruby>
              画面<rt>がめん</rt>
            </ruby>
            へ
          </Link>
        </div>
      </section>
    </main>
  );
}
