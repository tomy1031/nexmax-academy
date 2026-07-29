"use client";

import type { ReactNode } from "react";
import { GlossaryText } from "@/components/glossary-text";
import { PERSONALITY_RESULT_READINGS, type Reading } from "@/content/personality";

/**
 * 読み辞書からふりがなを合成する。**ルビHTMLを手書きしない**ための唯一の入口（AGENTS.md 規律2）。
 *
 * 同じ位置で複数の語が一致したときは、**配列で先に出たほうが勝つ**（`index < nextIndex` が厳密比較のため）。
 * つまり読み辞書の並びが意味を持つ。「手」を「手順」より前に置くと「順」が裸で残る。
 * この不変条件は `tests/glossary.test.ts` で固定してある。
 */
export function RubyText({ text, readings }: { text: string; readings: readonly Reading[] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let nextReading: Reading | undefined;
    let nextIndex = text.length;

    for (const reading of readings) {
      const index = text.indexOf(reading.text, cursor);
      if (index >= 0 && index < nextIndex) {
        nextIndex = index;
        nextReading = reading;
      }
    }

    if (!nextReading) {
      parts.push(text.slice(cursor));
      break;
    }
    if (nextIndex > cursor) parts.push(text.slice(cursor, nextIndex));
    parts.push(
      <ruby key={`${nextReading.text}-${cursor}`}>
        {nextReading.text}
        <rt>{nextReading.reading}</rt>
      </ruby>,
    );
    cursor = nextIndex + nextReading.text.length;
  }

  return <>{parts}</>;
}

/** `GlossaryText` の `renderText` に渡す用。 */
export function renderRuby(text: string, readings: readonly Reading[]) {
  return <RubyText text={text} readings={readings} />;
}

/**
 * ふりがな＋語彙メモを両方通す学習者向け本文。
 * 性格診断まわりの学習者向け文はすべてこれを使う（07 §2.5）。
 */
export function LearnerText({ text }: { text: string }) {
  return (
    <GlossaryText text={text} readings={PERSONALITY_RESULT_READINGS} renderText={renderRuby} />
  );
}
