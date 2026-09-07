"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Scenario } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { sanitizeMockPage } from "@/lib/text/mock-page";
import styles from "./research-page.module.css";

/**
 * 事前調査（しらべる）— 訪問の 前に、お客さまの SNS・サイトを 見る 段。
 *
 * ## なぜ 会話の 前に 置くのか
 * 旧アプリ（youken_teigi/hearing）の 5話は「ミッション → **しらべる** → しつもんメモ →
 * インタビュー → けっか」で 1本。調べずに 会って いきなり 10個 聞き出すのは、
 * 日本の 現場の やり方でも ないし、学習者にとっては **手がかりゼロの 10連問**に なる。
 * ここで お店の 事情（売り切れが 多い・DMの 返事が たいへん…）を 先に つかむから、
 * 「なぜ 作りたいですか？」が **自分の ことばで** 出て くる。
 *
 * ## 模擬ページは 旧アプリの HTML を そのまま 出す
 * Instagram風・会社サイト風の 見た目は **それ自体が 教材**（読む 相手が 実物に 見える）。
 * だから HTML と class 名を 変えず、CSS だけ 写した（`research-page.module.css`）。
 * 出す 直前に `sanitizeMockPage` を 通す——教材データは 先生が 直せる 場所なので、
 * 走る タグが 混ざる 道を 残さない。
 *
 * ## 3もんは「当たるまで」続く
 * ここは 合否を つける 場では なく、**見落としを 拾わせる**ための 問い。だから
 * 外しても 先へ 進めず、ページを 見直して えらび直す。ただし 結果は ぼかさない
 *（規律1）——外した ときは「ちがいます」と 言い切ってから、どこを 見るかを 出す。
 */

type Research = NonNullable<Scenario["research"]>;

