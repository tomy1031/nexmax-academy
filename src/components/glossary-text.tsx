"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { findGlossaryTerm, type GlossaryEntry } from "@/content/glossary";
import type { Reading } from "@/content/personality";

/** 漢字を含む語かどうか。含むなら、台帳の読みでルビを保証する。 */
const HAS_KANJI = /[一-鿿]/;

/** 吹き出しの実寸。はみ出し判定に使う（Tailwind の w-60 と合わせる）。 */
const POPOVER_WIDTH = 240;
const POPOVER_HEIGHT = 120;
/** 画面のふちに触れさせない余白。 */
const EDGE_MARGIN = 12;

/**
 * 語彙メモつきの本文（07 §2.5）。
 *
 * 職場語は平易語に置き換えない（01ガイド R6-1）。かといって ひらがなに開いても、
 * 意味を知らない語は意味ゼロの かたまり になるだけで解決しない。
 * そこで本文は **漢字＋ふりがな** で出し、意味は タップで やさしい日本語＋英語 を出す。
 *
 * 英語は本文には出さない。日本語の説明で届かなかったときの非常口として、
 * ポップオーバーの中にだけ置く。
 *
 * **1文につき下線は1語だけ**。同じ文で2回タップさせない（§2.5）。
 */
export function GlossaryText({
  text,
  readings,
  renderText,
}: {
  text: string;
  readings: readonly Reading[];
  /** ふりがな合成。呼び出し側の RubyText をそのまま渡す。 */
  renderText: (text: string, readings: readonly Reading[]) => ReactNode;
}) {
  const entry = findGlossaryTerm(text);
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // 画面の上のほう（質問の柱書きなど）では、上に出すと吹き出しが画面外に切れて何も見えない。
  // 左右も、ふち近くの語だと はみ出して横スクロールが出る。開くたびに置き場所を決め直す。
  const [placeBelow, setPlaceBelow] = useState(false);
  const [shiftX, setShiftX] = useState(0);

  if (!entry) return <>{renderText(text, readings)}</>;

  const toggle = () => {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        setPlaceBelow(rect.top < POPOVER_HEIGHT + EDGE_MARGIN);
        const centerX = rect.left + rect.width / 2;
        const overflowLeft = Math.max(0, EDGE_MARGIN - (centerX - POPOVER_WIDTH / 2));
        const overflowRight = Math.max(
          0,
          centerX + POPOVER_WIDTH / 2 - (window.innerWidth - EDGE_MARGIN),
        );
        setShiftX(overflowLeft - overflowRight);
      }
    }
    setOpen((current) => !current);
  };

  const at = text.indexOf(entry.term);
  const before = text.slice(0, at);
  const after = text.slice(at + entry.term.length);

  // 下線を引く語こそ一番むずかしい。共通の読み辞書に載っていなくてもルビが出るように、
  // 台帳の読みを先頭に足して渡す（先頭に置くのは RubyText が同位置なら先勝ちのため）。
  const termReadings = HAS_KANJI.test(entry.term)
    ? [{ text: entry.term, reading: entry.reading }, ...readings]
    : readings;

  return (
    <>
      {before && renderText(before, readings)}
      <span className="relative inline-block">
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={popoverId}
          className="decoration-sky cursor-pointer underline decoration-dotted decoration-2 underline-offset-4"
        >
          {renderText(entry.term, termReadings)}
        </button>
        {open && (
          <span
            id={popoverId}
            role="note"
            style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
            className={`border-sky text-ink absolute left-1/2 z-30 w-60 rounded-2xl border-2 bg-white px-3 py-2 text-xs leading-relaxed font-bold shadow-[0_6px_18px_rgba(0,79,141,.22)] ${
              placeBelow ? "top-full mt-2" : "bottom-full mb-2"
            }`}
          >
            <span className="text-navy block">
              {entry.term}
              {entry.kanji && entry.kanji !== entry.term && `（${entry.kanji}）`}
              {/* 読みは漢字があるときだけ。かな表記の語に足すと「ものづくりものづくり」になる。 */}
              {entry.reading !== entry.term && (
                <span className="text-ink-soft ml-1 font-bold">{entry.reading}</span>
              )}
            </span>
            <span className="mt-1 block">{entry.meaning}</span>
            {/* 英語は最後の受け皿。日本語の意味より下に、控えめに置く（§2.5）。 */}
            <span className="border-hairline text-ink-soft mt-1.5 block border-t pt-1.5 text-[11px] font-semibold">
              {entry.english}
            </span>
          </span>
        )}
      </span>
      {after && renderText(after, readings)}
    </>
  );
}

/**
 * 設問カードの下に並べる「ことばメモ」のチップ（07 §2.5）。
 *
 * **なぜ本文の下線と別に要るか**: Ⓐ/Ⓑ の選択肢は `<button>` の中にあり、
 * ボタンを入れ子にできないので下線＋タップが使えない。選択肢に出るむずかしい語は
 * ここでしか支えられない。柱書きの語も一緒に並べて、1か所で引けるようにする。
 */
export function GlossaryChip({ entry }: { entry: GlossaryEntry }) {
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [placeBelow, setPlaceBelow] = useState(false);
  const [shiftX, setShiftX] = useState(0);

  const toggle = () => {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        setPlaceBelow(rect.top < POPOVER_HEIGHT + EDGE_MARGIN);
        const centerX = rect.left + rect.width / 2;
        const overflowLeft = Math.max(0, EDGE_MARGIN - (centerX - POPOVER_WIDTH / 2));
        const overflowRight = Math.max(
          0,
          centerX + POPOVER_WIDTH / 2 - (window.innerWidth - EDGE_MARGIN),
        );
        setShiftX(overflowLeft - overflowRight);
      }
    }
    setOpen((current) => !current);
  };

  return (
    <span className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={popoverId}
        className="border-hairline text-ink hover:bg-sky-soft cursor-pointer rounded-full border-2 bg-white px-3 py-1 text-xs font-bold"
      >
        {HAS_KANJI.test(entry.term) ? (
          <ruby>
            {entry.term}
            <rt>{entry.reading}</rt>
          </ruby>
        ) : (
          entry.term
        )}
      </button>
      {open && (
        <span
          id={popoverId}
          role="note"
          style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
          className={`border-sky text-ink absolute left-1/2 z-30 w-60 rounded-2xl border-2 bg-white px-3 py-2 text-left text-xs leading-relaxed font-bold shadow-[0_6px_18px_rgba(0,79,141,.22)] ${
            placeBelow ? "top-full mt-2" : "bottom-full mb-2"
          }`}
        >
          <span className="text-navy block">
            {entry.term}
            {entry.reading !== entry.term && (
              <span className="text-ink-soft ml-1 font-bold">{entry.reading}</span>
            )}
          </span>
          <span className="mt-1 block">{entry.meaning}</span>
          {/* 英語は最後の受け皿。日本語の意味より下に、控えめに置く（§2.5）。 */}
          <span className="border-hairline text-ink-soft mt-1.5 block border-t pt-1.5 text-[11px] font-semibold">
            {entry.english}
          </span>
        </span>
      )}
    </span>
  );
}
