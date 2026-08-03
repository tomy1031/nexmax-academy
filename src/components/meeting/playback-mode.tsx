"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Meeting } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";
import { CaptionBar, MeetingShell } from "./meeting-shell";
import { ListeningPanel } from "./listening-panel";

/**
 * 再生モード — Zoom風の画面で「聞く」教材。
 *
 * 音声（audioUrl）があれば速度を落として聞ける。無いときは台本を1行ずつ
 * 進める読み物として成立させる（音声はあとから差し込める）。
 *
 * 聞き取りチェックは旧アプリと同じく、入力欄ひとつ（ListeningPanel）。
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

  // ステージの進み具合に反映する（設計07 §3）。最後の行まで見たら「おわった」。
  const done = line >= meeting.script.length - 1;
  useEffect(() => {
    recordContentProgress(meeting.id, {
      status: done ? "completed" : "started",
      position: { line },
    });
  }, [meeting.id, done, line]);

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
          <div className="card-island flex flex-wrap items-center gap-2 p-3">
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
            className="btn-island btn-game px-5 py-2.5 text-sm disabled:opacity-40"
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
            className="btn-island btn-game px-5 py-2.5 text-sm disabled:opacity-40"
          >
            つぎ →
          </button>
        </div>

        <ListeningPanel
          transcript={meeting.script.map((l) => l.text).join("\n")}
          keywords={meeting.keywords}
          goal={meeting.revealGoal}
          furigana={furigana}
        />
      </MeetingShell>
    </div>
  );
}
