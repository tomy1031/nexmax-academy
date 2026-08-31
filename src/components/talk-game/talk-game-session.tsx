"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { DictionaryText } from "@/components/dictionary-text";
import { AnswerNotebook } from "@/components/answers/answer-notebook";
import { readNotebook, type Notebook, type NotebookLine } from "@/lib/answers/notebook";
import type { AnswerNotebookSource } from "@/components/answers/answer-notebook";
import { RubyText } from "@/components/ruby-text";
import { HintModal } from "@/components/meeting/hint-modal";
import { SpeakButton } from "@/components/meeting/speak-button";
import { SpeechSpeedPicker } from "@/components/meeting/speech-speed-picker";
import { dropJudgeSession, requestTalkTurn } from "@/components/meeting/judge-api";
import { useLiveVoice } from "@/components/meeting/use-live-voice";
import type { Meeting } from "@/content/schema";
import type { DictionaryEntry } from "@/lib/dictionary";
import { getProfile } from "@/lib/profile";
import { recordContentProgress } from "@/lib/progress/store";
import { bufferMeetingTurn, flushMeetingTurns } from "@/lib/meeting/log";
import { fillName } from "@/lib/meeting/speech";
import {
  DEFAULT_SPEED,
  readSpeechSpeed,
  readSpeechSpeedOnServer,
  saveSpeechSpeed,
  subscribeSpeechSpeed,
  type SpeechSpeedId,
} from "@/lib/meeting/speed";
import {
  EMPTY_TALK,
  applyTurn,
  type TalkFocus,
  type TalkPlan,
  type TalkState,
  type TalkObservations,
} from "@/lib/talkgame/affinity";
import { localObservations, localReply } from "@/lib/talkgame/local";
import {
  clearTalkResume,
  parseTalkResume,
  readTalkResumeRaw,
  readTalkResumeRawOnServer,
  saveTalkResume,
  subscribeTalkResume,
} from "@/lib/talkgame/resume";
import { readAloud, talkInstruction } from "@/lib/talkgame/instructions";
import { buildFuriganaIndex, mergeFuriganaEntries } from "@/lib/text/furigana";
import { TalkFeedback, TalkRubric, FEEDBACK_FURIGANA } from "./talk-feedback";
import { TalkScene } from "./talk-scene";

/**
 * 対話ゲーム — 好感度 100% を 目ざして 社長と 話す（願い #177）
 *
 * ## ミーティングとは 別の 部品に した 理由（2026-08-23 の 指定）
 * ヘンディさんの ミーティングは **決まった しつもんに 順に 答える** 練習で、
 * 進み方も 画面も それに 合わせて 育って きた。松井社長との 会話は ねらいが ちがう:
 *
 * - しつもんは **その場で 作る**（学習者が 何を おもしろいと 言うかは 先に 書けない）
 * - 終わりは しつもんを 使いきった ときでは なく、**好感度が 満タン**に なった とき
 *
 * 同じ 部品に 相乗りさせると、片方を 直すたびに もう片方が 黙って 動く。
 * だから 舞台（`TalkScene`）から 別に 立てる。**共通の 部品は 借りる**——
 * 声（`useLiveVoice`）・話す ボタン・ヒント・辞書つきの 本文は そのまま 使う。
 *
 * ## 進み方
 * ```
 * ロビー → ①社長が 話す（第一声・しつもん）
 *        → ②学習者が 答える（こえ／文字）
 *        → ③見かた（観点で 好感度が 上がる）
 *        → ①へ もどる
 * ```
 * 話す ばんで「おもしろい ところ」を 5つ 見つけたら、**聞く ばん**へ 変わる
 *（こんどは 学習者が 社長に しつもんする）。好感度が 満タンに なったら クリア。
 * 切りかえの 判断は ぜんぶ `src/lib/talkgame/affinity.ts` の 純粋な 関数が 持つ。
 *
 * ## 運転手は 1人（docs/constraints.md 2026-08-18）
 * 深掘りの しつもんは **見かたの 係**（`requestTalkTurn`）が 作り、画面が
 * 声の 相手へ「よみあげて:」と 渡す。相手に 自分で しつもんさせない——
 * 2人が 別々に 聞くと、学習者は どちらに 答えるのか 分からなく なる。
 *
 * ## 鍵が 無くても 遊べる
 * 見かたに つなげない ときは 端末の 規則（`src/lib/talkgame/local.ts`）で 見る。
 * 好感度の 上がり方は ゆっくりに なるが、**話しきれば 満タンに 届く**
 *（`applyTurn` の 底上げ）。こちらの 都合で 学習者を 止めない。
 */

/** 画面の 飾りに 出る 漢字の 読み（教材の 読み辞書とは 混ぜない・規律2）。 */
const CHROME_ENTRIES: readonly (readonly [string, string])[] = [
  ["社長", "しゃちょう"],
  ["会社", "かいしゃ"],
  ["話", "はな"],
  ["聞", "き"],
  ["言", "い"],
  ["見", "み"],
  ["中", "なか"],
  ["合", "あ"],
  ["気", "き"],
  ["形", "かたち"],
  ["入", "はい"],
  ["文字", "もじ"],
  ["書", "か"],
  ["番", "ばん"],
  ...FEEDBACK_FURIGANA,
];

const CHROME_FURIGANA = buildFuriganaIndex(CHROME_ENTRIES);

type Phase = "lobby" | "host" | "me" | "thinking" | "feedback" | "review" | "clear";

/**
 * これまでの 会話 1往復ぶん（画面の「これまでの 話」に 並べる）。
 *
 * 台帳（`bufferMeetingTurn`）にも 同じ ものが 流れるが、あちらは **先生が あとで 見る**
 * 置き場で、送るのは 話しきった とき 1回。学習者が **いま 見返す**ための 控えは
 * 別に 画面が 持つ——鍵の 無い 教室でも 同じ ように 見えなければ ならないから。
 */
