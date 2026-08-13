"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Meeting } from "@/content/schema";
import { CallShell, CaptionBar } from "@/components/call-shell";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { normalizeReading } from "@/lib/text/normalize";
import { recordContentProgress } from "@/lib/progress/store";
import { checkJapanese, coreOf, type AdviceText } from "./japanese-check";

/**
 * ミーティング — Zoom風の画面で、相手の質問に自分の日本語で答える。
 *
 * ## ねらいは2つある
 * 1. **Zoomの操作に慣れる**。ノックして入り、カメラとマイクを見て、お礼を言って出る。
 *    日本の会社で最初に出会う道具なので、日本語より先に画面で詰まらせない。
 * 2. **話が続く形を覚える**。相手は必ず**おうむ返し＋共感**で受けてから次を聞く。
 *    「言った → 受け取ってもらえた」が毎回起きると、次を話す気になる（設計01 P7）。
 *
 * ## 判定はしない（詰まらせない）
 * 自己紹介に正解は無い。`keywords` に当たれば ひとこと足すが、**当たらなくても先へ進む**。
 * ここで止めると、いちばん助けが要る学習者だけが会話を終われなくなる。
 * 代わりに日本語の助言（`japanese-check.ts`）を毎回1つだけ返す。
 */
export function MeetingSession({
  meeting,
  /** ステージの枠の中に置くとき。戻り先は枠が持つ。 */
  embedded = false,
}: {
  meeting: Meeting;
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(meeting.furigana ?? []), [meeting.furigana]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [hintShown, setHintShown] = useState(false);
  /** 直前の答えに対する受け答え。null なら まだ答えていない。 */
  const [reply, setReply] = useState<{ echo: string; advice: AdviceText } | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);

  const question = meeting.questions[index];
  const done = index >= meeting.questions.length;

  const submit = useCallback(() => {
    if (!question) return;
    const advice = checkJapanese(draft).text;
    // 何も書いていないときは進めない（会話にならない）。助言だけ返す
    if (draft.trim().length === 0) {
      setReply({ echo: "", advice });
      return;
    }
    const core = coreOf(draft);
    const hit =
      question.keywords.length === 0 ||
      question.keywords.some((kw) => normalizeReading(draft).includes(normalizeReading(kw)));
    setReply({
      echo: question.echo.replaceAll("◯◯", core || draft.trim()),
      advice: hit ? advice : advice,
    });
    setAnswers((prev) => [...prev, draft.trim()]);
  }, [draft, question]);

  const next = useCallback(() => {
    const at = index + 1;
    setIndex(at);
    setDraft("");
    setHintShown(false);
    setReply(null);
    recordContentProgress(meeting.id, {
      status: at >= meeting.questions.length ? "completed" : "started",
      position: { panel: at },
    });
  }, [index, meeting.id, meeting.questions.length]);

  const body = done ? (
    <div className="card-island space-y-3 p-5">
      <p className="text-navy text-lg font-black">
        <RubyText text={meeting.closing} index={furigana} show />
      </p>
      <div className="bg-panel-tint rounded-[var(--radius-card)] p-4">
        <p className="text-ink-soft text-xs font-extrabold">きょう 話した こと</p>
        <ul className="mt-2 space-y-1">
          {answers.map((a, i) => (
            <li key={i} className="text-ink text-sm font-bold break-words">
              ・{a}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ) : (
    <div className="space-y-3">
      <CaptionBar
        speaker={meeting.host.name}
        text={<RubyText text={question!.ask} index={furigana} show />}
      />

      {reply ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-island space-y-2 p-4"
        >
          {reply.echo ? (
            <p className="text-ink font-bold break-words">
              <span className="text-sky mr-2 text-xs font-extrabold">{meeting.host.name}</span>
              <RubyText text={reply.echo} index={furigana} show />
            </p>
          ) : null}
          <p className="text-leaf text-sm font-extrabold">🌸 {reply.advice.praise}</p>
          {reply.advice.fix ? (
            <p className="text-ink-soft text-sm font-bold break-words">💡 {reply.advice.fix}</p>
          ) : null}
          {reply.advice.example ? (
            <p className="bg-panel-tint text-ink rounded-xl px-3 py-2 text-sm font-bold break-words">
              こう 言うと もっと いいです →「{reply.advice.example}」
            </p>
          ) : null}
        </motion.div>
      ) : null}

      {hintShown ? (
        <p className="bg-sun-soft text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-bold break-words">
          ヒント：
          <RubyText text={question!.hint} index={furigana} show />
        </p>
      ) : null}
    </div>
  );

  const controls = done ? null : (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (reply && reply.echo) next();
        else submit();
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="日本語で 答えて ください"
        aria-label="こたえを 入力する"
        className="border-hairline text-ink min-w-0 flex-1 rounded-full border-2 bg-white px-4 py-2 font-bold"
      />
      {!hintShown ? (
        <button
          type="button"
          onClick={() => setHintShown(true)}
          className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-2 text-sm font-black"
        >
          ヒント
        </button>
      ) : null}
      <button type="submit" className="btn-game px-5 py-2 text-sm">
        {reply && reply.echo ? "つぎへ →" : "はなす"}
      </button>
    </form>
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <CallShell
        title={meeting.title}
        focus={meeting.focus}
        participants={[meeting.host]}
        activeSpeaker={reply ? meeting.host.id : null}
        controls={controls}
      >
        {body}
      </CallShell>
    </div>
  );
}
