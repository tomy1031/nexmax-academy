"use client";

import type {
  Character,
  Content,
  Manga,
  MangaCharacter,
  MangaLine,
  MangaPage,
  MangaPanel,
} from "@/content/schema";
import { useState } from "react";
import { bakeSpeech, staleBakedPanels, unbakeSpeech, type UnbakeableLine } from "@/lib/manga-baked";
import { emptyMangaPage, emptyMangaPanel, PANEL_SIZE_OPTIONS } from "./drafts";
import { MangaMaker } from "./manga-maker";
import { ImageSlotEditor } from "./image-slot-editor";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import {
  MiniButton,
  RowTools,
  SelectField,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/**
 * 漫画のエディタ（設計07 §4）
 *
 * 4コマもストーリーも同じ構造（ページ＝コマのリスト）で編集する。違いは量と
 * レイアウトヒント（size）だけなので、途中で4コマをストーリーに育てられる。
 * セリフは画像に焼き込まずデータで持つ（あとで直せる・ふりがなを合成できる）。
 */
export function MangaEditor({
  value,
  onChange,
  cast = [],
  known = [],
}: {
  value: Manga;
  onChange: (manga: Manga) => void;
  /** 使いまわす登場人物（管理画面「とうじょう人物」）。絵の一貫性に使う。 */
  cast?: readonly Character[];
  /** すでに作った教材。AIに「過去の内容を踏まえて」作らせるために渡す。 */
  known?: readonly Content[];
}) {
  const patch = (part: Partial<Manga>) => onChange({ ...value, ...part });
  const characters = value.characters ?? [];
  const speakerOptions = [
    { value: "narration", label: "ナレーション" },
    ...characters.map((character) => ({
      value: character.id,
      label: `${character.name}（${character.id}）`,
    })),
  ];

  const updatePage = (index: number, next: MangaPage) =>
    patch({ pages: replaceAt(value.pages, index, next) });

  return (
    <div className="space-y-4">
      <MangaMaker value={value} onChange={onChange} cast={cast} known={known} />

      <StudioSection title="きほん">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="ID（半角の英小文字・数字・- _）"
            value={value.id}
            onChange={(id) => patch({ id })}
            placeholder="m7-manga"
          />
          <SelectField
            label="形式"
            value={value.format}
            options={[
              { value: "yonkoma", label: "4コマ" },
              { value: "story", label: "ストーリー" },
            ]}
            onChange={(format) => patch({ format })}
          />
          <TextField label="タイトル" value={value.title} onChange={(title) => patch({ title })} />
          <TextField
            label="せつめい"
            value={value.description}
            onChange={(description) => patch({ description })}
          />
        </div>
      </StudioSection>

      <SpeechModePanel value={value} onChange={onChange} />

      <StudioSection
        title="登場人物"
        hint="セリフの話す人は、ここに登録した人から えらびます。"
        right={
          <MiniButton
            tone="accent"
            onClick={() => patch({ characters: [...characters, { id: "", name: "", role: "" }] })}
          >
            ＋ 人を 追加
          </MiniButton>
        }
      >
        {characters.length === 0 ? (
          <p className="text-ink-faint text-xs font-bold">
            まだ ありません（ナレーションだけでも 作れます）。
          </p>
        ) : null}
        <div className="space-y-2">
          {characters.map((character, index) => (
            <CharacterRow
              key={index}
              character={character}
              index={index}
              count={characters.length}
              onChange={(next) => patch({ characters: replaceAt(characters, index, next) })}
              onMove={(delta) => patch({ characters: moveItem(characters, index, delta) })}
              onRemove={() => patch({ characters: removeAt(characters, index) })}
            />
          ))}
        </div>
      </StudioSection>

      {value.pages.map((page, pageIndex) => (
        <StudioSection
          key={pageIndex}
          title={`ページ ${pageIndex + 1}`}
          hint={value.format === "story" ? "場面カードの文字は「場面」に書きます。" : undefined}
          right={
            <RowTools
              index={pageIndex}
              count={value.pages.length}
              label="ページ"
              onMove={(delta) => patch({ pages: moveItem(value.pages, pageIndex, delta) })}
              onRemove={() => patch({ pages: removeAt(value.pages, pageIndex) })}
            />
          }
        >
          <TextField
            label="場面（なくてもよい）"
            value={page.title ?? ""}
            placeholder="その日の午後 — 会議室"
            onChange={(title) =>
              updatePage(pageIndex, { ...page, title: title.length > 0 ? title : undefined })
            }
          />

          <div className="space-y-3">
            {page.panels.map((panel, panelIndex) => (
              <PanelEditor
                key={panelIndex}
                panel={panel}
                panelIndex={panelIndex}
                panelCount={page.panels.length}
                mangaId={value.id}
                speakerOptions={speakerOptions}
                onChange={(next) =>
                  updatePage(pageIndex, {
                    ...page,
                    panels: replaceAt(page.panels, panelIndex, next),
                  })
                }
                onMove={(delta) =>
                  updatePage(pageIndex, {
                    ...page,
                    panels: moveItem(page.panels, panelIndex, delta),
                  })
                }
                onRemove={() =>
                  updatePage(pageIndex, {
                    ...page,
                    panels: removeAt(page.panels, panelIndex),
                  })
                }
              />
            ))}
          </div>

          <MiniButton
            tone="accent"
            onClick={() =>
              updatePage(pageIndex, { ...page, panels: [...page.panels, emptyMangaPanel()] })
            }
          >
            ＋ コマを 追加
          </MiniButton>
        </StudioSection>
      ))}

      <MiniButton
        tone="accent"
        onClick={() => patch({ pages: [...value.pages, emptyMangaPage()] })}
      >
        ＋ ページを 追加
      </MiniButton>
    </div>
  );
}

function CharacterRow({
  character,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  character: MangaCharacter;
  index: number;
  count: number;
  onChange: (character: MangaCharacter) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border-hairline flex flex-wrap items-end gap-2 rounded-2xl border-2 bg-white p-3">
      <div className="w-40">
        <TextField
          label="ID"
          value={character.id}
          onChange={(id) => onChange({ ...character, id })}
          placeholder="hendy"
        />
      </div>
      <div className="w-40">
        <TextField
          label="名前"
          value={character.name}
          onChange={(name) => onChange({ ...character, name })}
          placeholder="ヘンディ"
        />
      </div>
      <div className="min-w-[8rem] flex-1">
        <TextField
          label="やくわり"
          value={character.role}
          onChange={(role) => onChange({ ...character, role })}
          placeholder="先輩エンジニア"
        />
      </div>
      <RowTools index={index} count={count} label="人" onMove={onMove} onRemove={onRemove} />
    </div>
  );
}

function PanelEditor({
  panel,
  panelIndex,
  panelCount,
  mangaId,
  speakerOptions,
  onChange,
  onMove,
  onRemove,
}: {
  panel: MangaPanel;
  panelIndex: number;
  panelCount: number;
  mangaId: string;
  speakerOptions: readonly { value: string; label: string }[];
  onChange: (panel: MangaPanel) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const updateLine = (index: number, next: MangaLine) =>
    onChange({ ...panel, lines: replaceAt(panel.lines, index, next) });

  return (
    <article className="border-hairline bg-panel rounded-2xl border-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-navy text-sm font-black">コマ {panelIndex + 1}</p>
        <RowTools
          index={panelIndex}
          count={panelCount}
          label="コマ"
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SelectField
          label="コマの大きさ"
          value={panel.size}
          options={PANEL_SIZE_OPTIONS}
          onChange={(size) => onChange({ ...panel, size })}
          hint="ストーリー形式のときだけ 効きます。"
        />
        <TextField
          label="ひとこと（なくてもよい）"
          value={panel.caption ?? ""}
          placeholder="いつもの朝の はずでした。"
          onChange={(caption) =>
            onChange({ ...panel, caption: caption.length > 0 ? caption : undefined })
          }
        />
      </div>

      <div className="mt-3">
        <ImageSlotEditor
          slot={panel.image}
          prefix={`manga/${mangaId.length > 0 ? mangaId : "draft"}`}
          onChange={(image) => onChange({ ...panel, image })}
        />
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-ink text-xs font-black">セリフ</p>
        {panel.lines.map((line, lineIndex) => (
          <div
            key={lineIndex}
            className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
          >
            <div className="w-44">
              <SelectField
                label="話す人"
                value={line.speaker}
                options={
                  speakerOptions.some((option) => option.value === line.speaker)
                    ? speakerOptions
                    : [
                        ...speakerOptions,
                        { value: line.speaker, label: `${line.speaker}（未登録）` },
                      ]
                }
                onChange={(speaker) => updateLine(lineIndex, { ...line, speaker })}
              />
            </div>
            <div className="min-w-[10rem] flex-1">
              <TextAreaField
                label="ことば"
                rows={2}
                value={line.text}
                onChange={(text) => updateLine(lineIndex, { ...line, text })}
              />
            </div>
            <RowTools
              index={lineIndex}
              count={panel.lines.length}
              label="セリフ"
              onMove={(delta) =>
                onChange({ ...panel, lines: moveItem(panel.lines, lineIndex, delta) })
              }
              onRemove={() => onChange({ ...panel, lines: removeAt(panel.lines, lineIndex) })}
            />
          </div>
        ))}
        <MiniButton
          tone="accent"
          onClick={() =>
            onChange({
              ...panel,
              lines: [
                ...panel.lines,
                { speaker: speakerOptions[0]?.value ?? "narration", text: "" },
              ],
            })
          }
        >
          ＋ セリフを 追加
        </MiniButton>
      </div>
    </article>
  );
}

/**
 * まんがの2つのモードを 切りかえる帯
 *
 * 「絵だけ」（既定・吹き出しは空で描かせ、セリフは画面で重ねる）と
 * 「セリフ入り」（吹き出しの中の文字も 絵に焼く）。
 *
 * 焼く文字は**読み辞書から機械で作る**。AIに書かせないのは、絵の字とデータの
 * セリフがずれると「セリフを直したのに古い字の絵が公開され続ける」ためで、
 * これは先生からは見えない壊れ方になる。
 */
function SpeechModePanel({ value, onChange }: { value: Manga; onChange: (manga: Manga) => void }) {
  const [problems, setProblems] = useState<readonly UnbakeableLine[]>([]);
  const stale = staleBakedPanels(value);

  const toBaked = () => {
    const result = bakeSpeech(value);
    setProblems(result.problems);
    onChange(result.manga);
  };

  const toPlain = () => {
    setProblems([]);
    onChange(unbakeSpeech(value));
  };

  return (
    <StudioSection title="セリフの 出し方" hint="絵の中に 文字を 入れるか、画面で 重ねるか。">
      <div className="flex flex-wrap items-center gap-2">
        <MiniButton tone={value.speechInImage ? undefined : "accent"} onClick={toPlain}>
          {value.speechInImage ? "絵だけに もどす" : "✓ 絵だけ（いま これ）"}
        </MiniButton>
        <MiniButton tone={value.speechInImage ? "accent" : undefined} onClick={toBaked}>
          {value.speechInImage ? "✓ セリフ入り（いま これ）" : "セリフを 絵に 入れる"}
        </MiniButton>
      </div>

      <p className="text-ink-soft mt-2 text-xs font-bold">
        絵に 焼く 文字は、読み辞書から <strong>ひらがなに 直して</strong> 作ります。 絵に 焼いた
        漢字には ふりがなを つけられないので、学習者が そこで 止まります。
      </p>

      {value.speechInImage && (
        <p className="text-ink-soft mt-1 text-xs font-bold">
          切りかえると、字の 入っていない 絵は 消えます。もう一度 コマの 絵を 作ってください。
        </p>
      )}

      {problems.length > 0 && (
        <div className="mt-3 rounded-2xl bg-[#fbf3e2] p-3">
          <p className="text-xs font-black text-[#8a5a12]">
            つぎの セリフは、まだ 絵に 入れられません（読み辞書に ない 漢字が あります）
          </p>
          <ul className="text-ink mt-1 list-disc pl-5 text-xs font-bold">
            {problems.map((p, i) => (
              <li key={i}>
                {p.page + 1}ページ目 {p.panel + 1}コマ目: 「{p.text}」
              </li>
            ))}
          </ul>
          <p className="text-ink-soft mt-1 text-xs font-bold">
            下の「読み辞書」に よみを 足してから、もう一度 押してください。
          </p>
        </div>
      )}

      {problems.length === 0 && stale.length > 0 && (
        <p className="mt-2 text-xs font-black text-[#c2410c]">
          セリフを 直したので、{stale.length}こ の コマで 絵の 字が 古いままです。 「セリフを 絵に
          入れる」を もう一度 押してください。
        </p>
      )}
    </StudioSection>
  );
}
