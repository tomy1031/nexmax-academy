"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Scenario } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import type { FeedbackKey } from "@/lib/feedback";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { CaptionBar, MeetingShell, MeetingNotReady } from "./meeting-shell";
import { resolveMatch } from "./req-matcher";
import { useLiveSession } from "./use-live-session";

/**
 * Live対話モード — 同じ Zoom風シェルの中で、お客さま役のAIと日本語で話す。
 *
 * 要件ボードは最初「？？？」で伏せてあり、聞き出せた項目だけが開く。
 * 判定は3層（AI → ローカルのキーワード救済 → 手動）で、AIの誤判定で
 * 正しい質問が却下されないようにする（設計01 §3）。
 */
export function LiveMeeting({ scenario }: { scenario: Scenario }) {
  const furigana = useMemo(() => buildFuriganaIndex(scenario.furigana ?? []), [scenario.furigana]);
  const live = useLiveSession();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // 画面に出す文言は型付きキーだけ（自由文字列を書けなくする — 設計03 §1.3-1）
  const [note, setNote] = useState<FeedbackKey | null>(null);
  const [draft, setDraft] = useState("");

  const participants = useMemo(
    () => [
      {
        id: "client",
        name: scenario.client.name,
        role: scenario.client.role,
        accent: "leaf" as const,
      },
    ],
    [scenario.client],
  );

  /** 発話を判定し、開いた項目があればボードをめくる。 */
  const judge = (utterance: string, aiReqId: string | null = null) => {
    const outcome = resolveMatch({
      utterance,
      reqs: scenario.interview.reqs,
      openIds: open,
      aiReqId,
    });
    if (outcome.reqId) {
      setOpen((prev) => new Set([...prev, outcome.reqId!]));
      setNote("meeting.itemFound");
    } else {
      setNote("meeting.offTopic");
    }
  };

  const askable = scenario.interview.reqs.filter((r) => !open.has(r.id));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/meeting" className="text-ink-soft hover:text-navy text-sm font-extrabold">
          ← ミーティング 一覧
        </Link>
        <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
          {scenario.emoji} {scenario.title}
        </span>
      </header>

      <MeetingShell
        title={scenario.title}
        focus={scenario.mission.goal}
        participants={participants}
        activeSpeaker={live.status === "live" ? "client" : null}
        onLeft={live.disconnect}
        controls={
          <div className="card-pop flex flex-wrap items-center gap-2 p-3">
            {live.status === "idle" && (
              <button
                type="button"
                onClick={() => void live.connect(scenario.interview.persona)}
                className="btn-game px-6 py-2.5 text-sm"
              >
                🎙️ 話しはじめる
              </button>
            )}
            {live.status === "connecting" && (
              <span className="text-ink-soft text-sm font-extrabold">つないでいます…</span>
            )}
            {live.status === "live" && (
              <>
                <span className="bg-leaf/15 text-leaf-deep rounded-full px-3 py-1 text-xs font-extrabold">
                  ● つながっています
                </span>
                <button
                  type="button"
                  onClick={live.disconnect}
                  className="btn-game px-4 py-2 text-xs"
                  style={
                    { "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties
                  }
                >
                  <span className="text-ink">いったん とめる</span>
                </button>
              </>
            )}
            {live.status === "error" && (
              <span className="text-coral-deep text-sm font-extrabold">
                つながりませんでした。もう一度 ためしてね
              </span>
            )}
          </div>
        }
      >
        {live.status === "notReady" ? (
          <MeetingNotReady />
        ) : (
          <>
            {/* 文字起こしは必ず見せる（AIの誤判定を目で確かめられるように） */}
            <section className="flex flex-col gap-2">
              {live.transcript.slice(-4).map((turn, i) => (
                <CaptionBar
                  key={i}
                  speaker={turn.from === "me" ? "あなた" : scenario.client.name}
                  text={turn.text}
                />
              ))}
            </section>

            {/* 文字でも聞ける（音声が使えない環境でも学習を止めない） */}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                live.send(draft);
                judge(draft);
                setDraft("");
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="しつもんを 書いて 送る"
                aria-label="しつもんを 入力する"
                className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 font-bold"
              />
              <button type="submit" className="btn-game shrink-0 px-6 py-2.5 text-sm">
                きく
              </button>
            </form>

            {note && <FeedbackMessage messageKey={note} />}
          </>
        )}

        {/* 要件ボード（？？？フリップ） */}
        <section className="card-pop p-5">
          <h3 className="text-ink font-extrabold">
            📋 聞き出すこと（{open.size} / {scenario.interview.reqs.length}）
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {scenario.interview.reqs.map((req) => {
              const isOpen = open.has(req.id);
              return (
                <motion.li
                  key={req.id}
                  layout
                  className="border-hairline rounded-[var(--radius-card)] border-2 px-3 py-2"
                  style={{ background: isOpen ? "var(--color-sky-soft)" : "var(--color-panel)" }}
                >
                  <p className="text-ink text-sm font-extrabold">
                    <span className="mr-1">{req.icon}</span>
                    <RubyText text={req.label} index={furigana} />
                  </p>
                  <p className="text-ink-soft mt-0.5 text-sm font-bold">
                    {isOpen ? <RubyText text={req.secret} index={furigana} /> : "？？？"}
                  </p>
                </motion.li>
              );
            })}
          </ul>

          {askable.length > 0 && (
            <details className="mt-3">
              <summary className="text-sky cursor-pointer text-sm font-extrabold">
                こう聞いてみよう（ヒント）
              </summary>
              <p className="text-ink-soft mt-2 text-sm font-bold">
                <RubyText text={askable[0]!.hint} index={furigana} />
              </p>
            </details>
          )}
        </section>
      </MeetingShell>
    </div>
  );
}
