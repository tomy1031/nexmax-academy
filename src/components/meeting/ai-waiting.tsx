"use client";

import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * **AI（Gemini）を 呼んで いる あいだの ローディング**
 *
 * 2026-09-20 の 指定「Gemini 読み込み中は ローディングが 出る ように して ください。
 * Gemini 呼び出し中と わかる ように」。
 *
 * ## なぜ 字だけでは 足りなかったか
 * 前は 送信欄の 中に「AIが いま 見て います…」と 灰色の 字が 出るだけで、
 * **止まって いるのか 動いて いるのか**が 画面から 読めなかった。往復は 数秒 かかる
 *（鍵の つなぎ直しが 入ると 10秒を 越える ことが ある）ので、動いて いる ことを
 * **目で 分かる もの**——回る 輪と 光る 帯——で 見せる。
 *
 * ## 名前を 出す
 * 「AI」だけでは どこへ 出て いるのかが 分からない。**Gemini**と 名前で 書く
 *（学習者は 設定で 自分の 鍵を 入れる ので、どこに つないで いるかは 知って いてよい）。
 *
 * 動きは `prefers-reduced-motion` で 止まる（`globals.css` の 既定）。
 */
export function AiWaiting({
  /** 何を して いるか（「見て います」「聞いて います」）。 */
  doing,
  index,
  /** 行の 中に 置く ときは `line`、帯で 出す ときは `card`。 */
  look = "card",
}: {
  doing: string;
  index: FuriganaIndex;
  look?: "card" | "line";
}) {
  return (
    <p
      /* 読み上げにも 出す（見えない 待ちを 作らない）。 */
      role="status"
      aria-live="polite"
      className={
        look === "card"
          ? "border-sky-deep bg-sky-soft text-navy flex items-center gap-2 rounded-[var(--radius-card)] border-2 px-4 py-2 text-sm font-black"
          : "bg-panel-tint text-ink-soft flex items-center gap-2 rounded-[var(--radius-card)] px-4 py-2 text-sm font-black"
      }
    >
      <span
        aria-hidden
        className="border-sky-deep inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
      />
      <span>
        Gemini（AI）が <RubyText text={doing} index={index} show />
        <span aria-hidden className="ml-0.5 inline-flex gap-0.5">
          <Dot at={0} />
          <Dot at={150} />
          <Dot at={300} />
        </span>
      </span>
    </p>
  );
}

/** 3つの 点が 順に 光る（往復が 続いて いる 印）。 */
function Dot({ at }: { at: number }) {
  return (
    <span
      className="bg-sky-deep inline-block h-1 w-1 animate-pulse rounded-full"
      style={{ animationDelay: `${at}ms` }}
    />
  );
}
