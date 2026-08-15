"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Meeting } from "@/content/schema";
import { CallShell, CaptionBar } from "@/components/call-shell";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, kanaOf } from "@/lib/text/furigana";
import {
  hintPatterns,
  hintSegments,
  readHintShown,
  readHintShownOnServer,
  saveHintShown,
  subscribeHintShown,
} from "@/lib/meeting/hint";
import { MAX_ATTEMPTS, type JudgeResult } from "@/lib/meeting/judge";
import {
  awardAnswer,
  awardCompletion,
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
import { needsJapaneseInput } from "@/lib/meeting/input";
import {
  clearMeetingResume,
  restoreMeeting,
  saveMeetingResume,
  type MeetingStart,
} from "@/lib/meeting/resume";
import { fillAnswer, fillName } from "@/lib/meeting/speech";
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
 * ## 型文（かたぶん）は はじめから 見えている
 * 答え方の足場（`question.hint`）を「ヒント」ボタンの向こうに隠していたが、
 * 声で日本語を話すのが いちばん こわい学習者は、**ボタンの存在に気づかないまま固まる**。
 * だから既定で入力欄のすぐ上に出し、隠すかどうかは学習者が握るつまみにする
 *（設計05 §5.5 の初級＝常時表示／設計01 P11 の「負荷の調整装置は学習者の手に」）。
 * 選んだ状態は端末に残るので、次の質問でも 次の教材でも 追いかけてくる
 *（判定と保存は `src/lib/meeting/hint.ts`）。
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
 *
 * ## 途中で やめても、つづきから（`@/lib/meeting/resume`）
 * 進んだところを保存するだけで**読んでいなかった**ので、6問目まで進めて閉じた
 * 学習者は次に開くと1問目からだった。いまは 位置・開いた札・ハート・答えた
 * ことばを まとめて 戻す。完走したあとに開き直したときは はじめから 話せる。
 *
 * ## 差し込みの 役（`@/lib/meeting/speech`）
 * `ask` は 呼び名、`echo` は **学習者の答え**、`hint` は どちらでもない。
 * 1つの関数で 順に 置換すると 先に 呼び名が 全部 食べてしまう（実際に 起きていた）。
 */

/**
 * 画面の飾り（型文のボタン・見出し・見守りの ことば）に出る漢字の読み。
 *
 * 教材の読み辞書（`meeting.furigana`）は 教材の 本文の ための ものなので、
 * 画面が自分で出す語はここで覆う（規律2: 学習者が読む漢字を裸で出さない）。
 * 教材の索引と混ぜないのは、混ぜると教材側のルビの当たり方が変わるため。
 */
const CHROME_FURIGANA = buildFuriganaIndex([
  ["型文", "かたぶん"],
  ["日本語", "にほんご"],
  ["入力", "にゅうりょく"],
  ["言", "い"],
  ["見", "み"],
  ["書", "か"],
  ["文", "ぶん"],
]);

/**
 * 見守りの ことば（送る前に 気づいて ほしい こと）。
 *
 * 「不正解」ではなく **次の 一手**を書く。どちらも 画面から 消えるのは
 * 学習者が 次の 操作を した ときだけで、答えは 消さない（打ち直しに ならない）。
 */
const NOTICE = {
  empty: "だいじょうぶです。「こう 言えます」の 文を そのまま 書いても いいですよ。",
  latin: "キーボードが 日本語入力に なって いないかも しれません。たしかめて みましょう。",
} as const;
type NoticeKey = keyof typeof NOTICE;

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
  /*
   * 端末に 残って いる「いまの ところ」。**入室前（ロビー）は 何も 描かない**ので、
   * サーバで 描いた HTML と 食い違わない（ロビーの 中身は 保存値に 依らない）。
   * 保存値の 読み方は listening-panel と 同じ流儀（useState の 初期化で 1度だけ）。
   */
  const [start] = useState<MeetingStart>(() =>
    restoreMeeting(
      meeting.id,
      meeting.questions.map((q) => q.id),
    ),
  );
  const [index, setIndex] = useState(start.index);
  /** 途中から 戻って きた ことを 学習者に 伝えるか（1歩 進んだら 消す）。 */
  const [resumed, setResumed] = useState(start.resumed);
  const [draft, setDraft] = useState("");
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
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>(start.answers);
  /** 開いた札（＝言い直しを求められずに 答えられた質問）。 */
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(start.openIds));
  /** いちばん最近ひらいた札。祝いの ✨ と 相手タイルの発光の的。 */
  const [justOpenedId, setJustOpenedId] = useState<string | null>(null);
  /** 好感度。教材に affection が無いときは触られないまま残る。 */
  const [affection, setAffection] = useState<AffectionState>(start.affection);
  /** 送る前の 見守り（からっぽ・日本語入力で ない）。答えは 消さない。 */
  const [notice, setNotice] = useState<NoticeKey | null>(null);
  /**
   * 見守りを 出した ことば。**同じ ことばで もう一度 押したら そのまま 送る**。
   * ここを 止め続けると、ローマ字で しか 打てない 端末の 学習者が 進めなくなる
   *（見守りは 関所では なく 気づきの ひとこと）。
   */
  const [noticedText, setNoticedText] = useState<string | null>(null);
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
  /**
   * 型文を 見せるか。**既定は 見える**。
   *
   * state に持たない理由は2つある。①端末の保存値は「外の入れ物」なので購読して読む
   * ②state だと 質問が変わるたび・教材を開くたびに 初期値へ戻ってしまう
   *（前の実装は `next()` のたびに false に戻していた）。
   */
  const hintShown = useSyncExternalStore(subscribeHintShown, readHintShown, readHintShownOnServer);
  const voice = useLiveVoice();
  /** 作り置きの音声（質問・おわりの ひとこと）。 */
  const clip = useClipPlayer();
  /** 判定ずみの発話ID（同じ発話を二度見ない）。 */
  const judgedRef = useRef(0);

  const question = meeting.questions[index];
  const done = index >= meeting.questions.length;
  const live = voice.status === "live";

  /**
   * 呼び名を差し込む（`ask` / `closing` / `reward` 用）。
   * **`echo` には 通さない**——あちらの `◯◯` は 学習者の 答えの 場所（`fillAnswer`）。
   */
  const withName = useCallback((text: string) => fillName(text, learnerName), [learnerName]);

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
        /*
         * おうむ返しは **学習者の 答え**を 返す。ここで 呼び名を 差し込む 関数を
         * 通していた ため、`◯◯` が 先に 名前で 埋まり、相手が
         * 「そうです、ソピアですね。」と 名前を 答えとして 復唱していた。
         */
        echo: spoken ? "" : fillAnswer(question.echo, coreOf(utterance)),
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
    /*
     * 何も書いていないときは、AIを呼ばずに 見守りの ひとことを 出す（待たせない）。
     * ここで `reply` を 作って いた ころは、送りボタンが 「つぎへ →」に 変わり、
     * **書いて みましょうと 言った 直後に 書いた 答えが 捨てられて いた**。
     * 見守りは `reply` と 別の 入れ物で 持ち、ボタンは「はなす」の ままにする。
     */
    if (text.length === 0) {
      setNotice("empty");
      return;
    }
    /*
     * 日本語入力に なって いない ときだけ 声を かける（クイズの inspectReadingInput と
     * 同じ 配慮）。ミーティングの 答えは 漢字・カタカナ混じりが 正常なので、
     * 弾くのは「日本語の 文字が 1つも 無い」ときに 限る。
     * 同じ ことばで もう一度 押されたら そのまま 送る——止め続けない。
     */
    if (needsJapaneseInput(text) && noticedText !== text) {
      setNotice("latin");
      setNoticedText(text);
      return;
    }
    setNotice(null);
    setNoticedText(null);
    setDraft("");
    // Live につながっていれば、書いた文でも相手は**声で**返す
    if (live) voice.sendText(text);
    void judgeUtterance(text, live);
  }, [draft, question, thinking, live, voice, judgeUtterance, noticedText]);

  /** 同じ質問をもう一度。回数だけ増やして、質問は変えない。 */
  const retry = useCallback(() => {
    setAttempt((n) => Math.min(n + 1, MAX_ATTEMPTS));
    setReply(null);
    setDraft("");
    setNotice(null);
    setGained(0);
  }, []);

  const next = useCallback(() => {
    const at = index + 1;
    const finishing = at >= meeting.questions.length;
    setIndex(at);
    setDraft("");
    // 型文は ここで 隠さない。学習者が 決めた 見せ方は 質問を またいで 続く
    setReply(null);
    setAttempt(1);
    setJustOpenedId(null);
    setNotice(null);
    setNoticedText(null);
    setResumed(false);

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

  /**
   * 答えられない ときの 逃げ道。**札は 開かない**まま つぎの 質問へ。
   *
   * 空のまま「はなす」を押すと 実際には 進めたのに、画面には 助言しか 出ず
   * 「進める」とは どこにも 書いて いなかった。答えられない 学習者は そこで
   * 座り込む——90分の 授業では それが いちばん 起きる（P8: 詰まらせない）。
   */
  const skip = useCallback(() => {
    if (thinking) return;
    next();
  }, [thinking, next]);

  /**
   * いまの ところを 端末に 残す（つぎに 開いたとき つづきから 始めるため）。
   *
   * 保存だけを する 効果——ここで state を 読んで state に 書くと、描画のたびに
   * 書き込みが 連鎖する。話しきったら 消す：完走した 人が もう一度 開いたら
   * **はじめから 話せる**のが 正しい。
   */
  useEffect(() => {
    if (done) {
      clearMeetingResume(meeting.id);
      return;
    }
    if (index === 0 && openIds.size === 0 && Object.keys(answers).length === 0) return;
    saveMeetingResume({
      meetingId: meeting.id,
      index,
      openIds: [...openIds],
      answers,
      affection: { perQuestion: affection.perQuestion, finished: affection.finished },
    });
  }, [meeting.id, done, index, openIds, answers, affection]);

  /** 伏せ札に出す並び。ラベルはきろくカードと同じ短縮を使う（同じ質問の名前をそろえる）。 */
  const boardItems = useMemo(
    () => meeting.questions.map((q) => ({ id: q.id, short: shortAsk(withName(q.ask)) })),
    [meeting.questions, withName],
  );

  /**
   * いまの質問の型文。「そのまま 口に 出せる 文」の並びにして持つ。
   * **呼び名を差し込まない**（`withName` を通さない）——`hint` の `◯◯` は
   * 学習者が自分のことばを入れる穴で、名前の目印ではない。
   */
  const hintLines = useMemo(() => hintPatterns(question?.hint ?? ""), [question]);

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
      {/* 途中から 戻って きた ことを 先に 言う（同じ 質問が 出て 戸惑わない ように） */}
      {resumed ? (
        <p className="bg-cream border-hairline text-ink rounded-[var(--radius-card)] border-2 px-4 py-2 text-sm font-bold">
          🔖 まえの つづきから はじめます。
        </p>
      ) : null}

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
        /* bg-sun-soft は globals.css に 無い（＝色が つかない）。実在する トークンを 使う */
        <p className="bg-cream text-ink rounded-[var(--radius-card)] px-4 py-2 text-sm font-bold">
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
          {/*
            AIが 見られない あいだの ハートは ゆっくり（miss と 同じ 1点）。
            黙って 減らすと「なぜ 貯まらないのか」が 分からないまま 終わるので、
            理由を 前向きに 1行 置く（責める ことばは 使わない）。
          */}
          {meeting.affection ? (
            <p className="text-ink-faint text-xs font-bold">
              いまは AIが おやすみです。ハートは ゆっくり たまります。
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 送る前の 見守り。答えは 消さない・進む 道も 消さない */}
      {notice ? (
        <p className="bg-cream border-hairline text-ink rounded-[var(--radius-card)] border-2 px-4 py-2 text-sm font-bold">
          <RubyText text={NOTICE[notice]} index={CHROME_FURIGANA} show />
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

  /*
   * 答えるところ（型文＋入力欄）。**型文は入力欄のすぐ上**に置く。
   * 目線が「聞かれたこと → 言い方 → 打つ／話す」の順で下へ流れ、
   * 足場を見るために画面を探し回らなくてよくなる。
   */
  const controls = done ? null : (
    <div className="space-y-2">
      <div className="flex justify-end">
        {/*
          足場を いるか いらないか 決めるのは 学習者（設計01 P11）。
          はじめは 見えている ので、この つまみは「かくす」から 始まる。
          隠しているあいだは 目に つく 色にして、気づかないまま 固まらないようにする。
        */}
        <button
          type="button"
          onClick={() => saveHintShown(!hintShown)}
          aria-pressed={hintShown}
          className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
            hintShown
              ? "border-hairline text-ink-soft bg-panel"
              : "border-sun-deep bg-cream text-navy"
          }`}
        >
          <RubyText
            text={hintShown ? "型文を かくす" : "型文を 見る"}
            index={CHROME_FURIGANA}
            show
          />
        </button>
      </div>

      {/*
        「ヒント：〜」という出し方は 答えの 予告に 見えて、読むだけで 終わって いた。
        「こう 言えます →「◯◯です。」」にして、**そのまま 口に 出せる 文**として 見せる。
      */}
      {hintShown && hintLines.length > 0 ? (
        <div className="bg-cream border-hairline rounded-[var(--radius-card)] border-2 px-4 py-3">
          <p className="text-ink-soft text-xs font-extrabold">
            <RubyText text="こう 言えます" index={CHROME_FURIGANA} show />
          </p>
          <ul className="mt-1 space-y-1">
            {hintLines.map((line, at) => (
              <li key={`${at}-${line}`} className="text-ink text-base font-black break-words">
                「
                {hintSegments(line).map((seg, i) =>
                  seg.blank ? (
                    // 穴は「自分の ことばを 入れる ところ」だと 見た目で 分かるようにする
                    <span
                      key={i}
                      className="border-sky text-sky mx-0.5 border-b-2 border-dashed px-0.5"
                    >
                      {seg.text}
                    </span>
                  ) : (
                    <RubyText key={i} text={seg.text} index={furigana} show />
                  ),
                )}
                」
              </li>
            ))}
          </ul>
          <p className="text-ink-faint mt-2 text-xs font-bold">◯◯ は あなたの ことばです。</p>
        </div>
      ) : null}

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
        <button type="submit" disabled={thinking} className="btn-game px-5 py-2 text-sm">
          {askedRetry ? "もう いちど 言う" : reply ? "つぎへ →" : "はなす"}
        </button>
      </form>

      {/*
        答えられない ときの 出口。**答えた あと（つぎへ が 出ている とき）は 出さない**
        ——同じ 場所に 進む ボタンが 2つ 並ぶと、どちらが 何なのか 分からなくなる。
        言い直しを 求められて いる ときは 出す（そこが いちばん 詰まる ところ）。
      */}
      {!reply || askedRetry ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* 押すと 何が 起きるかを 先に 書く（押してから 知る ことを 減らす） */}
          <span className="text-ink-faint text-xs font-bold">
            🎴 は ？？？の まま、つぎの しつもんへ いきます
          </span>
          <button
            type="button"
            onClick={skip}
            disabled={thinking}
            className="border-hairline text-ink-soft bg-panel rounded-full border-2 px-4 py-1.5 text-xs font-extrabold disabled:opacity-40"
          >
            <RubyText text="まだ 言えない（つぎへ）" index={CHROME_FURIGANA} show />
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <CallShell
        title={meeting.title}
        focus={meeting.focus}
        /* 題・きょう やること・名札の 漢字に ふりがなを つける（教材の 読み辞書） */
        furigana={furigana}
        /* 話す 教材なので 見出しは「はなす まえに」 */
        purpose="speak"
        /*
         * マイクの ボタンを Live の 開始／終了に つなぐ。
         * 渡さなければ ボタンは 出ない——押しても 何も 起きない ボタンを 置かない。
         */
        mic={{
          on: live,
          busy: voice.status === "connecting",
          onToggle: () => {
            if (live) voice.stop();
            else void voice.start(instruction, hostVoice);
          },
        }}
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
