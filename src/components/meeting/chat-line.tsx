"use client";

import { motion } from "motion/react";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import type { DictionaryEntry } from "@/lib/dictionary";
import type { FuriganaIndex } from "@/lib/text/furigana";
import type { JudgeResult } from "@/lib/meeting/judge";
import type { AdviceText } from "./japanese-check";
import { JUDGE_FURIGANA } from "./ui-furigana";
import { JudgeCard } from "./judge-card";

/**
 * チャット欄の 1行 — **話し手が 混ざらない ように 色と 名札で 分ける**
 *
 * 部品として 出したのは、ばんを **別々の 教材**に 分けた ため（2026-08-23）。
 * 答える ばんと 聞く ばんで 同じ 見た目を 使う ので、どちらかを 直した ときに
 * もう片方が 置いて いかれない ように、置き場を 1つに する。
 *
 * 見かた（`coach`）は **相手の ことばでは ない**——`judge-card.tsx` の 決まりを 守り、
 * 吹き出しでは なく 別の 面で 出す。
 */

export interface Fallback {
  advice: AdviceText;
  note: string;
}

export type ChatBody =
  /** 教材の しつもん（作り置きの こえが あれば 聞き直せる）。 */
  | { kind: "ask"; questionId: string; text: string; audioUrl?: string }
  /** 相手の 受け止め（文字で 返った ぶん。声の ぶんは 字幕で 届く）。 */
  /** 相手の ことば。`audioUrl` が あれば 🔊 で 聞き返せる（作り置き・その場の こえ 両方）。 */
  | { kind: "host"; text: string; audioUrl?: string }
  /** 学習者が 言った こと。 */
  | { kind: "me"; text: string }
  /** 日本語の 見かた（相手の ことばでは ない）。 */
  | {
      kind: "coach";
      judge?: JudgeResult;
      fallback?: Fallback;
      note?: string | null;
      /**
       * AIに 通せなかった **理由の 名前**（学習者には 見せない）。
       * 画面に 出す ことばは 理由を まとめて しまうので、どこで つまずいたのかが
       * 通し検証の 写真から 読めなかった（2026-08-20）。印だけ 残す。
       */
      reason?: string | null;
    };

export type ChatEntry = ChatBody & { id: string };

export function ChatLine({
  entry,
  hostName,
  furigana,
  dictionary,
  onReplay,
}: {
  entry: ChatEntry;
  hostName: string;
  furigana: FuriganaIndex;
  dictionary?: readonly DictionaryEntry[];
  onReplay?: () => void;
}) {
  if (entry.kind === "coach") {
    return (
      <motion.div
        data-kind="coach"
        data-fallback={entry.reason ?? undefined}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {entry.judge ? <JudgeCard judge={entry.judge} hostName={hostName} /> : null}
        {/* AIに 通せなかった 理由。あとから 読み返せる ように チャットにも 残す */}
        {entry.note ? (
          <p className="text-ink-faint mt-1 text-xs font-bold break-words">{entry.note}</p>
        ) : null}
        {entry.fallback ? (
          <div className="bg-panel-tint space-y-1 rounded-[var(--radius-card)] p-3">
            <p className="text-leaf text-sm font-extrabold">
              🌸 <RubyText text={entry.fallback.advice.praise} index={JUDGE_FURIGANA} show />
            </p>
            {entry.fallback.advice.fix ? (
              <p className="text-ink-soft text-sm font-bold break-words">
                💡 {entry.fallback.advice.fix}
              </p>
            ) : null}
            {entry.fallback.advice.example ? (
              <p className="text-ink rounded-xl bg-white px-3 py-2 text-sm font-bold break-words">
                こう 言うと もっと いいです →「{entry.fallback.advice.example}」
              </p>
            ) : null}
            {entry.fallback.note ? (
              <p className="text-ink-faint text-xs font-bold">{entry.fallback.note}</p>
            ) : null}
          </div>
        ) : null}
      </motion.div>
    );
  }

  const mine = entry.kind === "me";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-kind={entry.kind}
      className={mine ? "flex justify-end" : "flex justify-start"}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          mine ? "bg-sky-soft text-ink" : "bg-panel-tint text-ink"
        }`}
      >
        <p className={`text-[11px] font-extrabold ${mine ? "text-navy" : "text-sky"}`}>
          {mine ? "あなた" : hostName}
          {/* 作り置きの こえが ある ときだけ、その 行を 聞き直せる */}
          {onReplay ? (
            <button
              type="button"
              onClick={onReplay}
              aria-label="もう いちど 聞く"
              className="border-hairline text-navy ml-2 rounded-full border bg-white px-1.5 py-0.5 text-[11px] font-extrabold"
            >
              🔊
            </button>
          ) : null}
        </p>
        <p className="text-ink mt-0.5 leading-relaxed font-bold break-words">
          {entry.kind === "ask" ? (
            <DictionaryText text={entry.text} index={furigana} show dictionary={dictionary} />
          ) : (
            entry.text
          )}
        </p>
      </div>
    </motion.div>
  );
}
