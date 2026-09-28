"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ROMAJI_KEY,
  canAppendRomaji,
  romajiBackspace,
  romajiCandidates,
  romajiDisplay,
} from "@/lib/text/romaji";

/**
 * 読みのひらがな入力。舞台の下端に置く主役の入力欄。
 *
 * 旧仕様（wordtest_revice.md §17）を守る: アプリ内かなキーボードは作らない／
 * コピー・貼り付けと右クリックは止める／Enter で決定。
 * 大きさも旧アプリどおり（画面の下でいちばん目立つ大きな文字）。
 * 「ひらがなだけ許す」判定は共有の normalize.ts が持ち、ここは入口の見張りだけ。
 *
 * ## PC では OS の 日本語入力（IME）を 使わせない（2026-09-28）
 * IME の **予測候補**を 見れば、あてずっぽうの 読みが 画面の 漢字に なるか
 * 入力欄の 中で 答え合わせ できて しまう。候補の 窓は ページから 消せない ので、
 * PC（マウスの ある きかい）では 入力欄を 読み取り専用に して IME を 起こさず、
 * 打った キーを `src/lib/text/romaji.ts` で ひらがなに する。予測候補は 一度も 出ない。
 * スマホ（指の きかい）は これまで どおり 端末の キーボードで 打つ。
 */
export function ReadingInput({
  onSubmit,
  disabled,
  /** 直前の入力に注意が出ているとき、旧アプリと同じくふるえる。 */
  shake = false,
  /**
   * ふるえの 通し番号。**番号が 変わるたびに もう一度 ふるえる**（2026-08-27）。
   *
   * 打ち直しは 何度でも できる ように なった ので、2回目・3回目の
   * 打ちまちがいにも 合図が 要る。class を 付けた ままでは
   * CSSアニメーションが 再生されないので、いったん 外して 付け直す。
   */
  shakeKey = 0,
  /**
   * 正しい よみか（ローマ字の 解釈が 割れた ときに 使う）。
   * 「konnichiha」は IME に よって こんにちは とも こんいちは とも なる。
   * どちらに 読んでも 当たる なら、当たる ほうを 渡す。
   */
  accepts,
}: {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  shake?: boolean;
  shakeKey?: number;
  accepts?: (kana: string) => boolean;
}) {
  const romajiMode = useRomajiMode();
  // 問題が変わったら親が key を変えて作り直す（入力欄は自然に空になり、
  // autoFocus が効く）。effect で初期化しないための作り。
  const [value, setValue] = useState("");
  /** PC で 打った ローマ字（画面には ひらがなに して 出す）。 */
  const [raw, setRaw] = useState("");
  /** 打ちかけが 残った まま Enter を 押した 回数（ふるえて「まだ 決まらない」を 知らせる）。 */
  const [nudge, setNudge] = useState(0);
  const boxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || (!shakeKey && !nudge)) return;
    el.classList.remove("shake-input");
    void el.offsetWidth; // 再生の やり直し
    el.classList.add("shake-input");
    const timer = setTimeout(() => el.classList.remove("shake-input"), 320);
    return () => clearTimeout(timer);
  }, [shakeKey, nudge]);

  const submit = () => {
    if (disabled) return;
    if (romajiMode) {
      const candidates = romajiCandidates(raw);
      if (candidates.length === 0) {
        // 打ちかけ（"kais" の s など）が 残る 間は 決めない。欄に 英字が 見えて いるので、
        // ふるえて「まだ ひらがなに なって いない」ことを 知らせる
        if (raw) setNudge((n) => n + 1);
        return;
      }
      onSubmit(candidates.find((kana) => accepts?.(kana)) ?? candidates[0]!);
      setRaw("");
      return;
    }
    onSubmit(value);
    setValue("");
  };

  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={boxRef}
        // 入力欄が主役の画面。毎問フォーカスを戻すのが操作上の要件。
        autoFocus
        type="text"
        value={romajiMode ? (romajiDisplay(raw) ?? "") : value}
        disabled={disabled}
        // 読み取り専用の 欄では IME が 起きない（キーは onKeyDown で 受ける）
        readOnly={romajiMode}
        onKeyDown={
          romajiMode
            ? (e) => {
                if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                  return;
                }
                if (e.key === "Backspace") {
                  e.preventDefault();
                  setRaw((r) => romajiBackspace(r));
                  return;
                }
                // 空白は 変換の キー。読み取り専用の 欄で 画面が 流れない ように 止める
                if (e.key === " ") e.preventDefault();
                const key = romajiKeyOf(e.nativeEvent);
                if (!key) return;
                e.preventDefault();
                setRaw((r) => (canAppendRomaji(r, key) ? r + key : r));
              }
            : undefined
        }
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
        className="text-ink w-full cursor-text rounded-[18px] border-4 bg-white/95 px-4 py-3 text-center text-3xl font-black shadow-[0_5px_0_rgba(0,79,141,.18)] outline-none sm:text-4xl"
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

/** 指の きかい（スマホ・タブレット）か。サーバでは 指の きかい 扱い（入力欄は 押した あとに しか 出ない）。 */
const COARSE = "(pointer: coarse)";

function subscribePointer(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(COARSE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** PC（指の きかい では ない）なら、ローマ字を アプリで ひらがなに する。 */
function useRomajiMode(): boolean {
  return useSyncExternalStore(
    subscribePointer,
    () => typeof window.matchMedia === "function" && !window.matchMedia(COARSE).matches,
    () => false,
  );
}

/**
 * 押された キーの ローマ字（a〜z・-・'）。
 * ふつうは `key` を 見る（配列の ちがう キーボードでも 刻印どおりに なる）。
 * IME が キーを 取った ときの "Process" や、英字の 無い 配列の 字は、物理キーの `code` から 引く。
 */
function romajiKeyOf(e: KeyboardEvent): string | null {
  const key = e.key.length === 1 ? e.key.toLowerCase() : "";
  if (ROMAJI_KEY.test(key)) return key;
  if (/^[\x20-\x7e]$/.test(key)) return null; // 数字・記号 は 受けない
  // 英字以外の 配列（クメール語など）でも、キーの 位置で ローマ字に する
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (e.code === "Minus") return "-";
  return null;
}
