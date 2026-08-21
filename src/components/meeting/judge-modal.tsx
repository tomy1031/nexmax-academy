"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import type { JudgeResult } from "@/lib/meeting/judge";
import { JUDGE_FURIGANA as FURIGANA } from "@/components/meeting/ui-furigana";
import { type FuriganaIndex } from "@/lib/text/furigana";

/**
 * 日本語の 見かた（ポップアップ）
 *
 * ## なぜ 前に 出すか
 * これまでは 会話の 流れの 中に カードとして 積んで いたので、
 * **つたわったのか、もう いちどなのか**が ひと目で 分からなかった
 *（2026-08-18 の 指定）。いちばん 大事な 分かれ道なので、画面の 前に 出して
 * 1つずつ 読ませ、つぎに 何を するかを 学習者が 押して 決める。
 *
 * ## 見出しを 絵と 色で 分ける（2026-08-21 の 指定「読みにくい」）
 * `dl` に 小さな 灰色の 見出しを 並べて いた ころは、**どこが 自分の ことばで
 * どこが 直しなのか**が 字の 大きさでしか 分からなかった。
 * 見出しに 丸い 絵を 付け、中身を それぞれ 箱に 入れる。
 * アドバイスは **ほめる ところ（桃）と 直す ところ（橙）を 線で 分ける**——
 * 続けて 書くと、ほめられて いるのか 直されて いるのかが 混ざる。
 *
 * ## 点は「できた ところ」だけ 数える（P8）
 * ✕ を 数えない。3段（すばらしい／つたわりました／もう いちど）を 星に 写して、
 * **上がる ことだけ**を 見せる。
 */

/**
 * 3段の 見え方。
 *
 * **合格と やり直しは、色・絵・ボタンの ことばの ぜんぶで 分ける**
 *（2026-08-20 の 指定「合格と やり直しの 見た目の ちがいが はっきり わかるように」）。
 * 星の 数だけで 分けて いた ころは、どちらなのか 一目で 分からなかった。
 */
const LOOK: Record<
  JudgeResult["grade"],
  {
    title: string;
    /** 見出しの 下の 1行（つぎに 何を するかを 先に 言う）。 */
    lead: string;
    face: string;
    stars: number;
    band: string;
    next: string;
    /** ボタンの 下の 小さな ひとこと。 */
    footnote: string | null;
  }
> = {
  veryGood: {
    title: "よく できました！",
    lead: "そのまま つぎへ すすめます",
    face: "🌸",
    stars: 3,
    band: "var(--color-leaf-deep)",
    next: "つぎの しつもんへ →",
    footnote: null,
  },
  good: {
    title: "つたわりました！",
    lead: "そのまま つぎへ すすめます",
    face: "🙆",
    stars: 2,
    band: "var(--color-leaf-deep)",
    next: "つぎの しつもんへ →",
    footnote: null,
  },
  miss: {
    title: "もう 少し！",
    lead: "もういちど れんしゅうしよう！",
    face: "🔄",
    stars: 1,
    band: "var(--color-sky-deep)",
    next: "もう いちど 練習しよう",
    footnote: "もう一回 こたえて みよう！",
  },
};

/** 見出し1つぶん（丸い 絵 ＋ 色の ついた 字）。 */
function SectionLabel({ face, text, tone }: { face: string; text: string; tone: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-black" style={{ color: tone }}>
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]"
        style={{ background: `color-mix(in srgb, ${tone} 18%, white)` }}
      >
        {face}
      </span>
      <RubyText text={text} index={FURIGANA} show />
    </p>
  );
}

