"use client";

import { useMemo, type ReactNode } from "react";
import { GlossaryText } from "@/components/glossary-text";
import { PERSONALITY_RESULT_READINGS, type Reading } from "@/content/personality";
import {
  annotateRuby,
  buildFuriganaIndex,
  type FuriganaEntry,
  type FuriganaIndex,
} from "@/lib/text/furigana";

/**
 * 読み辞書からふりがなを合成する。**ルビHTMLを手書きしない**ための唯一の入口（AGENTS.md 規律2）。
 * dangerouslySetInnerHTML は使わない（旧アプリはここで innerHTML にルビHTMLを流していた）。
 *
 * 読み辞書の渡し方が2つある。当たり方の規則がちがうので、どちらも残す:
 *
 * - `readings`（`{text, reading}` の配列）— 性格診断まわり。同じ位置で複数の語が
 *   一致したときは**配列で先に出たほうが勝つ**。つまり並びが意味を持ち、「手」を
 *   「手順」より前に置くと「順」が裸で残る。`tests/glossary.test.ts` で固定してある。
 * - `furigana` / `index`（`[表記, 読み]` の組）— 教材コンテンツ側。こちらは**最長一致**で
 *   引く（辞書の並びに責任を持たせない）。索引を使い回す画面は `index` を渡す。
 *
 * 一方を他方に寄せると、寄せられた側の既存の辞書の当たり方が変わり、学習者の画面で
 * 読みが崩れる。だから当たり方ごとに実装を分け、入口だけを1つにする。
 */
export function RubyText(props: {
  text: string;
  /** 性格診断まわりの読み辞書（配列順に先勝ち）。 */
  readings?: readonly Reading[];
  /** 教材コンテンツの読み辞書（最長一致）。 */
  furigana?: readonly FuriganaEntry[];
  /** 事前に組んだ索引。同じ辞書を何度も使う画面ではこちらを渡す。 */
  index?: FuriganaIndex;
  /** ふりがな OFF のときは地の文だけを出す。 */
  show?: boolean;
  className?: string;
}) {
  const { readings, ...rest } = props;
  return readings ? <ReadingsRuby {...rest} readings={readings} /> : <IndexRuby {...rest} />;
}

/** 配列順に先勝ちで引く版（性格診断まわり）。 */
function ReadingsRuby({
  text,
  readings,
  show = true,
  className,
}: {
  text: string;
  readings: readonly Reading[];
  show?: boolean;
  className?: string;
}) {
  const parts: ReactNode[] = [];

  if (show) {
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
  } else {
    parts.push(text);
  }

  return className ? <span className={className}>{parts}</span> : <>{parts}</>;
}

/** 最長一致で引く版（教材コンテンツ）。 */
function IndexRuby({
  text,
  furigana,
  index,
  show = true,
  className,
}: {
  text: string;
  furigana?: readonly FuriganaEntry[];
  index?: FuriganaIndex;
  show?: boolean;
  className?: string;
}) {
  const resolved = useMemo(() => index ?? buildFuriganaIndex(furigana ?? []), [index, furigana]);
  const segments = useMemo(
    () => (show ? annotateRuby(text, resolved) : [{ text }]),
    [text, resolved, show],
  );

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.reading ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.reading}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

/**
 * 色の面（濃い地に白文字）に置く ふりがなの 色。
 *
 * `globals.css` の 既定は `rt { color: ink-soft }`（濃い灰）なので、紺や 緑の チップの 上では
 * **ふりがなだけ 沈んで 読めない**（2026-08-18 の指摘）。地の 文字が 白の ところは ふりがなも
 * 白にする。`globals.css` は 共有ファイルで 単独スレッドから 触れない決まりなので、
 * 使う側で この クラスを 足す形にしてある。
 */
export const RUBY_ON_COLOR = "[&_rt]:text-white";

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
