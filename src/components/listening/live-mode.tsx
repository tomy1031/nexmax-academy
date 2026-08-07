"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Scenario } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import type { FeedbackKey } from "@/lib/feedback";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";
import { CaptionBar, CallShell } from "@/components/call-shell";
import { LiveReason } from "./live-reason";
import { resolveMatch } from "./req-matcher";
import { useLiveSession } from "./use-live-session";

/**
 * たいわ（Live対話）— 同じ Zoom風シェルの中で、お客さま役のAIと日本語で話す。
 *
 * リスニング（聞く教材）と枠を共有するが、学習者がすることは正反対（聞く／話す）。
 * 呼び名も行き先（/talk）も分けてある。混ぜると、学習者は聞くつもりで
 * マイクに向かうことになる。
 *
 * 要件ボードは最初「？？？」で伏せてあり、聞き出せた項目だけが開く。
 * 判定は3層（AI → ローカルのキーワード救済 → 手動）で、AIの誤判定で
 * 正しい質問が却下されないようにする（設計01 §3）。
 */
export function TalkSession({
  scenario,
  /**
   * ステージの枠（ContentFrame）の中に置くとき。自前の外枠と戻りリンクを出さない
   * ——戻り先は枠が持つ（教材ごとに戻り先が違うと、学習者は1本おわるたびに
   * 別の一覧へ放り出される）。
   */
  embedded = false,
}: {
  scenario: Scenario;
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(scenario.furigana ?? []), [scenario.furigana]);
  const live = useLiveSession();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // 画面に出す文言は型付きキーだけ（自由文字列を書けなくする — 設計03 §1.3-1）
  const [note, setNote] = useState<FeedbackKey | null>(null);
  const [draft, setDraft] = useState("");
  /**
   * いま出しているヒントの項目。
   *
   * 以前は「まだ聞けていない項目の**先頭**」を開きっぱなしで出していた。
   * それだと、上から順に読み上げるだけで全部そろってしまい、
   * 「自分で聞き出す」練習にならない。押したときに、まだ聞けていない中から
   * ひとつだけ出す。
   */
  const [hintId, setHintId] = useState<string | null>(null);

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
      setNote("talk.itemFound");
    } else {
      setNote("talk.offTopic");
    }
  };

  // ステージの進み具合に反映する（設計07 §3）。退出まで行ったら「おわった」。
  useEffect(() => {
    recordContentProgress(scenario.id, { status: "started" });
  }, [scenario.id]);

  const handleLeft = useCallback(() => {
    live.disconnect();
    recordContentProgress(scenario.id, { status: "completed" });
  }, [live, scenario.id]);

  const askable = scenario.interview.reqs.filter((r) => !open.has(r.id));
  // 聞き出せた項目のヒントは引っこめる（もう要らないものが残っていると、
  // 「まだ聞けていない」と勘違いする）
  const hint = askable.find((req) => req.id === hintId) ?? null;

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {embedded ? null : (
        <header className="mb-5 flex items-center justify-between gap-3">
          {/*
            たいわ だけの 一覧は まだ 無く、/listening が「きく」と「はなす」の
            両方の 入口を 兼ねている。だから ここでは 種別の名前を 言い切らない
            （「リスニング 一覧」と 書くと、たいわ から 戻る 先の 名前が ずれる）。
          */}
          <Link href="/listening" className="text-ink-soft hover:text-navy text-sm font-extrabold">
            ← いちらんに もどる
          </Link>
          <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
            {scenario.emoji} {scenario.title}
          </span>
        </header>
      )}

      <CallShell
        title={scenario.title}
        focus={scenario.mission.goal}
        participants={participants}
        activeSpeaker={live.status === "live" ? "client" : null}
        onLeft={handleLeft}
        controls={
          <div className="card-island flex flex-wrap items-center gap-2 p-3">
            {live.status === "idle" && (
              <button
                type="button"
                onClick={() => void live.connect(scenario.interview.persona)}
                className="btn-island btn-game px-6 py-2.5 text-sm"
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
                  className="btn-island btn-game px-4 py-2 text-xs"
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
                つながりませんでした。下に りゆうが 出ています
              </span>
            )}
          </div>
        }
      >
        {live.status === "notReady" || live.status === "error" ? (
          <LiveReason reason={live.reason} />
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
              <button type="submit" className="btn-island btn-game shrink-0 px-6 py-2.5 text-sm">
                きく
              </button>
            </form>

            {note && <FeedbackMessage messageKey={note} />}
          </>
        )}

        {/* 要件ボード（？？？フリップ） */}
        <section className="card-island p-5">
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
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  // まだ聞けていないものから ひとつ。同じものが続かないよう、
                  // いま出しているものは候補から外す。
                  const pool = askable.filter((req) => req.id !== hintId);
                  const from = pool.length > 0 ? pool : askable;
                  setHintId(from[Math.floor(Math.random() * from.length)]!.id);
                }}
                className="btn-game px-4 py-2 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
              >
                💡 ヒントを 1つ もらう（のこり {askable.length}）
              </button>
              {hint && (
                <p className="bg-panel-tint text-ink mt-2 rounded-2xl px-4 py-2 text-sm font-bold">
                  <span className="mr-1">{hint.icon}</span>
                  <RubyText text={hint.hint} index={furigana} />
                </p>
              )}
            </div>
          )}
        </section>
      </CallShell>
    </div>
  );
}
