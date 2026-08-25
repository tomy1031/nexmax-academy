"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { DictionaryText } from "@/components/dictionary-text";
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
  foundCount,
  type TalkPlan,
  type TalkState,
  type TalkObservations,
} from "@/lib/talkgame/affinity";
import { localObservations, localTopic } from "@/lib/talkgame/local";
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
import { TalkFeedback, FEEDBACK_FURIGANA } from "./talk-feedback";
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

type Phase = "lobby" | "host" | "me" | "thinking" | "feedback" | "clear";

interface TurnResult {
  observations: TalkObservations;
  gained: number;
  /** 話しきった ぶんの 底上げ（観点とは 別に 見せる）。 */
  lifted: number;
  /** この 発話を 見た ときの ばん（切りかえ後では ない）。 */
  judgedAs: TalkState["round"];
  discovered: string | null;
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
  const [askText, setAskText] = useState("");
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
      findCount: game?.findCount ?? 5,
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
    if (phase === "feedback" || phase === "clear") return game.figures.smile;
    return game.figures.neutral;
  }, [game, phase]);

  const hints = useMemo(() => {
    if (!game) return [] as readonly string[];
    return talk.round === "listen" ? game.listenHints : game.talkHints;
  }, [game, talk.round]);

  /** つぎの ことばへ。ぜんぶ 出しきったら 学習者の ばん。 */
  const nextLine = useCallback(() => {
    const rest = queue.slice(1);
    if (rest.length === 0) {
      setAskText(queue[0] ?? "");
      setPhase(ending ? "clear" : "me");
    }
    setQueue(rest);
  }, [queue, ending]);

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
    setPhase("lobby");
  }, []);

  const start = useCallback(() => {
    if (!game) return;
    turnRef.current += 1;
    const from = saved ?? EMPTY_TALK;
    setTalk(from);
    setResult(null);
    setEnding(false);
    setPhase("host");
    /*
     * つづきの ときは **いまの ばんの 出だし**から 話し直す。
     * その場で AIが 作った 深掘りの しつもんは 残して いない——相手との つなぎは
     * 切れて いる ので、同じ 会話には 戻らない（`src/lib/talkgame/resume.ts`）。
     */
    if (from.round === "listen") {
      setQueue([withName(game.listenInvite)]);
    } else if (from.turns > 0) {
      const scripted = game.openers[from.turns] ?? "";
      const probe = game.probes[from.turns % Math.max(1, game.probes.length)] ?? "";
      setQueue([withName(scripted) || withName(probe)]);
    } else {
      setQueue([withName(game.opening), withName(game.openers[0] ?? "")]);
    }
    recordContentProgress(meeting.id, { status: "started" });
  }, [game, meeting.id, saved, withName]);

  /**
   * 1つの 発話を 見る。こえでも 文字でも、ここを 通る。
   *
   * ここで 投げられると 画面が 二度と 動かなく なる ので、**必ず 受け止める**。
   * 見かたが 出ない ことより、止まる ことの ほうが 重い。
   */
  const judge = useCallback(
    async (utterance: string) => {
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
      const remaining = Math.max(0, plan.findCount - talk.found.length);
      const answer = await requestTalkTurn(`${meeting.id}:${talk.round}`, {
        round: talk.round,
        ask: askText,
        hint: hints[0] ?? "",
        judgePrompt: meeting.judgePrompt ?? "",
        hostName: meeting.host.name,
        learnerName,
        utterance: said,
        found: talk.found,
        remaining,
      }).catch(() => ({ ok: false as const, reason: "network" }));

      // やめた／もう一度 始めた あとの 返事は 捨てる（半券が 変わって いる）
      if (turnRef.current !== ticket) return;
      const observations = answer.ok
        ? answer.judgement.observations
        : localObservations(talk.round, said);
      const topic = answer.ok ? answer.judgement.topic : localTopic(talk.round, said, observations);
      const step = applyTurn(talk, plan, observations, topic || null);
      setTalk(step.state);
      // 画面が 自分で 出す 文は **かなだけ**（その場の 文には ルビを 合成できない）
      setNote(answer.ok ? null : "AIの みかたが いま つかえません。すすみかたは おなじです。");
      setResult({
        observations,
        gained: step.gained,
        lifted: step.lifted,
        judgedAs: step.judgedAs,
        discovered: step.discovered,
        said,
        praise: answer.ok ? answer.judgement.praise : "じぶんの ことばで いえましたね。",
        /* AIが 「null」「なし」の 文字を 返す ことが ある。そのまま 出すと 画面に 出る */
        fix: answer.ok ? cleanFix(answer.judgement.fix) : "",
        example: answer.ok ? answer.judgement.exampleAnswer : "",
        reply: answer.ok ? answer.judgement.reply : "",
        nextAsk: answer.ok ? answer.judgement.nextAsk : "",
      });
      setPhase("feedback");
    },
    [game, meeting, plan, talk, askText, hints, learnerName],
  );

  /** 見かたを 読み終えたら、社長の ことばへ もどる。 */
  const afterFeedback = useCallback(() => {
    if (!game || !result) return;
    const lines: string[] = [];
    if (result.reply) lines.push(result.reply);
    if (talk.round === "clear") {
      lines.push(withName(game.reward));
      setEnding(true);
    } else if (talk.round === "listen") {
      lines.push(withName(game.listenInvite));
    } else {
      /*
       * **出だしの 2つは 教材が 決める**（2026-08-24 の 指定
       *「どんな 会社だと 思った？」「どんな ところが おもしろいと 思った？」）。
       * そこから 先の 深掘りは AIが 作る——学習者が 何を おもしろいと 言うかは
       * 先に 書けないので、書けるのは 入口だけ。
       */
      const scripted = game.openers[talk.turns] ?? "";
      /*
       * 予備は **出だしを 使いきった ところから** 順に 回す。`turns` で そのまま
       * 割って いた ころは、予備の 1つめ（「どうして、それが おもしろいと…」）が
       * 6ターン目まで 出ず、深掘りの 順が くずれて いた（2026-08-24 の 検収指摘）。
       */
      const at = Math.max(0, talk.turns - game.openers.length);
      const probe = game.probes[at % Math.max(1, game.probes.length)] ?? "";
      lines.push(withName(scripted) || result.nextAsk || withName(probe));
    }
    setResult(null);
    setQueue(lines.filter((one) => one !== ""));
    setPhase("host");
  }, [game, result, talk.round, talk.turns, withName]);

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
    void Promise.resolve().then(() => judge(heard.text));
  }, [voice.lastUtterance, judge, phase]);

  /* 見かたの つなぎは 画面を 離れる ときに 閉じる（置き去りに しない）。 */
  useEffect(() => dropJudgeSession, []);

  useEffect(() => {
    if (phase !== "clear") return;
    recordContentProgress(meeting.id, { status: "completed" });
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

  const found = foundCount(talk, plan);

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
                : `「おもしろい」を ${plan.findCount}つ 見つけて、こうかんど ${plan.goal}% を めざしましょう。`
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
        bright={phase === "feedback" || phase === "clear"}
      >
        {/* 見つけた「おもしろい」の 札 */}
        {/*
          板が 出て いる あいだは しまう。デスクトップでは 板が 左上に 来る ので、
          札と 重なって どちらも 読めなく なる（2026-08-24 の 検収指摘）。
        */}
        {phase !== "clear" && phase !== "feedback" ? (
          <div className="absolute top-24 left-3 flex flex-col gap-1">
            <span className="text-ink-soft rounded-full bg-white/85 px-2.5 py-0.5 text-[11px] font-black">
              おもしろい {found} / {plan.findCount}
            </span>
            {talk.found.slice(0, plan.findCount).map((one) => (
              <motion.span
                key={one}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-navy max-w-[9rem] truncate rounded-full bg-white/85 px-2.5 py-0.5 text-[11px] font-bold"
                title={one}
              >
                🔎 <RubyText text={one} index={boardFurigana} show />
              </motion.span>
            ))}
          </div>
        ) : null}

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

        {phase === "host" || phase === "thinking" ? (
          <SpeechPanel
            text={line}
            furigana={furigana}
            dictionary={dictionary}
            thinking={phase === "thinking"}
            onNext={nextLine}
          />
        ) : null}

        {phase === "me" ? (
          <AnswerPanel
            ask={askText}
            furigana={furigana}
            dictionary={dictionary}
            typed={typed}
            note={note}
            round={talk.round}
            hasHint={hints.length > 0}
            voice={voice}
            hostVoice={hostVoice}
            instruction={instruction}
            onHint={() => setHintOpen(true)}
            onTyped={setTyped}
            onSend={() => void judge(typed)}
          />
        ) : null}

        {phase === "feedback" && result ? (
          <TalkFeedback
            round={result.judgedAs}
            observations={result.observations}
            gained={result.gained}
            lifted={result.lifted}
            said={result.said}
            praise={result.praise}
            fix={result.fix}
            example={result.example}
            discovered={result.discovered}
            furigana={boardFurigana}
            onNext={afterFeedback}
          />
        ) : null}

        {phase === "clear" ? (
          <ClearPanel
            hostName={meeting.host.name}
            goal={plan.goal}
            found={talk.found}
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
    </div>
  );
}

/** 社長が 話して いる あいだの セリフ枠。 */
function SpeechPanel({
  text,
  furigana,
  dictionary,
  thinking,
  onNext,
}: {
  text: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary?: readonly DictionaryEntry[];
  thinking: boolean;
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
        <div className="mt-3 flex items-center justify-end">
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
  dictionary,
  typed,
  note,
  round,
  hasHint,
  voice,
  hostVoice,
  instruction,
  onHint,
  onTyped,
  onSend,
}: {
  ask: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dictionary?: readonly DictionaryEntry[];
  typed: string;
  note: string | null;
  round: TalkState["round"];
  hasHint: boolean;
  voice: ReturnType<typeof useLiveVoice>;
  hostVoice?: string;
  instruction: string;
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
  found,
  closing,
  furigana,
  dictionary,
  onLeave,
}: {
  hostName: string;
  goal: number;
  found: readonly string[];
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
        {found.length > 0 ? (
          <ul className="flex flex-wrap justify-center gap-1.5">
            {found.map((one) => (
              <li
                key={one}
                className="text-navy rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: "var(--color-sky-soft)" }}
              >
                🔎 <RubyText text={one} index={furigana} show />
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" onClick={onLeave} className="btn-game rounded-full px-7 py-3">
          おわる
        </button>
      </motion.div>
    </div>
  );
}
