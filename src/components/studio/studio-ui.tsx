"use client";

import { useMemo, type ReactNode } from "react";
import type { Content } from "@/content/schema";
import { collectLearnerTexts } from "@/lib/content-checks";
import { buildFuriganaIndex, uncoveredKanji } from "@/lib/text/furigana";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import type { SaveIssue } from "./issue-text";

/**
 * スタジオ共通の小さな入力部品（先生向け）
 *
 * 学習者の画面と同じ島テイスト（card-island / btn-game）でそろえつつ、
 * ここは編集画面なので情報密度を上げる。ラベルは通常の日本語でよい。
 */

const INPUT_CLASS =
  "border-hairline text-ink w-full rounded-xl border-2 bg-white px-3 py-2 text-sm font-bold";

export function StudioSection({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card-island p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-navy text-lg font-black">{title}</h2>
          {hint ? <p className="text-ink-soft mt-1 text-xs font-bold">{hint}</p> : null}
        </div>
        {right}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  listId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  listId?: string;
}) {
  return (
    <label className="block">
      <span className="text-ink text-xs font-black">{label}</span>
      <input
        type="text"
        value={value}
        list={listId}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} mt-1`}
      />
      {hint ? <span className="text-ink-soft mt-1 block text-xs font-bold">{hint}</span> : null}
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-ink text-xs font-black">{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} mt-1 leading-relaxed`}
      />
      {hint ? <span className="text-ink-soft mt-1 block text-xs font-bold">{hint}</span> : null}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-ink text-xs font-black">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`${INPUT_CLASS} mt-1`}
      />
      {hint ? <span className="text-ink-soft mt-1 block text-xs font-bold">{hint}</span> : null}
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-ink text-xs font-black">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${INPUT_CLASS} mt-1`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="text-ink-soft mt-1 block text-xs font-bold">{hint}</span> : null}
    </label>
  );
}

/**
 * 「これが こたえ」を1つだけ えらぶ丸（ラジオ）。
 *
 * 選択肢の文と同じ行に置くので、単体で置ける形にしてある。name をそろえたものが
 * 1つの組になり、キーボードの矢印でも移せる（1セットに何問も作るので、
 * 全部をマウスで押させない）。
 */
export function RadioChoice({
  name,
  label,
  checked,
  onSelect,
}: {
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="text-ink flex items-center gap-1 text-xs font-black whitespace-nowrap">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="accent-sky h-4 w-4"
      />
      {label}
    </label>
  );
}

/** 「これも こたえ」を いくつでも えらべる四角（チェックボックス）。 */
export function CheckChoice({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="text-ink flex items-center gap-1 text-xs font-black whitespace-nowrap">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
        className="accent-sky h-4 w-4"
      />
      {label}
    </label>
  );
}

