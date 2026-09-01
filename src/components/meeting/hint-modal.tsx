"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import { hintSegments } from "@/lib/meeting/hint";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * ヒント（答え方の 型文）の ポップアップ
 *
 * ## なぜ ポップアップに したか
 * 入力欄の すぐ上に 出しっぱなしに して いた（2026-08-18）。読めるのは よいが、
 * 画面の 下半分が 型文で うまり、**会話の 記録と 話す ボタンが 押し出されて いた**。
 * 2026-08-20 の 指定で ポップアップに する——**要る ときに 呼び、読んだら 閉じる**。
 *
 * ## 答えは 出さない
 * 出すのは **言い方の 型**だけで、◯◯ は 学習者の ことばの ままに する。
 * ここを 埋めて しまうと、読んで 写すだけの 練習に なる。
 */
export function HintModal({
  lines,
  hasBlank,
  example,
  furigana,
  onClose,
}: {
  /** 「そのまま 口に 出せる 文」の 並び。 */
  lines: readonly string[];
  /** ◯◯（自分の ことばを 入れる 穴）が あるか。 */
  hasBlank: boolean;
  /**
   * お手本（`(ex)`）。**中身まで 入った 1つの 答え**（2026-09-01 の 指定）。
   *
   * 型文は「言い方の かたち」しか 見せないので、**どこまで 言えば 相手に 届くのか**が
   * 分からない ままだった。相手の 心が 動く のは どういう 答えかを 1つ 見せる。
   * 写させる ためでは ないので 型文と 並べて 出す——◯◯ は 空の まま 残って いる。
   */
  example?: string;
  /** 教材の 読み辞書（型文の 漢字に ふりがなを 合成する）。 */
  furigana: FuriganaIndex;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ヒントの ポップアップ"
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(15,34,51,0.55)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="card-island max-h-[88vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-navy text-center text-lg font-black">💡 ヒント</p>
        <ul className="mt-3 space-y-2">
          {lines.map((line, at) => (
            <li
              key={`${at}-${line}`}
              className="bg-cream text-ink rounded-xl px-4 py-3 text-base font-black break-words"
            >
              「
              {hintSegments(line).map((seg, i) =>
                seg.blank ? (
                  <span
                    key={i}
                    className="border-sky text-sky mx-0.5 border-b-2 border-dashed px-0.5"
                  >
                    {seg.text}
                  </span>
                ) : (
                  <RubyText key={i} text={seg.text} index={furigana} show />
                ),
              )}
              」
            </li>
          ))}
        </ul>
        {hasBlank ? (
          <p className="text-ink-faint mt-2 text-xs font-bold">◯◯ は あなたの ことばです。</p>
        ) : null}

        {example ? (
          <div
            className="mt-4 rounded-xl border-2 px-4 py-3"
            style={{ borderColor: "var(--color-leaf)", background: "var(--color-panel-tint)" }}
          >
            <p className="text-leaf-deep text-xs font-black">(ex) こう 言うと よく つたわります</p>
            <p className="text-ink mt-1 text-sm font-bold break-words">
              「<RubyText text={example} index={furigana} show />」
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="btn-island btn-game mt-5 w-full px-6 py-3 text-base"
        >
          とじる
        </button>
      </motion.div>
    </div>
  );
}
