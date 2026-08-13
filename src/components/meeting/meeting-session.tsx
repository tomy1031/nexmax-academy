"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Meeting } from "@/content/schema";
import { CallShell, CaptionBar } from "@/components/call-shell";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, kanaOf } from "@/lib/text/furigana";
import { MAX_ATTEMPTS, type JudgeResult } from "@/lib/meeting/judge";
import { recordMeetingTurn } from "@/lib/meeting/log";
import { getProfile } from "@/lib/profile";
import { recordContentProgress } from "@/lib/progress/store";
import { checkJapanese, coreOf, type AdviceText } from "./japanese-check";
import { judgeFailNote, requestJudge } from "./judge-api";
import { JudgeCard } from "./judge-card";
import { VisemeFace, type Viseme } from "./viseme-face";
import { useClipPlayer } from "./use-clip-player";
import { useLiveVoice } from "./use-live-voice";

/**
 * ミーティング — Zoom風の画面で、相手の質問に自分の日本語で答える。
 *
 * ## ねらいは2つある
 * 1. **Zoomの操作に慣れる**。ノックして入り、カメラとマイクを見て、お礼を言って出る。
 * 2. **話が続く形を覚える**。相手は必ず受け取ってから次を聞く。
 *
 * ## 返事は AI が作る（テンプレートではない）
 * 以前は `echo` の `◯◯` を学習者の答えで置き換えていた。だから
 * 「どこから 来ましたか」に「うるさい」と答えると
 * 「うるさいですか。いい ところですね。」と返っていた——**噛み合っているかを
 * 誰も見ていなかった**。いまは `/api/meeting/judge` に通し、意味と形の2軸で見て、
 * すばらしい／つたわった／もう いちど を返す（src/lib/meeting/judge.ts）。
 *
 * ## 声でも 書いても、同じ会話になる
 * - Live につながっていれば、**書いて送っても相手は声で返す**（sendText）
 * - つながっていなければ、判定APIが返した `reply` を画面に出す
 * どちらの道でも、日本語の見かた（JudgeCard）は同じように出る。
 *
 * ## 詰まらせない
 * 言い直しは最大2回まで（`MAX_ATTEMPTS`）。そのあとは判定を残したまま必ず先へ進む。
 * ここが崩れると、いちばん助けが要る学習者だけが会話を終われなくなる。
 */

/** 相手の質問・受け答えの中で、学習者の呼び名に置きかわる目印。 */
const NAME_MARK = "◯◯";

