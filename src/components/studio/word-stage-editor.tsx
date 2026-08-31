"use client";

import { useMemo } from "react";
import type { Word, WordStage } from "@/content/schema";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import {
  FuriganaEditor,
  MiniButton,
  NumberField,
  RowTools,
  StringListEditor,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/**
 * 単語ステージ（単語テスト）のエディタ
 *
 * これまでスタジオに無かった。「ことばを ぬき出す」がAIで作るところまでは出来ても、
 * **作ったあと1語も直せない**ので、AIの言い回しがそのまま学習者に出ていた。
 * 辞書（src/lib/dictionary.ts）もこのデータを畳んだものなので、
 * ここが直せないと辞書の説明文も直せない。
 *
 * 1語に要るものが多い（読み・英語の意味・まよう こたえ3つ・やさしい説明・例文）。
 * 全部そろわないと `wordStageSchema` が保存を止めるので、枠は最初から出しておく。
 */

/** まよう こたえ の数（wordSchema の wrongMeanings.length(3)）。 */
const WRONG_COUNT = 3;

/** 単語ステージの最低語数（wordStageSchema の words.min(6)）。 */
const MIN_WORDS = 6;

export function WordStageEditor({
  value,
  onChange,
}: {
  value: WordStage;
  onChange: (stage: WordStage) => void;
}) {
  const patch = (part: Partial<WordStage>) => onChange({ ...value, ...part });

  const updateWord = (index: number, part: Partial<Word>) => {
    const current = value.words[index];
    if (!current) return;
    patch({ words: replaceAt(value.words, index, { ...current, ...part }) });
  };

  /** 出題数は語数を超えられない（スキーマの superRefine）。上限を出して先に気づかせる。 */
  const maxQuestions = Math.max(1, value.words.length);

  const duplicateTerms = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const word of value.words) {
      if (seen.has(word.term)) dup.add(word.term);
      seen.add(word.term);
    }
    return dup;
  }, [value.words]);

  return (
    <div className="space-y-4">
      <StudioSection title="きほん" hint="単語テストの 1ステージぶんです。">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="ID（半角の 英小文字・数字・- _）"
            value={value.id}
            onChange={(id) => patch({ id })}
            placeholder="houkoku_words"
            hint={value.id ? `学習者は /wordtest/${value.id} で 受けます。` : undefined}
          />
          <TextField
            label="タイトル"
            value={value.title}
            onChange={(title) => patch({ title })}
            placeholder="ほうこくの ことば"
          />
        </div>
        <TextAreaField
          label="せつめい"
          value={value.description}
          onChange={(description) => patch({ description })}
          placeholder="ほうこくの ときに つかう ことばを おぼえます。"
        />
        {/*
          セット名を 付けると、その ステージの 中で **別の セット**として 学習者に 出る
          （初級・中級…／願い #203）。空なら これまでどおり、同じ ステージの ほかの
          名前なしの ことばと 1つに まとまる。
        */}
        <TextField
          label="セット名（からでも よい）"
          value={value.label ?? ""}
          onChange={(label) => patch({ label: label.length > 0 ? label : undefined })}
          placeholder="初級"
          hint={
            value.label
              ? "ステージの トップに この 名前で ならびます。漢字の よみは 下の 読み辞書に 足してください。"
              : "からにすると、同じ ステージの ほかの ことばと 1つに まとまります。"
          }
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label={`出題数（1〜${maxQuestions}）`}
            value={value.questionCount}
            min={1}
            max={maxQuestions}
            onChange={(questionCount) => patch({ questionCount })}
          />
          <NumberField
            label="合格ライン（％）"
            value={value.passRate}
            min={1}
            max={100}
            onChange={(passRate) => patch({ passRate })}
          />
          <TextField
            label="あけるための ことば（からでも よい）"
            value={value.password ?? ""}
            onChange={(password) => patch({ password: password.length > 0 ? password : undefined })}
            placeholder="stage1"
            hint="からにすると 最初から あそべます。"
          />
        </div>
      </StudioSection>

      <FuriganaEditor
        content={value}
        entries={value.furigana ?? []}
        onChange={(furigana) => patch({ furigana })}
        emptyNote="ことばと れいぶんの 漢字に よみを つけます。"
      />

      <StudioSection
        title={`ことば（${value.words.length}語）`}
        hint={`${MIN_WORDS}語から つくれます。まよう こたえは ${WRONG_COUNT}つ、ぜんぶ 英語で 書きます。`}
      >
        {value.words.length < MIN_WORDS ? (
          <p className="text-ink-soft text-xs font-bold">
            あと {MIN_WORDS - value.words.length}語 たすと ほぞんできます。
          </p>
        ) : null}

        <ol className="space-y-3">
          {value.words.map((word, index) => (
            <li key={index} className="border-hairline space-y-3 rounded-2xl border-2 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-faint w-6 text-sm font-black">{index + 1}</span>
                <div className="min-w-[8rem] flex-1">
                  <TextField
                    label="ID（半角）"
                    value={word.id}
                    onChange={(id) => updateWord(index, { id })}
                    placeholder="houkoku"
                  />
                </div>
                <RowTools
                  index={index}
                  count={value.words.length}
                  label="ことば"
                  onMove={(delta) => patch({ words: moveItem(value.words, index, delta) })}
                  onRemove={() => patch({ words: removeAt(value.words, index) })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="ことば（教材に 出てくる 書き方）"
                  value={word.term}
                  onChange={(term) => updateWord(index, { term })}
                  placeholder="報告"
                  hint={
                    duplicateTerms.has(word.term)
                      ? "同じ ことばが この ステージに 2つ あります。辞書には 1つしか 出ません。"
                      : undefined
                  }
                />
                <TextField
                  label="よみ（ひらがな）"
                  value={word.reading}
                  onChange={(reading) => updateWord(index, { reading })}
                  placeholder="ほうこく"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="こたえ（英語）"
                  value={word.meaningEn}
                  onChange={(meaningEn) => updateWord(index, { meaningEn })}
                  placeholder="Report"
                />
                <TextField
                  label="ローマ字（なくても よい）"
                  value={word.romaji ?? ""}
                  onChange={(romaji) =>
                    updateWord(index, { romaji: romaji.length > 0 ? romaji : undefined })
                  }
                  placeholder="houkoku"
                />
              </div>

              {/*
                まよう こたえ は ちょうど3つ。増減できるようにすると、
                2つや4つのまま保存の画面まで行って、そこで止められることになる。
              */}
              <div>
                <p className="text-navy text-xs font-black">
                  まよう こたえ（英語・{WRONG_COUNT}つ）
                </p>
                <div className="mt-1 grid gap-2 sm:grid-cols-3">
                  {Array.from({ length: WRONG_COUNT }, (_, slot) => (
                    <TextField
                      key={slot}
                      label={`${slot + 1}つめ`}
                      value={word.wrongMeanings[slot] ?? ""}
                      onChange={(text) => {
                        const next = Array.from(
                          { length: WRONG_COUNT },
                          (_, i) => word.wrongMeanings[i] ?? "",
                        );
                        next[slot] = text;
                        updateWord(index, { wrongMeanings: next });
                      }}
                      placeholder="Shopping"
                    />
                  ))}
                </div>
              </div>

              <TextAreaField
                label="やさしい 日本語の せつめい（辞書に 出ます）"
                value={word.explanationJa}
                onChange={(explanationJa) => updateWord(index, { explanationJa })}
                placeholder="報告は、仕事の 結果や 様子を 人に 知らせる ことです。"
              />
              <TextField
                label="れいぶん（教材と 同じ 場面で）"
                value={word.example}
                onChange={(example) => updateWord(index, { example })}
                placeholder="ほうれんそう（報告・連絡・相談）。"
              />
            </li>
          ))}
        </ol>

        <MiniButton tone="accent" onClick={() => patch({ words: [...value.words, emptyWord()] })}>
          ＋ ことばを 追加
        </MiniButton>
      </StudioSection>

      {/*
        景色の並びはゲームの見た目（森 → 空 → 宇宙）。ふつうは触らないので下に置く。
        課ごとに違う並びにすると、同じゲームなのに課によって見え方が変わる。
      */}
      <StudioSection
        title="ゲームの 景色（ふつうは そのままで よい）"
        hint="出題が すすむと この 順に 景色が 変わります。"
      >
        <StringListEditor
          label="景色"
          items={value.fieldSequence}
          itemLabel="景色"
          placeholder="forest"
          addLabel="＋ 景色を 追加"
          onChange={(fieldSequence) => patch({ fieldSequence })}
        />
      </StudioSection>
    </div>
  );
}

export function emptyWord(): Word {
  return {
    id: "",
    term: "",
    reading: "",
    meaningEn: "",
    wrongMeanings: ["", "", ""],
    explanationJa: "",
    example: "",
  };
}
