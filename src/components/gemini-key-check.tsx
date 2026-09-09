"use client";

import { useRef, useState, type RefObject } from "react";
import {
  adviceFor,
  ALL_KEY_CHECK_REASONS,
  checkGeminiKey,
  KEY_CHECK_FURIGANA,
  type KeyCheckLevel,
} from "@/lib/ai/key-check";
import { RubyText } from "@/components/ruby-text";
import { saveGeminiKey } from "@/lib/profile";

/**
 * 「せつぞくを ためす」— 学習者が じぶんの キーを その場で 確かめる
 *
 * せってい（/map/settings）と はじめの せってい（/welcome）の APIキーの カードの 下に 出す。
 * 判定と 文言は `src/lib/ai/key-check.ts`。ここは 見た目と 押した ときの 手順だけ。
 *
 * 結果は **はっきり 言う**（規律1）。つながったか、つながらなかったか、
 * つながらなかったなら 何が 原因で つぎに 何を するか。ぼかさない。
 */

const LEVEL_STYLE: Record<KeyCheckLevel, { border: string; mark: string; text: string }> = {
  ok: { border: "var(--color-leaf)", mark: "✅", text: "text-leaf-deep" },
  warn: { border: "var(--color-sun)", mark: "⚠️", text: "text-navy" },
  fail: { border: "var(--color-coral)", mark: "❌", text: "text-coral-deep" },
};

function ResultBox({ reason, sample = false }: { reason: string; sample?: boolean }) {
  const advice = adviceFor(reason);
  const style = LEVEL_STYLE[advice.level];
  return (
    <section
      role={sample ? undefined : "status"}
      className="mt-3 rounded-2xl border-2 bg-white p-3"
      style={{ borderColor: style.border }}
      data-key-check={reason}
    >
      <p className={`${style.text} text-sm font-black`}>
        {style.mark} <RubyText text={advice.what} index={KEY_CHECK_FURIGANA} show />
      </p>
      <p className="text-ink mt-1 text-sm font-bold">
        <RubyText text={advice.next} index={KEY_CHECK_FURIGANA} show />
      </p>
      {/* 先生や 開発者が 原因を 追えるよう、理由の 名前は 小さく 出す（キーは 含まれない） */}
      <p className="text-ink-faint mt-2 text-[11px] font-bold">reason: {reason}</p>
    </section>
  );
}

type CheckState =
  | { kind: "idle" }
  | { kind: "running" }
  /** `tested` は ためした キー（前後の 空白を 除いた もの）。別の キーに 直したら 結果は 消す。 */
  | { kind: "done"; reason: string; tested: string };

export function GeminiKeyCheck({
  value,
  inputRef,
}: {
  value: string;
  /** 保存と 同じく、打ちかけの 中身（onChange が まだ 走っていない 分）も そのまま 読む。 */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  // 押すたびに 進める 番号。返事が 来たとき 古い 番号なら 捨てる（遅い 回線で キーを 貼り直した とき）。
  const seq = useRef(0);

  const run = async () => {
    const id = ++seq.current;
    const key = (inputRef?.current?.value ?? value).trim();
    /*
     * 押した時点の キーを この きかいに 残す（管理者画面と 同じ）。
     * うまく いった 直後に「ほぞんする」を 忘れても、通った キーを 失わない。
     * 空の ときは 何も しない（消すのは「ほぞんする」の 仕事）。
     */
    if (key) saveGeminiKey(key);
    setState({ kind: "running" });
    const outcome = await checkGeminiKey(key);
    if (id !== seq.current) return;
    setState({ kind: "done", reason: outcome.reason, tested: key });
  };

  // ためした あとで キーを 書き換えたら、古い 判定は 出さない（別の キーの 結果に 見える）。
  const showResult = state.kind === "done" && state.tested === value.trim();

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state.kind === "running"}
        className="border-sky text-navy flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-3 bg-white px-3 text-sm font-extrabold shadow-[0_4px_0_#9dd8f2] disabled:opacity-60"
      >
        {state.kind === "running" ? "🔌 ためして います…" : "🔌 せつぞくを ためす"}
      </button>
      {showResult ? <ResultBox reason={state.reason} /> : null}
    </div>
  );
}

/**
 * 見本 — 出しうる 結果を ぜんぶ 並べる（`?keycheck=all`）
 *
 * Google の 失敗を わざと 起こす ことは できないので、文言の 確認は ここで 行う。
 * 学習者の ふだんの 画面には 出ない。
 */
export function GeminiKeyCheckGallery() {
  return (
    <div className="mt-4" data-testid="key-check-gallery">
      <h3 className="text-navy text-sm font-black">
        🧪 「せつぞくを ためす」の けっかの みほん（
        <span data-testid="key-check-gallery-count">{ALL_KEY_CHECK_REASONS.length}</span> パターン）
      </h3>
      {ALL_KEY_CHECK_REASONS.map((reason) => (
        <ResultBox key={reason} reason={reason} sample />
      ))}
    </div>
  );
}
