"use client";

import { useMemo } from "react";
import {
  annotateRuby,
  buildFuriganaIndex,
  type FuriganaEntry,
  type FuriganaIndex,
} from "@/lib/text/furigana";

/**
 * ルビ表示 — プレーンテキスト＋読み辞書から <ruby> を組み立てる
 *（AGENTS.md 規律2。コンテンツ側にルビHTMLを書かせない）。
 *
 * dangerouslySetInnerHTML は使わない。旧アプリは innerHTML にルビHTMLを流していたが、
 * ここではセグメント配列から React 要素を作るので、その経路自体が存在しない。
 */
export function RubyText({
  text,
  furigana,
  index,
  show = true,
  className,
}: {
  text: string;
  /** この場面かぎりの読み辞書（ステージ・問題データが持つもの）。 */
  furigana?: readonly FuriganaEntry[];
  /** 事前に組んだ索引。同じ辞書を何度も使う画面ではこちらを渡す。 */
  index?: FuriganaIndex;
  /** ふりがな OFF のときは地の文だけを出す。 */
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
