"use client";

/* eslint-disable @next/next/no-html-link-for-pages --
   この画面の 行き先は **わざと ふつうの <a>**。next/link は 画面を 読み直さず 部品だけを
   取りに行くので、部品が 入れ替わって 壊れている この場面では 同じ失敗を くり返す。 */

import { useEffect } from "react";
import "./globals.css";
import { isStaleAssetError, takeReloadTicket } from "@/lib/stale-asset";

/**
 * どこも受け止められなかったエラーの 最後の受け皿。
 *
 * ## なぜ 置くか
 * 置かないと Next の 既定の画面（英語で "This page couldn't load"）が 出る。
 * 学習者は カンボジアの 学生で、英語の 500 の 画面では 何を すればよいか 分からない。
 *
 * ## いちばん多い原因は 「アプリが 新しく なった」
 * デプロイが 入ると 古い名前の 部品は 404 に なり、開きっぱなしの タブは
 * `ChunkLoadError` で 止まる（src/lib/stale-asset.ts に 詳しく 書いた）。
 * これは **読み直せば 必ず 直る** ので、学習者を 待たせずに アプリが 自分で 読み直す。
 * ぐるぐる 回らないよう、自動の 読み直しは しるしを 見て 一度だけ（`takeReloadTicket`）。
 * 二度目からは 下の ボタン（手で 押す）に 落ちる。
 *
 * global-error は ルートの レイアウトごと 差し替わるため、`<html>` と `<body>` を
 * 自分で 書き、CSS も 自分で 読み込む。
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!isStaleAssetError(error)) return;
    // クッキーを 止めている ブラウザでは **参照した だけで** 例外に なる。
    // ここで 落ちると 画面が 白く なるので、取れなければ 手で 押す道に 落とす。
    let store: Storage | null = null;
    try {
      store = window.sessionStorage;
    } catch {
      store = null;
    }
    if (!takeReloadTicket(store, Date.now())) return;
    window.location.reload();
  }, [error]);

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="bg-bg-mid text-ink flex min-h-full flex-col">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-10 text-center">
          <p className="text-5xl" aria-hidden>
            🙂
          </p>

          <h1 className="text-xl font-bold sm:text-2xl">うまく ひらけませんでした</h1>

          <p className="max-w-md leading-relaxed">
            アプリが 新しく なったときに 出ます。
            <br />
            下の ボタンを 押すと 直ります。
          </p>
          <p className="text-ink-soft max-w-md text-sm">
            The app was updated. Please open this page again.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-button bg-navy text-on-accent hover:bg-navy-deep px-6 py-3 font-bold shadow-md transition"
            >
              もう いちど ひらく
            </button>
            <a
              href="/"
              className="rounded-button border-hairline bg-panel text-navy hover:bg-panel-tint border px-6 py-3 font-bold transition"
            >
              さいしょの 画面へ
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