/** 端末に保存された呼び名を読む（別のタブで変わったら追いつく）。 */
function subscribeToProfile(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readName(): string {
  return getProfile()?.displayName ?? "";
}
/** サーバでは端末の保存値が読めない。名前なしで描いて、画面が出てから差し替える。 */
function readNameOnServer(): string {
  return "";
}

/** 判定が使えなかったときの、規則ベースの助言（会話は止めない）。 */
interface Fallback {
  advice: AdviceText;
  note: string;
}

interface Reply {
  /** 相手の返事（画面に出す文）。Live が声で返しているときは空。 */
  echo: string;
  judge: JudgeResult | null;
  fallback: Fallback | null;
}

export function MeetingSession({
  meeting,
  /** 相手の声（人物カードの voice）。Live に渡して、まんがと同じ声で話させる。 */
  hostVoice,
  /** 相手の口パクの絵（人物カードの mouth）。無ければ置き場の決まりに従う。 */
  hostMouth,
  /** ステージの枠の中に置くとき。戻り先は枠が持つ。 */
  embedded = false,
}: {
  meeting: Meeting;
  hostVoice?: string;
  hostMouth?: Partial<Record<Viseme, string>>;
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(meeting.furigana ?? []), [meeting.furigana]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [hintShown, setHintShown] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [thinking, setThinking] = useState(false);
  /** 同じ質問への何回目の発話か（1始まり）。言い直しの上限に使う。 */
  const [attempt, setAttempt] = useState(1);
  const [answers, setAnswers] = useState<string[]>([]);
  /**
   * 学習者の呼び名。診断のときに決めた名前を、相手が呼べるようにする。
   *
   * 効果の中で読んで state に入れると、描画のたびに書き込みが連鎖する
   *（React Compiler が禁じる）。端末の保存値は「外の入れ物」なので、
   * 購読して読む形にする（マップの分身と同じやり方）。
   */
  const learnerName = useSyncExternalStore(subscribeToProfile, readName, readNameOnServer);
  const voice = useLiveVoice();
  /** 作り置きの音声（質問・おわりの ひとこと）。 */
  const clip = useClipPlayer();
  /** 判定ずみの発話ID（同じ発話を二度見ない）。 */
  const judgedRef = useRef(0);

  const question = meeting.questions[index];
  const done = index >= meeting.questions.length;
  const live = voice.status === "live";

  /** 呼び名を差し込む。名前がまだ無いときは「あなた」にする（◯◯のままにしない）。 */
  const withName = useCallback(
    (text: string) => text.replaceAll(NAME_MARK, learnerName || "あなた"),
    [learnerName],
  );

  const askText = question ? withName(question.ask) : "";

  /** いま読み上げている文（かな）。口の形はここから取る。 */
  const spokenKana = useMemo(() => {
    const text = reply?.echo || askText;
    return kanaOf(text, furigana) ?? text;
  }, [reply, askText, furigana]);

  /**
   * 相手（Live）に渡す指示。人格・きょう聞くこと・呼び名だけを渡す。
   *
   * **`judgePrompt` はここに入れない。** 入れると、相手が声で直しはじめ、
   * 画面の見かた（JudgeCard）と2人で別々のことを言う。相手は会話を続ける役、
   * 教えるのは画面の役、と分けておく（判定は /api/meeting/judge が持つ）。
   */
  const instruction = useMemo(
    () =>
      [
        meeting.persona,
        "",
        `話す 相手の 呼び名は「${learnerName || "あなた"}」です。名前で 呼んで ください。`,
        "きょう 聞く ことは つぎの とおりです。上から 順に 1つずつ 聞いて ください。",
        ...meeting.questions.map((q, i) => `${i + 1}. ${withName(q.ask)}`),
      ].join("\n"),
    [meeting, learnerName, withName],
  );

  /**
   * 1つの発話を見る。声でも文字でも、ここを通る。
   *
   * `spoken` が true のときは Live が声で返しているので、画面には返事を出さない
   *（同じキャラが2つの違うことを言うのを防ぐ）。
   */
  const judgeUtterance = useCallback(
    async (utterance: string, spoken: boolean) => {
      if (!question) return;
      const at = Date.now();
      setThinking(true);
      const result = await requestJudge({
        ask: withName(question.ask),
        hint: question.hint,
        keywords: question.keywords,
        judgePrompt: meeting.judgePrompt,
        hostName: meeting.host.name,
        learnerName,
        utterance,
        attempt,
      });
      setThinking(false);

      if (result.ok) {
        setReply({
          echo: spoken ? "" : result.judge.reply,
          judge: result.judge,
          fallback: null,
        });
        if (!result.judge.retry) setAnswers((prev) => [...prev, utterance]);
        void recordMeetingTurn({
          meetingId: meeting.id,
          questionId: question.id,
          attempt,
          mode: spoken ? "voice" : "text",
          utterance,
          judge: result.judge,
          fallback: "none",
          model: result.model,
          latencyMs: Date.now() - at,
        });
        return;
      }

      /*
       * AIに通せなかったとき。規則ベースの助言（ていねいさ・長さ・文の終わり）に落ちる。
       * 教材の `echo` はここでだけ使う——噛み合いを見ていないテンプレートなので、
       * 平常時の返事にはしない。
       */
      const advice = checkJapanese(utterance).text;
      setReply({
        echo: spoken ? "" : withName(question.echo).replaceAll(NAME_MARK, coreOf(utterance)),
        judge: null,
        fallback: { advice, note: judgeFailNote(result.reason) },
      });
      setAnswers((prev) => [...prev, utterance]);
      void recordMeetingTurn({
        meetingId: meeting.id,
        questionId: question.id,
        attempt,
        mode: spoken ? "voice" : "text",
        utterance,
        judge: null,
        fallback: result.reason,
        model: "",
        latencyMs: Date.now() - at,
      });
    },
    [question, meeting, attempt, learnerName, withName],
  );

  /**
   * 質問が変わったら、作り置きの音声を鳴らす。
   *
   * Live につながっているときは鳴らさない——相手が自分で質問を読むので、
   * 2つの声が重なる。つながっていない学習者（キーが無い・マイクが無い）にとっては、
   * ここが**唯一 声を聞ける場所**になる。
   */
  const clipUrl = done ? meeting.closingAudioUrl : question?.audioUrl;
  const playClip = clip.play;
  useEffect(() => {
    if (live || !clipUrl) return;
    playClip(clipUrl);
  }, [clipUrl, live, playClip]);

  // 声で話したぶんを見る。相手が話しはじめた合図で1つに束ねてから届く
  useEffect(() => {
    const heard = voice.lastUtterance;
    if (!heard || heard.id === judgedRef.current) return;
    judgedRef.current = heard.id;
    void judgeUtterance(heard.text, true);
  }, [voice.lastUtterance, judgeUtterance]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!question || thinking) return;
    // 何も書いていないときは、AIを呼ばずに同じ言葉で受ける（待たせない・毎回同じ）
    if (text.length === 0) {
      setReply({
        echo: "",
        judge: null,
        fallback: { advice: checkJapanese("").text, note: "" },
      });
      return;
    }
    setDraft("");
    // Live につながっていれば、書いた文でも相手は**声で**返す
    if (live) voice.sendText(text);
    void judgeUtterance(text, live);
  }, [draft, question, thinking, live, voice, judgeUtterance]);

  /** 同じ質問をもう一度。回数だけ増やして、質問は変えない。 */
  const retry = useCallback(() => {
    setAttempt((n) => Math.min(n + 1, MAX_ATTEMPTS));
    setReply(null);
    setDraft("");
  }, []);

  const next = useCallback(() => {
    const at = index + 1;
    setIndex(at);
    setDraft("");
    setHintShown(false);
    setReply(null);
    setAttempt(1);
    recordContentProgress(meeting.id, {
      status: at >= meeting.questions.length ? "completed" : "started",
      position: { panel: at },
    });
  }, [index, meeting.id, meeting.questions.length]);

  const askedRetry = reply?.judge?.retry === true;

  const body = done ? (
    <div className="card-island space-y-3 p-5">
      <p className="text-navy text-lg font-black">
        <RubyText text={withName(meeting.closing)} index={furigana} show />
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
        text={<RubyText text={askText} index={furigana} show />}
      />

      {voice.turns.length > 0 ? (
        <div className="card-island space-y-1 p-3">
          <p className="text-ink-soft text-xs font-extrabold">聞こえた ことば</p>
          {voice.turns.slice(-4).map((t, i) => (
            <p key={i} className="text-ink text-sm font-bold break-words">
              <span className={t.from === "me" ? "text-leaf mr-2" : "text-sky mr-2"}>
                {t.from === "me" ? "あなた" : meeting.host.name}
              </span>
              {t.text}
            </p>
          ))}
        </div>
      ) : null}

      {voice.status === "notReady" ? (
        <p className="bg-sun-soft text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-bold">
          {voice.reason === "noMic"
            ? "マイクが つかえません。下の 入力で 答えても だいじょうぶです。"
            : "声は まだ つかえません。下の 入力で 答えて ください。"}
        </p>
      ) : null}

      {thinking ? (
        <p className="bg-panel-tint text-ink-soft rounded-[var(--radius-card)] px-4 py-2 text-sm font-black">
          {meeting.host.name}さんが 聞いて います…
        </p>
      ) : null}

      {reply?.echo ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-island text-ink p-4 font-bold break-words"
        >
          <span className="text-sky mr-2 text-xs font-extrabold">{meeting.host.name}</span>
          {reply.echo}
        </motion.p>
      ) : null}

      {reply?.judge ? <JudgeCard judge={reply.judge} hostName={meeting.host.name} /> : null}

      {reply?.fallback ? (
        <div className="card-island space-y-2 p-4">
          <p className="text-leaf text-sm font-extrabold">🌸 {reply.fallback.advice.praise}</p>
          {reply.fallback.advice.fix ? (
            <p className="text-ink-soft text-sm font-bold break-words">
              💡 {reply.fallback.advice.fix}
            </p>
          ) : null}
          {reply.fallback.advice.example ? (
            <p className="bg-panel-tint text-ink rounded-xl px-3 py-2 text-sm font-bold break-words">
              こう 言うと もっと いいです →「{reply.fallback.advice.example}」
            </p>
          ) : null}
          {reply.fallback.note ? (
            <p className="text-ink-faint text-xs font-bold">{reply.fallback.note}</p>
          ) : null}
        </div>
      ) : null}

      {hintShown ? (
        <p className="bg-sun-soft text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-bold break-words">
          ヒント：
          <RubyText text={withName(question!.hint)} index={furigana} show />
        </p>
      ) : null}
    </div>
  );

  const controls = done ? null : (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (askedRetry) retry();
        else if (reply) next();
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
      {live ? null : (
        <button
          type="button"
          onClick={() => void voice.start(instruction, hostVoice)}
          disabled={voice.status === "connecting"}
          className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-2 text-sm font-black disabled:opacity-40"
        >
          {voice.status === "connecting" ? "つないで います…" : "🎤 声で 話す"}
        </button>
      )}
      {/* 作り置きの音がある質問は、何度でも聞き直せる（聞き取りは くり返しが効く） */}
      {clipUrl && !live ? (
        <button
          type="button"
          onClick={() => clip.play(clipUrl)}
          className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-2 text-sm font-black"
        >
          🔊 もう いちど 聞く
        </button>
      ) : null}
      {!hintShown ? (
        <button
          type="button"
          onClick={() => setHintShown(true)}
          className="border-hairline text-navy rounded-full border-2 bg-white px-4 py-2 text-sm font-black"
        >
          ヒント
        </button>
      ) : null}
      <button type="submit" disabled={thinking} className="btn-game px-5 py-2 text-sm">
        {askedRetry ? "もう いちど 言う" : reply ? "つぎへ →" : "はなす"}
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
        faces={{
          /*
           * 口の絵は**相手のIDから引く**（人物の id と同じ場所に置く決まり）。
           * ここを1人ぶん決め打ちにすると、先生がスタジオで別の相手の
           * ミーティングを作ったとき、顔だけヘンディさんのままになる。
           */
          [meeting.host.id]: (
            <VisemeFace
              dir={`/img/characters/${meeting.host.id}/mouth`}
              sources={hostMouth}
              utterance={spokenKana}
              /* 作り置きを鳴らしているあいだは そちらの音で 口を動かす */
              analyser={clip.playing ? clip.analyser : voice.analyser}
              alt={meeting.host.name}
            />
          ),
        }}
        controls={controls}
      >
        {body}
      </CallShell>
    </div>
  );
}
