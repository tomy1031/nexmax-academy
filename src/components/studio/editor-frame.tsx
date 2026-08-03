"use client";

import type { ReactNode } from "react";
import type { SaveIssue } from "./issue-text";
import { IssueList } from "./studio-ui";

/**
 * エディタ共通の枠（もどる・したがき保存・公開・なおすところ）
 *
 * 3つのエディタで保存の導線を同じ形にするために切り出す。
 * 「したがきを ほぞん」と「こうかい」を並べるのは、公開の判断を1クリック分だけ
 * 重くしておくため（公開＝学習者に出る）。
 */
export function EditorFrame({
  title,
  hint,
  onBack,
  onSave,
  saving,
  disabledNote,
  issues,
  children,
}: {
  title: string;
  hint?: string;
  onBack: () => void;
  onSave: (publish: boolean) => void;
  saving: boolean;
  /** 保存できない理由（DB未設定など）。あればボタンを止めて理由を出す。 */
  disabledNote?: string | null;
  issues: readonly SaveIssue[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="card-island flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="text-ink-soft hover:text-navy text-xs font-black"
          >
            ← 一覧に もどる
          </button>
          <h1 className="text-navy mt-1 truncate text-xl font-black">{title}</h1>
          {hint ? <p className="text-ink-soft text-xs font-bold">{hint}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {disabledNote ? (
            <span className="text-ink-soft max-w-[18rem] text-xs font-bold">{disabledNote}</span>
          ) : null}
          <button
            type="button"
            disabled={saving || Boolean(disabledNote)}
            onClick={() => onSave(false)}
            className="border-hairline text-navy rounded-2xl border-2 bg-white px-5 py-2.5 text-sm font-black disabled:opacity-40"
          >
            したがきを ほぞん
          </button>
          <button
            type="button"
            disabled={saving || Boolean(disabledNote)}
            onClick={() => onSave(true)}
            className="btn-game px-5 py-2.5 text-sm [--btn-face:#004f8d] [--btn-shadow:#003c6b] disabled:opacity-40"
          >
            こうかい
          </button>
        </div>
      </div>

      <IssueList issues={issues} />

      {children}
    </div>
  );
}
