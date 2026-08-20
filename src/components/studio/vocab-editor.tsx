"use client";

import { useMemo, useState } from "react";
import type { VocabBook, VocabWord } from "@/content/schema";
import { replaceAt } from "./list-ops";
import {
  FuriganaEditor,
  MiniButton,
  StringListEditor,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/**
 * ことば（辞書）の エディタ — **語の 正を 直す 唯一の 場所**
 *
 * 語彙は 2026-08-20 まで 5か所に あり、同じ ことばの 説明が 別々に 育っていた。
 * いまは `content/vocab/` の 1つだけ。教材（単語ステージ・記事・まんが・語彙メモ）は
 * すべて ここを 指して いるので、**ここを 直せば ぜんぶに 届く**。
 *
 * ふりがなは 語ごとに 持てる（`VocabWord.furigana`）。説明文を 直す 人が
 * 同じ 場所で 読みも 足せる ように するため——別ファイルへ 行かないと 直せないなら、
 * 読めない 漢字は 直らないまま 残る。
 */

/** まよう こたえ の数（vocabWordSchema の wrongMeanings.length(3)）。 */
const WRONG_COUNT = 3;

export function VocabEditor({
  value,
  onChange,
}: {
  value: VocabBook;
  onChange: (book: VocabBook) => void;
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const patchWord = (index: number, part: Partial<VocabWord>) => {
    const current = value.words[index];
    if (!current) return;
    onChange({ ...value, words: replaceAt(value.words, index, { ...current, ...part }) });
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return value.words
      .map((word, index) => ({ word, index }))
      .filter(
        ({ word }) =>
          !q ||
          word.term.toLowerCase().includes(q) ||
          word.reading.includes(q) ||
          (word.englishTerm ?? "").toLowerCase().includes(q),
      );
  }, [query, value.words]);

  return (
    <StudioSection
      title="ことば（辞書）"
      hint="ここが ことばの 正です。直すと、単語ゲーム・記事・まんが・ことばメモの ぜんぶに 届きます。"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ことば・よみ・英語で さがす"
          className="border-hairline min-w-40 flex-1 rounded-full border-2 px-3 py-1 text-sm font-bold"
        />
        <span className="text-ink-soft text-xs font-black">
          {shown.length} / {value.words.length}語
        </span>
      </div>

      <ul className="space-y-2">
        {shown.map(({ word, index }) => {
          const open = openId === word.id;
          return (
            <li key={word.id} className="border-hairline rounded-xl border-2 bg-white p-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : word.id)}
                className="w-full text-left"
              >
                <span className="text-navy block text-sm font-black">
                  {word.term}（{word.reading}）
                  {word.englishTerm ? (
                    <span className="text-ink-soft ml-2 font-bold">{word.englishTerm}</span>
                  ) : null}
                  {!word.wrongMeanings ? (
                    <span className="text-ink-faint ml-2 text-xs font-bold">
                      ゲームには 出せません
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-soft block text-xs font-bold">{word.meaningJa}</span>
              </button>

              {open ? (
                <div className="mt-3 space-y-3 border-t-2 border-dashed pt-3">
                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-[8rem] flex-1">
                      <TextField
                        label="ことば"
                        value={word.term}
                        onChange={(next) => patchWord(index, { term: next })}
                      />
                    </div>
                    <div className="min-w-[8rem] flex-1">
                      <TextField
                        label="よみ（ひらがな）"
                        value={word.reading}
                        onChange={(next) => patchWord(index, { reading: next })}
                      />
                    </div>
                  </div>
                  <TextAreaField
                    label="やさしい 日本語の 説明"
                    value={word.meaningJa}
                    onChange={(next) => patchWord(index, { meaningJa: next })}
                  />
                  <TextAreaField
                    label="れい文"
                    value={word.example ?? ""}
                    onChange={(next) => patchWord(index, { example: next || undefined })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-[8rem] flex-1">
                      <TextField
                        label="英語（見出し・20字まで）"
                        value={word.englishTerm ?? ""}
                        onChange={(next) => patchWord(index, { englishTerm: next || undefined })}
                      />
                    </div>
                    <div className="min-w-[8rem] flex-1">
                      <TextField
                        label="英語の 意味（ことばメモに 出す）"
                        value={word.englishMeaning ?? ""}
                        onChange={(next) => patchWord(index, { englishMeaning: next || undefined })}
                      />
                    </div>
                  </div>

                  {word.wrongMeanings ? (
                    <StringListEditor
                      label="まよう こたえ（英語で 3つ）"
                      items={word.wrongMeanings}
                      onChange={(next) => patchWord(index, { wrongMeanings: next })}
                      itemLabel="こたえ"
                      placeholder="Meeting"
                    />
                  ) : (
                    <MiniButton
                      onClick={() =>
                        patchWord(index, {
                          wrongMeanings: Array.from({ length: WRONG_COUNT }, () => ""),
                        })
                      }
                    >
                      ＋ 単語ゲームに 出せるように する（まよう こたえを 3つ 書く）
                    </MiniButton>
                  )}

                  {/*
                    **この語だけの よみ辞書。** 足りない 漢字を その場に 出すので、
                    説明文を 書いた 流れの まま 読みを 足せる。
                    渡す `content` を 1語だけの 束に するのは、いま 直している 語の
                    足りない 漢字だけを 出す ため（164語ぶん 出ると 読めない）。
                  */}
                  <FuriganaEditor
                    entries={word.furigana ?? []}
                    onChange={(next) => patchWord(index, { furigana: next })}
                    emptyNote="この ことばの 説明に 漢字が あるなら、よみを 足してください。"
                    content={{ ...value, words: [word], furigana: value.furigana }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? (
        <p className="text-ink-faint text-xs font-bold">見つかりませんでした。</p>
      ) : null}
    </StudioSection>
  );
}
