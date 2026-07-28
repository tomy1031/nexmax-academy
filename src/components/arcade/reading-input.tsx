"use client";

import { useState } from "react";

/**
 * 読みのひらがな入力。
 *
 * 旧仕様（wordtest_revice.md §17）を守る: アプリ内かなキーボードは作らない／
 * コピー・貼り付けと右クリックは止める／Enter で決定。
 * 「ひらがなだけ許す」判定は共有の normalize.ts が持ち、ここは入口の見張りだけ。
 */
export function ReadingInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}) {
  // 問題が変わったら親が key を変えて作り直す（入力欄は自然に空になり、
  // autoFocus が効く）。effect で初期化しないための作り。
  const [value, setValue] = useState("");

  return (
    <form
      className="flex w-full max-w-2xl gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        onSubmit(value);
        setValue("");
      }}
    >
      <input
        // 入力欄が主役の画面。毎問フォーカスを戻すのが操作上の要件。
        autoFocus
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value.replace(/\s+/g, ""))}
        onPaste={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="text"
        placeholder="よみかた"
        aria-label="よみを ひらがなで 入力する"
        className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-2xl font-extrabold sm:text-3xl"
      />
      <button
        type="submit"
        disabled={disabled}
        className="btn-game shrink-0 px-6 py-3 text-lg"
        style={{ "--btn-face": "#0288d1", "--btn-shadow": "#0272ae" } as React.CSSProperties}
      >
        けってい
      </button>
    </form>
  );
}
