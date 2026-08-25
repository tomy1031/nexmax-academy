"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import type { DictionaryEntry } from "@/lib/dictionary";

/**
 * ことばの じしょ（学習者向け）
 *
 * 教材の本文でタップしたときに出る説明と**同じもの**を、一覧でも引けるようにする。
 * 本文の下線は1文につき1語しか出ない（設計07 §2.5）ので、「さっき出てきた
 * あの ことば」をあとから探す道がないと、そこで学習が止まる。
 *
 * 中身は単語ステージを畳んだもの（src/lib/dictionary.ts）。別の保存先は無い。
 */
export function DictionaryPage({ entries }: { entries: readonly DictionaryEntry[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim();
    if (needle.length === 0) return entries;
    const lower = needle.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.term.includes(needle) ||
        entry.reading.includes(needle) ||
        entry.meaningEn.toLowerCase().includes(lower),
    );
  }, [entries, query]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link
          prefetch={false}
          href="/map"
          className="text-ink-soft hover:text-navy text-sm font-extrabold"
        >
          ← マップに もどる
        </Link>
        <Link
          prefetch={false}
          href="/arcade"
          className="text-sky text-sm font-extrabold underline underline-offset-4"
        >
          🕹️ ことばで あそぶ
        </Link>
      </header>

      <section className="card-island p-5 sm:p-6">
        <p className="text-ink-faint text-xs font-extrabold">📚 ことばの じしょ</p>
        <h1 className="text-ink mt-1 text-2xl font-extrabold sm:text-3xl">
          <ruby>
            辞書<rt>じしょ</rt>
          </ruby>
        </h1>
        <p className="text-ink-soft mt-2 leading-relaxed font-bold">
          べんきょうした ことばが ぜんぶ ここに あります（{entries.length}
          ご）。よみかたでも、えいごでも さがせます。
        </p>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ことば・よみかた・English"
          aria-label="ことばを さがす"
          className="border-hairline text-ink mt-4 w-full rounded-2xl border-2 bg-white px-4 py-3 font-bold"
        />
      </section>

      {entries.length === 0 ? (
        <p className="card-island text-ink-soft mt-6 p-5 font-bold">
          まだ ことばが ありません。もうすこし まってね。
        </p>
      ) : filtered.length === 0 ? (
        <p className="card-island text-ink-soft mt-6 p-5 font-bold">
          「{query}」は まだ ありません。ほかの ことばで さがして みてください。
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {filtered.map((entry) => (
            <li key={entry.term} className="card-island p-4">
              <p className="text-navy text-lg font-black">
                <ruby>
                  {entry.term}
                  <rt>{entry.reading}</rt>
                </ruby>
              </p>
              {/*
                説明文と例文にも漢字が入る。出典の単語ステージの読み辞書でルビを合成する
                ——ここが裸だと、いちばん助けが要る場所で読めなくなる（AGENTS.md 規律2）。
              */}
              <RubyText
                className="text-ink mt-1 block text-sm leading-relaxed font-bold"
                text={entry.explanationJa}
                furigana={entry.furigana}
              />
              <p className="text-ink-soft mt-1 text-xs font-bold">
                れい: <RubyText text={entry.example} furigana={entry.furigana} />
              </p>
              {/* 英語は最後の受け皿。日本語の説明より下に、控えめに置く（設計07 §2.5）。 */}
              <p className="border-hairline text-ink-soft mt-2 border-t pt-2 text-xs font-semibold">
                {entry.meaningEn}
              </p>
              <Link
                prefetch={false}
                href={`/arcade/${entry.stageId}`}
                className="text-sky mt-2 inline-block text-xs font-black underline underline-offset-4"
              >
                🕹️ {entry.stageTitle} で あそぶ
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
