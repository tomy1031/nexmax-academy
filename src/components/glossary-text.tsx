"use client";

import { useId, useState, type ReactNode } from "react";
import { findGlossaryTerm } from "@/content/glossary";
import type { Reading } from "@/content/personality";

/**
 * 語彙メモつきの本文（07 §2.5）。
 *
 * 職場語は平易語に置き換えない（01ガイド R6-1）。一方でN4学習中の学生には
 * ひらがな4拍の漢語（うんよう・たいおう）は意味ゼロの未知語なので、
 * 「残す」と「読める」を両立させるためにタップで意味を出す。
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
  const [open, setOpen] = useState(false);

  if (!entry) return <>{renderText(text, readings)}</>;

  const at = text.indexOf(entry.term);
  const before = text.slice(0, at);
  const after = text.slice(at + entry.term.length);

  return (
    <>
      {before && renderText(before, readings)}
      <span className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={popoverId}
          className="decoration-sky cursor-pointer underline decoration-dotted decoration-2 underline-offset-4"
        >
          {entry.term}
        </button>
        {open && (
          <span
            id={popoverId}
            role="note"
            className="border-sky text-ink absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-2xl border-2 bg-white px-3 py-2 text-xs leading-relaxed font-bold shadow-[0_6px_18px_rgba(0,79,141,.22)]"
          >
            <span className="text-navy block">
              {entry.term}
              {entry.kanji && entry.kanji !== entry.term && `（${entry.kanji}）`}
            </span>
            <span className="mt-1 block">{entry.meaning}</span>
          </span>
        )}
      </span>
      {after && renderText(after, readings)}
    </>
  );
}
