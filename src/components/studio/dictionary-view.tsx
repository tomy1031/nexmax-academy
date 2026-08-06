"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WordStage } from "@/content/schema";
import { buildDictionary } from "@/lib/dictionary";
import { MiniButton, SourceBadge } from "./studio-ui";

/**
 * ことば・辞書（管理画面）
 *
 * 上が単語ステージの一覧（＝保存先）、下が辞書。
 * **辞書に保存先は無い**。全単語ステージを ことば単位で畳んだ見え方でしかない
 *（src/lib/dictionary.ts）。だからここで直せるものは無く、直すときは
 * その ことばを持っている単語ステージを開く。
 *
 * この作りにしている理由は重複である。同じ「報告」が3つの課に出てきたとき、
 * 辞書を別に持つと説明文が2つ育ち、いつのまにか食い違う。畳めば1つしか存在しえない。
 */
export function DictionaryView({
  wordStages,
  dbStatusOf,
  onOpen,
  onNew,
  onRemove,
}: {
  wordStages: readonly WordStage[];
  dbStatusOf: (kind: string, id: string) => "draft" | "published" | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string, title: string) => void;
}) {
  const [query, setQuery] = useState("");
  const dictionary = useMemo(() => buildDictionary(wordStages), [wordStages]);
  const filtered = useMemo(() => {
    const needle = query.trim();
    if (needle.length === 0) return dictionary;
    return dictionary.filter(
      (entry) =>
        entry.term.includes(needle) ||
        entry.reading.includes(needle) ||
        entry.meaningEn.toLowerCase().includes(needle.toLowerCase()),
    );
  }, [dictionary, query]);

  const stageById = useMemo(
    () => new Map(wordStages.map((stage) => [stage.id, stage])),
    [wordStages],
  );

  return (
    <div className="space-y-4">
      <section className="card-island p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-navy text-lg font-black">単語ステージ（{wordStages.length}こ）</h2>
          <button
            type="button"
            onClick={onNew}
            className="btn-game px-4 py-2 text-sm [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
          >
            ＋ あたらしい 単語ステージ
          </button>
        </div>
        <p className="text-ink-soft mt-1 text-xs font-bold">
          ことばアーケードで あそぶ 単位です。ステージの 本文から つくるときは、 ステージを
          ひらいて「ことばを ぬき出す」を つかいます。
        </p>

        {wordStages.length === 0 ? (
          <p className="text-ink-soft mt-4 font-bold">まだ ありません。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {wordStages.map((stage) => (
              <li
                key={stage.id}
                className="border-hairline flex flex-wrap items-center gap-3 rounded-2xl border-2 bg-white p-3"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-navy font-black">{stage.title}</p>
                  <p className="text-ink-soft text-xs font-bold">
                    {stage.words.length}語・{stage.questionCount}問 出題
                  </p>
                  <p className="text-ink-faint text-xs font-bold">/arcade/{stage.id}</p>
                </div>
                <SourceBadge status={dbStatusOf("wordstage", stage.id)} />
                <Link
                  href={`/arcade/${stage.id}`}
                  className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-1 text-xs font-black"
                >
                  あそぶ
                </Link>
                <MiniButton tone="accent" onClick={() => onOpen(stage.id)}>
                  ✎ ひらく
                </MiniButton>
                {dbStatusOf("wordstage", stage.id) ? (
                  <MiniButton tone="danger" onClick={() => onRemove(stage.id, stage.title)}>
                    けす
                  </MiniButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-island p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-navy text-lg font-black">辞書（{dictionary.length}語）</h2>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ことば・よみ・英語で さがす"
            className="border-hairline text-ink w-56 rounded-xl border-2 bg-white px-3 py-2 text-sm font-bold"
          />
        </div>
        <p className="text-ink-soft mt-1 text-xs font-bold">
          単語ステージ ぜんぶを ことば ごとに 畳んだ ものです。 ここに 出る せつめいが、教材の
          本文で タップしたときに 出ます。 直すときは その ことばを もっている 単語ステージを
          ひらきます。
        </p>

        {dictionary.length === 0 ? (
          <p className="text-ink-soft mt-4 font-bold">
            まだ ことばが ありません。単語ステージを つくると ここに 出ます。
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-hairline text-ink-soft border-b text-left">
                  <th className="px-3 py-2">ことば</th>
                  <th className="px-3 py-2">よみ</th>
                  <th className="px-3 py-2">やさしい せつめい</th>
                  <th className="px-3 py-2">英語</th>
                  <th className="px-3 py-2">どこの ことば</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.term} className="border-hairline border-b align-top">
                    <td className="text-navy px-3 py-2 font-black">{entry.term}</td>
                    <td className="text-ink-soft px-3 py-2 font-bold">{entry.reading}</td>
                    <td className="text-ink px-3 py-2 font-bold">{entry.explanationJa}</td>
                    <td className="text-ink-soft px-3 py-2 font-bold">{entry.meaningEn}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onOpen(entry.stageId)}
                        disabled={!stageById.has(entry.stageId)}
                        className="text-sky text-xs font-black underline underline-offset-4 disabled:no-underline disabled:opacity-50"
                      >
                        {entry.stageTitle}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="text-ink-soft mt-3 font-bold">
                「{query}」に あう ことばは ありません。
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
