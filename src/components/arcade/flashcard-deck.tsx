"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Word } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { shuffle } from "./scheduler";

/**
 * フラッシュカード。カードをめくって覚える（旧5モードのひとつ）。
 * 読み上げは端末の音声合成を使い、無い環境ではボタンを出さない。
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

  const canSpeak = useMemo(() => typeof window !== "undefined" && "speechSynthesis" in window, []);
  const word = order[index];
  if (!word) return null;

  const go = (delta: number) => {
    setIndex((i) => (i + delta + order.length) % order.length);
    setFlipped(false);
  };

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(word.reading);
    utterance.lang = "ja-JP";
    utterance.rate = 0.85; // 既定は遅め（理解設計ガイド P10）
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="card-pop mx-auto w-full max-w-xl p-6 text-center sm:p-8">
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
            <span className="text-ink block text-2xl font-extrabold">{word.meaningEn}</span>
            <span className="text-ink-soft mt-3 block text-base font-bold">
              <RubyText text={word.explanationJa} index={furigana} />
            </span>
          </span>
        ) : (
          <span className="text-ink text-4xl font-extrabold">
            <ruby>
              {word.term}
              <rt>{word.reading}</rt>
            </ruby>
          </span>
        )}
      </motion.button>
      <p className="text-ink-faint mt-2 text-sm font-bold">
        カードを おすと うら・おもてが かわるよ
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <DeckButton onClick={() => go(-1)}>← まえ</DeckButton>
        {canSpeak && (
          <DeckButton onClick={speak} face="#8d6ae8" shadow="#7452cc">
            🔊 よみあげ
          </DeckButton>
        )}
        <DeckButton onClick={() => go(1)}>つぎ →</DeckButton>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
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
  face = "#ffffff",
  shadow = "#cfe6f3",
}: {
  children: React.ReactNode;
  onClick: () => void;
  face?: string;
  shadow?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-game px-5 py-2.5 text-sm"
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
