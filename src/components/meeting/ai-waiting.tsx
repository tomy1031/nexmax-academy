"use client";

import { useEffect, useRef } from "react";

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

/**
 * 学習者の 画面の 待ちうけ — **画面 ぜんたいを 覆う**
 *
 * 2026-09-21 の 指定「テキストチャットだと 見えないし、そもそも マイクで 話すのが
 * メインなので 不適切です。また 画面の 制御も ある ため、全体に 表示される ことが
 * 望ましいです」「もっと 操作できない ように 画面全体に 出る ように できますか？」。
 *
 * ## なぜ チャットの 中では だめだったか
 * 学習者は **マイクで 話す**。目は 相手の 顔と 板に 行って いて、会話の 記録の
 * いちばん下は **見て いない**（スマホでは 折りたたまれて いる ことも ある）。
 * そこに ローディングを 置いても、待って いる ことに 気づけない。
 *
 * ## 覆うのは「見せる」ためだけでは ない
 * 待って いる あいだに 押されると 困る ものが ある——もう いちど 話す・曜日を
 * 変える・報告メモを 開く。**幕で ぜんぶ 塞ぐ**のが いちばん 確かで、
 * 「これは 押せる／押せない」を 1つずつ 覚えさせずに すむ。
 *
 * - 指 … 幕が 受けとめる（下の ボタンには 届かない）。`touch-action: none` で
 *   うしろの 画面が すべるのも 止める。
 * - キー … 開いた ときに 幕へ 指（focus）を 移し、Tab で うしろへ 抜けない ように する。
 *
 * 閉じる 道は **置かない**。Gemini の 返事が 来たら 消える——途中で 閉じられると、
 * 返事が 来た ときに 画面と 話が 食いちがう。
 */
export function AiWaitingOverlay({
  /** 何を して いるか（「見て います」「聞いて います」）。 */
  doing,
  index,
}: {
  doing: string;
  index: FuriganaIndex;
}) {
  const veil = useRef<HTMLDivElement>(null);
  /* 開いたら 幕に 指を 移す（うしろの ボタンに キーが 届かなく なる）。 */
  useEffect(() => {
    veil.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={veil}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={`Gemini（AI）が ${doing}`}
      tabIndex={-1}
      onKeyDown={(event) => {
        /* Tab で 幕の うしろへ 抜けない。 */
        if (event.key === "Tab") event.preventDefault();
      }}
      /* ポップアップ（z-50）と まなびマップの 幕（z-60）より 前。 */
      className="fixed inset-0 z-[70] grid place-items-center p-6 outline-none"
      style={{ background: "rgba(15,34,51,0.72)", touchAction: "none" }}
    >
      <div className="card-island flex w-full max-w-xs flex-col items-center gap-3 p-6 text-center">
        <span
          aria-hidden
          className="border-sky-deep inline-block h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
        />
        {/* 読み上げにも 出す（見えない 待ちを 作らない）。 */}
        <p
          role="status"
          aria-live="polite"
          className="text-navy text-base leading-[1.9] font-black"
        >
          Gemini（AI）が <RubyText text={doing} index={index} show />
          <Dots />
        </p>
        {/*
          ここだけ ひらがな。この 幕は **教材の 読み辞書が 無い 画面**でも 出るので、
          漢字を 置くと 裸の まま 出る（規律2）。
        */}
        <p className="text-ink-soft text-sm leading-[1.9] font-bold">そのまま おまちください。</p>
      </div>
    </div>
  );
}

/**
 * 先生の 画面の 待ちうけ — **行の 中に 置く**
 *
 * `/studio` の 試し撃ちは 先生が **書いて 直す** 画面なので、幕で 塞ぐと
 * 直しの 手が 止まる。ここは ボタンの となりで 回って いれば よい。
 */
export function AiWaiting({ doing, index }: { doing: string; index: FuriganaIndex }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="bg-panel-tint text-ink-soft flex items-center gap-2 rounded-[var(--radius-card)] px-4 py-2 text-sm font-black"
    >
      <span
        aria-hidden
        className="border-sky-deep inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
      />
      <span>
        Gemini（AI）が <RubyText text={doing} index={index} show />
        <Dots />
      </span>
    </p>
  );
}

/** 3つの 点が 順に 光る（往復が 続いて いる 印）。 */
function Dots() {
  return (
    <span aria-hidden className="ml-0.5 inline-flex gap-0.5">
      <Dot at={0} />
      <Dot at={150} />
      <Dot at={300} />
    </span>
  );
}

function Dot({ at }: { at: number }) {
  return (
    <span
      className="bg-sky-deep inline-block h-1 w-1 animate-pulse rounded-full"
      style={{ animationDelay: `${at}ms` }}
    />
  );
}
