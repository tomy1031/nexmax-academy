"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import {
  breakdown,
  NO_OBSERVATIONS,
  type TalkFocus,
  type TalkObservations,
  type TalkRound,
} from "@/lib/talkgame/affinity";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * 好感度が 上がった 理由を 見せる 板
 *
 * ## 観点の 内訳を 出す（2026-08-24 の 指定「いくつかの 観点で 審査」）
 * 「+5%」だけ 見せると、なぜ 上がったのかが 分からない まま 次へ 進む。
 * **どの 観点で 点が 入ったか**を 並べると、つぎに 何を 足せば 伸びるのかが
 * 自分で 決められる（設計01 P8: 直し方が 見える 形で 返す）。
 *
 * ## 入らなかった 観点も 消さない
 * 消すと「なぜ 5% で 止まったのか」が 見えない。ただし **✕ や 赤は 使わない**——
 * 空いた 席（うすい 丸）として 置く。罰に 見える 表現は 置かない（P8）。
 *
 * ## リボンの ことば
 * 「不正解」「間違い」「ダメ」は 使わない（絶対規律1）。いちばん 下でも
 *「よく 言えました」から 始める——声を 出した ことは、それだけで 前進だから。
 */

/** 観点の 見出し（かなだけ。ふりがなの 要らない 形で 持つ）。 */
const LABELS: Record<keyof TalkObservations, string> = {
  japanese: "にほんごで 言えた",
  onTopic: "しつもんに 合って いる",
  concrete: "会社の ことが 入って いる",
  reason: "りゆうが 言えた",
  feeling: "気もちが 入って いる",
  polite: "ていねいに 言えた",
  question: "しつもんの 形に なって いる",
};

/**
 * 答える **前**に 見せる「この しつもんで 見る ところ」（2026-08-31 の 指定）。
 *
 * ## なぜ 先に 見せるか
 * 見かたの 板は 答えた あとにしか 出なかった ので、学習者は
 * **何を 見られて いるのかを 知らない まま** 答えて いた。点が 動いた 理由が
 * あとから しか 分からないと、上がっても 下がっても ものさしが 見えない
 *（2026-08-31「採点基準が不明確で嬉しい気持ちにならない」）。
 *
 * ここは **予告**なので ✓ を 付けない。付けると、まだ 答えて いないのに
 * 「できて いない」欄が 並ぶ ことに なる（規律1）。
 */
