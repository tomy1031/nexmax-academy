"use client";

import { useMemo, useState } from "react";
import type { ContentRefType, Stage, VocabBook } from "@/content/schema";
import { contentKindMeta } from "@/lib/content-kinds";
import { stageContentPath } from "@/lib/stage-routes";
import { AreaPicker } from "./area-picker";
import { LISTED_OPTIONS, STAGE_COLOR_OPTIONS } from "./drafts";
import { moveItem, removeAt } from "./list-ops";
import {
  FuriganaEditor,
  MiniButton,
  SelectField,
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
 * ステージは「学習の ながれ」そのもの。報告のステージなら
 * まんが → ページ → リスニング → そのリスニングの もんだい、と積んでいく。
 * だから画面も上から順に、①きほん ②エリアの絵 ③ながれ の3段にする。
 *
 * ③では **その場で教材を作れる**ことが要。別画面へ行って作り、戻ってきて
 * IDを打ち込む、という作り方だと、ID の打ちまちがいが必ず起き、しかも
 * まちがいに気づくのは学習者がタップして404を見たときになる。
 */
export function StageEditor({
  value,
  onChange,
  library,
  knownIds,
  textsByRef,
  vocabBooks,
  onOpenContent,
  onCreateContent,
}: {
  value: Stage;
  onChange: (stage: Stage) => void;
  /** いま存在する教材（git ∪ DB）。「もう ある ものから えらぶ」の候補。 */
  library: readonly RefOption[];
  /** 保存ずみのID。ここに無い参照は「まだ ほぞんして いません」と出す。 */
  knownIds: ReadonlySet<string>;
  /** すでに どこかの 単語ステージに ある ことば → その ステージの 見出し。 */
  /** ことばの 正。辞書ぜんたいから 選べるように するため 渡す。 */
  vocabBooks: readonly VocabBook[];
  /**
   * 教材ID → 学習者が読む文。「ことばを ぬき出す」に渡す。
   * ステージが持っているのは参照先のIDだけなので、本文は studio-shell から届く
   *（shell だけが git ∪ DB の全教材を持っている）。
   */
  textsByRef: Readonly<Record<string, readonly string[]>>;
  /** その教材のエディタを開く。 */
  onOpenContent: (ref: string, type: ContentRefType) => void;
  /** 新しい教材を作って、このステージの ながれ に足す。 */
  onCreateContent: (type: ContentRefType) => void;
}) {
  const patch = (part: Partial<Stage>) => onChange({ ...value, ...part });

  return (
    <div className="space-y-4">
      <StudioSection
        title="① きほん"
        hint="URL・見出し・マップでの 見え方を きめます。ここから 始めます。"
      >
        <TextField
          label="URL（半角の 英小文字・数字・-）"
          value={value.id}
          onChange={(id) => patch({ id })}
          placeholder="houkoku"
          hint={
            value.id
              ? `学習者は /${value.id} で ひらきます。あとから 変えると 進捗の 記録が つながらなくなります。`
              : "学習者は /ここに書いた名前 で ひらきます（例: /houkoku）。"
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
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
          placeholder="こまった ことが 起きたとき、先輩に 伝える ことばを 習います。"
        />
        {/*
          せつめいは 漢字＋ふりがなで 書く（ひらがなに 開かない・docs/constraints.md）。
          マップの カードと ステージの 見出しが、この 読み辞書から ルビを 合成する。
        */}
        <FuriganaEditor
          entries={value.furigana ?? []}
          onChange={(furigana) => patch({ furigana })}
          emptyNote="まだ ありません。ないと せつめいの 漢字に ふりがなが つきません。"
          content={value}
        />
        {/*
          公開かどうかは上の「こうかい」ボタン（editor-frame）だけで決める。
          ここにも状態セレクトを置くと、DBの status 列と中身の status が食い違い
          「こうかいしたのに 地図に出ない」が起きるため、入口を1つにする。
          ならびの ばんごう も置かない——並び替えは一覧側で ↑↓ を押すだけにする
          （番号を手で書かせると、2つのステージが同じ番号になって順番が動かなくなる）。
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="ピンの色"
            value={value.color}
            options={STAGE_COLOR_OPTIONS}
            onChange={(color) => patch({ color })}
          />
          {/*
            「こうかい」（完成度）とは別の軸。こうかいしても 地図に出さない、が
            この選択である——案内のページを 学習の道すじに 混ぜないため。
            出さないほうを選んでも URL は生きるので、リンクを配れば ひらける。
          */}
          <SelectField
            label="まなびマップ"
            value={value.listed ? "map" : "url"}
            options={LISTED_OPTIONS}
            onChange={(where) => patch({ listed: where === "map" })}
            hint={
              value.listed
                ? "地図に 停留所として ならびます。"
                : `地図には 出ません。${value.id ? `/${value.id}` : "URL"} を リンクで 配って ひらいてもらいます。`
            }
          />
        </div>
      </StudioSection>

      <AreaPicker stageId={value.id} value={value.area} onChange={(area) => patch({ area })} />

      <FlowEditor
        value={value}
        onChange={onChange}
        library={library}
        knownIds={knownIds}
        onOpenContent={onOpenContent}
        onCreateContent={onCreateContent}
      />

      <WordStages value={value} onChange={onChange} library={library} />

      {/*
        単語ステージは手で書くと1課ぶんで1時間仕事になる。作られないままだと
        ステージから「ことばで あそぶ」へ行く道が開かないので、ここから作れるようにする。
        作ったIDは上の一覧（wordStageIds）に足す——ステージ側に足さないと、
        単語ステージだけができて、どのステージからも開けないものになる。
      */}
      <VocabExtractor
        stage={value}
        textsByRef={textsByRef}
        vocabBooks={vocabBooks}
        onCreated={(id) => patch({ wordStageIds: [...value.wordStageIds, id] })}
      />
    </div>
  );
}

/** ながれ に置ける教材（単語ステージは別枠なので入らない）。 */
const FLOW_TYPES: readonly ContentRefType[] = [
  "manga",
  "article",
  "slides",
  "listening",
  "quizset",
  "scenario",
];

/** その場で作れる種別。たいわ（scenario）はまだエディタが無いので選ぶだけにする。 */
const CREATABLE: ReadonlySet<ContentRefType> = new Set([
  "manga",
  "article",
  "slides",
  "listening",
  "quizset",
]);

/**
 * 学習の ながれ。上から順に学習者が進む。
 *
 * 番号つきの縦並びにして、あいだを線でつなぐ。表よりも「順番がある」ことが伝わる。
 */
function FlowEditor({
  value,
  onChange,
  library,
  knownIds,
  onOpenContent,
  onCreateContent,
}: {
  value: Stage;
  onChange: (stage: Stage) => void;
  library: readonly RefOption[];
  knownIds: ReadonlySet<string>;
  onOpenContent: (ref: string, type: ContentRefType) => void;
  onCreateContent: (type: ContentRefType) => void;
}) {
  const [adding, setAdding] = useState<ContentRefType | null>(null);
  const titleById = useMemo(
    () => new Map(library.map((item) => [`${item.type}:${item.id}`, item.title])),
    [library],
  );
  const patch = (part: Partial<Stage>) => onChange({ ...value, ...part });

  return (
    <StudioSection
      title="③ この ステージの ながれ"
      hint="上から 順に 学習者が すすみます。ここに 教材を 足して いきます。"
    >
      {value.contents.length === 0 ? (
        <p className="bg-panel-tint text-ink-soft rounded-2xl p-4 text-sm font-bold">
          まだ 何も ありません。下の「＋ ふやす」から、まんが や リスニングを 足してください。
        </p>
      ) : (
        <ol className="space-y-0">
          {value.contents.map((item, index) => {
            const meta = contentKindMeta(item.type);
            const title = titleById.get(`${item.type}:${item.ref}`);
            const saved = knownIds.has(item.ref);
            const href = stageContentPath(value.id, value.contents, index);
            return (
              <li key={`${item.type}:${item.ref}:${index}`}>
                {index > 0 ? (
                  <div aria-hidden className="ml-6 h-4 w-0.5 bg-[var(--color-hairline,#d5e6f2)]" />
                ) : null}
                <div className="border-hairline flex flex-wrap items-center gap-3 rounded-2xl border-2 bg-white p-3">
                  <span className="bg-navy grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <span aria-hidden className="text-xl leading-none">
                    {meta.icon}
                  </span>
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-navy text-sm font-black">
                      {title ?? item.ref}
                      <span className="text-ink-faint ml-2 text-xs font-bold">{meta.label}</span>
                    </p>
                    <p className="text-ink-faint text-xs font-bold">
                      {href ? `${href}　` : ""}
                      {item.ref}
                    </p>
                    {!saved ? (
                      <p className="text-coral-deep text-xs font-black">
                        まだ ほぞんして いません — ひらいて ほぞんするまで、学習者には 出ません。
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <MiniButton
                      tone="accent"
                      onClick={() => onOpenContent(item.ref, item.type)}
                      title={`${meta.label}をひらく`}
                    >
                      ✎ ひらく
                    </MiniButton>
                    <MiniButton
                      onClick={() => patch({ contents: moveItem(value.contents, index, -1) })}
                      disabled={index === 0}
                      title="上へ"
                    >
                      ↑
                    </MiniButton>
                    <MiniButton
                      onClick={() => patch({ contents: moveItem(value.contents, index, 1) })}
                      disabled={index === value.contents.length - 1}
                      title="下へ"
                    >
                      ↓
                    </MiniButton>
                    <MiniButton
                      tone="danger"
                      onClick={() => patch({ contents: removeAt(value.contents, index) })}
                      title="このステージから はずす"
                    >
                      はずす
                    </MiniButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="bg-panel-tint space-y-3 rounded-2xl p-3">
        <p className="text-navy text-xs font-black">＋ ふやす</p>
        <div className="flex flex-wrap gap-2">
          {FLOW_TYPES.map((type) => {
            const meta = contentKindMeta(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => setAdding(adding === type ? null : type)}
                aria-pressed={adding === type}
                className={`rounded-full border-2 px-4 py-1.5 text-xs font-black ${
                  adding === type
                    ? "bg-navy border-navy text-white"
                    : "border-hairline text-ink bg-white"
                }`}
              >
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>

        {adding ? (
          <AddPanel
            type={adding}
            library={library}
            onPick={(ref) => {
              patch({ contents: [...value.contents, { ref, type: adding }] });
              setAdding(null);
            }}
            onCreate={() => {
              setAdding(null);
              onCreateContent(adding);
            }}
          />
        ) : null}
      </div>
    </StudioSection>
  );
}

/** 種別を選んだあとの2択（新しく作る／もうあるものから選ぶ）。 */
function AddPanel({
  type,
  library,
  onPick,
  onCreate,
}: {
  type: ContentRefType;
  library: readonly RefOption[];
  onPick: (ref: string) => void;
  onCreate: () => void;
}) {
  const meta = contentKindMeta(type);
  const options = library.filter((item) => item.type === type);
  const [picked, setPicked] = useState("");

  return (
    <div className="border-hairline space-y-3 rounded-2xl border-2 bg-white p-3">
      {CREATABLE.has(type) ? (
        <div>
          <MiniButton tone="accent" onClick={onCreate}>
            ＋ あたらしい {meta.label}を つくる
          </MiniButton>
          <p className="text-ink-faint mt-1 text-xs font-bold">
            IDは じどうで つけます。つくったら すぐ 中身を 書く 画面に なります。
          </p>
        </div>
      ) : (
        <p className="text-ink-soft text-xs font-bold">
          {meta.label}は まだ スタジオで 作れません。content/ の JSON で 作った ものから
          えらんでください。
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <SelectField
            label={`もう ある ${meta.label}から えらぶ`}
            value={picked}
            options={[
              { value: "", label: "— えらんでください —" },
              ...options.map((item) => ({ value: item.id, label: `${item.title}（${item.id}）` })),
            ]}
            onChange={setPicked}
          />
        </div>
        <MiniButton onClick={() => picked && onPick(picked)} disabled={picked === ""}>
          この ステージに 入れる
        </MiniButton>
      </div>
      {options.length === 0 ? (
        <p className="text-ink-faint text-xs font-bold">まだ 1つも ありません。</p>
      ) : null}
    </div>
  );
}

/**
 * ひもづける単語ステージ。
 *
 * 手で ID を打たせない（打ちまちがえると、ステージから「ことばで あそぶ」が消える）。
 * 選ぶだけにして、候補は いま存在する単語ステージから出す。
 */
function WordStages({
  value,
  onChange,
  library,
}: {
  value: Stage;
  onChange: (stage: Stage) => void;
  library: readonly RefOption[];
}) {
  const [picked, setPicked] = useState("");
  const options = library.filter(
    (item) => item.type === "wordstage" && !value.wordStageIds.includes(item.id),
  );
  const titleById = new Map(library.map((item) => [item.id, item.title]));
  const patch = (ids: string[]) => onChange({ ...value, wordStageIds: ids });

  return (
    <StudioSection
      title="🕹️ ことばの ゲーム"
      hint="この ステージから すぐ ひらける 単語ステージです。"
    >
      {value.wordStageIds.length > 0 ? (
        <ul className="space-y-2">
          {value.wordStageIds.map((id, index) => (
            <li
              key={id}
              className="border-hairline flex flex-wrap items-center gap-2 rounded-2xl border-2 bg-white p-3"
            >
              <span className="min-w-[10rem] flex-1">
                <span className="text-navy block text-sm font-black">
                  {titleById.get(id) ?? id}
                </span>
                <span className="text-ink-faint block text-xs font-bold">/arcade/{id}</span>
              </span>
              <MiniButton
                tone="danger"
                onClick={() => patch(removeAt(value.wordStageIds, index))}
                title="はずす"
              >
                はずす
              </MiniButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-faint text-xs font-bold">まだ ありません。</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <SelectField
            label="単語ステージを えらぶ"
            value={picked}
            options={[
              { value: "", label: "— えらんでください —" },
              ...options.map((item) => ({ value: item.id, label: `${item.title}（${item.id}）` })),
            ]}
            onChange={setPicked}
          />
        </div>
        <MiniButton
          tone="accent"
          onClick={() => {
            if (!picked) return;
            patch([...value.wordStageIds, picked]);
            setPicked("");
          }}
          disabled={picked === ""}
        >
          ＋ 入れる
        </MiniButton>
      </div>
    </StudioSection>
  );
}