export function ResearchStep({
  research,
  furigana,
  onDone,
  onBack,
}: {
  research: Research;
  furigana: FuriganaIndex;
  onDone: () => void;
  onBack?: () => void;
}) {
  const [pageIdx, setPageIdx] = useState(0);
  /** いま 出している もんだいの 番号。`quiz.length` まで 行ったら 調べ おわり。 */
  const [quizIdx, setQuizIdx] = useState(0);
  /** いま えらんだ 選択肢。当たれば そのまま「つぎへ」、外れれば えらび直す。 */
  const [picked, setPicked] = useState<number | null>(null);

  const page = research.pages[pageIdx] ?? research.pages[0]!;
  const markup = useMemo(() => sanitizeMockPage(page.html), [page.html]);
  const quiz = research.quiz[quizIdx];
  const cleared = quizIdx >= research.quiz.length;
  const hit = quiz != null && picked != null && picked === quiz.answer;

  return (
    <div className="flex flex-col gap-4">
      <section className="card-island p-5">
        <h2 className="text-ink text-lg font-extrabold">
          🔍{" "}
          <ruby>
            事前調査<rt>じぜんちょうさ</rt>
          </ruby>
        </h2>
        <p className="text-ink-soft mt-2 leading-relaxed font-bold">
          <RubyText text={research.intro} index={furigana} />
        </p>
        <p className="bg-panel-tint text-ink mt-3 rounded-2xl px-4 py-2 text-sm font-bold">
          💡 あとで <b>3つの クイズ</b>に{" "}
          <ruby>
            答<rt>こた</rt>
          </ruby>
          えます。よく{" "}
          <ruby>
            見<rt>み</rt>
          </ruby>
          てね！
        </p>

        {research.pages.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {research.pages.map((p, i) => (
              <button
                key={p.tab}
                type="button"
                onClick={() => setPageIdx(i)}
                aria-pressed={i === pageIdx}
                className="border-hairline rounded-full border-2 px-3 py-1.5 text-sm font-extrabold"
                style={{
                  background: i === pageIdx ? "var(--color-sky-soft)" : "var(--color-panel)",
                  color: i === pageIdx ? "var(--color-navy)" : "var(--color-ink-soft)",
                }}
              >
                <RubyText text={p.tab} index={furigana} />
              </button>
            ))}
          </div>
        )}

        {/* 画面の わく。スマホの ページは 幅を しぼって「電話に 見える」ように する */}
        <div
          className={`border-hairline mx-auto mt-3 w-full overflow-hidden border-2 bg-white ${
            page.frame === "phone" ? "max-w-[380px] rounded-[28px]" : "rounded-[var(--radius-card)]"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-[#e5e7eb] bg-[#f3f4f6] px-3 py-2">
            {page.frame === "browser" && (
              <span aria-hidden className="flex shrink-0 gap-1">
                <span className="block size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="block size-2.5 rounded-full bg-[#febc2e]" />
                <span className="block size-2.5 rounded-full bg-[#28c840]" />
              </span>
            )}
            <span className="truncate rounded-full bg-white px-3 py-1 text-xs font-bold text-[#4b5563]">
              🔒 {page.url}
            </span>
          </div>
          {/*
            教材の 見た目を そのまま 出す ところ。読みは HTML に 焼いて ある
            （旧アプリが 書いた <ruby>）ので、ここでは 合成しない。
          */}
          <div
            className={`${styles.frame} max-h-[70vh] overflow-y-auto bg-white text-[#111827]`}
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        </div>
      </section>

      <section className="card-island p-5">
        <h3 className="text-ink font-extrabold">
          ✏️{" "}
          <ruby>
            調査<rt>ちょうさ</rt>
          </ruby>
          クイズ
        </h3>

        {quiz && (
          <div className="mt-3">
            <p className="text-ink-soft text-xs font-extrabold">
              クイズ {quizIdx + 1} / {research.quiz.length}
            </p>
            <p className="text-ink mt-1 leading-relaxed font-extrabold">
              <RubyText text={quiz.q} index={furigana} />
            </p>
            <ul className="mt-3 grid gap-2">
              {quiz.options.map((opt, i) => {
                const chosen = picked === i;
                const right = i === quiz.answer;
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      disabled={hit}
                      onClick={() => setPicked(i)}
                      className={`border-hairline w-full rounded-[var(--radius-card)] border-2 px-4 py-2.5 text-left font-extrabold ${
                        chosen ? (right ? "bg-leaf/15" : "bg-coral/15") : "bg-panel"
                      }`}
                    >
                      {/* 当たり・外れを その場で 印に する（規律1: 結果を ぼかさない） */}
                      <span className="mr-1">{chosen ? (right ? "⭕" : "✗") : "・"}</span>
                      <RubyText text={opt} index={furigana} />
                    </button>
                  </li>
                );
              })}
            </ul>

            {picked != null && !hit && <FeedbackMessage messageKey="research.retry" />}
            {hit && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <FeedbackMessage messageKey="quiz.correct" />
                <p className="border-hairline bg-panel-tint text-ink-soft mt-3 rounded-[var(--radius-card)] border-2 px-4 py-3 leading-relaxed font-bold">
                  <RubyText text={quiz.why} index={furigana} />
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuizIdx(quizIdx + 1);
                    setPicked(null);
                  }}
                  className="btn-island btn-game mt-3 w-full px-6 py-3"
                >
                  つぎへ
                </button>
              </motion.div>
            )}
          </div>
        )}

        {cleared && (
          <div className="mt-3">
            <FeedbackMessage messageKey="research.done" />
            <h4 className="text-ink mt-4 font-extrabold">
              📋{" "}
              <ruby>
                調査<rt>ちょうさ</rt>
              </ruby>
              で わかったこと
            </h4>
            <ul className="mt-2 grid gap-2">
              {research.findings.map((f) => (
                <li
                  key={f}
                  className="border-hairline bg-panel-tint text-ink rounded-[var(--radius-card)] border-2 px-4 py-2 font-bold"
                >
                  ✅ <RubyText text={f} index={furigana} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-ink-soft hover:text-navy text-sm font-extrabold"
          >
            ← もどる
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onDone}
          disabled={!cleared}
          className="btn-island btn-game px-6 py-3 disabled:opacity-40"
        >
          📝 しつもんメモへ →
        </button>
      </div>
    </div>
  );
}