export function TalkRubric({
  round,
  focus,
  furigana,
}: {
  round: TalkRound;
  focus?: readonly TalkFocus[];
  furigana: FuriganaIndex;
}) {
  const rows = breakdown(round, NO_OBSERVATIONS, focus);
  return (
    <div
      className="rounded-xl border-2 px-3 py-2"
      style={{ borderColor: "var(--color-hairline)", background: "var(--color-panel-tint)" }}
    >
      <p className="text-ink-soft text-[11px] font-black">
        <RubyText text="この しつもんで 見る ところ" index={furigana} show />
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {rows.map((row) => (
          <li
            key={row.key}
            data-rubric={row.key}
            className="text-ink-soft text-[11px] font-bold whitespace-nowrap"
          >
            <RubyText text={LABELS[row.key]} index={furigana} show />
            <span className="ml-1 tabular-nums" style={{ color: "var(--color-coral-deep)" }}>
              +{row.points}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 観点の 読み（画面の ことば。教材の 辞書とは 混ぜない）。 */
export const FEEDBACK_FURIGANA: readonly (readonly [string, string])[] = [
  ["会社", "かいしゃ"],
  ["言", "い"],
  ["合", "あ"],
  ["気", "き"],
  ["形", "かたち"],
  ["入", "はい"],
];

function ribbonOf(gained: number, max: number): { text: string; color: string } {
  const ratio = max > 0 ? gained / max : 0;
  if (ratio >= 0.8) return { text: "さいこう！", color: "var(--color-sun-deep)" };
  if (ratio >= 0.5) return { text: "いいね！", color: "var(--color-leaf-deep)" };
  // リボンは かなだけ（その場の 飾りには ルビを 合成しない・規律2）
  return { text: "よく いえました！", color: "var(--color-sky-deep)" };
}

export function TalkFeedback({
  round,
  focus,
  judged = true,
  observations,
  gained,
  lifted,
  said,
  praise,
  fix,
  example,
  furigana,
  onNext,
}: {
  /** **この 発話を 見た ときの** ばん（切りかえ後では ない）。 */
  round: TalkRound;
  /** **その とき 聞かれて いた しつもんの**「見る ところ」。答える前の 予告と 同じ 表に する。 */
  focus?: readonly TalkFocus[];
  /**
   * AIの 見かたに つなげたか。false なら 端末の 規則だけで 見て いる。
   *
   * 規則では **会社の 中身・りゆう・気もちが 判らない**ので、そこを ✗ の 顔で 出すと
   *「NMClaw が 先進的で いいと 思いました」に「会社の ことが 入って いる ✗」が 付く。
   * **見て いない ことと、できて いない ことは ちがう。**
   */
  judged?: boolean;
  observations: TalkObservations;
  /** 観点から 上がった ぶん。下の 内訳の 合計と 一致する。 */
  gained: number;
  /** 話しきった ぶんの 底上げ（0 の ことが 多い）。 */
  lifted: number;
  /** 学習者が 言った ことば（そのまま 引用する）。 */
  said: string;
  praise: string;
  fix: string;
  example: string;
  furigana: FuriganaIndex;
  onNext: () => void;
}) {
  const rows = breakdown(round, observations, focus);
  /*
   * 端末の 規則では 判らない 観点（`src/lib/talkgame/local.ts` が いつも false に する もの）。
   * 立って いれば そのまま ✓、立って いなければ「?」——見て いないから である。
   */
  const unseen = new Set<keyof TalkObservations>(
    judged ? [] : (["concrete", "reason", "feeling"] as const).filter((key) => !observations[key]),
  );
  const max = rows.reduce((sum, row) => sum + row.points, 0);
  const ribbon = ribbonOf(gained, max);

  return (
    // 名前ふだ（左上）と 重ねない。上を 空けて、だれと 話して いるかを 消さない。
    <div className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto p-3 sm:top-24 sm:right-auto sm:left-0 sm:w-[58%] sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-island space-y-3 p-4 sm:p-5"
      >
        <motion.span
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          className="text-on-accent inline-block rounded-lg px-4 py-1.5 text-lg font-black shadow"
          style={{ background: ribbon.color }}
        >
          {ribbon.text}
        </motion.span>

        <p className="text-ink text-sm font-bold">
          <RubyText text={praise} index={furigana} show />
        </p>

        <div className="rounded-xl border-2 p-3" style={{ borderColor: "var(--color-hairline)" }}>
          <p className="text-ink-soft text-xs font-bold">あなたの ことば</p>
          <p className="text-navy mt-0.5 text-sm font-black break-words">「{said}」</p>

          <ul className="mt-2 space-y-1">
            {rows.map((row) => (
              // `data-kanten` は 検証の 手がかり。画面の 字には ふりがなが 合成される ので、
              // 文字で 探すと 当たらない（`tests/e2e/furigana.spec.ts` 冒頭の 覚書と 同じ 罠）。
              <li
                key={row.key}
                data-kanten={row.key}
                data-on={row.on}
                className="flex items-center gap-2 text-xs font-bold"
              >
                <span
                  aria-hidden
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]"
                  style={{
                    background: row.on ? "var(--color-leaf)" : "var(--color-hairline)",
                    color: row.on ? "var(--color-on-accent)" : "var(--color-ink-faint)",
                  }}
                >
                  {row.on ? "✓" : unseen.has(row.key) ? "?" : "・"}
                </span>
                <span className={row.on ? "text-ink" : "text-ink-faint"}>
                  <RubyText text={LABELS[row.key]} index={furigana} show />
                </span>
                <span
                  className="ml-auto tabular-nums"
                  style={{ color: row.on ? "var(--color-coral-deep)" : "var(--color-ink-faint)" }}
                >
                  +{row.points}%
                </span>
              </li>
            ))}
          </ul>

          {/*
            **見て いない ことを、できて いない 顔で 出さない**（2026-08-31 の 指摘）。
            端末の 規則は 会社の 中身・りゆう・気もちを 判らない ので、そこは「?」に して
            断りを 置く。ここが 無かった ころ、名前を 名指した 答えに
            「会社の ことが 入って いる ✗ +0%」が 付いて いた。
          */}
          {rows.some((row) => unseen.has(row.key)) ? (
            <p className="text-ink-faint mt-2 text-[11px] font-bold">
              ? は、いまは AIに つなげないので みて いない ところです。 こうかんどは さがりません。
            </p>
          ) : null}
        </div>

        {fix ? (
          <p className="text-ink-soft text-xs font-bold">
            <RubyText text={`つぎは… ${fix}`} index={furigana} show />
          </p>
        ) : null}

        {example ? (
          <p
            className="rounded-xl px-3 py-2 text-xs font-bold"
            style={{ background: "var(--color-cream)", color: "var(--color-ink)" }}
          >
            <RubyText text={`こう 言えます: ${example}`} index={furigana} show />
          </p>
        ) : null}

        {/*
          底上げは **観点とは 別の 行**で 見せる。合わせて 1つの 数に すると、
          内訳の 合計と 合わなく なる（2026-08-24 の 検収指摘）。
        */}
        {lifted > 0 ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-leaf-deep text-sm font-black"
          >
            🎉 さいごまで 話しきりました！ こうかんど +{lifted}%
          </motion.p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-black" style={{ color: "var(--color-coral-deep)" }}>
            こうかんど +{gained}%
          </p>
          <button type="button" onClick={onNext} className="btn-game rounded-full px-6 py-2.5">
            つぎへ ▶
          </button>
        </div>
      </motion.div>
    </div>
  );
}
