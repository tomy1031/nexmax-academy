"use client";

import { useState } from "react";

/**
 * 読みのひらがな入力。舞台の下端に置く主役の入力欄。
 *
 * 旧仕様（wordtest_revice.md §17）を守る: アプリ内かなキーボードは作らない／
 * コピー・貼り付けと右クリックは止める／Enter で決定。
 * 大きさも旧アプリどおり（画面の下でいちばん目立つ大きな文字）。
 * 「ひらがなだけ許す」判定は共有の normalize.ts が持ち、ここは入口の見張りだけ。
 */
export function ReadingInput({
  onSubmit,
  disabled,
  /** 直前の入力に注意が出ているとき、旧アプリと同じくふるえる。 */
  shake = false,
}: {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  shake?: boolean;
}) {
  // 問題が変わったら親が key を変えて作り直す（入力欄は自然に空になり、
  // autoFocus が効く）。effect で初期化しないための作り。
  const [value, setValue] = useState("");

  return (
    <form
      className="flex w-full gap-2"
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
        className={`text-ink w-full rounded-[18px] border-4 bg-white/95 px-4 py-3 text-center text-3xl font-black shadow-[0_5px_0_rgba(0,79,141,.18)] outline-none sm:text-4xl ${
          shake ? "shake-input" : ""
        }`}
        style={{ borderColor: shake ? "var(--color-coral)" : "var(--color-sun)" }}
      />
      <button
        type="submit"
        disabled={disabled}
        className="btn-game hidden shrink-0 px-7 text-xl sm:block"
        style={{ "--btn-face": "#4fa8e8", "--btn-shadow": "#0272ae" } as React.CSSProperties}
      >
        けってい
      </button>
    </form>
  );
}