export function JudgeModal({
  judge,
  ask,
  askFurigana,
  utterance,
  hostName,
  reply,
  waiting = false,
  note,
  onNext,
}: {
  judge: JudgeResult;
  /**
   * その とき 聞かれて いた しつもん。
   *
   * ポップアップだけを 見て「何に 答えた のか」が 分かるように する
   *（2026-08-20 の 指定）。チャット欄を さかのぼらせない。
   */
  ask: string;
  /** しつもんの 読み（教材の 読み辞書）。ここだけ ルビを 合成できる。 */
  askFurigana: FuriganaIndex;
  /** 学習者が 言った ことば（そのまま 見せる）。 */
  utterance: string;
  hostName: string;
  /**
   * 相手の へんじ。**画面が 出した ことば だけ**を 受け取る。
   *
   * 声で 答えた ときは 相手が こえで 返して いて、その ことばは 判定の `reply` とは
   * ちがう。ここに 判定の `reply` を 出して いた ため、**こえと 字が 食いちがって
   * いた**（2026-08-21 の 指摘）。声の ときは 空で 受け取り、この 欄を 出さない
   *（相手が 言った ことは チャット欄に 残る）。
   */
  reply: string;
  /**
   * 相手が まだ 話して いるか。
   *
   * **話し終わるまで つぎへ 行かせない**（2026-08-21 の 指定）。前は 押した 瞬間に
   * つぎの しつもんが 出て いたので、ヘンディさんの 返事の 上に つぎの しつもんが
   * かぶさって いた——学習者は どちらを 聞けば よいか 分からない。
   */
  waiting?: boolean;
  /**
   * AIに 通せなかった ときの ひとこと（理由と つぎの 一手）。
   * 責める 言い方に しない——学習者は 自分の 日本語の せいだと 受け取る。
   */
  note?: string | null;
  /** 「つぎへ」／「もう いちど」を 押した とき。 */
  onNext: () => void;
}) {
  const base = LOOK[judge.grade];
  const again = judge.retry;
  const look = again ? LOOK.miss : base;

  return (
    <div
      role="dialog"
      aria-modal="true"
      /*
       * 名前を チャットの カード（`judge-card.tsx`）と 分ける。
       * 同じ 名前に して いた ため、検査が「どちらの ことか」を 決められず
       * 落ちた（CI・2026-08-18）。人にも 機械にも 別の ものだと 分かる 名前に する。
       */
      aria-label="はんていの ポップアップ"
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(15,34,51,0.55)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="card-island max-h-[88vh] w-full max-w-md overflow-y-auto p-5"
      >
        {/*
          いちばん 上に **色の 帯**を 置く。合格は みどり・やり直しは あお——
          読む 前に 目の はしで どちらか 分かる。
          帯の 中は **絵・大きな 字・つぎの 一手**の 3つで、読む 順番を 決める。
        */}
        <div
          className="-mx-5 -mt-5 mb-3 rounded-t-[var(--radius-card)] px-4 py-4"
          style={{ background: look.band }}
        >
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/20 text-3xl">
              {look.face}
            </span>
            <span className="min-w-0 flex-1">
              <h2 className="text-2xl leading-tight font-black text-white">
                <RubyText text={look.title} index={FURIGANA} show />
              </h2>
              <p className="text-sun mt-0.5 text-sm leading-snug font-black">{look.lead}</p>
            </span>
          </div>
        </div>
        <p className="text-center text-lg" aria-label={`ほし ${look.stars}つ`}>
          {"⭐".repeat(look.stars)}
          <span className="opacity-25">{"⭐".repeat(3 - look.stars)}</span>
        </p>

        <div className="mt-3 space-y-3 text-left">
          <div>
            <SectionLabel face="❓" text={`${hostName}さんの しつもん`} tone="var(--color-sky)" />
            <p className="border-hairline bg-panel text-ink mt-1 rounded-xl border px-3 py-2 text-sm font-bold break-words">
              <RubyText text={ask} index={askFurigana} show />
            </p>
          </div>

          <div>
            <SectionLabel face="🧑" text="あなたの ことば" tone="var(--color-sky)" />
            <p className="bg-panel-tint text-ink mt-1 rounded-xl px-3 py-2 font-bold break-words">
              {utterance}
            </p>
          </div>

          {/* 相手が どう 受け止めたか。**画面が 出した ことば だけ**（こえの ときは 出さない） */}
          {reply ? (
            <div>
              <SectionLabel
                face="💬"
                text={`${hostName}さんの へんじ`}
                tone="var(--color-leaf-deep)"
              />
              <p className="border-hairline bg-panel text-ink mt-1 rounded-xl border px-3 py-2 font-bold break-words">
                <RubyText text={reply} index={FURIGANA} show />
              </p>
            </div>
          ) : null}

          <div>
            <SectionLabel
              face="💡"
              text={`${hostName}さんからの アドバイス`}
              tone="var(--color-coral-deep)"
            />
            {/* ほめる ところと 直す ところを **線で 分ける**（続けて 書くと 混ざる） */}
            <div className="border-hairline bg-panel mt-1 rounded-xl border px-3 py-2">
              <p className="text-ink flex gap-2 font-bold break-words">
                <span aria-hidden className="shrink-0">
                  💗
                </span>
                <span className="flex-1">
                  <RubyText text={judge.praise} index={FURIGANA} show />
                </span>
              </p>
              {judge.fix ? (
                <p className="border-hairline text-ink mt-2 flex gap-2 border-t border-dashed pt-2 font-bold break-words">
                  <span aria-hidden className="shrink-0">
                    ❗
                  </span>
                  <span className="flex-1">
                    <RubyText text={judge.fix} index={FURIGANA} show />
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <SectionLabel face="⭐" text="もっと よく なる 言い方" tone="var(--color-sun-deep)" />
            <p className="bg-cream text-ink mt-1 rounded-xl px-3 py-2 font-black break-words">
              「<RubyText text={judge.exampleAnswer} index={FURIGANA} show />」
            </p>
          </div>
        </div>

        {note ? <p className="text-ink-faint mt-3 text-xs font-bold break-words">{note}</p> : null}

        {/* つぎに 何を するかは、この ボタンの 字で 分かるようにする */}
        <button
          type="button"
          onClick={onNext}
          autoFocus
          disabled={waiting}
          className="btn-island btn-game mt-5 w-full px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none [&_rt]:text-white"
          style={
            again
              ? ({ "--btn-face": "#f2654a", "--btn-shadow": "#d24a31" } as React.CSSProperties)
              : undefined
          }
        >
          <RubyText text={look.next} index={FURIGANA} show />
        </button>
        {waiting ? (
          <p className="text-ink-soft mt-2 text-center text-xs font-black">
            🔊 {hostName}さんが 話して います
          </p>
        ) : look.footnote ? (
          <p className="text-coral-deep mt-2 text-center text-xs font-black">
            <RubyText text={look.footnote} index={FURIGANA} show />
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
