"use client";

import { useMemo } from "react";
import { BLANK_MARK, type QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { checkWordbank } from "@/lib/quiz/draft";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * 穴うめの 答え合わせ — **文の 中の、まちがえた あなの ところに 正解を 置く**
 *
 * ## なぜ 要るか
 * これまでの 答え合わせは「正解」を 横に 並べるだけだった
 *（`（1）お時間　（2）問題　…`）。6つの あなの うち **どれを どう まちがえたのかは
 * 学習者が 自分で 突き合わせる しか なく**、番号で 数えながら 見くらべる 学習者は
 * いない——つまり 直す ところが 分からないまま つぎへ 進んで いた
 *（2026-09-11 の 指定「答えが 出るだけで、どこを どう 間違えたか わかりません。
 * 構造的に 直せそうでしょうか？」）。
 *
 * だから **問いと 同じ 形（文＋あな）で 返す**。あなの ところに 自分が 入れた
 * ことばが そのまま 残り、ちがう ものだけ そのとなりに 正しい ことばが 出る。
 * 目を 動かす 距離が ゼロに なる。
 *
 * ## 教材データでは なく エンジンを 直した
 * 1つの 教材の 文言を 足して 済ませると、ほかの 穴うめ問題は 直らない。
 * ここは **すべての 穴うめ問題**に 効く。
 *
 * ## しるしは 色だけに たよらない
 * ○×の 記号・ことば・色の 3つで 示す（画面ぜんたいの 決めごと）。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["正", "ただ"],
  ["合", "あ"],
  ["書", "か"],
  ["緑", "みどり"],
]);

const CHIP = "rounded-full border-2 px-2 py-0.5 text-sm font-extrabold";

const OK_STYLE = { borderColor: "#58c273", background: "#e9f8ee", color: "#1f3a56" } as const;
const NG_STYLE = { borderColor: "#f26fa7", background: "#fdeaf2", color: "#1f3a56" } as const;
const RIGHT_STYLE = { borderColor: "#58c273", background: "#58c273", color: "#ffffff" } as const;

export function WordbankReview({
  question,
  answer,
  furigana,
}: {
  question: Extract<QuizQuestion, { type: "wordbank" }>;
  /** 学習者の こたえ（`QuizResult.answer`。記録に 残るのは 文だけ）。 */
  answer: string;
  furigana: FuriganaIndex;
}) {
  const checks = useMemo(() => checkWordbank(question, answer), [question, answer]);

  /* あなの 通し番号を 先に 割り当てて おく（問いの 画面と 同じ 数え方）。 */
  const rows = useMemo(() => {
    let counter = 0;
    return question.lines.map((line) => {
      const chunks = line.split(BLANK_MARK);
      return chunks.map((text, i) => ({
        text,
        blank: i < chunks.length - 1 ? counter++ : null,
      }));
    });
  }, [question.lines]);

  const missed = checks.filter((check) => !check.ok).length;

  return (
    <div className="border-hairline bg-panel mt-2 rounded-[var(--radius-card)] border-2 p-3">
      {rows.map((parts, lineIndex) => (
        <p key={lineIndex} className="text-ink py-1 leading-loose font-bold">
          {parts.map((part, partIndex) => {
            const check = part.blank === null ? null : checks[part.blank];
            return (
              <span key={partIndex}>
                <RubyText text={part.text} index={furigana} />
                {check && part.blank !== null && (
                  <span className="mx-1 inline-flex flex-wrap items-center gap-1 align-middle">
                    <span className={CHIP} style={check.ok ? OK_STYLE : NG_STYLE}>
                      <span className="text-ink-faint mr-0.5 text-xs">（{part.blank + 1}）</span>
                      {check.own === "" ? (
                        <RubyText text="書いて いません" index={UI_FURIGANA} />
                      ) : (
                        <RubyText text={check.own} index={furigana} />
                      )}
                      <span aria-hidden className="ml-0.5">
                        {check.ok ? "✓" : "✗"}
                      </span>
                      <span className="sr-only">
                        {check.ok ? "。合って います。" : "。ちがいます。正しいのは"}
                      </span>
                    </span>
                    {!check.ok && (
                      <>
                        <span aria-hidden className="text-ink-faint text-xs font-extrabold">
                          →
                        </span>
                        <span className={CHIP} style={RIGHT_STYLE}>
                          <RubyText text={check.right} index={furigana} />
                        </span>
                      </>
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </p>
      ))}

      {/* しるしの 意味を ことばでも 言う（記号と 色だけでは 伝わらない）。 */}
      <p className="text-ink-soft mt-2 text-xs font-extrabold">
        {missed === 0 ? (
          <RubyText text="✓ ぜんぶ 合って いました。" index={UI_FURIGANA} />
        ) : (
          <RubyText
            text={`✗が ${missed}つ ありました。→の うしろの 緑の ことばが 正しい こたえです。`}
            index={UI_FURIGANA}
          />
        )}
      </p>
    </div>
  );
}
