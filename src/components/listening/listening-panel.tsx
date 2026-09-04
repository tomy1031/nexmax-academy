"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { RubyText } from "@/components/ruby-text";
import { annotateRuby, type FuriganaIndex } from "@/lib/text/furigana";
import { readListeningFinds, saveListeningFinds } from "@/lib/progress/store";
import {
  createListening,
  remainingKeywords,
  replayListening,
  revealRate,
  submitListening,
  type HitKind,
  type ListeningRules,
  type ListeningState,
} from "./listening-checks";

/**
 * 聞き取りチェック。旧アプリと同じく **入力欄はひとつ**。
 *
 * 入れた言葉が キーワードか／キーワードを含むか／本文にあるか で
 * 点数と文言が変わり、当たった箇所の原稿がその場で開く。
 *
 * ## 一度ひらいた原稿は ひらいたまま
 * 当てた言葉をこの端末に残し、次に来たときに流し込み直す
 *（listening-checks の replayListening）。保存するのは**開いた位置ではなく
 * 入力した言葉**——位置は台本を1文字直すだけでずれる。
 * DBには置かない。消えても学習が止まらない種類のデータである。
 */
export function ListeningPanel({
  contentId,
  transcript,
  keywords,
  rules,
  goal,
  showTranscript,
  furigana,
  onChange,
}: {
  /** 保存のキー（この教材のID）。 */
  contentId: string;
  transcript: string;
  keywords: readonly string[];
  rules: ListeningRules;
  goal: number;
  /** 原稿そのものを出すか。既定では出さない（見えていると聞く練習にならない）。 */
  showTranscript: boolean;
  furigana: FuriganaIndex;
  onChange?: (state: ListeningState) => void;
}) {
  const [state, setState] = useState<ListeningState>(() =>
    // 前に当てた言葉を流し込んで、続きから始める
    replayListening(
      // 読み辞書を 渡す —— これが 無いと ひらがなで 打っても 当たらない
      createListening(transcript, keywords, rules, furigana),
      readListeningFinds(contentId),
    ),
  );
  const [value, setValue] = useState("");
  /**
   * 当たらなかったときに 入力欄を 小さく 首ふりさせるか（減点はしない）。
   *
   * 以前は `key` を 変えて 入力欄を 作り直して いた。作り直すと **スマホの
   * キーボードが 閉じる**ので、外すたびに 画面の 下から 打ち直しに なった。
   * いまは class を 付け外しするだけで、入力欄は そのまま 残す。
   */
  const [shaking, setShaking] = useState(false);
  const notified = useRef<ListeningState | null>(null);

  // 表示率は外（つぎへの関所）でも使う。描画のたびに呼ばないよう、変わったときだけ渡す
  useEffect(() => {
    if (notified.current === state) return;
    notified.current = state;
    onChange?.(state);
  }, [state, onChange]);

  const rate = revealRate(state);
  const left = remainingKeywords(state);
  const latest = state.log[0];
  const cleared = rate >= goal;

  const submit = () => {
    const next = submitListening(state, value);
    const entry = next.log[0];
    if (next !== state) {
      setState(next);
      saveListeningFinds(contentId, next.usedInputs);
    }
    /*
     * **当たらなかった ときも 入力を 消す**（2026-09-04 の 指定）。
     * 前は 残して いた——首を ふるだけ だったので、学習者は 消してから 打ち直す
     * ことに なり、次の ことばを 入れる のに 手間が 1つ 増えて いた。
     */
    if (
      entry &&
      (entry.kind === "miss" ||
        entry.kind === "partway" ||
        entry.kind === "romaji" ||
        entry.kind === "tooShort" ||
        entry.kind === "close")
    ) {
      setShaking(true);
    }
    setValue("");
  };

  return (
    <section className="card-island p-5">
      <h3 className="text-ink font-extrabold">🔍 聞こえた ことばを 入れてみよう</h3>
      {/*
        何文字から受けつけるかを、押す前に言う。N4以下の学習者は
        「みじかいよ」と言われても、何文字なら よいのかが分からない。
      */}
      <p className="text-ink-soft mt-1 text-sm font-bold">
        ひらがなだけの ときは <b>{rules.minLength}文字いじょう</b> 入れてください。ながい ことばほど
        てんすうが 高いです。
      </p>

      {/* 旧アプリの score-bar 相当 */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="スコア" value={state.score} accent="#f0a819" />
        <Stat label="ひらいた ぶん" value={`${rate}%`} accent="#0272ae" />
        <Stat label="のこり" value={`${left}こ`} accent="#f26fa7" />
        {/*
          「ミス 10 / 3」は不自然だった。3は「ここまで来たらヒントを出す」目安で、
          上限ではない。分母を出さず、目安に届いたことだけ色で伝える。
        */}
        <Stat
          label="ミス"
          value={`${state.misses}かい`}
          accent={state.misses >= rules.maxMiss ? "#f2654a" : "#5a7089"}
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
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // 首ふりが おわったら class を 外す。つぎに 外した ときに もう一度 動く
          onAnimationEnd={() => setShaking(false)}
          autoComplete="off"
          spellCheck={false}
          placeholder={`きこえた ことば（${rules.minLength}文字いじょう）`}
          aria-label="聞こえた ことばを 入力する"
          className={`text-ink min-w-0 flex-1 rounded-[var(--radius-button)] border-2 bg-white px-4 py-2.5 font-bold ${
            shaking ? "shake-input" : ""
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
              className="flex flex-wrap items-center gap-2 text-sm font-bold"
            >
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-black text-white"
                style={{ background: BADGE[entry.kind].color }}
              >
                {BADGE[entry.kind].label}
              </span>
              <span className="text-ink break-words">{entry.input}</span>
              {entry.keywords.length > 0 && (
                <span className="text-ink-soft text-xs break-words">
                  {entry.keywords.join(" ＋ ")}
                </span>
              )}
              {/* 外れた ときの 手がかり（どこまで 合って いたか・ローマ字だ、など） */}
              {entry.hint && (
                <span className="text-ink-soft w-full text-xs font-bold break-words">
                  {entry.hint}
                </span>
              )}
              {entry.points > 0 && (
                <span className="ml-auto font-black text-[#f0a819]">+{entry.points}</span>
              )}
            </motion.li>
          ))}
        </ul>
      )}

      {state.misses >= rules.maxMiss && !cleared && (
        <p className="text-ink-soft mt-3 text-sm font-bold">
          もういちど 聞いてみよう。上の ▶ を おすと、はじめから きけます。
        </p>
      )}

      {/*
        原稿。既定では出さない——見えていると読む練習になってしまう。
        「げんこう ON」にしたときだけ、当てた場所が見えてくる形で出す。
      */}
      {showTranscript ? (
        <p
          className="border-hairline bg-panel-tint mt-4 rounded-[var(--radius-card)] border-2 p-4 leading-loose font-bold break-words whitespace-pre-wrap"
          aria-label="原稿"
        >
          <RevealedScript
            transcript={state.transcript}
            revealed={state.revealed}
            furigana={furigana}
          />
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {latest ? `${latest.input}: ${BADGE[latest.kind].label} ${latest.points}点` : ""}
      </p>

      {/* 見つけた ことば。原稿を出していなくても、成果は見えるようにする */}
      {state.foundKeywords.length > 0 && (
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
  /*
   * さっき 打った ことば。**「まだ 出ていないみたい」と 言わない**——
   * 1回目に「本文に ある」と 言った ばかりの ことばに それを 言うと 嘘に なる
   *（2026-09-04 の 指摘）。
   */
  repeat: { label: "もう 見つけたよ", color: "#0272ae" },
  /*
   * 「まだ 出ていないみたい」1つに まとめて いた のを、**理由ごとに 割った**
   *（2026-09-04 の 指摘「意味不明」）。学習者に 要るのは 否定では なく
   * **打ち直す 手がかり**なので、どこまで 合って いたかも 出す（entry.hint）。
   */
  partway: { label: "とちゅうまで 合ってる", color: "#f0a819" },
  romaji: { label: "ローマ字みたい", color: "#f0a819" },
  miss: { label: "本文に 出てこない", color: "#9db0c2" },
};

/**
 * 穴埋めの 原稿。**開いた ことばには ふりがなを 出す**（2026-09-04 の 指定
 *「文章は 漢字主体（ふりがなあり表示）が よい かも」）。
 *
 * ## なぜ 1文字ずつでは 足りないのか
 * 前は 1文字ずつ 出して いた。開いて いく 仕組みには それで よいが、
 * **ルビは ことば 単位でしか 振れない**ので、漢字が 裸の まま 出て いた——
 * 漢字主体で 原稿を 書くと、そこで 読めなく なる（規律2）。
 *
 * そこで 読み辞書で **ことばに 割ってから** 出し、
 * **その ことばが まるごと 開いた ときだけ** ルビを 振る。
 * 半分 開いた ことばに 読みを 付けると、**まだ 当てて いない ぶんの 答えを 見せて しまう**。
 */
function RevealedScript({
  transcript,
  revealed,
  furigana,
}: {
  transcript: string;
  revealed: ReadonlySet<number>;
  furigana: FuriganaIndex;
}) {
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [index, segment] of annotateRuby(transcript, furigana).entries()) {
    const start = at;
    const chars = [...segment.text];
    const whole = chars.every((_, k) => revealed.has(start + k));
    if (segment.reading && whole) {
      out.push(
        <ruby key={`r${index}`} className="text-ink">
          {segment.text}
          <rt className="text-[0.6em] font-bold">{segment.reading}</rt>
        </ruby>,
      );
    } else {
      chars.forEach((char, k) => {
        const i = start + k;
        out.push(
          revealed.has(i) ? (
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
        );
      });
    }
    at += segment.text.length;
  }
  return <>{out}</>;
}

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
