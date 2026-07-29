"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";
import {
  createListening,
  MAX_MISS,
  remainingKeywords,
  revealRate,
  submitListening,
  type HitKind,
  type ListeningState,
} from "./listening-checks";

/**
 * 聞き取りチェック。旧アプリと同じく **入力欄はひとつ**。
 *
 * 入れた言葉が キーワードか／キーワードを含むか／本文にあるか で
 * 点数と文言が変わり、当たった箇所の原稿がその場で開く。
 * 旧アプリにあった表示（スコア・ワード表示率・ミス n/3・
 * 漢字/ひらがな/その他 の内わけ・入力の履歴）は全部そのまま出す。
 */
export function ListeningPanel({
  transcript,
  keywords,
  goal,
  furigana,
}: {
  transcript: string;
  keywords: readonly string[];
  goal: number;
  furigana: FuriganaIndex;
}) {
  const [state, setState] = useState<ListeningState>(() => createListening(transcript, keywords));
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(0);

  const rate = revealRate(state);
  const left = remainingKeywords(state);
  const latest = state.log[0];
  const cleared = rate >= goal;

  const submit = () => {
    const next = submitListening(state, value);
    const entry = next.log[0];
    if (next !== state) setState(next);
    if (entry && (entry.kind === "miss" || entry.kind === "tooShort" || entry.kind === "close")) {
      setShake((n) => n + 1); // 当たらなかったときは入力欄が小さく首をふるだけ（減点なし）
    } else {
      setValue("");
    }
  };

  return (
    <section className="card-island p-5">
      <h3 className="text-ink font-extrabold">🔍 聞こえた ことばを 入れてみよう</h3>

      {/* 旧アプリの score-bar 相当 */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="スコア" value={state.score} accent="#f0a819" />
        <Stat label="ワード表示率" value={`${rate}%`} accent="#0272ae" />
        <Stat label="のこり" value={`${left}こ`} accent="#f26fa7" />
        <Stat
          label="ミス"
          value={`${state.misses} / ${MAX_MISS}`}
          accent={state.misses >= MAX_MISS ? "#f2654a" : "#5a7089"}
        />
      </div>

      <div className="text-ink-soft mt-2 flex flex-wrap gap-3 text-xs font-extrabold">
        <span>🎯 キーワード: {state.kanjiHits}</span>
        <span>📝 よみ: {state.hiraganaHits}</span>
        <span>✓ その他: {state.otherHits}</span>
      </div>

      {/* 表示率のバー。のこり1こでバーの先がきらめく */}
      <div
        className="mt-2 h-3 w-full overflow-hidden rounded-full border border-white bg-[#e4eef3] shadow-inner"
        role="progressbar"
        aria-valuenow={rate}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className={`h-full rounded-full ${left === 1 ? "animate-pulse" : ""}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, rate)}%` }}
          style={{ background: cleared ? "var(--color-leaf)" : "var(--color-sky)" }}
        />
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          key={`input-${shake}`}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="聞こえた ことばを 入力… （Enterで はんてい）"
          aria-label="聞こえた ことばを 入力する"
          className={`text-ink w-full rounded-[var(--radius-button)] border-2 bg-white px-4 py-2.5 font-bold ${
            shake > 0 && latest && latest.points === 0 ? "shake-input" : ""
          }`}
          style={{ borderColor: "var(--color-hairline)" }}
        />
        <button type="submit" className="btn-island btn-game shrink-0 px-6 py-2.5 text-sm">
          はんてい
        </button>
      </form>

      {/* 入力の履歴（旧アプリの result-log） */}
      {state.log.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {state.log.map((entry, i) => (
            <motion.li
              key={`${entry.input}-${state.log.length - i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-sm font-bold"
            >
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-black text-white"
                style={{ background: BADGE[entry.kind].color }}
              >
                {BADGE[entry.kind].label}
              </span>
              <span className="text-ink">{entry.input}</span>
              {entry.keywords.length > 0 && (
                <span className="text-ink-soft text-xs">{entry.keywords.join(" ＋ ")}</span>
              )}
              {entry.points > 0 && (
                <span className="ml-auto font-black text-[#f0a819]">+{entry.points}</span>
              )}
            </motion.li>
          ))}
        </ul>
      )}

      {state.misses >= MAX_MISS && !cleared && (
        <p className="text-ink-soft mt-3 text-sm font-bold">
          もういちど 聞いてみよう。🔊 を おして、はじめから きけるよ。
        </p>
      )}

      {/* 原稿。当てた場所だけが見えてくる */}
      <p
        className="border-hairline bg-panel-tint mt-4 rounded-[var(--radius-card)] border-2 p-4 leading-loose font-bold break-words whitespace-pre-wrap"
        aria-label="原稿"
      >
        {[...state.transcript].map((char, i) =>
          state.revealed.has(i) ? (
            <span key={i} className="text-ink">
              {char}
            </span>
          ) : (
            <span
              key={i}
              className="rounded-[3px]"
              style={{ background: "var(--color-hairline)", color: "transparent" }}
              aria-hidden
            >
              {char === "\n" ? "\n" : "　"}
            </span>
          ),
        )}
      </p>

      {cleared && (
        <p className="text-leaf-deep mt-3 text-center font-extrabold">
          🎉 原稿が {goal}% ひらいたよ！
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {latest ? `${latest.input}: ${BADGE[latest.kind].label} ${latest.points}点` : ""}
      </p>

      {/* ふりがな用の辞書を使う場面（キーワード一覧のヒント表示） */}
      {left > 0 && state.foundKeywords.length > 0 && (
        <p className="text-ink-faint mt-3 text-xs font-bold">
          見つけた:{" "}
          {state.foundKeywords.map((kw) => (
            <span key={kw} className="mr-2">
              <RubyText text={kw} index={furigana} />
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/** 判定ごとのバッジ。文言は原典の言い回しに合わせる。 */
const BADGE: Record<HitKind, { label: string; color: string }> = {
  keyword: { label: "キーワード！", color: "#3aa458" },
  hiragana: { label: "よみで せいかい", color: "#0272ae" },
  contains: { label: "を ふくむ！", color: "#3aa458" },
  close: { label: "おしい！", color: "#f0a819" },
  partial: { label: "本文に ある", color: "#8d6ae8" },
  tooShort: { label: "みじかいよ", color: "#9db0c2" },
  miss: { label: "まだ 出ていないみたい", color: "#9db0c2" },
};

function Stat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="border-hairline rounded-[16px] border-2 bg-white px-2 py-1.5 text-center">
      <p className="text-ink-soft text-[10px] font-black tracking-wider">{label}</p>
      <p className="text-lg leading-none font-black" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
