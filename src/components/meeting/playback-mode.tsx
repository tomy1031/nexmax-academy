"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Meeting } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import type { FeedbackKey } from "@/lib/feedback";
import { CaptionBar, MeetingShell } from "./meeting-shell";
import {
  createKeywordHunt,
  createReveal,
  revealRate,
  revealWith,
  submitKeyword,
  type KeywordHuntState,
  type RevealState,
} from "./listening-checks";

/**
 * 再生モード — Zoom風の画面で「聞く」教材。
 *
 * 音声（audioUrl）があれば速度を落として聞ける。無いときは台本を1行ずつ
 * 進める読み物として成立させる（音声はあとから差し込める）。
 *
 * 聞き取りチェックは旧アプリの2つを移植した:
 *   キーワード発見 / 隠し原稿リベール
 */
export function PlaybackMeeting({ meeting }: { meeting: Meeting }) {
  const furigana = useMemo(() => buildFuriganaIndex(meeting.furigana ?? []), [meeting.furigana]);
  const nameOf = useMemo(() => {
    const map = new Map(meeting.participants.map((p) => [p.id, p.name]));
    map.set("me", "あなた");
    map.set("narration", "せつめい");
    return map;
  }, [meeting.participants]);

  const [line, setLine] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [rate, setRate] = useState(0.85); // 既定は遅め（P10）
  const audioRef = useRef<HTMLAudioElement>(null);

  const current = meeting.script[line];

  const setSpeed = (value: number) => {
    setRate(value);
    // 速度を変えてもピッチは保つ（低い声にしない — 理解設計ガイド P10）
    if (audioRef.current) {
      audioRef.current.playbackRate = value;
      audioRef.current.preservesPitch = true;
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/meeting" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← ミーティング 一覧
        </Link>
        <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
          🎧 {meeting.title}
        </span>
      </header>

      <MeetingShell
        title={meeting.title}
        focus={meeting.focus}
        participants={meeting.participants}
        activeSpeaker={current?.speaker ?? null}
        controls={
          <div className="card-pop flex flex-wrap items-center gap-2 p-3">
            {meeting.audioUrl && (
              <audio ref={audioRef} src={meeting.audioUrl} controls className="w-full sm:w-auto" />
            )}
            <span className="text-ink-soft text-xs font-extrabold">はやさ</span>
            {[0.7, 0.85, 1].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpeed(value)}
                aria-pressed={rate === value}
                className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
                  rate === value
                    ? "bg-sky border-sky text-white"
                    : "border-hairline text-ink-soft bg-panel"
                }`}
              >
                {value === 1 ? "ふつう" : value === 0.85 ? "すこし ゆっくり" : "ゆっくり"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCaptionsOn((v) => !v)}
              className={`ml-auto rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
                captionsOn
                  ? "bg-sky border-sky text-white"
                  : "border-hairline text-ink-soft bg-panel"
              }`}
            >
              字幕 {captionsOn ? "ON" : "OFF"}
            </button>
          </div>
        }
      >
        {current && (
          <CaptionBar
            speaker={nameOf.get(current.speaker) ?? current.speaker}
            hidden={!captionsOn}
            text={<RubyText text={current.text} index={furigana} />}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={line === 0}
            onClick={() => setLine((i) => Math.max(0, i - 1))}
            className="btn-game px-5 py-2.5 text-sm disabled:opacity-40"
            style={{ "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties}
          >
            <span className="text-ink">← まえ</span>
          </button>
          <span className="text-ink-faint text-xs font-extrabold">
            {line + 1} / {meeting.script.length}
          </span>
          <button
            type="button"
            disabled={line >= meeting.script.length - 1}
            onClick={() => setLine((i) => Math.min(meeting.script.length - 1, i + 1))}
            className="btn-game px-5 py-2.5 text-sm disabled:opacity-40"
          >
            つぎ →
          </button>
        </div>

        {meeting.keywords.length > 0 && (
          <KeywordHunt keywords={meeting.keywords} furigana={furigana} />
        )}

        <TranscriptReveal meeting={meeting} goal={meeting.revealGoal} />
      </MeetingShell>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * キーワード発見
 * ------------------------------------------------------------------ */

function KeywordHunt({
  keywords,
  furigana,
}: {
  keywords: readonly string[];
  furigana: ReturnType<typeof buildFuriganaIndex>;
}) {
  const [state, setState] = useState<KeywordHuntState>(() => createKeywordHunt(keywords));
  const [feedback, setFeedback] = useState<FeedbackKey | null>(null);
  const [value, setValue] = useState("");

  const submit = useCallback(
    (input: string) => {
      const result = submitKeyword(state, input);
      setState(result.state);
      setFeedback(result.hit ? "listening.keywordFound" : "listening.keywordUnknown");
      if (result.hit) setValue("");
    },
    [state],
  );

  return (
    <section className="card-pop p-5">
      <h3 className="text-ink font-extrabold">🔍 聞こえた ことばを 入れてみよう</h3>
      <p className="text-ink-soft mt-1 text-sm font-bold">
        {state.found.length} / {keywords.length} こ　スコア {state.score}
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="きこえた ことば"
          aria-label="聞こえた ことばを 入力する"
          className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 font-bold"
        />
        <button type="submit" className="btn-game shrink-0 px-6 py-2.5 text-sm">
          さがす
        </button>
      </form>

      {feedback && <FeedbackMessage messageKey={feedback} className="mt-3" />}

      {state.found.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {state.found.map((word) => (
            <motion.li
              key={word}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-leaf/15 text-leaf-deep rounded-full px-3 py-1 text-sm font-extrabold"
            >
              ✓ <RubyText text={word} index={furigana} />
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * 隠し原稿リベール
 * ------------------------------------------------------------------ */

function TranscriptReveal({ meeting, goal }: { meeting: Meeting; goal: number }) {
  const transcript = useMemo(() => meeting.script.map((l) => l.text).join("\n"), [meeting.script]);
  const [state, setState] = useState<RevealState>(() => createReveal(transcript));
  const [value, setValue] = useState("");
  const rate = revealRate(state);
  const cleared = rate >= goal;

  const submit = (input: string) => {
    setState((prev) => revealWith(prev, input).state);
    setValue("");
  };

  return (
    <section className="card-pop p-5">
      <h3 className="text-ink font-extrabold">📜 かくれた 原稿を 出そう</h3>
      <p className="text-ink-soft mt-1 text-sm font-bold">
        聞こえた ことばを 入れると、その ところが 見えてくるよ（いま {rate}% ／ めやす {goal}%）
      </p>

      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--color-sky-soft)" }}
      >
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, rate)}%` }}
          style={{ background: cleared ? "var(--color-leaf)" : "var(--color-sky)" }}
        />
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="きこえた ことば"
          aria-label="原稿を 出す ことばを 入力する"
          className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 font-bold"
        />
        <button
          type="submit"
          className="btn-game shrink-0 px-6 py-2.5 text-sm"
          style={{ "--btn-face": "#8d6ae8", "--btn-shadow": "#7452cc" } as React.CSSProperties}
        >
          出す
        </button>
      </form>

      {cleared && <FeedbackMessage messageKey="listening.revealProgress" className="mt-3" />}

      <p
        className="border-hairline bg-panel-tint mt-3 rounded-[var(--radius-card)] border-2 p-4 leading-loose font-bold break-words whitespace-pre-wrap"
        aria-label="原稿"
      >
        {[...transcript].map((char, i) =>
          state.revealed.has(i) ? (
            <span key={i} className="text-ink">
              {char}
            </span>
          ) : (
            <span
              key={i}
              className="text-ink-faint/40 rounded-[3px]"
              style={{ background: "var(--color-hairline)" }}
              aria-hidden
            >
              {char === "\n" ? "\n" : "　"}
            </span>
          ),
        )}
      </p>
    </section>
  );
}
