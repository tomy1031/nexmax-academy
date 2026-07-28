"use client";

import { useMemo, useState } from "react";
import type { Word } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { normalizeReading } from "@/lib/text/normalize";

/**
 * 辞書 — ステージの語をいつでも調べられる場所（旧5モードのひとつ）。
 * 検索は共有の正規化を通すので、漢字・ひらがな・カタカナ・英語のどれでも引ける。
 */
export function WordDictionary({
  words,
  furigana,
  onBack,
}: {
  words: readonly Word[];
  furigana: FuriganaIndex;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");

  const hits = useMemo(() => {
    const needle = normalizeReading(query);
    if (!needle) return words;
    return words.filter((w) =>
      [w.term, w.reading, w.meaningEn, w.explanationJa, w.example].some((field) =>
        normalizeReading(field).includes(needle),
      ),
    );
  }, [query, words]);

  return (
    <div className="card-pop mx-auto w-full max-w-2xl p-5 sm:p-6">
      <h2 className="text-ink text-2xl font-extrabold">辞書</h2>
      <p className="text-ink-soft mt-1 text-sm font-bold">
        ことばを 入れると さがせるよ（かんじ・ひらがな・えいご どれでも いいよ）
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="さがす"
        aria-label="ことばを さがす"
        className="border-hairline bg-panel text-ink mt-3 w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 font-bold"
      />

      <p className="text-ink-faint mt-2 text-sm font-bold">{hits.length} こ</p>

      <ul className="divide-hairline border-hairline mt-2 max-h-[56vh] divide-y overflow-y-auto rounded-[var(--radius-card)] border-2">
        {hits.map((word) => (
          <li key={word.id} className="px-4 py-3">
            <p className="text-ink text-lg font-extrabold">
              <ruby>
                {word.term}
                <rt>{word.reading}</rt>
              </ruby>
              <span className="text-sky ml-3 text-sm">{word.meaningEn}</span>
            </p>
            <p className="text-ink-soft mt-1 text-sm font-bold">
              <RubyText text={word.explanationJa} index={furigana} />
            </p>
            <p className="text-ink-faint mt-1 text-sm">
              <RubyText text={word.example} index={furigana} />
            </p>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onBack}
        className="btn-game mt-4 w-full px-6 py-3 text-base"
        style={{ "--btn-face": "#0288d1", "--btn-shadow": "#0272ae" } as React.CSSProperties}
      >
        もどる
      </button>
    </div>
  );
}
