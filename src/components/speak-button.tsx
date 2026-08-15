"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

/**
 * よみあげボタン — 端末の音声合成で 日本語を 読む共通部品
 *
 * 読みの手がかりを 目だけに 頼らせない。N5〜N4 の学習者は 漢字が読めない場面が
 * 多く、ふりがなが 付いていても 音として 結び付いていないことがある。
 * 「読めない → 止まる」を 音で ほどく（設計01 P10 — 音は ゆっくりが 既定）。
 *
 * ## 渡すのは ルビ合成前の プレーンテキスト
 * 画面のルビは `RubyText` が その場で 合成したもので、データは プレーンのまま
 *（AGENTS.md 規律2）。読み上げにも その プレーンな文字列を そのまま渡す
 * ——合成後の DOM から 文字を 拾うと、ルビの読みが 本文に 混ざって 二重に 読まれる。
 *
 * ## 出ない環境がある
 * speechSynthesis は 端末・ブラウザによって 無い。無いときは **ボタンを出さない**
 *（押しても 何も 起きないボタンは、学習者に「こわれている」と 思わせる）。
 */

/** 読む速さ。既定は遅め（理解設計ガイド P10）。 */
const SPEECH_RATE = 0.85;

/** 音声合成の有無は 変わらない。購読は 何もしない（解除だけ返す）。 */
const subscribeNever = () => () => {};

export function SpeakButton({
  text,
  label = "よみあげ",
  className,
  style,
  children,
}: {
  /** 読み上げる文字列（ルビ合成前のプレーンテキスト）。 */
  text: string;
  /** 読み上げボタンだと分かる名前。画面に文字を出さない形でも読み上げソフトに届く。 */
  label?: string;
  /** 見た目を呼び出し側で決めるとき（省略すると小さな丸ボタン）。 */
  className?: string;
  style?: CSSProperties;
  /** ボタンの中身。省略すると 🔊 だけ。 */
  children?: ReactNode;
}) {
  /*
   * サーバでは speechSynthesis の有無を 知れない。最初の描画は サーバと同じ
   *「出さない」に そろえ、クライアントで 確かめてから 出す
   *（ハイドレーションのズレを 作らない）。
   */
  const canSpeak = useSyncExternalStore(
    subscribeNever,
    () => "speechSynthesis" in window,
    () => false,
  );

  if (!canSpeak || text.trim().length === 0) return null;

  const speak = () => {
    /*
     * 前の読み上げは 止める。ためこむと、押した段落ではなく 前の段落が
     * 読まれ続け、学習者は「押した所と ちがう所が 読まれる」ことになる。
     */
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = SPEECH_RATE;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={label}
      title={label}
      className={
        className ??
        "border-hairline bg-panel text-ink grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-base"
      }
      style={style}
    >
      {children ?? <span aria-hidden>🔊</span>}
    </button>
  );
}
