"use client";

import Image from "next/image";
import { motion } from "motion/react";
import type { Scenario } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * ミッション — ヘンディ先輩からの 社内チャットで「なぜ 行くのか」を 受け取る 段。
 *
 * ## 依頼の 形で 渡す
 * 旧アプリ（youken_teigi/hearing）の 1段目。いきなり 相手の 前に 立たせず、
 * **先輩から 頼まれる**ところから 始める——学習者の 立場（ネクストメイクの エンジニア）と
 * 目的（何を 聞いて 帰るのか）が 決まるので、会話の あいだ 迷子に なりにくい。
 *
 * ## きょうの ことば は ここで 出す
 * 会話で 使う 6語を **使う 直前に** 見せる（別の 画面に 置くと、会話中に 戻れない）。
 * 単語テストとしての 練習は wordstage が 別に 持つ。ここは「見て おく」だけ。
 */

export function MissionStep({
  scenario,
  furigana,
  onDone,
}: {
  scenario: Scenario;
  furigana: FuriganaIndex;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="card-island p-5">
        <h2 className="text-ink text-lg font-extrabold">
          {scenario.emoji} <RubyText text={scenario.title} index={furigana} />
        </h2>
        <p className="text-ink-soft text-xs font-bold">{scenario.subtitleEn}</p>

        <h3 className="text-ink mt-4 font-extrabold">
          💬{" "}
          <ruby>
            社内<rt>しゃない</rt>
          </ruby>
          チャット
        </h3>
        <ul className="mt-2 grid gap-2">
          {scenario.mission.chat.map((line, i) => {
            const mine = line.from === "me";
            return (
              <motion.li
                key={`${i}-${line.text}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.18, 1.1) }}
                className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}
              >
                {mine ? (
                  <span
                    aria-hidden
                    className="bg-sky-soft grid size-9 shrink-0 place-items-center rounded-full text-lg"
                  >
                    🧑‍💻
                  </span>
                ) : (
                  <Image
                    src="/img/characters/hendy/portrait.webp"
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                )}
                <div className={mine ? "text-right" : ""}>
                  <p className="text-ink-soft text-xs font-extrabold">
                    {mine ? (
                      "あなた"
                    ) : (
                      <>
                        ヘンディ
                        <ruby>
                          先輩<rt>せんぱい</rt>
                        </ruby>
                      </>
                    )}
                  </p>
                  <p
                    className={`border-hairline mt-0.5 inline-block rounded-[var(--radius-card)] border-2 px-4 py-2 text-left leading-relaxed font-bold ${
                      mine ? "bg-sky-soft text-navy" : "bg-panel text-ink"
                    }`}
                  >
                    <RubyText text={line.text} index={furigana} />
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ul>

        <div className="border-hairline bg-panel-tint mt-4 flex items-start gap-3 rounded-[var(--radius-card)] border-2 px-4 py-3">
          <span aria-hidden className="text-xl">
            🎯
          </span>
          <div>
            <p className="text-ink-soft text-xs font-extrabold">ミッション</p>
            <p className="text-ink font-extrabold">
              <RubyText text={scenario.mission.goal} index={furigana} />
            </p>
          </div>
        </div>
      </section>

      <section className="card-island p-5">
        <h3 className="text-ink font-extrabold">📚 きょうの ことば</h3>
        <p className="text-ink-soft mt-1 text-sm font-bold">
          インタビューで{" "}
          <ruby>
            使<rt>つか</rt>
          </ruby>
          う{" "}
          <ruby>
            言葉<rt>ことば</rt>
          </ruby>
          です。
          <ruby>
            先<rt>さき</rt>
          </ruby>
          に{" "}
          <ruby>
            見<rt>み</rt>
          </ruby>
          て おきましょう。
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {scenario.words.map((w) => (
            <li
              key={w.w}
              className="border-hairline bg-panel rounded-[var(--radius-card)] border-2 px-4 py-3"
            >
              <p className="text-ink font-extrabold">
                <ruby>
                  {w.w}
                  <rt>{w.r}</rt>
                </ruby>
              </p>
              <p className="text-sky text-xs font-extrabold">{w.en}</p>
              <p className="text-ink-soft mt-1 text-sm font-bold">
                <RubyText text={w.m} index={furigana} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="btn-island btn-game px-6 py-3">
          🔍{" "}
          <ruby>
            事前調査<rt>じぜんちょうさ</rt>
          </ruby>
          に すすむ →
        </button>
      </div>
    </div>
  );
}
