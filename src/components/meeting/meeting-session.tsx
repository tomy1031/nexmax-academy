"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Meeting } from "@/content/schema";
import { CallShell, CaptionBar } from "@/components/call-shell";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, kanaOf } from "@/lib/text/furigana";
import { MAX_ATTEMPTS, type JudgeResult } from "@/lib/meeting/judge";
import {
  awardAnswer,
  awardCompletion,
  EMPTY_AFFECTION,
  heartsOf,
  rewardOpen,
  type AffectionState,
} from "@/lib/meeting/affection";
import { recordMeetingTurn } from "@/lib/meeting/log";
import {
  readMeetingRecord,
  readMeetingRecordOnServer,
  saveMeetingRecord,
  shortAsk,
  subscribeMeetingRecord,
  type MeetingRecord,
} from "@/lib/meeting/record";
import { getProfile } from "@/lib/profile";
import { recordContentProgress } from "@/lib/progress/store";
import { AffectionMeter } from "./affection-meter";
import { checkJapanese, coreOf, type AdviceText } from "./japanese-check";
import { judgeFailNote, requestJudge } from "./judge-api";
import { JudgeCard } from "./judge-card";
import { QuestionBoard } from "./question-board";
import { MeetingResultCard, PreviousRecordCard, RewardCard } from "./result-card";
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
 *
 * ## 進み具合を「開く箱」で見せる（設計01 P2）
 * 画面の脇に **？？？ポイントボード**を置く。きょう聞かれることが伏せ札で並び、
 * 答えられた札だけがフリップして開く。何問めかを数字で言うより、
 * 「札が1枚 開いた」ほうが、次の一言を出す理由になる。
 *
 * ## 好感度は 教材が 決める（`meeting.affection` があるときだけ）
 * ハートは**上がるだけ**（P8）。点の配り方と閾値の判定は
 * `src/lib/meeting/affection.ts` の純粋な関数が持つ——ここに書くと、
 * 画面を直すたびに黙って基準が動き、テストで固定できない。
 *
 * ## おわりに 手が 空にならない（P13）
 * 話しきったら「きょう 話せた こと」を1枚のカードにして端末に残す。
 * 次に来たときは「まえの きろく」として読める。
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
  /**
   * 質問ID → 学習者が さいごに 言った ことば。
   *
   * 以前は配列に押し込んでいたが、言い直しや判定の落ちかたによって
   * 質問の並びと一致しなくなる（同じ質問で2つ入る・入らない質問がある）。
   * きろくカードは「どの質問に 何と 答えたか」を見せるものなので、質問IDで持つ。
   */
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>({});
  /** 開いた札（＝言い直しを求められずに 答えられた質問）。 */
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  /** いちばん最近ひらいた札。祝いの ✨ と 相手タイルの発光の的。 */
  const [justOpenedId, setJustOpenedId] = useState<string | null>(null);
  /** 好感度。教材に affection が無いときは触られないまま残る。 */
  const [affection, setAffection] = useState<AffectionState>(EMPTY_AFFECTION);
  /** いま増えたハート（メーターのポップ用）。つぎの質問へ行くと 0 に戻る。 */
  const [gained, setGained] = useState(0);
  /**
   * きょうの きろく。**話しきった ときに 1度だけ 組み立てる**。
   * 描画のたびに作ると日付が動き続けるし、保存したものと画面のものがずれる。
   */
  const [record, setRecord] = useState<MeetingRecord | null>(null);
  /**
   * 学習者の呼び名。診断のときに決めた名前を、相手が呼べるようにする。
   *
   * 効果の中で読んで state に入れると、描画のたびに書き込みが連鎖する
   *（React Compiler が禁じる）。端末の保存値は「外の入れ物」なので、
   * 購読して読む形にする（マップの分身と同じやり方）。
   */
  const learnerName = useSyncExternalStore(subscribeToProfile, readName, readNameOnServer);
  /**
   * 前に来たときの きろく。端末の保存値は「外の入れ物」なので購読して読む。
   * 出すのは会話の途中だけ——おわりの画面では、いま作ったカードのほうを見せる。
   */
  const previous = useSyncExternalStore(
    subscribeMeetingRecord,
    () => readMeetingRecord(meeting.id),
    readMeetingRecordOnServer,
  );
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
   * 1つの発話ぶんの「ごほうび」をまとめて更新する。
   *
   * 札を開くのは**言い直しを求められなかったとき**だけ（まだ直している最中に
   * 開くと、開いた札の意味が薄まる）。ハートは判定に関わらず足す——miss でも
   * 会話が前に進んだことは変わらないので（P8: 罰を見せない）。
   */
  const rewardTurn = useCallback(
    (
      questionId: string,
      utterance: string,
      grade: JudgeResult["grade"] | null,
      opened: boolean,
    ) => {
      setAnswers((prev) => ({ ...prev, [questionId]: utterance }));
      if (opened) {
        setOpenIds((prev) => new Set([...prev, questionId]));
        setJustOpenedId(questionId);
      }
      const next = awardAnswer(affection, questionId, grade);
      setAffection(next);
      setGained(heartsOf(next) - heartsOf(affection));
    },
    [affection],
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
        rewardTurn(question.id, utterance, result.judge.grade, !result.judge.retry);
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
      // 判定に通せなくても、答えた事実は残る。札は開き、ハートも足す
      rewardTurn(question.id, utterance, null, true);
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
    [question, meeting, attempt, learnerName, withName, rewardTurn],
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
    setGained(0);
  }, []);

  const next = useCallback(() => {
    const at = index + 1;
    const finishing = at >= meeting.questions.length;
    setIndex(at);
    setDraft("");
    setHintShown(false);
    setReply(null);
    setAttempt(1);
    setJustOpenedId(null);

    if (finishing) {
      // さいごまで話しきったぶんのハートと、手に残るきろくは ここで一度だけ作る
      const finished = awardCompletion(affection);
      setAffection(finished);
      setGained(heartsOf(finished) - heartsOf(affection));
      const today: MeetingRecord = {
        meetingId: meeting.id,
        at: new Date().toISOString(),
        lines: meeting.questions
          .filter((q) => (answers[q.id] ?? "") !== "")
          .map((q) => ({
            questionId: q.id,
            ask: shortAsk(withName(q.ask)),
            answer: answers[q.id] ?? "",
          })),
        hearts: meeting.affection ? heartsOf(finished) : undefined,
        maxHearts: meeting.affection?.maxHearts,
      };
      setRecord(today);
      // 保存が できない 端末（プライベートモード等）でも、画面の カードは 出る
      saveMeetingRecord(today);
    } else {
      setGained(0);
    }

    recordContentProgress(meeting.id, {
      status: finishing ? "completed" : "started",
      position: { panel: at },
    });
  }, [index, meeting, answers, affection, withName]);

  /** 伏せ札に出す並び。ラベルはきろくカードと同じ短縮を使う（同じ質問の名前をそろえる）。 */
  const boardItems = useMemo(
    () => meeting.questions.map((q) => ({ id: q.id, short: shortAsk(withName(q.ask)) })),
    [meeting.questions, withName],
  );

  /** いま持っているハート。教材に affection が無いときは画面のどこにも出ない。 */
  const hearts = heartsOf(affection);

  const askedRetry = reply?.judge?.retry === true;

  const main = done ? (
    <div className="space-y-3">
      <div className="card-island p-5">
        <p className="text-navy text-lg font-black">
          <RubyText text={withName(meeting.closing)} index={furigana} show />
        </p>
      </div>

      {record ? <MeetingResultCard record={record} furigana={furigana} /> : null}

      {/*
        とっておきの話は closing の あと。届かなかったときは 何も出さない
        ——「開かなかった箱」を見せるのは、この教材では 罰にしかならない（P8）。
      */}
      {meeting.affection && rewardOpen(affection, meeting.affection.threshold) ? (
        <RewardCard
          text={withName(meeting.affection.reward)}
          hostName={meeting.host.name}
          furigana={furigana}
        />
      ) : null}
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

  /*
   * 脇の列（広い画面では右、スマホでは会話の下）。
   * 会話そのものを上に置くのは、答えを入力する場所が いちばん 近くに あってほしいため。
   * 札のボードは <details> なので、どの画面でも たたんで しまえる。
   */
  const body = (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      {main}
      <aside className="space-y-3">
        {meeting.affection ? (
          <AffectionMeter
            hearts={hearts}
            maxHearts={meeting.affection.maxHearts}
            gained={gained}
            threshold={meeting.affection.threshold}
            hostName={meeting.host.name}
          />
        ) : null}
        <QuestionBoard
          items={boardItems}
          openIds={openIds}
          currentId={question?.id ?? null}
          justOpenedId={justOpenedId}
          furigana={furigana}
        />
        {/* まえの きろくは 会話の あいだ だけ。おわりの 画面では きょうの カードを 見せる */}
        {!done && previous && previous.lines.length > 0 ? (
          <PreviousRecordCard record={previous} furigana={furigana} />
        ) : null}
      </aside>
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
        /* 発光は学習行為に紐づける（札が開いた・ハートが増えた瞬間だけ光る） */
        celebrate={
          justOpenedId !== null || (meeting.affection && gained > 0) ? meeting.host.id : null
        }
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