interface TurnLog {
  /** そのとき 社長が 聞いた こと。 */
  readonly ask: string;
  /** 学習者が 言った こと。 */
  readonly said: string;
  /** その ターンで 上がった ぶん（底上げも 足した、メーターの 動きと 同じ 数）。 */
  readonly gained: number;
  /** 社長の 返事。 */
  readonly reply: string;
}

interface TurnResult {
  observations: TalkObservations;
  /** その 発話を 見た ときに 効いて いた「見る ところ」（答える前の 予告と そろえる）。 */
  focus?: readonly TalkFocus[];
  gained: number;
  /** 話しきった ぶんの 底上げ（観点とは 別に 見せる）。 */
  lifted: number;
  /** この 発話を 見た ときの ばん（切りかえ後では ない）。 */
  judgedAs: TalkState["round"];
  said: string;
  praise: string;
  fix: string;
  example: string;
  reply: string;
  nextAsk: string;
}

/** 「直す ところは 無い」を 表す 中身を 空に そろえる（画面に「null」と 出さない）。 */
function cleanFix(value: string): string {
  const trimmed = value.trim();
  return ["null", "none", "なし", "無し", "-", "—"].includes(trimmed) ? "" : trimmed;
}

function subscribeToProfile(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readName(): string {
  return getProfile()?.displayName ?? "";
}
function readNameOnServer(): string {
  return "";
}

/**
 * 準備フォームの こたえを **文字列の まま** 取る。
 *
 * `useSyncExternalStore` は 同じ 中身なら 同じ 値が 返る ことを 求める。
 * 行の 並び（オブジェクト）を そのまま 返すと 毎回 別物に なり、描き直しが 止まらない。
 * しおりの 読み方（`readTalkResumeRaw` → `parseTalkResume`）と 同じ 形に そろえて ある。
 *
 * `reportOnly` の 束（調査シート）は 見ない——`from` が 指すのは 準備フォームの 設問。
 */
function prepSnapshot(sources: readonly AnswerNotebookSource[] | undefined): string {
  const books = (sources ?? [])
    .filter((one) => !one.reportOnly)
    .map((one) => readNotebook(one.ref))
    .filter((one): one is Notebook => one !== null);
  return books.length === 0 ? "" : JSON.stringify(books);
}

function prepSnapshotOnServer(): string {
  return "";
}

/** 設問ID → 書いた 行。同じ IDが 2つ あれば 先に 出た ほうを 残す。 */
function parsePrep(raw: string): Readonly<Record<string, NotebookLine>> {
  if (raw === "") return {};
  const map: Record<string, NotebookLine> = {};
  try {
    for (const book of JSON.parse(raw) as Notebook[]) {
      for (const one of book.lines) if (!(one.questionId in map)) map[one.questionId] = one;
    }
  } catch {
    // 壊れた 保存値は「まだ 無い」として 扱う（会話は 止めない・notebook.ts と 同じ）
    return {};
  }
  return map;
}

export function TalkGameSession({
  meeting,
  hostVoice,
  dictionary,
  embedded = false,
}: {
  meeting: Meeting;
  hostVoice?: string;
  dictionary?: readonly DictionaryEntry[];
  /**
   * 先生の 画面（スタジオの「話して みる」）に 埋めこむ ときは true。
   *
   * 学習者の 画面は 全画面（`fixed inset-0`）で よいが、先生の 画面では
   * **枠の 中に おさめる**——全画面が かぶさると、下に ある「やめる」が
   * 押せなく なる（2026-08-24 の 検収指摘）。
   */
  embedded?: boolean;
}) {
  const game = meeting.talkGame;
  const learnerName = useSyncExternalStore(subscribeToProfile, readName, readNameOnServer);
  const voice = useLiveVoice();

  const [phase, setPhase] = useState<Phase>("lobby");
  const [talk, setTalk] = useState<TalkState>(EMPTY_TALK);
  const [queue, setQueue] = useState<readonly string[]>([]);
  /**
   * もう 出した 社長の ことば（**新しい ものが うしろ**）。
   *
   * 「もどる」（2026-08-31 の 指定）で 読み返す ために 持つ。`queue` から 捨てて
   * いた ころは、押し進めた ことばを **二度と 出せなかった**——聞きのがした 人は
   * ブラウザの 戻るしか 手が 無く、それは 進みごと 消える 操作に なる。
   */
  const [spoken, setSpoken] = useState<readonly string[]>([]);
  /** これまでの 会話（画面の「これまでの 話」）。 */
  const [log, setLog] = useState<readonly TurnLog[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [askText, setAskText] = useState("");
  /**
   * いま 聞かれて いる しつもんの「見る ところ」と、準備フォームの どこで 書いた ことか。
   *
   * `askText` は セリフの 列（`queue`）を 使いきった ときに 決まるが、こちらは
   * **列に 積む ときに** 決まる（列は 文字列しか 持たないので、付いて 回れない）。
   * 深掘りの しつもん（AIが その場で 作る）には 対応する 準備が 無いので、
   * `from` は 空に なる——そこは 画面が「じゅんびに ない しつもん」と 断る。
   */
  const [askFocus, setAskFocus] = useState<readonly TalkFocus[] | undefined>(undefined);
  const [askFrom, setAskFrom] = useState("");
  /**
   * 準備フォームで 書いた ことを、しつもんの 横に 出す ための 引き（設問ID → 行）。
   *
   * **調べた ことを 見ながら 話す**引き先は ひきだし（`AnswerNotebook`）と 同じ
   * `meeting.notes`。ただし ここで 読むのは **口に 出して 報告する ぶんだけの
   * ものでは ない**ので、`reportOnly` の 束（調査シート）は 見ない——
   * `from` が 指すのは あくまで 準備フォームの 設問 だから。
   *
   * 端末の 中（localStorage）を 読むので、**画面が 出て から** 読む
   *（サーバでは 読めない。ロビーの ちらつきを 作らない）。
   */
  const prepRaw = useSyncExternalStore(
    subscribeToProfile,
    () => prepSnapshot(meeting.notes),
    prepSnapshotOnServer,
  );
  const prep = useMemo(() => parsePrep(prepRaw), [prepRaw]);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<TurnResult | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** クリアの 話を 読み終えたら クリア画面へ（`queue` を 使いきった ときに 見る）。 */
  const [ending, setEnding] = useState(false);
  /**
   * 端末に 残って いた ところ（無ければ null）。
   *
   * サーバでは 端末の 保存値が 読めない ので、**画面が 出て から** 読む。
   * 読めるまでは「はじめる」の まま——ちらつくが、無い ものを 有る ように
   * 見せて 消す より よい。
   */
  const savedRaw = useSyncExternalStore(
    subscribeTalkResume,
    () => readTalkResumeRaw(meeting.id),
    readTalkResumeRawOnServer,
  );
  const saved = useMemo(() => {
    const found = parseTalkResume(savedRaw);
    return found && found.percent > 0 ? found : null;
  }, [savedRaw]);
  const speed = useSyncExternalStore(
    subscribeSpeechSpeed,
    readSpeechSpeed,
    readSpeechSpeedOnServer,
  );

  const plan: TalkPlan = useMemo(
    () => ({
      goal: game?.goal ?? 100,
      openAt: game?.openAt ?? 60,
      // 出だしの しつもんを 使いきったら 聞く ばんへ（準備の 設問と 1対1）
      askCount: game?.openers.length ?? 0,
    }),
    [game],
  );

  const furigana = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(meeting.furigana ?? [], [])),
    [meeting.furigana],
  );
  /**
   * 見かたの 板で つかう 索引。
   *
   * 板には **画面の ことば**（観点の 見出し）と **札の ことば**（AIの ラベル、
   * 判定に つなげない ときは 学習者が 書いた 文）が 並ぶ。片方の 索引だけでは
   * どちらかが 裸の 漢字に なる ので、2つを 合わせる（規律2）。
   */
  const boardFurigana = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(meeting.furigana ?? [], CHROME_ENTRIES)),
    [meeting.furigana],
  );

  const withName = useCallback((text: string) => fillName(text, learnerName), [learnerName]);

  const instruction = useMemo(
    () => talkInstruction({ persona: meeting.persona, hostName: meeting.host.name }, learnerName),
    [meeting.persona, meeting.host.name, learnerName],
  );

  /**
   * `turns` 回目に 出す 出だしの しつもん（使いきったら null）。
   *
   * 教材は 文字列でも 書けるので（前からの 形）、読み口を ここに 1つだけ 置く。
   */
  const openerAt = useCallback((turns: number) => game?.openers[turns] ?? null, [game]);

  /** いま 出て いる 社長の ことば。 */
  const line = queue[0] ?? "";

  /*
   * 出て いる ことばを、声の 相手にも **そのまま** 言わせる。
   * 画面の 字と 声が ちがう ことを 言うと、学習者は どちらを 聞けば よいのか
   * 分からなく なる（2026-08-18 の 指摘と 同じ 事故）。
   */
  const control = voice.control;
  const spokenRef = useRef<string>("");
  useEffect(() => {
    if (phase !== "host" || !line) {
      // ばんが 変われば 読み上げの 覚えも 捨てる（もう一度 遊ぶ ときに 黙らない ように）
      spokenRef.current = "";
      return;
    }
    if (voice.status !== "live") return;
    if (spokenRef.current === line) return;
    spokenRef.current = line;
    control(readAloud(line));
  }, [phase, line, voice.status, control]);

  /** 立ち絵は ばんで 変える（考えて いる あいだは 「考え中」）。 */
  const figure = useMemo(() => {
    if (!game) return "";
    if (phase === "thinking") return game.figures.think;
    if (phase === "feedback" || phase === "review" || phase === "clear") return game.figures.smile;
    return game.figures.neutral;
  }, [game, phase]);

  const hints = useMemo(() => {
    if (!game) return [] as readonly string[];
    return talk.round === "listen" ? game.listenHints : game.talkHints;
  }, [game, talk.round]);

  /** つぎの ことばへ。ぜんぶ 出しきったら 学習者の ばん。 */
  const nextLine = useCallback(() => {
    const said = queue[0] ?? "";
    const rest = queue.slice(1);
    if (rest.length === 0) {
      setAskText(said);
      setPhase(ending ? "clear" : "me");
    }
    setQueue(rest);
    // 出した ことばは 捨てずに 積む（「もどる」で 読み返す）
    if (said) setSpoken((before) => [...before, said]);
  }, [queue, ending]);

  /**
   * ひとつ 前の ことばへ もどる（2026-08-31 の 指定「戻る ボタン」）。
   *
   * ## もどせるのは **読む ところ**だけ
   * 好感度も、答えた ことも もどさない。好感度は **減る道を 1本も 持たない**
   *（設計01 P8・`applyTurn`）ので、ターンごと 巻き戻すと その 決まりを 破る ことに なる。
   * ここで もどるのは「社長が さっき 何と 言ったか」「さっきの 見かたは 何だったか」——
   * **聞きのがし・読みのがしを 取り返す**ための 道である。
   *
   * ぜんぶ もどりきったら、その 前に 出て いた 見かたの 板を もう一度 開く。
   */
  const backLine = useCallback(() => {
    if (spoken.length > 0) {
      const last = spoken[spoken.length - 1] ?? "";
      setSpoken((before) => before.slice(0, -1));
      setQueue((before) => [last, ...before]);
      setPhase("host");
      return;
    }
    if (result) setPhase("review");
  }, [spoken, result]);

  /** 見かたの 板を 読み終えて、いま 出て いた ことばへ 帰る。 */
  const leaveReview = useCallback(() => {
    setPhase(queue.length > 0 ? "host" : "me");
  }, [queue.length]);

  /** 「もどる」を 出してよいか（もどる 先が 何も 無い ときは 出さない）。 */
  const canGoBack = spoken.length > 0 || result !== null;

  /**
   * はじめから 話す。
   *
   * **毎回 まっさらから 始める**。途中の しおりを 置かないのは、この 教材が
   * 3〜5分で 終わる 短い ものだから——ミーティング（12問・20分）とは 重さが ちがう。
   * もう一度 押した ときに 前の 好感度が 残って いると、満タンの まま 動かない
   * 部屋に 座る ことに なる。
   */
  /** 飛んで いる 判定の 半券（`judge` の 説明を 参照）。 */
  const turnRef = useRef(0);

  /** 会話から 出る（やめる・もう一度 はじめる）。飛んで いる 判定を 無効に する。 */
  const leave = useCallback(() => {
    turnRef.current += 1;
    setLogOpen(false);
    setPhase("lobby");
  }, []);

  const start = useCallback(() => {
    if (!game) return;
    turnRef.current += 1;
    const from = saved ?? EMPTY_TALK;
    setTalk(from);
    setResult(null);
    setSpoken([]);
    setLog([]);
    setEnding(false);
    setPhase("host");
    /*
     * つづきの ときは **いまの ばんの 出だし**から 話し直す。
     * その場で AIが 作った 深掘りの しつもんは 残して いない——相手との つなぎは
     * 切れて いる ので、同じ 会話には 戻らない（`src/lib/talkgame/resume.ts`）。
     */
    if (from.round === "listen") {
      setAskFocus(undefined);
      setAskFrom("");
      setQueue([withName(game.listenInvite)]);
    } else if (from.turns > 0) {
      const opener = openerAt(from.turns);
      const probe = game.probes[from.turns % Math.max(1, game.probes.length)] ?? "";
      setAskFocus(opener?.focus);
      setAskFrom(opener?.from ?? "");
      setQueue([withName(opener?.ask ?? "") || withName(probe)]);
    } else {
      const opener = openerAt(0);
      setAskFocus(opener?.focus);
      setAskFrom(opener?.from ?? "");
      setQueue([withName(game.opening), withName(opener?.ask ?? "")]);
    }
    recordContentProgress(meeting.id, { status: "started" });
  }, [game, meeting.id, saved, withName, openerAt]);

  /**
   * 1つの 発話を 見る。こえでも 文字でも、ここを 通る。
   *
   * ここで 投げられると 画面が 二度と 動かなく なる ので、**必ず 受け止める**。
   * 見かたが 出ない ことより、止まる ことの ほうが 重い。
   */
  const judge = useCallback(
    async (utterance: string, mode: "text" | "voice" = "text") => {
      if (!game) return;
      const said = utterance.trim();
      if (!said) return;
      /*
       * **飛んで いる 判定の 半券を 持つ**（2026-08-24 の 再検収 N1）。
       *
       * 見かたは 3秒ほど かかる。その あいだに「やめる」を 押した 学習者を、
       * 返事が 返った 瞬間に **ゲームへ 引き戻して いた**——ロビーに 出たのに
       * 12秒後に 全画面が かぶさって 板が 出る。番号が 変わって いたら、
       * その 判定は もう この 画面の ものでは ない ので 捨てる。
       */
      const ticket = turnRef.current + 1;
      turnRef.current = ticket;
      setTyped("");
      setPhase("thinking");
      const at = Date.now();
      const answer = await requestTalkTurn(`${meeting.id}:${talk.round}`, {
        round: talk.round,
        ask: askText,
        focus: talk.round === "talk" ? askFocus : undefined,
        hint: hints[0] ?? "",
        judgePrompt: meeting.judgePrompt ?? "",
        hostName: meeting.host.name,
        learnerName,
        utterance: said,
      }).catch(() => ({ ok: false as const, reason: "network" }));

      // やめた／もう一度 始めた あとの 返事は 捨てる（半券が 変わって いる）
      if (turnRef.current !== ticket) return;
      /*
       * **社長との 会話も 台帳に 残す**（2026-08-28 の 指定「各シートの回答についてと
       * ヘンディさん、松井社長との対話については、終了後1度でまとめてデータを送る」）。
       *
       * これまで この 教材は **端末の しおりしか 持って いなかった**ので、先生には
       * 何を 話したかが 一度も 見えなかった。置き場は ヘンディさんと 同じ 台帳
       *（`meeting_turn_logs`）。ここでは **ためるだけ**で、送るのは 話しきった とき 1回。
       *
       * 見かたは **持って いる ぶんだけ**残す。この 教材の 見かたには 三段の 評価
       *（`grade`）も 軸（ことば・かみ合い・かたち）も 無い——無い ものを それらしい
       * 既定で 埋めると、先生の 画面が 数えられない ものを 数えて しまう。
       */
      bufferMeetingTurn({
        meetingId: meeting.id,
        // 「何問目」の 無い 自由な 会話なので、**ばん**を 鍵に する（話す／聞く）
        questionId: `talk:${talk.round}`,
        attempt: talk.turns + 1,
        mode,
        utterance: said,
        judge: answer.ok
          ? {
              reply: answer.judgement.reply,
              praise: answer.judgement.praise,
              fix: answer.judgement.fix,
              exampleAnswer: answer.judgement.exampleAnswer,
            }
          : null,
        fallback: answer.ok ? "none" : answer.reason,
        model: answer.ok ? answer.model : "",
        latencyMs: Date.now() - at,
      });
      const observations = answer.ok
        ? answer.judgement.observations
        : localObservations(talk.round, said);
      /*
       * **その しつもんの 観点で 見る**（2026-08-31 の 指定）。答える前に 予告した 表と
       * 同じ ものを 使う——ここで 別の 表を 使うと、予告と 内訳が 食い違う。
       */
      const focus = talk.round === "talk" ? askFocus : undefined;
      const step = applyTurn(talk, plan, observations, focus);
      setTalk(step.state);
      // 画面が 自分で 出す 文は **かなだけ**（その場の 文には ルビを 合成できない）
      setNote(answer.ok ? null : "AIの みかたが いま つかえません。すすみかたは おなじです。");
      setResult({
        observations,
        focus,
        gained: step.gained,
        lifted: step.lifted,
        judgedAs: step.judgedAs,
        said,
        praise: answer.ok ? answer.judgement.praise : "じぶんの ことばで いえましたね。",
        /* AIが 「null」「なし」の 文字を 返す ことが ある。そのまま 出すと 画面に 出る */
        fix: answer.ok ? cleanFix(answer.judgement.fix) : "",
        example: answer.ok ? answer.judgement.exampleAnswer : "",
        /*
         * **答えた ことに 相手が 何も 言わない、を 作らない**（2026-08-31 の 指定
         * 「判定画面ですぐに次の質問に行ってしまう」）。AIに 通せない ときも、
         * 受け取った ことだけは 必ず 返す（`localReply`）。
         */
        reply: (answer.ok ? answer.judgement.reply : "") || localReply(talk.round, talk.turns),
        nextAsk: answer.ok ? answer.judgement.nextAsk : "",
      });
      /*
       * **これまでの 話を 画面に 残す**（2026-08-31 の 指定「今まで どのような 会話を
       * したかを UI に 入れられますか」）。上がった ぶんは **メーターが 動いた 数**
       *（観点＋底上げ）に そろえる——控えと リングで ちがう 数が 出ると、
       * どちらが 本当か 学習者には 決められない。
       */
      setLog((before) => [
        ...before,
        {
          ask: askText,
          said,
          gained: step.gained + step.lifted,
          reply: (answer.ok ? answer.judgement.reply : "") || localReply(talk.round, talk.turns),
        },
      ]);
      setPhase("feedback");
    },
    [game, meeting, plan, talk, askText, askFocus, hints, learnerName],
  );

  /** 見かたを 読み終えたら、社長の ことばへ もどる。 */
  const afterFeedback = useCallback(() => {
    if (!game || !result) return;
    const lines: string[] = [];
    /*
     * **返事が 先、しつもんは その あと**。ここを 1つの 列に 積んで 順に 出すので、
     * 学習者は「言った ことが 届いた」→「つぎを 聞かれる」の 2拍で 進む。
     * `result.reply` は `judge` で 必ず 中身が 入る（AIが 無い ときは `localReply`）。
     */
    if (result.reply) lines.push(result.reply);
    if (talk.round === "clear") {
      lines.push(withName(game.reward));
      setEnding(true);
    } else if (talk.round === "listen") {
      setAskFocus(undefined);
      setAskFrom("");
      lines.push(withName(game.listenInvite));
    } else {
      /*
       * **出だしの 2つは 教材が 決める**（2026-08-24 の 指定
       *「どんな 会社だと 思った？」「どんな ところが おもしろいと 思った？」）。
       * そこから 先の 深掘りは AIが 作る——学習者が 何を おもしろいと 言うかは
       * 先に 書けないので、書けるのは 入口だけ。
       */
      const opener = openerAt(talk.turns);
      /*
       * 予備は **出だしを 使いきった ところから** 順に 回す。`turns` で そのまま
       * 割って いた ころは、予備の 1つめ（「どうして、それが おもしろいと…」）が
       * 6ターン目まで 出ず、深掘りの 順が くずれて いた（2026-08-24 の 検収指摘）。
       */
      const at = Math.max(0, talk.turns - game.openers.length);
      const probe = game.probes[at % Math.max(1, game.probes.length)] ?? "";
      /*
       * 出だしを 使いきった あとの 深掘りには **準備の 対応が 無い**。観点は
       * 共通の 表（`focus` を 渡さない）に 戻し、`from` も 空に する——
       * 対応が 無いのに 「じゅんびの ◯」と 出すと、学習者は 書いた はずの ものを
       * 探しに 行って 見つけられない。
       */
      setAskFocus(opener?.focus);
      setAskFrom(opener?.from ?? "");
      lines.push(withName(opener?.ask ?? "") || result.nextAsk || withName(probe));
    }
    /*
     * **`result` は 消さない**（2026-08-31 の 指定「戻る ボタン」）。消して いた ころは、
     * 板を 閉じた 瞬間に 見かたが 二度と 出せなく なって いた。つぎの 発話を 見る
     * ときに 上書きされる ので、残って いるのは いつも「ひとつ 前の 見かた」1つ だけ。
     */
    setSpoken([]);
    setQueue(lines.filter((one) => one !== ""));
    setPhase("host");
  }, [game, result, talk.round, talk.turns, withName, openerAt]);

  /*
   * ばんが 変わったら **黙って つなぎ直す**（指示文は つなぐ ときにしか 渡せない）。
   * 聞く ばんに 入ると 相手の しごとが「答える」に 変わる。
   */
  const swapInstruction = voice.swapInstruction;
  const swappedRef = useRef(false);
  useEffect(() => {
    if (talk.round !== "listen") {
      // はじめから 遊び直した ときも、もう一度 張り直せる ように 戻す
      swappedRef.current = false;
      return;
    }
    if (swappedRef.current || voice.speaking) return;
    swappedRef.current = true;
    void swapInstruction(instruction, hostVoice);
  }, [talk.round, voice.speaking, swapInstruction, instruction, hostVoice]);

  // こえで 話した ぶんを 見る（相手が 話しはじめた 合図で 1つに 束ねて 届く）
  const judgedRef = useRef(0);
  useEffect(() => {
    const heard = voice.lastUtterance;
    if (!heard || heard.id === judgedRef.current) return;
    if (phase !== "me") return;
    judgedRef.current = heard.id;
    /*
     * 効果の 中で そのまま 状態を 変えない（描き直しが 連なる）。1つ 後ろへ ずらす。
     */
    void Promise.resolve().then(() => judge(heard.text, "voice"));
  }, [voice.lastUtterance, judge, phase]);

  /* 見かたの つなぎは 画面を 離れる ときに 閉じる（置き去りに しない）。 */
  useEffect(() => dropJudgeSession, []);

  useEffect(() => {
    if (phase !== "clear") return;
    recordContentProgress(meeting.id, { status: "completed" });
    // 話しきった。ためた 会話は ここで **1回だけ** 送る（2026-08-28 の 指定）
    void flushMeetingTurns(meeting.id);
  }, [phase, meeting.id]);

  /*
   * **しおりを 書く**（2026-08-21 の 指定「画面更新などした 場合でも 途中から」）。
   * 満タンまで 行ったら 消す——もう一度 開いた 人は はじめから 話せる ほうが よい。
   */
  useEffect(() => {
    if (phase === "lobby") return;
    if (talk.round === "clear") clearTalkResume(meeting.id);
    else saveTalkResume(meeting.id, talk);
  }, [phase, talk, meeting.id]);

  if (!game) return null;

  if (phase === "lobby") {
    return (
      <div className="card-island space-y-4 p-5">
        <div className="flex items-start gap-4">
          <div className="relative h-28 w-24 shrink-0">
            <Image
              src={game.figures.smile}
              alt={meeting.host.name}
              fill
              sizes="96px"
              className="object-contain object-bottom"
            />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-navy text-xl font-black">
              <RubyText text={meeting.title} index={furigana} show />
            </h2>
            <p className="text-ink text-sm font-bold">
              <DictionaryText
                text={withName(meeting.focus)}
                index={furigana}
                show
                dictionary={dictionary}
              />
            </p>
          </div>
        </div>

        <div
          className="rounded-xl px-4 py-3 text-sm font-bold"
          style={{ background: "var(--color-cream)", color: "var(--color-ink)" }}
        >
          <RubyText
            text={
              saved
                ? `いま こうかんど ${saved.percent}%。つづきから 話しましょう。`
                : `社長と 話して、こうかんど ${plan.goal}% を めざしましょう。`
            }
            index={CHROME_FURIGANA}
            show
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SpeechSpeedPicker
            value={speed ?? DEFAULT_SPEED}
            onChange={(id: SpeechSpeedId) => saveSpeechSpeed(id)}
            tone="light"
          />
          <button type="button" onClick={start} className="btn-game ml-auto rounded-full px-7 py-3">
            {saved ? "つづきから 話す ▶" : "はじめる ▶"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "relative aspect-[4/3] w-full overflow-hidden rounded-2xl sm:aspect-[16/9]"
          : "fixed inset-0 z-50"
      }
      style={{ background: "var(--color-ink)" }}
    >
      <TalkScene
        background={game.background}
        figure={figure}
        hostName={meeting.host.name}
        hostRole={meeting.host.role}
        percent={talk.percent}
        goal={plan.goal}
        /*
         * リングの 脇に 出す (+n) は **メーターが 動いた ぶん**。観点の ぶんだけ に すると、
         * 底上げが 乗る ターンで 数字と 動きが 食い違う（2026-08-24 の 検収指摘）。
         */
        gained={phase === "feedback" ? (result?.gained ?? 0) + (result?.lifted ?? 0) : 0}
        furigana={furigana}
        bright={phase === "feedback" || phase === "review" || phase === "clear"}
      >
        {/*
          **やめる 道を 1つ 置く**（2026-08-24 の 検収指摘）。全画面に なる ので、
          ここが 無いと 途中で 出る 手だてが ブラウザの 戻る しか なくなる——
          スマホの 戻るは アプリごと 出る 操作に なりやすい。
          しおりは 残る ので、進みは 消えない（`saveTalkResume`）。
        */}
        {phase !== "clear" ? (
          <button
            type="button"
            onClick={leave}
            className="text-ink-soft absolute top-3 right-28 rounded-full bg-white/90 px-3 py-1 text-xs font-black shadow"
          >
            やめる
          </button>
        ) : null}

        {/*
          **調べた ことを 見ながら 話す**（2026-08-27 の 指定）と **これまでの 話**。

          引き先は ミーティングと 同じ（`meeting.notes`）——「メモを 見ながら 話す」は
          画面ごとに 別の しくみを 持たない。板が 出て いる あいだは しまう
          （下に かぶさって どちらも 読めなくなる）。

          **左に 置く**（2026-08-31 の 指摘「好感度と 自分の 答えを 見る ボタンが
          被っています」）。右上は 好感度の リング（96px）の 場所で、`top-12 right-3` に
          置いた ボタンは そのまま リングの 上に 乗って いた。左は 名前ふだの 下が
          空いて いる——「おもしろい」の 札を 廃止した ぶん、まるごと 空いた。
        */}
        {phase !== "clear" && phase !== "feedback" && phase !== "review" ? (
          <div className="absolute top-24 left-3 flex flex-col items-start gap-1.5">
            <AnswerNotebook sources={meeting.notes} />
            {log.length > 0 ? (
              <button
                type="button"
                onClick={() => setLogOpen(true)}
                className="border-hairline bg-panel text-navy rounded-full border-2 px-3 py-1.5 text-xs font-extrabold"
              >
                🗒️ <RubyText text="これまでの 話" index={CHROME_FURIGANA} show />（{log.length}）
              </button>
            ) : null}
          </div>
        ) : null}

        {phase === "host" || phase === "thinking" ? (
          <SpeechPanel
            text={line}
            furigana={furigana}
            dictionary={dictionary}
            thinking={phase === "thinking"}
            onBack={phase === "host" && canGoBack ? backLine : undefined}
            onNext={nextLine}
          />
        ) : null}

        {phase === "me" ? (
          <AnswerPanel
            ask={askText}
            furigana={furigana}
            boardFurigana={boardFurigana}
            dictionary={dictionary}
            typed={typed}
            note={note}
            round={talk.round}
            focus={talk.round === "talk" ? askFocus : undefined}
            prepared={askFrom ? (prep[askFrom] ?? null) : null}
            hasHint={hints.length > 0}
            voice={voice}
            hostVoice={hostVoice}
            instruction={instruction}
            onBack={canGoBack ? backLine : undefined}
            onHint={() => setHintOpen(true)}
            onTyped={setTyped}
            onSend={() => void judge(typed)}
          />
        ) : null}

        {phase === "feedback" && result ? (
          <TalkFeedback
            round={result.judgedAs}
            focus={result.focus}
            observations={result.observations}
            gained={result.gained}
            lifted={result.lifted}
            said={result.said}
            praise={result.praise}
            fix={result.fix}
            example={result.example}
            furigana={boardFurigana}
            onNext={afterFeedback}
          />
        ) : null}

        {/*
          **ひとつ 前の 見かたを もう一度 開く**（「もどる」の 行き止まり）。
          板そのものは 同じ 部品で、ちがうのは ボタンの ことばだけ——
          ここで 別の 見た目に すると、同じ ものだと 分からなくなる。
        */}
        {phase === "review" && result ? (
          <TalkFeedback
            round={result.judgedAs}
            focus={result.focus}
            observations={result.observations}
            gained={result.gained}
            lifted={result.lifted}
            said={result.said}
            praise={result.praise}
            fix={result.fix}
            example={result.example}
            furigana={boardFurigana}
            onNext={leaveReview}
          />
        ) : null}

        {phase === "clear" ? (
          <ClearPanel
            hostName={meeting.host.name}
            goal={plan.goal}
            closing={withName(meeting.closing)}
            furigana={furigana}
            dictionary={dictionary}
            onLeave={leave}
          />
        ) : null}
      </TalkScene>

      {hintOpen ? (
        <HintModal lines={hints} hasBlank furigana={furigana} onClose={() => setHintOpen(false)} />
      ) : null}

      {logOpen ? (
        <TalkLog log={log} furigana={boardFurigana} onClose={() => setLogOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * これまでの 話（2026-08-31 の 指定「今まで どのような 会話を したかを UI に」）
 *
 * ## なぜ 要るか
 * この 会話は **その場で 流れて 消える**。しつもんも、自分の こたえも、社長の 返事も、
 * つぎへ 進んだ 瞬間に 画面から 無くなって いた。学習者は 何を 話したかを 覚えて おく
 * ために 会話に 気を 取られる——**思い出す 仕事**を 画面が 引き受ける。
 *
 * ## ヒントと 同じ「押すと 開く ひきだし」
 * 出しっぱなしに しない（docs/constraints.md 2026-08-20）。会話の 画面は もう 混んで
 * いて、常に 出すと 話す ボタンと 相手の 顔を 押し出す（`AnswerNotebook` と 同じ 判断）。
 *
 * ## 上がった ぶんだけ 見せる（点を つけ直さない）
 * 観点の 内訳は 出さない。ここは **何を 話したか**を 思い出す 場所で、
 * 見直しの 場所では ない。内訳が 要る 人は「もどる」で 見かたの 板を 開ける。
 */
function TalkLog({
  log,
  furigana,
  onClose,
}: {
  log: readonly TurnLog[];
  furigana: ReturnType<typeof buildFuriganaIndex>;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 grid place-items-end sm:place-items-center"
      style={{ background: "rgba(15,23,42,.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label="これまでの はなし"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-island max-h-[80%] w-full space-y-3 overflow-y-auto p-4 sm:max-w-lg sm:p-5"
      >
        <p className="text-navy text-base font-black">
          🗒️ <RubyText text="これまでの 話" index={furigana} show />
        </p>

        <ol className="space-y-3">
          {log.map((one, at) => (
            <li key={at} className="border-hairline rounded-xl border-2 p-3">
              <p className="text-ink-soft text-[11px] font-black">
                {at + 1}. <RubyText text="社長" index={furigana} show />
              </p>
              <p className="text-navy mt-0.5 text-xs font-bold break-words">{one.ask}</p>

              <p className="text-ink-soft mt-2 text-[11px] font-black">
                <RubyText text="あなた" index={furigana} show />
              </p>
              <p className="text-ink mt-0.5 text-xs font-bold break-words">「{one.said}」</p>

              {one.reply ? (
                <p className="text-ink-soft mt-2 text-xs font-bold break-words">
                  → <RubyText text={one.reply} index={furigana} show />
                </p>
              ) : null}

              <p
                className="mt-1 text-right text-xs font-black tabular-nums"
                style={{ color: "var(--color-coral-deep)" }}
              >
                こうかんど +{one.gained}%
              </p>
            </li>
          ))}
        </ol>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-game rounded-full px-6 py-2.5">
            とじる
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/** 社長が 話して いる あいだの セリフ枠。 */
function SpeechPanel({
  text,
  furigana,
  dictionary,
  thinking,
  onBack,
  onNext,
}: {
  text: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary?: readonly DictionaryEntry[];
  thinking: boolean;
  /** ひとつ 前へ もどす（もどる 先が 無い ときは 渡さない）。 */
  onBack?: () => void;
  onNext: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-white/95 p-4 shadow-xl sm:p-6"
      >
        <p className="text-navy text-base leading-relaxed font-black sm:text-xl">
          <DictionaryText text={text} index={furigana} show dictionary={dictionary} />
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          {/* もどるは 目立たせない（進む ほうが 本筋）。無い ときは 場所だけ 空ける */}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-ink-soft rounded-full border-2 px-4 py-2 text-sm font-black"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              ◀ もどる
            </button>
          ) : (
            <span />
          )}
          {thinking ? (
            <span className="text-ink-soft text-sm font-bold">きいて います…</span>
          ) : (
            <button type="button" onClick={onNext} className="btn-game rounded-full px-6 py-2.5">
              つぎへ ▶
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/** 学習者が 答える／聞く ばんの 板。 */
function AnswerPanel({
  ask,
  furigana,
  boardFurigana,
  dictionary,
  typed,
  note,
  round,
  focus,
  prepared,
  hasHint,
  voice,
  hostVoice,
  instruction,
  onBack,
  onHint,
  onTyped,
  onSend,
}: {
  ask: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  /** 画面の ことば（観点の 見出し）まで 覆う 索引。 */
  boardFurigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary?: readonly DictionaryEntry[];
  typed: string;
  note: string | null;
  round: TalkState["round"];
  /** この しつもんの「見る ところ」（答える前に 予告する）。 */
  focus?: readonly TalkFocus[];
  /** 準備フォームで この しつもんに あたる ものを 書いて いれば、その 行。 */
  prepared: NotebookLine | null;
  hasHint: boolean;
  voice: ReturnType<typeof useLiveVoice>;
  hostVoice?: string;
  instruction: string;
  /** 社長の ことばを もう一度 読む（もどる 先が 無い ときは 渡さない）。 */
  onBack?: () => void;
  onHint: () => void;
  onTyped: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2 rounded-3xl bg-white/95 p-3 shadow-xl sm:p-5"
      >
        <p className="text-ink-soft text-xs font-black">
          {round === "listen" ? "あなたが きく ばんです" : "あなたの ばんです"}
        </p>
        {/* `data-ask` は 検証の 手がかり（その場で 作られた しつもんかを 外から 見る）。 */}
        <p data-ask className="text-navy text-sm font-bold sm:text-base">
          <DictionaryText text={ask} index={furigana} show dictionary={dictionary} />
        </p>

        {/*
          **じゅんびで 書いた ことを、その しつもんの 横に 出す**（2026-08-31 の 指定
          「質問の内容が事前にまとめた内容と一致していない箇所があります」）。
          ひきだし（AnswerNotebook）は 5問ぶんを まとめて 出す ので、いま 聞かれて
          いるのが どれかは 学習者が 自分で 探す ことに なって いた。
        */}
        {prepared && prepared.answer.trim() !== "" ? (
          <div
            data-prepared
            className="rounded-xl border-2 px-3 py-2"
            style={{ borderColor: "var(--color-hairline)", background: "var(--color-cream)" }}
          >
            <p className="text-ink-soft text-[11px] font-black">
              <RubyText text="じゅんびで 書いた こと" index={boardFurigana} show />
              {prepared.section ? `（${prepared.section}）` : ""}
            </p>
            <p className="text-navy mt-0.5 text-xs font-bold break-words">
              {prepared.answer.trim()}
            </p>
          </div>
        ) : null}

        {/* **何を 見るかを 先に 出す**（採点の ものさしを 答える前に 見せる）。 */}
        <TalkRubric round={round} focus={focus} furigana={boardFurigana} />

        {note ? <p className="text-ink-soft text-[11px] font-bold">{note}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <SpeakButton
            status={voice.status}
            reason={voice.reason}
            talking={voice.talking}
            onConnect={() => void voice.start(instruction, hostVoice)}
            onStartTalking={voice.startTalking}
            onStopTalking={voice.stopTalking}
          />
          {hasHint ? (
            <button
              type="button"
              onClick={onHint}
              className="rounded-full border-2 px-3 py-1.5 text-xs font-black"
              style={{ borderColor: "var(--color-hairline)", color: "var(--color-navy)" }}
            >
              💡 ヒント
            </button>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-ink-soft rounded-full border-2 px-3 py-1.5 text-xs font-black"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              ◀ もどる
            </button>
          ) : null}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={typed}
            onChange={(event) => onTyped(event.target.value)}
            placeholder="もじで かいても いいです"
            aria-label="文字で 答える"
            className="text-ink min-w-0 flex-1 rounded-full border-2 px-4 py-2 text-sm font-bold"
            style={{ borderColor: "var(--color-hairline)" }}
          />
          <button
            type="submit"
            disabled={typed.trim() === ""}
            aria-label="おくる"
            className="btn-game shrink-0 rounded-full px-4 py-2 text-sm disabled:opacity-40"
          >
            ➤
          </button>
        </form>
      </motion.div>
    </div>
  );
}

/** 満タンに なった ときの 画面。 */
function ClearPanel({
  hostName,
  goal,
  closing,
  furigana,
  dictionary,
  onLeave,
}: {
  hostName: string;
  goal: number;
  closing: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary?: readonly DictionaryEntry[];
  onLeave: () => void;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card-island w-full max-w-xl space-y-3 p-5 text-center"
      >
        <p className="text-sun-deep text-3xl font-black">🏆 クリア！</p>
        <p className="text-navy text-lg font-black">
          <RubyText text={`${hostName}さんとの こうかんど ${goal}%`} index={furigana} show />
        </p>
        <p className="text-ink text-sm font-bold">
          <DictionaryText text={closing} index={furigana} show dictionary={dictionary} />
        </p>
        <button type="button" onClick={onLeave} className="btn-game rounded-full px-7 py-3">
          おわる
        </button>
      </motion.div>
    </div>
  );
}
