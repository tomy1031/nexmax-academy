"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import type { JudgeResult } from "@/lib/meeting/judge";
import { buildFuriganaIndex } from "@/lib/text/furigana";

/**
 * 日本語の 見かた（ポップアップ）
 *
 * ## なぜ 前に 出すか
 * これまでは 会話の 流れの 中に カードとして 積んで いたので、
 * **つたわったのか、もう いちどなのか**が ひと目で 分からなかった
 *（2026-08-18 の 指定）。いちばん 大事な 分かれ道なので、画面の 前に 出して
 * 1つずつ 読ませ、つぎに 何を するかを 学習者が 押して 決める。
 *
 * ## 項目を 分ける
 * 「あなたの ことば」「アドバイス」「言い方の れい」を 見出しで 分ける。
 * 1つの 文に まとめて いた ころは、どこが 自分の ことばで どこが 直しなのかが
 * 混ざって 読めなかった。
 *
 * ## 点は「できた ところ」だけ 数える（P8）
 * ✕ を 数えない。3段（すばらしい／つたわりました／もう いちど）を 星に 写して、
 * **上がる ことだけ**を 見せる。
 */

/** 画面が 自分で 出す 字の 読み（教材の 読み辞書とは 混ぜない・規律2）。 */
const FURIGANA = buildFuriganaIndex([
  ["言", "い"],
  ["方", "かた"],
  ["次", "つぎ"],
]);

const LOOK: Record<JudgeResult["grade"], { title: string; face: string; stars: number }> = {
  veryGood: { title: "つたわりました！", face: "🌸", stars: 3 },
  good: { title: "つたわりました", face: "🙆", stars: 2 },
  miss: { title: "もう いちど 言って みましょう", face: "🔁", stars: 1 },
};

export function JudgeModal({
  judge,
  utterance,
  hostName,
  onNext,
}: {
  judge: JudgeResult;
  /** 学習者が 言った ことば（そのまま 見せる）。 */
  utterance: string;
  hostName: string;
  /** 「つぎへ」／「もう いちど」を 押した とき。 */
  onNext: () => void;
}) {
  const look = LOOK[judge.grade];
  const again = judge.retry;

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
        {/* つたわったか、もう いちどか。いちばん 上に、いちばん 大きく */}
        <p className="text-center text-4xl">{look.face}</p>
        <h2
          className="mt-1 text-center text-xl font-black"
          style={{ color: again ? "var(--color-sky-deep)" : "var(--color-leaf-deep)" }}
        >
          {look.title}
        </h2>
        <p className="mt-1 text-center text-lg" aria-label={`ほし ${look.stars}つ`}>
          {"⭐".repeat(look.stars)}
          <span className="opacity-25">{"⭐".repeat(3 - look.stars)}</span>
        </p>

        <dl className="mt-4 space-y-3 text-left">
          <div>
            <dt className="text-ink-soft text-xs font-extrabold">あなたの ことば</dt>
            <dd className="bg-panel-tint text-ink mt-1 rounded-xl px-3 py-2 font-bold break-words">
              {utterance}
            </dd>
          </div>

          <div>
            <dt className="text-ink-soft text-xs font-extrabold">
              {hostName}さんからの アドバイス
            </dt>
            <dd className="text-ink mt-1 font-bold break-words">🌸 {judge.praise}</dd>
            {judge.fix ? (
              <dd className="text-ink-soft mt-1 font-bold break-words">💡 {judge.fix}</dd>
            ) : null}
          </div>

          <div>
            <dt className="text-ink-soft text-xs font-extrabold">
              <RubyText text="言い方の れい" index={FURIGANA} show />
            </dt>
            <dd className="bg-cream text-ink mt-1 rounded-xl px-3 py-2 font-black break-words">
              「{judge.exampleAnswer}」
            </dd>
          </div>
        </dl>

        {/* つぎに 何を するかは、この ボタンの 字で 分かるようにする */}
        <button
          type="button"
          onClick={onNext}
          autoFocus
          className="btn-island btn-game mt-5 w-full px-6 py-3 text-base"
          style={
            again
              ? ({ "--btn-face": "#4fa8e8", "--btn-shadow": "#2f86c4" } as React.CSSProperties)
              : undefined
          }
        >
          {again ? "もう いちど 言う" : "つぎの しつもんへ"}
        </button>
      </motion.div>
    </div>
  );
}
