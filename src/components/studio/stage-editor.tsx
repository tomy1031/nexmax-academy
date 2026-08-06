"use client";

import { useId, useState } from "react";
import { ROUTE_AREAS } from "@/content/areas";
import type { ContentRefType, Stage, StageContentRef } from "@/content/schema";
import { CONTENT_TYPE_OPTIONS, STAGE_COLOR_OPTIONS } from "./drafts";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import { uploadAsset } from "./studio-api";
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
import { VocabExtractor } from "./vocab-extractor";

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
  textsByRef,
}: {
  value: Stage;
  onChange: (stage: Stage) => void;
  refOptions: readonly RefOption[];
  /**
   * 教材ID → 学習者が読む文。「ことばを ぬき出す」に渡す。
   * ステージが持っているのは参照先のIDだけなので、本文は studio-shell から届く
   *（shell だけが git ∪ DB の全教材を持っている）。
   */
  textsByRef: Readonly<Record<string, readonly string[]>>;
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
        {/*
          公開かどうかは上の「こうかい」ボタン（editor-frame）だけで決める。
          ここにも状態セレクトを置くと、DBの status 列と中身の status が食い違い
          「こうかいしたのに 地図に出ない」が起きるため、入口を1つにする。
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="ピンの色"
            value={value.color}
            options={STAGE_COLOR_OPTIONS}
            onChange={(color) => patch({ color })}
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

      {/*
        単語ステージは手で書くと1課ぶんで1時間仕事になる。作られないままだと
        ステージから「ことばで あそぶ」へ行く道が開かないので、ここから作れるようにする。
        作ったIDは上の一覧（wordStageIds）に足す——ステージ側に足さないと、
        単語ステージだけができて、どのステージからも開けないものになる。
      */}
      <VocabExtractor
        stage={value}
        textsByRef={textsByRef}
        onCreated={(id) => patch({ wordStageIds: [...value.wordStageIds, id] })}
      />

      <AreaEditor value={value} onChange={onChange} />
    </div>
  );
}

/**
 * マップの土地（設計: src/content/areas.ts）
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」。ここを決めると、そのステージが
 * マップの上から step 番目の土地として増える。決めなければ既定の土地を使う。
 *
 * 名前に国名を入れない。国は情勢で差し替える前提なので、画面文言が国に依存すると
 * 差し替えのたびに UI を直すことになる（都市名・遺跡名は国名ではないので使ってよい）。
 */
function AreaEditor({ value, onChange }: { value: Stage; onChange: (stage: Stage) => void }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = value.area;

  const patchArea = (part: Partial<NonNullable<Stage["area"]>>) => {
    onChange({
      ...value,
      area: { name: "", reading: "", image: "", note: "", ...area, ...part },
    });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadAsset(file, `areas/${value.id || "stage"}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    patchArea({ image: result.url });
  };

  if (!area) {
    return (
      <StudioSection
        title="マップの 土地"
        hint="このステージが マップの どこに 立つかです。きめないと きていの 土地を つかいます。"
      >
        <p className="text-ink-soft text-xs font-bold">
          いまは きていの 土地（{ROUTE_AREAS.length}か所）を つかいます。
          {value.step > ROUTE_AREAS.length ? (
            <>
              <br />
              このステージは {value.step} ばんめ なので、きていの 土地が ありません。 土地を
              きめないと、空色の おびに なります。
            </>
          ) : null}
        </p>
        <MiniButton tone="accent" onClick={() => patchArea({})}>
          ＋ この ステージの 土地を つくる
        </MiniButton>
      </StudioSection>
    );
  }

  return (
    <StudioSection
      title="マップの 土地"
      hint="マップの 上から この ステージの ばんごう（ステップ）の ところに 出ます。"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="景色の 名前（国の 名前は 入れない）"
          value={area.name}
          onChange={(name) => patchArea({ name })}
          placeholder="きりの やまなみ"
          hint="まちの 名前・いせきの 名前は つかえます。"
        />
        <TextField
          label="よみ（ひらがな）"
          value={area.reading}
          onChange={(reading) => patchArea({ reading })}
          placeholder="きりの やまなみ"
        />
      </div>
      <TextField
        label="地図に そえる ひとこと"
        value={area.note}
        onChange={(note) => patchArea({ note })}
        placeholder="きりの なかを ぬけて いきます。"
      />

      <div className="border-hairline space-y-2 rounded-2xl border-2 bg-white p-3">
        <p className="text-navy text-xs font-black">はいけいの 絵（たて長 1024×1536）</p>
        {area.image ? (
          // next/image は外部URLの許可設定が要るため、ここは素の img で出す（確認用の小さな見本）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={area.image}
            alt=""
            className="border-hairline h-28 w-auto rounded-xl border-2 object-cover"
          />
        ) : (
          <p className="text-ink-faint text-xs font-bold">
            まだ ありません。絵が なくても ステージは 出ます（空色の おびに なります）。
          </p>
        )}
        <TextField
          label="絵の ばしょ（URL か /img/scenes/…）"
          value={area.image}
          onChange={(image) => patchArea({ image })}
          placeholder="/img/scenes/area_misty_peaks.webp"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => void handleFile(e.target.files?.[0])}
            className="text-ink-soft text-xs font-bold"
          />
          {busy ? <span className="text-ink-soft text-xs font-black">あげています…</span> : null}
        </div>
        {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
        <p className="text-ink-faint text-xs font-bold">
          絵は Codex でも つくれます（docs/skills/codex_image_generation.md §7.1）。
        </p>
      </div>

      <MiniButton onClick={() => onChange({ ...value, area: undefined })}>
        この 土地を やめる（きていに もどす）
      </MiniButton>
    </StudioSection>
  );
}
