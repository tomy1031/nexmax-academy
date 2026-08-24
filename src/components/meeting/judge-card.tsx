"use client";

import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import { JUDGE_FURIGANA } from "@/components/meeting/ui-furigana";
import { isPerfect, type JudgeGrade, type JudgeResult } from "@/lib/meeting/judge";

/**
 * 返事の見かた（AIの判定）を出すカード。
 *
 * ## 話し手を分ける
 * このカードは**ヘンディさんの言葉ではない**。相手は会話を続ける役、教えるのは
 * 学習の画面の役、と分けておかないと、「さっき いいですねと言った人が、
 * すぐ 直してと言う」人格になる。だから枠も色も、相手の吹き出しと変える。
 *
 * ## 3段の見せ方
 * 内部では veryGood / good / miss と呼ぶが、**画面に「Miss」とは出さない**。
 * できなかったことを名前で呼ぶと、次の一言が出なくなる（規律1）。
 * 出すのは「すばらしい！」「つたわりました！」「もう いちど いってみよう」。
 *
 * ## 英語をそえる
 * AIの言葉は教材と違って読み辞書を持てない（＝ふりがなが付かない）ので、
 * かなだけで返させている。それでも意味が分からない語は残るので、
 * `glossary` の語を下に英語で並べる。読める道を2本にしておく。
 */

const BADGE: Record<JudgeGrade, { label: string; face: string; shadow: string }> = {
  veryGood: { label: "すばらしい！", face: "#3aa458", shadow: "#2b7f43" },
  good: { label: "つたわりました！", face: "#0f7fd4", shadow: "#0b62a4" },
  // 「できなかった」ではなく「もう1回できる」として見せる
  miss: { label: "もう いちど いってみよう", face: "#f0a500", shadow: "#c98700" },
};

export function JudgeCard({ judge, hostName }: { judge: JudgeResult; hostName: string }) {
  const badge = BADGE[judge.grade];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-island space-y-3 p-4"
      aria-label="にほんごの みかた"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-3 py-1 text-sm font-black text-white"
          style={{ background: badge.face, boxShadow: `0 3px 0 ${badge.shadow}` }}
        >
          {badge.label}
        </span>
        <span className="text-ink-faint text-xs font-bold">
          {hostName}さんが{" "}
          <ruby>
            聞<rt>き</rt>
          </ruby>
          いて います
        </span>
      </div>

      <p className="text-leaf text-sm font-extrabold break-words">
        🌸 <RubyText text={judge.praise} index={JUDGE_FURIGANA} show />
      </p>
      {judge.fix ? (
        <p className="text-ink-soft text-sm font-bold break-words">
          💡 <RubyText text={judge.fix} index={JUDGE_FURIGANA} show />
        </p>
      ) : null}
      {/* もう 直す ところが 無い ときは 出さない（2026-08-23 の 指定） */}
      {isPerfect(judge) ? null : (
        <p className="bg-panel-tint text-ink rounded-xl px-3 py-2 text-sm font-bold break-words">
          こう いうと もっと いいです →「{judge.exampleAnswer}」
        </p>
      )}

      {judge.glossary.length > 0 ? (
        <div>
          <p className="text-ink-faint text-xs font-extrabold">ことばの いみ（English）</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {judge.glossary.map((item) => (
              <li
                key={item.term}
                className="border-hairline text-ink rounded-full border-2 bg-white px-3 py-1 text-xs font-bold"
              >
                {item.term}
                <span className="text-ink-soft ml-1">— {item.en}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {judge.retry ? (
        /* bg-sun-soft は globals.css に 無い（＝色が つかない）。実在する トークンを 使う */
        <p className="bg-cream text-ink rounded-xl px-3 py-2 text-sm font-black break-words">
          もう いちど、うえの れいを みながら いって みましょう。
        </p>
      ) : null}
    </motion.div>
  );
}
