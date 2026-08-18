"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Meeting, MeetingQuestion } from "@/content/schema";
import { CallShell } from "@/components/call-shell";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import type { DictionaryEntry } from "@/lib/dictionary";
import { buildFuriganaIndex, kanaOf, type FuriganaIndex } from "@/lib/text/furigana";
import {
  HINT_BLANK,
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
import { asksToSkip, needsJapaneseInput } from "@/lib/meeting/input";
import { fillAnswer, fillName } from "@/lib/meeting/speech";
import {
  rateOf,
  readSpeechSpeed,
  readSpeechSpeedOnServer,
  saveSpeechSpeed,
  subscribeSpeechSpeed,
} from "@/lib/meeting/speed";
import { getProfile } from "@/lib/profile";
import { recordContentProgress } from "@/lib/progress/store";
import { AffectionMeter } from "./affection-meter";
import { checkJapanese, type AdviceText } from "./japanese-check";
import { judgeFailNote, requestJudge } from "./judge-api";
import { JudgeCard } from "./judge-card";
import { ProgressChips } from "./question-board";
import { MeetingResultCard, PreviousRecordCard, RewardCard } from "./result-card";
import { SpeakButton } from "./speak-button";
import { SpeechSpeedPicker } from "./speech-speed-picker";
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
 * ## いつも はじめから（2026-08-18 の指定）
 * 途中を 端末に 残して「まえの つづきから はじめます」と 出して いたが、やめた。
 * この 教材で いちばん 練習したい のは あいさつと 名乗りで、そこを 飛ばして
 * 4問目から 始まる 会議には 意味が 無い（Zoom の 会議も 途中から 始まらない）。
 *
 * ## 差し込みの 役（`@/lib/meeting/speech`）
 * `ask` は 呼び名、`echo` は **学習者の答え**、`hint` は どちらでもない。
 * 1つの関数で 順に 置換すると 先に 呼び名が 全部 食べてしまう（実際に 起きていた）。
 */

/**
 * 画面の飾り（ヒントの つまみ・見出し・見守りの ことば）に出る漢字の読み。
 *
 * 教材の読み辞書（`meeting.furigana`）は 教材の 本文の ための ものなので、
 * 画面が自分で出す語はここで覆う（規律2: 学習者が読む漢字を裸で出さない）。
 * 教材の索引と混ぜないのは、混ぜると教材側のルビの当たり方が変わるため。
 */
const CHROME_FURIGANA = buildFuriganaIndex([
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
/**
 * チャット欄の 1行。
 *
 * 相手の ことば（`ask`・`host`）／自分の ことば（`me`）／日本語の 見かた（`coach`）を
 * **同じ 流れ**に 積む。話し手が 混ざらない ように、色と 名札で 分ける
 *（見かたは 相手の ことばでは ない ——`judge-card.tsx` の 決まりを 守る）。
 */
type ChatBody =
  /** 教材の しつもん（作り置きの こえが あれば 聞き直せる）。 */
  | { kind: "ask"; questionId: string; text: string; audioUrl?: string }
  /** 相手の 受け止め（文字で 返った ぶん。声の ぶんは 字幕で 届く）。 */
  | { kind: "host"; text: string }
  /** 学習者が 言った こと。 */
  | { kind: "me"; text: string }
  /** 日本語の 見かた（相手の ことばでは ない）。 */
  | { kind: "coach"; judge?: JudgeResult; fallback?: Fallback };

type ChatEntry = ChatBody & { id: string };

const NOTICE = {
  empty: "だいじょうぶです。ヒントの 文を そのまま 書いても いいですよ。",
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
  /**
   * ことばの 辞書（単語ステージを 畳んだもの）。相手の しつもんと
   * 「きょう やること」の ことばに 下線が つき、タップで 意味が 出る。
   *
   * 読みもの（`article-view`）と 同じ 引き先を 使う——ミーティング専用の
   * 用語集を 別に 持つと、同じ「先輩」の 説明が 2つに 割れて 育つ。
   * 中身は 先生が スタジオ（DB）で 直せる（`src/lib/dictionary.ts`）。
   */
  dictionary,
  /** ステージの枠の中に置くとき。戻り先は枠が持つ。 */
  embedded = false,
}: {
  meeting: Meeting;
  hostVoice?: string;
  hostMouth?: Partial<Record<Viseme, string>>;
  dictionary?: readonly DictionaryEntry[];
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(meeting.furigana ?? []), [meeting.furigana]);
  /*
   * ミーティングは **いつも はじめから**（2026-08-18 の指定）。
   * 途中を 端末に 残して「まえの つづきから はじめます」と 出して いたが、
   * この 教材で いちばん 練習したい のは あいさつと 名乗りで、そこを 飛ばして
   * 4問目から 始まる 会議には 意味が 無い。Zoom の 会議も 途中から 始まらない。
   */
  const [index, setIndex] = useState(0);
  /**
   * 部屋に 入ったか。**音は 入ってから 鳴らす**。
   *
   * ロビーに いる あいだも この 部品は 動いて いるので、入る 前に 1問目の 声を
   * 鳴らして いた——ブラウザは 人が さわる 前の 音を 止めるので **鳴らないまま
   * 鳴った ことに なり**、入った ときには もう 二度と 鳴らなかった
   *（「セリフが 再生されない ときが ある」の 正体の ひとつ）。
   */
  const [joined, setJoined] = useState(false);
  /** 相手の 話す 速さ（端末に 残る。ヒントの 出し入れと 同じ 流儀）。 */
  const speed = useSyncExternalStore(
    subscribeSpeechSpeed,
    readSpeechSpeed,
    readSpeechSpeedOnServer,
  );
  /**
   * **話しはじめた ときの しつもん**。声の 答えは 言い終わってから 届くので、
   * 届いた ころには 画面が つぎへ 進んで いる ことが ある。判定は これで 見る。
   */
  const answeringRef = useRef<MeetingQuestion | null>(null);
  /** チャット欄に 積む 記録（相手の しつもん・自分の 答え・見かた）。 */
  const [chat, setChat] = useState<readonly ChatEntry[]>([]);
  const pushChat = useCallback((entry: ChatBody) => {
    setChat((prev) => [...prev, { ...entry, id: `${prev.length}-${entry.kind}` }]);
  }, []);
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
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>({});
  /** 開いた札（＝言い直しを求められずに 答えられた質問）。 */
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  /** いちばん最近ひらいた札。祝いの ✨ と 相手タイルの発光の的。 */
  const [justOpenedId, setJustOpenedId] = useState<string | null>(null);
  /** 好感度。教材に affection が無いときは触られないまま残る。 */
  const [affection, setAffection] = useState<AffectionState>(EMPTY_AFFECTION);
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
        /*
         * **名前を 先に 渡さない**（2026-08-18 の 指摘）。
         * 端末に 登録された 呼び名を つなぐ ときに 渡して いたので、相手は
         * 学生が 名乗る 前から その 名前で 呼びはじめて いた——1問目が
         *「お名前を おしえて ください」なのに、もう 知って いる 人が 聞く 形に なる。
         * 名前は **1問目に 答えた あと**に 合図で 渡す（SIGNAL.name）。
         */
        "学生が 自分で 名乗るまで、名前や あだ名で 呼ばないで ください。",
        /*
         * **しつもんの 一覧も 渡さない**。渡して いた ころは
         *「上から 順に 1つずつ 聞いて ください」と 書いて あった ので、
         * 相手は 自分の 判断で 先へ 進み、同じ ことを くり返したり 飛ばしたり した。
         * 聞く ことは 1つずつ 合図で 渡す（人格の 側にも 同じ 決まりを 書いて ある）。
         */
        /*
         * **しつもんは 画面が する**（2026-08-18）。
         * 相手に 合図（「（しんこう）…」）を 送って 聞かせて いた ころは、
         * その 合図の ことばを **そのまま 読み上げる** ことが あった
         *（学習者には「進行」と 言われた ように 聞こえる）。
         * 裏の やりとりが 表に 出る 作りは やめ、しつもんは 作り置きの こえと
         * 画面の 字で 出す。相手は **受け止めて 返すだけ**に する。
         */
        "しつもんは 画面が します。あなたは しつもんを しないで ください。",
        "学生の ことばを 受け止めて、みじかく 返して ください。1回の 返事は 2文までです。",
      ].join("\n"),
    [meeting],
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
    async (utterance: string, spoken: boolean, target?: MeetingQuestion) => {
      /*
       * **どの しつもんへの 答えか**を 呼ぶ側から 受け取る。
       *
       * いまの しつもん（`question`）で 見て いた ころは、こんな ことが 起きて いた:
       * 声で 答える → 相手が 話しはじめた 合図で 判定に 出す → その 少し 前に
       * 画面は つぎの しつもんへ 進んで いる ——「どこから 来ましたか」の 画面で
       *「わたしは トミー です。」と 直され（＝1問目の 基準で 見られ）て いた
       *（2026-08-18 の 指摘）。答えは **話しはじめた ときの しつもん**で 見る。
       */
      const asked = target ?? question;
      if (!asked) return;
      const at = Date.now();
      pushChat({ kind: "me", text: utterance });
      setThinking(true);
      const result = await requestJudge({
        ask: withName(asked.ask),
        hint: asked.hint,
        keywords: asked.keywords,
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
        // 声で 返して いる ときは、相手の ことばは 字幕（voice.turns）で 届く
        if (!spoken && result.judge.reply) {
          pushChat({ kind: "host", text: result.judge.reply });
        }
        pushChat({ kind: "coach", judge: result.judge });
        rewardTurn(asked.id, utterance, result.judge.grade, !result.judge.retry);
        void recordMeetingTurn({
          meetingId: meeting.id,
          questionId: asked.id,
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
      const echo = spoken ? "" : fillAnswer(asked.echo, utterance);
      if (echo) pushChat({ kind: "host", text: echo });
      pushChat({ kind: "coach", fallback: { advice, note: judgeFailNote(result.reason) } });
      setReply({
        /*
         * おうむ返しは **学習者の 答え**を 返す。ここで 呼び名を 差し込む 関数を
         * 通していた ため、`◯◯` が 先に 名前で 埋まり、相手が
         * 「そうです、ソピアですね。」と 名前を 答えとして 復唱していた。
         * 中身の 取り出しは `fillAnswer` の 中（`answerCore`）——画面で 別の 関数を
         * かませて いた ころ、末尾だけを 削って 文が 壊れていた。
         */
        echo: spoken ? "" : fillAnswer(asked.echo, utterance),
        judge: null,
        fallback: { advice, note: judgeFailNote(result.reason) },
      });
      // 判定に通せなくても、答えた事実は残る。札は開き、ハートも足す
      rewardTurn(asked.id, utterance, null, true);
      void recordMeetingTurn({
        meetingId: meeting.id,
        questionId: asked.id,
        attempt,
        mode: spoken ? "voice" : "text",
        utterance,
        judge: null,
        fallback: result.reason,
        model: "",
        latencyMs: Date.now() - at,
      });
    },
    [question, meeting, attempt, learnerName, withName, rewardTurn, pushChat],
  );

  /**
   * 質問が変わったら、作り置きの音声を鳴らす。
   *
   * Live につながっているときは鳴らさない——相手が自分で質問を読むので、
   * 2つの声が重なる。つながっていない学習者（キーが無い・マイクが無い）にとっては、
   * ここが**唯一 声を聞ける場所**になる。
   */
  /* 選んだ 速さは つないだ あとでも 効く（つぎの ひとことから） */
  const setRate = voice.setRate;
  useEffect(() => {
    setRate(rateOf(speed));
  }, [speed, setRate]);

  const clipUrl = done ? meeting.closingAudioUrl : question?.audioUrl;
  const playClip = clip.play;
  useEffect(() => {
    if (!joined || !clipUrl) return;
    playClip(clipUrl);
  }, [joined, clipUrl, playClip]);

  // 声で話したぶんを見る。相手が話しはじめた合図で1つに束ねてから届く
  useEffect(() => {
    const heard = voice.lastUtterance;
    if (!heard || heard.id === judgedRef.current) return;
    judgedRef.current = heard.id;
    void judgeUtterance(heard.text, true, answeringRef.current ?? undefined);
  }, [voice.lastUtterance, judgeUtterance]);

  const next = useCallback(() => {
    const at = index + 1;
    const finishing = at >= meeting.questions.length;
    /*
     * 相手に つぎを 言わせる。**画面の 質問と 相手の ことばを 1つに 保つ**ため、
     * 進むのと 同じ ところで 合図を 出す（別の 効果に すると、進み方に よって
     * 出したり 出さなかったり する）。
     */
    const ask = meeting.questions[at];
    // つぎの しつもんは チャットにも 積む（あとから 読み返せる）
    if (ask) {
      pushChat({
        kind: "ask",
        questionId: ask.id,
        text: withName(ask.ask),
        audioUrl: ask.audioUrl,
      });
    }
    setIndex(at);
    setDraft("");
    // 型文は ここで 隠さない。学習者が 決めた 見せ方は 質問を またいで 続く
    setReply(null);
    setAttempt(1);
    setJustOpenedId(null);
    setNotice(null);
    setNoticedText(null);

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
  }, [index, meeting, answers, affection, withName, pushChat]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (thinking) return;
    /*
     * 決まった しつもんが ぜんぶ 終わった あとは **自由な おしゃべり**。
     * 判定も 進行も しない——相手に そのまま 渡して、返事を 待つ（2026-08-18 の 指定）。
     */
    if (done) {
      if (text.length === 0) return;
      setDraft("");
      pushChat({ kind: "me", text });
      if (live) voice.sendText(text);
      return;
    }
    if (!question) return;
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
    /*
     * 「すみません、つぎを おねがいします」——**ことばで 逃げられる**（P6・P10）。
     * 判定に かけないのは、逃げの ひとことを 答えとして 見て
     *「もう いちど」と 返すと、いちばん 詰まって いる 学習者を そこに 縛る ため。
     */
    if (asksToSkip(text)) {
      pushChat({ kind: "me", text });
      next();
      return;
    }
    // Live につながっていれば、書いた文でも相手は**声で**返す
    answeringRef.current = question;
    if (live) voice.sendText(text);
    void judgeUtterance(text, live, question);
  }, [draft, question, thinking, live, voice, judgeUtterance, noticedText, next, pushChat, done]);

  /** 同じ質問をもう一度。回数だけ増やして、質問は変えない。 */
  const retry = useCallback(() => {
    setAttempt((n) => Math.min(n + 1, MAX_ATTEMPTS));
    setReply(null);
    setDraft("");
    setNotice(null);
    setGained(0);
  }, []);

  /**
   * 答えられない ときの 逃げ道。**札は 開かない**まま つぎの 質問へ。
   *
   * 空のまま「はなす」を押すと 実際には 進めたのに、画面には 助言しか 出ず
   * 「進める」とは どこにも 書いて いなかった。答えられない 学習者は そこで
   * 座り込む——90分の 授業では それが いちばん 起きる（P8: 詰まらせない）。
   */
  /**
   * いまの質問の型文。「そのまま 口に 出せる 文」の並びにして持つ。
   * **呼び名を差し込まない**（`withName` を通さない）——`hint` の `◯◯` は
   * 学習者が自分のことばを入れる穴で、名前の目印ではない。
   */
  const hintLines = useMemo(() => hintPatterns(question?.hint ?? ""), [question]);

  /**
   * 型文に 穴が あるか。
   * 「はい。ほうこくします。」の ように そのまま 言える 型文でも
   * 「◯◯ は あなたの ことばです。」を 出して いたので、指す 先の 無い
   * 注意書きだけが 残って いた。穴が ある ときだけ 添える。
   */
  const hintHasBlank = useMemo(
    () => hintLines.some((line) => line.includes(HINT_BLANK)),
    [hintLines],
  );

  /*
   * 会話の 記録（チャット欄に 上から 順に 積む）。
   *
   * これまでは「いまの ひとこと」だけを 画面に 出して いたので、少し 前に
   * 何を 言われたか・どう 直せば よいかは **消えて いた**。学習者は 読み返せない。
   * Zoom の チャットと 同じで、**下に 伸びて 上へ さかのぼれる** 形に する。
   */
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // いつも いちばん 下（＝いまの しつもん）を 見せる
    const box = chatRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat.length, thinking]);

  /**
   * 判定が 出たら **自分で つぎへ 進む**（ボタンを 押させない）。
   *
   * 「つぎへ →」「もう いちど 言う」「まだ 言えない」の 3つの ボタンは、押すまで
   * 会話が 止まる 作りだった。会話の 教材で いちばん 大事なのは 話す ことなので、
   * 進み方は 判定に まかせる: 通ったら つぎの しつもんへ、言い直しなら 例を 見せて
   * もう いちど 同じ しつもんへ。読む 時間は 少し 置く（カードは 記録に 残る）。
   */
  const nextRef = useRef(next);
  const retryRef = useRef(retry);
  useEffect(() => {
    nextRef.current = next;
    retryRef.current = retry;
  });
  useEffect(() => {
    if (!reply || done) return;
    const again = reply.judge?.retry === true;
    const timer = setTimeout(
      () => (again ? retryRef.current() : nextRef.current()),
      again ? 2400 : 1200,
    );
    return () => clearTimeout(timer);
  }, [reply, done]);

  /** いま持っているハート。教材に affection が無いときは画面のどこにも出ない。 */
  const hearts = heartsOf(affection);

  /*
   * チャット欄。**ここだけが スクロールする**。おわった あとも 出しつづける——
   * 決まった しつもんが 終わったら **自由な おしゃべり**に なるので、
   * ここが 閉じると 話す ところが 無くなる（2026-08-18 の 指定）。
   */
  const chatPanel = (
    <div
      ref={chatRef}
      role="log"
      aria-label="かいわ"
      className="card-island h-[46vh] min-h-64 space-y-2 overflow-y-auto p-3 sm:h-[52vh]"
    >
      {chat.map((entry) => (
        <ChatLine
          key={entry.id}
          entry={entry}
          hostName={meeting.host.name}
          furigana={furigana}
          dictionary={dictionary}
          onReplay={
            entry.kind === "ask" && entry.audioUrl
              ? () => clip.play(entry.audioUrl as string)
              : undefined
          }
        />
      ))}
      {thinking ? (
        <p className="bg-panel-tint text-ink-soft rounded-[var(--radius-card)] px-4 py-2 text-sm font-black">
          {meeting.host.name}さんが 聞いて います…
        </p>
      ) : null}
    </div>
  );

  const main = done ? (
    <div className="space-y-3">
      <div className="card-island p-5">
        <p className="text-navy text-lg font-black">
          <DictionaryText
            text={withName(meeting.closing)}
            index={furigana}
            show
            dictionary={dictionary}
          />
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

      {/* ここからは 決まった しつもんが 無い。話したい ことを 話せる */}
      <p className="text-ink-soft text-sm font-extrabold">
        <RubyText
          text="ここからは、じゆうに 話せます。聞きたい ことを 聞いて みましょう。"
          index={CHROME_FURIGANA}
          show
        />
      </p>
      {chatPanel}
    </div>
  ) : (
    chatPanel
  );

  const body = (
    <div className="space-y-3">
      {meeting.affection ? (
        <AffectionMeter
          hearts={hearts}
          maxHearts={meeting.affection.maxHearts}
          gained={gained}
          threshold={meeting.affection.threshold}
          hostName={meeting.host.name}
        />
      ) : null}
      {main}
      {/* まえの きろくは おわりの 画面では 出さない（きょうの カードを 見せる） */}
      {!done && previous && previous.lines.length > 0 ? (
        <PreviousRecordCard record={previous} furigana={furigana} />
      ) : null}
    </div>
  );

  /*
   * 答えるところ。**ヒントは 入力欄の すぐ上に ピン留め**（スクロールで 逃がさない）。
   * ボタンは「おくる」1つだけ——「つぎへ」「もう いちど」「まだ 言えない」は
   * 会話の 中に 溶かした（進むのは 判定が 決め、逃げ道は ことばで 言う）。
   */
  const controls = done ? (
    /* 自由な おしゃべり。ヒントも 判定も 出さない——ここは 会話だけの 場 */
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="じゆうに 書いて みましょう"
        aria-label="こたえを 入力する"
        className="border-hairline text-ink min-w-0 flex-1 rounded-full border-2 bg-white px-4 py-2 font-bold"
      />
      <button type="submit" className="btn-game px-5 py-2 text-sm">
        おくる
      </button>
    </form>
  ) : (
    <div className="space-y-2">
      <div className="flex justify-end">
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
            text={hintShown ? "ヒントを かくす" : "ヒントを 見る"}
            index={CHROME_FURIGANA}
            show
          />
        </button>
      </div>

      {hintShown && hintLines.length > 0 ? (
        <div className="bg-cream border-hairline rounded-[var(--radius-card)] border-2 px-4 py-3">
          <p className="text-ink-soft text-xs font-extrabold">
            <RubyText text="💡 ヒント" index={CHROME_FURIGANA} show />
          </p>
          <ul className="mt-1 space-y-1">
            {hintLines.map((line, at) => (
              <li key={`${at}-${line}`} className="text-ink text-base font-black break-words">
                「
                {hintSegments(line).map((seg, i) =>
                  seg.blank ? (
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
          {hintHasBlank ? (
            <p className="text-ink-faint mt-1 text-xs font-bold">
              <RubyText text="◯◯ は あなたの ことばです。" index={CHROME_FURIGANA} show />
            </p>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p className="bg-cream border-hairline text-ink rounded-[var(--radius-card)] border-2 px-4 py-2 text-sm font-bold">
          <RubyText text={NOTICE[notice]} index={CHROME_FURIGANA} show />
        </p>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="日本語で 答えて ください"
          aria-label="こたえを 入力する"
          className="border-hairline text-ink min-w-0 flex-1 rounded-full border-2 bg-white px-4 py-2 font-bold"
        />
        <button type="submit" disabled={thinking} className="btn-game px-5 py-2 text-sm">
          おくる
        </button>
      </form>

      {/*
        こまった ときの 出口は **ボタンでは なく ことば**に した。
        「まだ 言えない（つぎへ）」は 何のための ボタンか 読み取れなかった（指摘）。
        実際の 会議で 使う 救援の 言い方を そのまま 練習に する（P6・P10）。
      */}
      <p className="text-ink-faint text-xs font-bold">
        <RubyText
          text="こまったら →「すみません、つぎを おねがいします」と 言って ください"
          index={CHROME_FURIGANA}
          show
        />
      </p>
    </div>
  );

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <CallShell
        title={meeting.title}
        focus={meeting.focus}
        /* 題・きょう やること・名札の 漢字に ふりがなを つける（教材の 読み辞書） */
        furigana={furigana}
        /* 「きょう やること」の ことばに 意味の 吹き出しを つける */
        dictionary={dictionary}
        /* 話す 教材なので 見出しは「はなす まえに」 */
        purpose="speak"
        /*
         * 話す ところは **Zoom の 画面の 中**（相手の 顔の すぐ下）。
         * 押して いる あいだ だけ こえを 送る——押しっぱなしで 話し、はなすと
         * 相手が 答える。ずっと 送って いた ころは、まわりの 音で 相手の セリフが
         * 途中で 止まって いた。
         */
        speak={
          <div className="space-y-2">
            {/* 進み具合は 相手の 顔の すぐ下（会話から 目を 離さずに 見える） */}
            <ProgressChips
              total={meeting.questions.length}
              openIds={openIds}
              order={meeting.questions.map((q) => q.id)}
              currentId={question?.id ?? null}
              justOpenedId={justOpenedId}
            />
            <SpeakButton
              status={voice.status}
              reason={voice.reason}
              talking={voice.talking}
              onConnect={() => void voice.start(instruction, hostVoice)}
              onStartTalking={() => {
                // いま 答えようと して いる しつもんを 覚える（判定が ずれない ように）
                answeringRef.current = question ?? null;
                voice.startTalking();
              }}
              onStopTalking={voice.stopTalking}
            />
            <SpeechSpeedPicker value={speed} onChange={saveSpeechSpeed} />
          </div>
        }
        /* 入る 前にも 速さを 決められる（はじめの ひとことから 効く） */
        settings={<SpeechSpeedPicker value={speed} onChange={saveSpeechSpeed} tone="light" />}
        /*
         * 音は 入ってから 鳴らす（人が さわる 前の 音は ブラウザに 止められる）。
         * 入った ら 1問目を チャットに 出す——**相手の 第一声**が ここに 並ぶ。
         */
        onJoined={() => {
          setJoined(true);
          const first = meeting.questions[index];
          if (first) {
            pushChat({
              kind: "ask",
              questionId: first.id,
              text: withName(first.ask),
              audioUrl: first.audioUrl,
            });
          }
        }}
        /* 出たら つないだ ものを 閉じる（マイクを 開いた ままに しない） */
        onLeft={() => voice.stop()}
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
        /*
         * 答える ところは **会話の 下**。上に 置いて いた ころは、スマホで
         * 「こう 言えます」と 入力欄が 先に 来て、相手の しつもんが その 下に あった
         * ——何を 聞かれたかを 見るのに、毎回 スクロールで 探す ことに なる。
         */
        controlsAt="bottom"
      >
        {body}
      </CallShell>
    </div>
  );
}

/**
 * チャット欄の 1行を 描く。
 *
 * 相手の ことばは 左・自分の ことばは 右——SNS と 同じ 並び方に する
 *（設計01 §1.1「ゲーム・SNS の UI の 文法は 母語の ように 読める」）。
 * 日本語の 見かた（コーチ）は どちらでも ない 色に して、相手の ことばと 混ぜない。
 */
function ChatLine({
  entry,
  hostName,
  furigana,
  dictionary,
  onReplay,
}: {
  entry: ChatEntry;
  hostName: string;
  furigana: FuriganaIndex;
  dictionary?: readonly DictionaryEntry[];
  onReplay?: () => void;
}) {
  if (entry.kind === "coach") {
    return (
      <motion.div data-kind="coach" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        {entry.judge ? <JudgeCard judge={entry.judge} hostName={hostName} /> : null}
        {entry.fallback ? (
          <div className="bg-panel-tint space-y-1 rounded-[var(--radius-card)] p-3">
            <p className="text-leaf text-sm font-extrabold">🌸 {entry.fallback.advice.praise}</p>
            {entry.fallback.advice.fix ? (
              <p className="text-ink-soft text-sm font-bold break-words">
                💡 {entry.fallback.advice.fix}
              </p>
            ) : null}
            {entry.fallback.advice.example ? (
              <p className="text-ink rounded-xl bg-white px-3 py-2 text-sm font-bold break-words">
                こう 言うと もっと いいです →「{entry.fallback.advice.example}」
              </p>
            ) : null}
            {entry.fallback.note ? (
              <p className="text-ink-faint text-xs font-bold">{entry.fallback.note}</p>
            ) : null}
          </div>
        ) : null}
      </motion.div>
    );
  }

  const mine = entry.kind === "me";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-kind={entry.kind}
      className={mine ? "flex justify-end" : "flex justify-start"}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          mine ? "bg-sky-soft text-ink" : "bg-panel-tint text-ink"
        }`}
      >
        <p className={`text-[11px] font-extrabold ${mine ? "text-navy" : "text-sky"}`}>
          {mine ? "あなた" : hostName}
          {/* 作り置きの こえが ある ときだけ、その 行を 聞き直せる */}
          {onReplay ? (
            <button
              type="button"
              onClick={onReplay}
              aria-label="もう いちど 聞く"
              className="border-hairline text-navy ml-2 rounded-full border bg-white px-1.5 py-0.5 text-[11px] font-extrabold"
            >
              🔊
            </button>
          ) : null}
        </p>
        <p className="text-ink mt-0.5 leading-relaxed font-bold break-words">
          {entry.kind === "ask" ? (
            <DictionaryText text={entry.text} index={furigana} show dictionary={dictionary} />
          ) : (
            entry.text
          )}
        </p>
      </div>
    </motion.div>
  );
}
