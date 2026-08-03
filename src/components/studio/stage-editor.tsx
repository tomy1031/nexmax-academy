"use client";

import { useId, useState } from "react";
import type { ContentRefType, Stage, StageContentRef } from "@/content/schema";
import { CONTENT_TYPE_OPTIONS, STAGE_COLOR_OPTIONS } from "./drafts";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import {
  MiniButton,
  NumberField,
  RowTools,
  SelectField,
  StringListEditor,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/** 参照先の候補（IDの打ちまちがいを減らすための入力補助）。 */
export interface RefOption {
  id: string;
  type: ContentRefType;
  title: string;
}

/**
 * ステージのエディタ（設計07 §3）
 *
 * ステージは「コンテンツの入れ物と順序」でしかない。contents[] の並びがそのまま
 * 学習順になるため、並べ替えを最も触りやすい位置に置く。
 */
export function StageEditor({
  value,
  onChange,
  refOptions,
}: {
  value: Stage;
  onChange: (stage: Stage) => void;
  refOptions: readonly RefOption[];
}) {
  const listId = useId();
  const [newRef, setNewRef] = useState("");
  const [newType, setNewType] = useState<ContentRefType>("manga");

  const patch = (part: Partial<Stage>) => onChange({ ...value, ...part });

  const addContent = () => {
    const ref = newRef.trim();
    if (ref.length === 0) return;
    patch({ contents: [...value.contents, { ref, type: newType }] });
    setNewRef("");
  };

  const updateContent = (index: number, part: Partial<StageContentRef>) => {
    const current = value.contents[index];
    if (!current) return;
    patch({ contents: replaceAt(value.contents, index, { ...current, ...part }) });
  };

  const candidates = refOptions.filter((option) => option.type === newType);

  return (
    <div className="space-y-4">
      <StudioSection title="きほん" hint="マップに出るステージの見た目と説明です。">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="ID（半角の英小文字・数字・- _）"
            value={value.id}
            onChange={(id) => patch({ id })}
            placeholder="m7-trouble"
            hint="あとから変えると 進捗の記録が つながらなくなります。"
          />
          <NumberField
            label="ステップ（1〜12）"
            value={value.step}
            min={1}
            max={12}
            onChange={(step) => patch({ step })}
          />
          <TextField
            label="タイトル"
            value={value.title}
            onChange={(title) => patch({ title })}
            placeholder="トラブルの ほうこく"
          />
          <TextField
            label="よみ（ひらがな）"
            value={value.reading}
            onChange={(reading) => patch({ reading })}
            placeholder="とらぶるの ほうこく"
          />
        </div>
        <TextAreaField
          label="せつめい"
          value={value.description}
          onChange={(description) => patch({ description })}
          placeholder="こまったことが 起きたとき、先輩に つたえる ことばを ならいます。"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="ピンの色"
            value={value.color}
            options={STAGE_COLOR_OPTIONS}
            onChange={(color) => patch({ color })}
          />
          <SelectField
            label="状態"
            value={value.status}
            options={[
              { value: "draft", label: "したがき（マップに出さない）" },
              { value: "published", label: "こうかい" },
            ]}
            onChange={(status) => patch({ status })}
          />
        </div>
      </StudioSection>

      <StudioSection
        title="コンテンツの じゅんばん"
        hint="この並びが そのまま 学習の順番になります。"
      >
        <ol className="space-y-2">
          {value.contents.map((item, index) => (
            <li
              key={index}
              className="border-hairline flex flex-wrap items-center gap-2 rounded-2xl border-2 bg-white p-3"
            >
              <span className="text-ink-faint w-6 text-sm font-black">{index + 1}</span>
              <div className="min-w-[10rem] flex-1">
                <TextField
                  label="参照先のID"
                  value={item.ref}
                  listId={listId}
                  onChange={(ref) => updateContent(index, { ref })}
                />
              </div>
              <div className="w-44">
                <SelectField
                  label="種別"
                  value={item.type}
                  options={CONTENT_TYPE_OPTIONS}
                  onChange={(type) => updateContent(index, { type })}
                />
              </div>
              <RowTools
                index={index}
                count={value.contents.length}
                label="コンテンツ"
                onMove={(delta) => patch({ contents: moveItem(value.contents, index, delta) })}
                onRemove={() => patch({ contents: removeAt(value.contents, index) })}
              />
            </li>
          ))}
        </ol>
        {value.contents.length === 0 ? (
          <p className="text-ink-faint text-xs font-bold">
            まだ ありません。下から 追加してください。
          </p>
        ) : null}

        <div className="bg-panel-tint flex flex-wrap items-end gap-2 rounded-2xl p-3">
          <div className="min-w-[10rem] flex-1">
            <TextField
              label="追加する ID"
              value={newRef}
              listId={listId}
              onChange={setNewRef}
              placeholder="m7-manga"
            />
          </div>
          <div className="w-44">
            <SelectField
              label="種別"
              value={newType}
              options={CONTENT_TYPE_OPTIONS}
              onChange={setNewType}
            />
          </div>
          <MiniButton tone="accent" onClick={addContent}>
            ＋ コンテンツを 追加
          </MiniButton>
        </div>

        <datalist id={listId}>
          {candidates.map((option) => (
            <option key={`${option.type}:${option.id}`} value={option.id}>
              {option.title}
            </option>
          ))}
        </datalist>
      </StudioSection>

      <StudioSection
        title="ことばのゲーム（単語ステージ）"
        hint="このステージに ひもづける 単語ステージのIDです。"
      >
        <StringListEditor
          label="単語ステージのID"
          items={value.wordStageIds}
          itemLabel="単語ステージ"
          placeholder="m7-words"
          addLabel="＋ 単語ステージを 追加"
          onChange={(wordStageIds) => patch({ wordStageIds })}
        />
      </StudioSection>
    </div>
  );
}
