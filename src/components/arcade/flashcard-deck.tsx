"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { Word } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { SpeakButton } from "@/components/speak-button";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { shuffle } from "./scheduler";

/**
 * フラッシュカード。カードをめくって覚える（旧5モードのひとつ）。
 * 読み上げは端末の音声合成を使い、無い環境ではボタンを出さない。
 *
 * **ふりがな ON/OFF**（2026-09-29 の 指定）。OFF で 消すのは **おもての 語の よみ だけ**——
 * 漢字を 見て 読めるかを 自分で ためす ため。うらは 答え合わせの 面なので、OFF の ときは
 * よみを うらに 出す（単語ゲームの「ふりがな OFF」と 同じ 決まり。答えの 面では いつも 読める）。
 */
export function FlashcardDeck({
  words,
  furigana,
  onBack,
}: {
  words: readonly Word[];
  furigana: FuriganaIndex;
  onBack: () => void;
}) {
  const [order, setOrder] = useState<readonly Word[]>(words);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [furiganaOn, setFuriganaOn] = useState(true);

  const word = order[index];
  if (!word) return null;

  const go = (delta: number) => {
    setIndex((i) => (i + delta + order.length) % order.length);
    setFlipped(false);
  };

  return (
    <div className="card-island mx-auto w-full max-w-xl p-6 text-center sm:p-8">
      <p className="text-ink-soft text-sm font-extrabold">
        フラッシュカード　{index + 1} / {order.length}
      </p>

      <motion.button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        key={`${word.id}-${String(flipped)}`}
        initial={{ rotateY: -90, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="border-hairline bg-panel-tint mt-4 grid min-h-52 w-full place-items-center rounded-[var(--radius-card)] border-2 px-5 py-8"
        aria-label="カードを めくる"
      >
        {flipped ? (
          <span>
            {!furiganaOn && (
              <span className="text-ink mb-2 block text-xl font-extrabold">
                <ruby>
                  {word.term}
                  <rt>{word.reading}</rt>
                </ruby>
              </span>
            )}
            <span className="text-ink block text-2xl font-extrabold">{word.meaningEn}</span>
            <span className="text-ink-soft mt-3 block text-base font-bold">
              <RubyText text={word.explanationJa} index={furigana} />
            </span>
          </span>
        ) : (
          <span className="text-ink text-4xl font-extrabold">
            <ruby>
              {word.term}
              {/* 消しても 高さは 残す（ON/OFF の たびに 語が 上下に 跳ねない） */}
              <rt className={furiganaOn ? undefined : "invisible"}>{word.reading}</rt>
            </ruby>
          </span>
        )}
      </motion.button>
      <p className="text-ink-faint mt-2 text-sm font-bold">
        カードを おすと うら・おもてが かわるよ
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <DeckButton onClick={() => go(-1)}>← まえ</DeckButton>
        {/* 読み上げは共通部品。音声合成が無い環境では ボタンごと 出ない。 */}
        <SpeakButton
          text={word.reading}
          className="btn-island btn-game px-5 py-2.5 text-sm"
          style={{ "--btn-face": "#8d6ae8", "--btn-shadow": "#7452cc" } as React.CSSProperties}
        >
          🔊 よみあげ
        </SpeakButton>
        <DeckButton onClick={() => go(1)}>つぎ →</DeckButton>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {/* 色は 単語ゲームの ふりがな ボタンと そろえる（ON＝青・OFF＝白） */}
        <DeckButton
          onClick={() => setFuriganaOn((on) => !on)}
          pressed={furiganaOn}
          face={furiganaOn ? "#4fa8e8" : "#ffffff"}
          shadow={furiganaOn ? "#0272ae" : "#cfe6f3"}
        >
          ふりがな {furiganaOn ? "ON" : "OFF"}
        </DeckButton>
        <DeckButton
          onClick={() => {
            setOrder(shuffle(words));
            setIndex(0);
            setFlipped(false);
          }}
          face="#3aa458"
          shadow="#2c7f44"
        >
          🔀 じゅんばんを かえる
        </DeckButton>
        <DeckButton onClick={onBack} face="#0288d1" shadow="#0272ae">
          もどる
        </DeckButton>
      </div>
    </div>
  );
}

function DeckButton({
  children,
  onClick,
  pressed,
  face = "#ffffff",
  shadow = "#cfe6f3",
}: {
  children: React.ReactNode;
  onClick: () => void;
  /** 切りかえボタンの ときだけ 渡す（読み上げに ON/OFF を 伝える）。 */
  pressed?: boolean;
  face?: string;
  shadow?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="btn-island btn-game px-5 py-2.5 text-sm"
      style={
        {
          "--btn-face": face,
          "--btn-shadow": shadow,
          color: face === "#ffffff" ? "var(--color-ink)" : undefined,
        } as React.CSSProperties
      }
    >
      {children}
    </button>
  );
}