/** 小さめの操作ボタン（上へ・下へ・けす など）。 */
export function MiniButton({
  children,
  onClick,
  disabled,
  tone = "plain",
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "plain" | "danger" | "accent";
  title?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-coral text-coral-deep"
      : tone === "accent"
        ? "border-sky text-sky-deep"
        : "border-hairline text-ink-soft";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-full border-2 bg-white px-3 py-1 text-xs font-black disabled:opacity-35 ${toneClass}`}
    >
      {children}
    </button>
  );
}

/** 並べ替え・削除の3点セット。並びが学習順そのものなので、どの一覧でも同じ形にする。 */
export function RowTools({
  index,
  count,
  onMove,
  onRemove,
  label,
}: {
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <MiniButton onClick={() => onMove(-1)} disabled={index === 0} title={`${label}を上へ`}>
        ↑
      </MiniButton>
      <MiniButton onClick={() => onMove(1)} disabled={index >= count - 1} title={`${label}を下へ`}>
        ↓
      </MiniButton>
      <MiniButton onClick={onRemove} tone="danger" title={`${label}をけす`}>
        けす
      </MiniButton>
    </div>
  );
}

/** 文字列の配列（かじょうがき・てじゅん・単語ステージID など）の編集。 */
export function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
  addLabel = "＋ 追加",
  itemLabel = "こうもく",
}: {
  label: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  itemLabel?: string;
}) {
  return (
    <div>
      <p className="text-ink text-xs font-black">{label}</p>
      <div className="mt-1 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={item}
              placeholder={placeholder}
              onChange={(event) => onChange(replaceAt(items, index, event.target.value))}
              className={INPUT_CLASS}
            />
            <RowTools
              index={index}
              count={items.length}
              label={itemLabel}
              onMove={(delta) => onChange(moveItem(items, index, delta))}
              onRemove={() => onChange(removeAt(items, index))}
            />
          </div>
        ))}
        {items.length === 0 ? (
          <p className="text-ink-faint text-xs font-bold">まだ ありません。</p>
        ) : null}
      </div>
      <MiniButton tone="accent" onClick={() => onChange([...items, ""])}>
        {addLabel}
      </MiniButton>
    </div>
  );
}

/** 保存で止まった理由の一覧。どこを・なぜ を並べる。 */
export function IssueList({ issues }: { issues: readonly SaveIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <section
      aria-label="なおすところ"
      className="rounded-[20px] border-2 bg-white p-4"
      style={{ borderColor: "var(--color-coral)" }}
    >
      <p className="text-coral-deep text-sm font-black">
        なおすところが {issues.length}件 あります
      </p>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, index) => (
          <li key={index} className="bg-panel-tint rounded-xl px-3 py-2">
            <span className="text-navy block text-xs font-black">{issue.where}</span>
            <span className="text-ink block text-sm font-bold">{issue.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 保存できたことの一言。消えるまで待たず、次の操作の邪魔をしない位置に出す。 */
export function Toast({ message, tone }: { message: string; tone: "ok" | "ng" }) {
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-black text-white shadow-lg"
      style={{
        background: tone === "ok" ? "var(--color-leaf-deep)" : "var(--color-coral-deep)",
      }}
    >
      {message}
    </div>
  );
}

/**
 * よみ辞書の編集（表示するときに ルビを合成するための もと）。
 *
 * ルビHTMLは手書きしない（AGENTS.md 規律2）。ここに ことばと よみ を書いておくと、
 * 学習者の画面で エンジンが ふりがなを つける。辞書が無いと、漢字に ふりがなが
 * 1つも付かないまま N4 の学習者に届く。
 *
 * もんだい・リスニングのように furigana を持つ教材で共用する。
 * 辞書の引き方は最長一致なので、並びの責任は先生に持たせない
 *（並び順が意味を持つのは性格診断まわりの readings のほう — ruby-text.tsx）。
 */
export function FuriganaEditor({
  entries,
  onChange,
  emptyNote,
  content,
}: {
  entries: readonly (readonly [string, string])[];
  /** 空になったら undefined を渡す（空配列を残すと 保存データに 意味のない項目が積もる）。 */
  onChange: (next: [string, string][] | undefined) => void;
  /** 1つも無いときに出す一言（教材の種類で言い方を変える）。 */
  emptyNote: string;
  /**
   * いま編集している教材。まだ ふりがなの ついていない 漢字を出すのに使う。
   * 保存してから `lint:content` に言われるより、書いている最中に見えるほうが直しやすい。
   */
  content: Content;
}) {
  const list = entries.map(([term, reading]) => [term, reading] as [string, string]);
  const setEntries = (next: [string, string][]) => onChange(next.length > 0 ? next : undefined);

  // 判定は検査（lint:content）と画面のルビ合成に使うのと同じ関数を通す。
  // ここだけ別の数え方にすると「スタジオでは足りているのに保存で止まる」が起きる。
  const missing = useMemo(() => {
    const index = buildFuriganaIndex(list.filter(([term, reading]) => term && reading));
    const seen = new Set<string>();
    for (const text of collectLearnerTexts(content)) {
      for (const kanji of uncoveredKanji(text, index)) seen.add(kanji);
    }
    return [...seen];
  }, [list, content]);

  return (
    <StudioSection
      title="よみ辞書"
      hint="ここに 書いた ことばに ふりがなが つきます。ながい ことばを 先に 書きます。"
    >
      <div className="space-y-2">
        {list.map(([term, reading], index) => (
          <div
            key={index}
            className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
          >
            <div className="min-w-[8rem] flex-1">
              <TextField
                label="ことば"
                value={term}
                onChange={(next) => setEntries(replaceAt(list, index, [next, reading]))}
                placeholder="報告"
              />
            </div>
            <div className="min-w-[8rem] flex-1">
              <TextField
                label="よみ（ひらがな）"
                value={reading}
                onChange={(next) => setEntries(replaceAt(list, index, [term, next]))}
                placeholder="ほうこく"
              />
            </div>
            <RowTools
              index={index}
              count={list.length}
              label="ことば"
              onMove={(delta) => setEntries(moveItem(list, index, delta))}
              onRemove={() => setEntries(removeAt(list, index))}
            />
          </div>
        ))}
        {list.length === 0 ? <p className="text-ink-faint text-xs font-bold">{emptyNote}</p> : null}
      </div>

      {missing.length > 0 ? (
        <div
          className="rounded-xl border-2 bg-white p-3"
          style={{ borderColor: "var(--color-sun)" }}
        >
          <p className="text-navy text-xs font-black">
            まだ ふりがなが ない 漢字（{missing.length}）
          </p>
          <p className="text-ink mt-1 text-sm font-black break-all">{missing.join(" ")}</p>
          <p className="text-ink-soft mt-1 text-xs font-bold">
            この 漢字が 出てくる ことばを 下に 足してください。1つでも のこると ほぞんの ときに
            止まります。
          </p>
        </div>
      ) : null}

      <MiniButton
        tone="accent"
        // 足りない漢字があれば、その1字目を入れた行で始める。先生が本文を
        // 探し直さずに済むようにするため（読みは先生が決める）。
        onClick={() => setEntries([...list, [missing[0] ?? "", ""]])}
      >
        ＋ ことばを 追加
      </MiniButton>
    </StudioSection>
  );
}

/**
 * その教材が git の JSON か、スタジオで作ったDB版か。
 *
 * 一覧なら どこでも同じ見た目で出す。消せるのはDB版だけなので、
 * 「けす」ボタンを出してよいかの判断もこのしるしと一致する。
 */
export function SourceBadge({ status }: { status: "draft" | "published" | null }) {
  if (!status) {
    return (
      <span className="border-hairline text-ink-soft rounded-full border-2 px-3 py-1 text-xs font-black">
        git版
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-black text-white"
      style={{
        background: status === "published" ? "var(--color-leaf-deep)" : "var(--color-sun-deep)",
      }}
    >
      {status === "published" ? "DB版（こうかい）" : "DB版（したがき）"}
    </span>
  );
}
