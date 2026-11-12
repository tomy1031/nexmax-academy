"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Novel, NovelFailureType, NovelScene } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { requestNovelJudge, warmNovelJudge } from "@/components/meeting/judge-api";
import type { LiveVoice } from "@/components/meeting/use-live-voice";
import { useIsAdmin } from "@/lib/admin-flag";
import { readsExample, retryLevel, starsForFails, type NovelJudgment } from "@/lib/novel/judge";
import {
  cardView,
  missingParts,
  reactionFace,
  reactionFor,
  type NovelFace,
} from "@/lib/novel/state";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { playNovelSe } from "./novel-sound";

type ConsultScene = Extract<NovelScene, { type: "consult" }>;
type NoticeScene = Extract<NovelScene, { type: "notice" }>;

/**
 * 相談 — マイクで 話して、Gemini が「伝わったか」を 判定する（仕様書 v4 §5・§6）。
 *
 * 流れ:
 * 1. 声かけ（「◯◯さん、今、お時間 よろしいですか」）→ 相手が「はい、どう しましたか」
 * 2. 本題を 話す（ボタンを 押して いる あいだだけ 録音）
 * 3. 聞き取った 文を 見せる（ちがえば「言い直す」。回数に 数えない）
 * 4. 判定。合格なら 結果へ。やり直しなら 相手の 反応 → ヒントを 3段で 強く する
 *
 * Gemini は 判定だけ。**画面の 文は ぜんぶ 教材の データ**（反応・ヒント・穴あき・お手本）。
 *
 * ## AI が 使えなくても 止めない（2026-11-12 の 検収）
 * この 教材は ステージの 関門なので、キーが 無い・使いすぎ・つながらない ときに 止まると、
 * つぎの ミーティングにも 進めない（注意事項「鍵の 無い 端末でも 関門の 前で 手ぶらに しない」）。
 * そのときは **お手本を 読めば 合格**（星 1つ）に する——3回 失敗した あとと 同じ 道。
 *
 * ## 判定の つなぎは 1回ごとに 新しく する
 * 鍵に 送った 回数を 入れる。同じ つなぎを 使い回すと、前の 回の 返事（型）を
 * くり返す ことが ある（judge-api.ts の もんだいの 見かたと 同じ 事故）。
 */

type Phase =
  "call" | "reply" | "talk" | "confirm" | "judging" | "react" | "whatif" | "error" | "passed";

const LISTEN_ONLY = [
  "あなたは 相談の 練習の 聞き係です。",
  "学生が 話し終わったら、何も 言いません。声でも 文字でも 返事を しません。",
  "しつもんも しません。あいづちも 打ちません。ただ 聞くだけです。",
].join("\n");

/** 先生用の「合格に する」を 押しつづける 時間。 */
const TEACHER_HOLD_MS = 3000;

/** 指を 離してから 聞き取りの 文が 届くまで 待つ 上限（それを 過ぎたら もう一度 押せる）。 */
const LISTEN_WAIT_MS = 6000;

/**
 * AI の 判定が 使えない ときの 一言。**この 教材で 本当に 起きる ことだけ 書く**
 *（「先に 進みます」とは 書かない——進むのは お手本を 読んだ とき）。
 */
function failNote(reason: string): string {
  switch (reason) {
    case "busy":
      return "いま ほかの 判定を して います。少し 待ってから、もう 一度 送って ください。";
    case "noKey":
      return "Geminiの キーが ないので、AIの 判定は 使えません。下の お手本を 読めば 合格に なります。";
    case "quota":
    case "rateLimited":
      return "今日は AIを 使いすぎました。下の お手本を 読めば 合格に なります。";
    default:
      return "AIの 判定が 届きませんでした。もう 一度 送るか、下の お手本を 読めば 合格に なります。";
  }
}

export function ConsultPanel({
  scene,
  novel,
  notice,
  partnerName,
  fails,
  cleared,
  stars,
  hasKey,
  index,
  show,
  translation,
  volume,
  voice,
  onFace,
  onBusy,
  onFail,
  onPassed,
  onNext,
}: {
  scene: ConsultScene;
  novel: Novel;
  notice: NoticeScene | null;
  partnerName: string;
  /** これまでの 失敗の 回数（保存から。戻って きても 消さない）。 */
  fails: number;
  cleared: boolean;
  stars: number;
  /** Gemini の キーが ある か（無ければ はじめから お手本の 道）。 */
  hasKey: boolean;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  volume: number;
  voice: LiveVoice;
  onFace: (face: NovelFace | null) => void;
  /** 判定を 待って いる あいだ（もどる・ログを 止める）。 */
  onBusy: (busy: boolean) => void;
  onFail: (type: NovelFailureType) => void;
  onPassed: (stars: number) => void;
  onNext: () => void;
}) {
  const isAdmin = useIsAdmin();
  const [phase, setPhase] = useState<Phase>(cleared ? "passed" : "call");
  /** 合格した あとの「もう 一度 練習する」（記録の 失敗回数を 増やさない）。 */
  const [practice, setPractice] = useState(false);
  const [practiceFails, setPracticeFails] = useState(0);
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [last, setLast] = useState<{ judgment: NovelJudgment; type: NovelFailureType } | null>(
    null,
  );
  const [errorReason, setErrorReason] = useState<string | null>(hasKey ? null : "noKey");
  /** AI の 判定が 使えない（キーが 無い・届かなかった）。お手本を 読めば 合格。 */
  const [aiDown, setAiDown] = useState(!hasKey);
  const [cardOpen, setCardOpen] = useState(scene.support !== "closed");
  const [micErrors, setMicErrors] = useState(0);
  const [earned, setEarned] = useState(stars);
  /** 指を 離して、聞き取りの 文を 待って いる。 */
  const [listening, setListening] = useState(false);

  const effectiveFails = practice ? practiceFails : fails;
  const failsRef = useRef(effectiveFails);
  useEffect(() => {
    failsRef.current = effectiveFails;
  }, [effectiveFails]);

  /* 画面から 消えた あと・新しく 送った あとに 届いた 判定は 捨てる */
  const mounted = useRef(true);
  const runId = useRef(0);
  const attemptNo = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runId.current += 1;
      onBusy(false);
    };
  }, [onBusy]);

  const level = retryLevel(effectiveFails);
  const name = `${partnerName}さん`;
  const judgeKey = (n: number) => `${scene.id}:${n}`;

  /* 相談の つなぎを 先に 張る（声かけを して いる あいだに） */
  useEffect(() => {
    if (!cleared && hasKey) void warmNovelJudge(`${scene.id}:0`);
  }, [scene.id, cleared, hasKey]);

  /* マイクの つなぎが 失敗した 回数（2回で テキスト入力を 出す） */
  const prevStatus = useRef(voice.status);
  useEffect(() => {
    if (voice.status === "error" && prevStatus.current !== "error") {
      void Promise.resolve().then(() => setMicErrors((n) => n + 1));
    }
    prevStatus.current = voice.status;
  }, [voice.status]);
  /* キーが 無いと 聞き取り（Live）も 使えない ので、はじめから 文を 書く 欄に する */
  const textMode = !hasKey || voice.status === "notReady" || micErrors >= 2;

  /* 指を 離したら、文が 届くまで「聞き取って います」を 出す */
  const wasTalking = useRef(false);
  useEffect(() => {
    if (wasTalking.current && !voice.talking) {
      void Promise.resolve().then(() => setListening(true));
      const timer = window.setTimeout(() => setListening(false), LISTEN_WAIT_MS);
      wasTalking.current = voice.talking;
      return () => window.clearTimeout(timer);
    }
    wasTalking.current = voice.talking;
  }, [voice.talking]);

  const pass = useCallback(
    (failCount: number) => {
      const got = starsForFails(failCount);
      setEarned((now) => Math.max(now, got));
      playNovelSe("pass", volume);
      onFace("happy");
      setPhase("passed");
      setPractice(false);
      onPassed(got);
    },
    [volume, onFace, onPassed],
  );

  const judge = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said) return;
      setHeard(said);
      /* お手本を 見せて いる とき（3回 失敗・AI が 使えない）は、読めば 合格 */
      if ((failsRef.current >= 3 || aiDown) && readsExample(said, scene.example)) {
        pass(Math.max(failsRef.current, 3));
        return;
      }
      if (aiDown && !hasKey) {
        setErrorReason("noKey");
        setPhase("error");
        return;
      }
      runId.current += 1;
      const mine = runId.current;
      const key = judgeKey(attemptNo.current);
      attemptNo.current += 1;
      setPhase("judging");
      onBusy(true);
      const result = await requestNovelJudge(key, scene, partnerName, said);
      if (!mounted.current || runId.current !== mine) return;
      onBusy(false);
      if (!result.ok) {
        if (result.reason !== "busy") setAiDown(true);
        setErrorReason(result.reason);
        setPhase("error");
        return;
      }
      setAiDown(false);
      void warmNovelJudge(judgeKey(attemptNo.current));
      const { judgment } = result;
      if (judgment.result === "pass") {
        pass(failsRef.current);
        return;
      }
      const type = judgment.failureType === "none" ? "vague" : judgment.failureType;
      setLast({ judgment, type });
      playNovelSe("retry", volume);
      onFace(reactionFace(type));
      if (type !== "unclear_audio") {
        if (practice) setPracticeFails((n) => n + 1);
        else onFail(type);
        /* 1回目の ヒント（足りない 番号を 光らせる）は カードが 開いて いないと 見えない */
        setCardOpen(true);
      }
      const whatIf = scene.whatIf?.[type as "decided_alone" | "hiding"];
      setPhase(whatIf && whatIf.length > 0 ? "whatif" : "react");
    },
    // judgeKey は scene.id だけで 決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, partnerName, volume, onFace, onFail, onBusy, aiDown, hasKey, practice, pass],
  );

  /* 声で 話した ぶん（`lastUtterance` は 学生の ことば） */
  const spokenAt = useRef(voice.lastUtterance?.id ?? 0);
  useEffect(() => {
    const said = voice.lastUtterance;
    if (!said || said.id === spokenAt.current) return;
    spokenAt.current = said.id;
    const text = said.text.trim();
    void Promise.resolve().then(() => {
      setListening(false);
      if (!text) return;
      if (phase === "call") {
        setPhase("reply");
        return;
      }
      if (phase === "talk" || phase === "error") {
        setHeard(text);
        setPhase("confirm");
      }
    });
  }, [voice.lastUtterance, phase]);

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    if (phase === "call") {
      setPhase("reply");
      return;
    }
    void judge(text);
  };

  /* ---- 先生用: 3秒 押しつづけると 合格に する（先生の 端末だけ） ---- */
  const holdTimer = useRef<number | null>(null);
  const stopTeacherHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const startTeacherHold = () => {
    stopTeacherHold();
    holdTimer.current = window.setTimeout(() => pass(failsRef.current), TEACHER_HOLD_MS);
  };
  useEffect(() => () => stopTeacherHold(), []);

  const restart = () => {
    setPractice(true);
    setPracticeFails(0);
    setPhase("call");
    setLast(null);
    onFace(null);
  };

  const view = notice ? cardView(notice.card, scene.support, cardOpen) : null;
  const glow = level >= 1 && last ? missingParts(last.judgment) : [];
  const reaction = last ? reactionFor(novel, scene, last.type) : null;
  const showPassed = phase === "passed" && !practice;
  /* お手本を 見せる とき（3回 失敗・AI が 使えない） */
  const showModel = level >= 3 || aiDown;

  return (
    <div className="space-y-3" data-testid="novel-consult" data-phase={phase}>
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-on-accent rounded-full px-3 py-1 text-xs font-black select-none"
          style={{ background: "var(--color-coral-deep)" }}
          {...(isAdmin
            ? {
                onPointerDown: startTeacherHold,
                onPointerUp: stopTeacherHold,
                onPointerLeave: stopTeacherHold,
                onPointerCancel: stopTeacherHold,
                "data-teacher": "1",
              }
            : {})}
          data-testid="novel-teacher-pass"
        >
          🗣 <RubyText text={`${name}に 相談`} index={index} show={show} />
        </span>
        {effectiveFails > 0 && !showPassed ? (
          <span className="text-ink-soft text-xs font-bold">
            <RubyText text={`やり直し ${effectiveFails}回`} index={index} show={show} />
          </span>
        ) : null}
      </div>

      {/* 気づきカード（日ごとに 支えを 減らす） */}
      {notice ? (
        <section
          className="rounded-2xl border-2 p-3"
          style={{ borderColor: "var(--color-sun)", background: "var(--color-cream)" }}
          data-testid="novel-card"
        >
          <div className="flex items-center justify-between">
            <p className="text-navy text-sm font-black">
              💡 <RubyText text="気づきカード" index={index} show={show} />
            </p>
            {scene.support === "closed" ? (
              <button
                type="button"
                onClick={() => setCardOpen((open) => !open)}
                className="text-navy text-xs font-black underline"
                data-testid="novel-card-toggle"
              >
                {cardOpen ? "とじる" : "ひらく"}
              </button>
            ) : null}
          </div>
          {view ? (
            <ol className="text-navy mt-1 space-y-0.5 text-sm font-bold">
              <CardRow n={1} glow={glow.includes(1)}>
                <RubyText text={view.seen} index={index} show={show} />
              </CardRow>
              <CardRow n={2} glow={glow.includes(2)}>
                <RubyText text={view.diff} index={index} show={show} />
              </CardRow>
              <CardRow n={3} glow={glow.includes(3)}>
                {scene.support === "form" && scene.askForm ? (
                  <RubyText text={scene.askForm} index={index} show={show} />
                ) : (
                  <span className="text-ink-soft">……</span>
                )}
              </CardRow>
            </ol>
          ) : null}
          {view && (scene.support === "form" || scene.support === "sentence") ? (
            <p className="text-ink-soft mt-1 text-xs font-bold">
              <RubyText text="③は、あなたが 考えて 言います。" index={index} show={show} />
            </p>
          ) : null}
        </section>
      ) : null}

      {showPassed ? (
        <div
          className="rounded-2xl border-2 p-3 text-center"
          style={{ borderColor: "var(--color-leaf)", background: "white" }}
          data-testid="novel-passed"
          data-stars={earned}
        >
          <p className="text-leaf-deep text-lg font-black">
            ⭕ <RubyText text="合格" index={index} show={show} />
          </p>
          <p className="text-2xl" aria-label={`星 ${earned}つ`}>
            {"★".repeat(earned)}
            <span className="text-ink-faint">{"★".repeat(Math.max(0, 3 - earned))}</span>
          </p>
          {heard ? <p className="text-ink-soft mt-1 text-xs font-bold">「{heard}」</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onNext}
              className="btn-island btn-game flex-1 px-4 py-2.5"
            >
              つぎへ
            </button>
            <button
              type="button"
              onClick={restart}
              className="border-hairline bg-panel text-navy rounded-xl border-2 px-3 py-2 text-xs font-black"
            >
              <RubyText text="もう 一度 練習する" index={index} show={show} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 1. 声かけ */}
          {phase === "call" ? (
            <Bubble who="me" index={index} show={show}>
              <p className="text-ink-soft text-xs font-bold">
                <RubyText text="まず 声を かけましょう" index={index} show={show} />
              </p>
              <RubyText text={`「${scene.call}」`} index={index} show={show} />
            </Bubble>
          ) : null}

          {/* 相手の 返事 → 本題へ */}
          {phase === "reply" ? (
            <div className="space-y-2">
              <Bubble who={name} index={index} show={show}>
                <RubyText text={scene.reply} index={index} show={show} />
                {translation && scene.replyEn ? (
                  <span className="text-ink-soft block text-xs font-medium">{scene.replyEn}</span>
                ) : null}
              </Bubble>
              <button
                type="button"
                onClick={() => setPhase("talk")}
                className="btn-island btn-game w-full px-6 py-3"
                data-testid="novel-to-talk"
              >
                <RubyText text="話す ▶" index={index} show={show} />
              </button>
            </div>
          ) : null}

          {/* 2. 本題（＋ やり直しの ヒント） */}
          {phase === "talk" || phase === "error" ? (
            <div className="space-y-2">
              {phase === "talk" ? (
                <p className="text-navy text-sm font-black">
                  🗣{" "}
                  <RubyText
                    text="①見たもの・した こと ②ちがい・問題 ③質問・お願い を 話しましょう。"
                    index={index}
                    show={show}
                  />
                </p>
              ) : null}
              {showModel ? (
                <HintBox
                  title="お手本（Model）— 声に 出して 読みましょう"
                  text={scene.example}
                  en={scene.exampleEn}
                  translation={translation}
                  index={index}
                  show={show}
                />
              ) : level >= 2 ? (
                <HintBox
                  title="ヒント（穴あきの 文 / Fill in the blanks）"
                  text={scene.cloze}
                  translation={translation}
                  index={index}
                  show={show}
                />
              ) : null}
            </div>
          ) : null}

          {/* 3. 聞き取った 文の 確認 */}
          {phase === "confirm" ? (
            <div className="space-y-2" data-testid="novel-confirm">
              <p className="text-ink-soft text-xs font-bold">
                <RubyText text="聞き取った 文" index={index} show={show} />
              </p>
              <p className="rounded-xl bg-white px-3 py-2 text-sm font-bold">「{heard}」</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void judge(heard)}
                  className="btn-island btn-game flex-1 px-4 py-2.5"
                  data-testid="novel-send"
                >
                  <RubyText text="これで 送る" index={index} show={show} />
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("talk")}
                  className="border-hairline bg-panel text-navy rounded-xl border-2 px-3 py-2 text-xs font-black"
                >
                  <RubyText text="言い直す" index={index} show={show} />
                </button>
              </div>
            </div>
          ) : null}

          {phase === "judging" ? (
            <p role="status" className="text-navy animate-pulse text-center text-sm font-black">
              <RubyText text={`${name}が 聞いて います…`} index={index} show={show} />
            </p>
          ) : null}

          {/* 「もしも」の 場面（勝手に 決める・問題を 隠す） */}
          {phase === "whatif" && last ? (
            <WhatIf
              lines={scene.whatIf?.[last.type as "decided_alone" | "hiding"] ?? []}
              cast={novel.cast}
              translation={translation}
              index={index}
              show={show}
              onDone={() => setPhase("react")}
            />
          ) : null}

          {/* 4. 相手の 反応 → ヒント */}
          {phase === "react" && last && reaction ? (
            <div className="space-y-2" data-testid="novel-react" data-type={last.type}>
              {last.type !== "unclear_audio" ? (
                <p className="text-coral-deep text-sm font-black" data-testid="novel-not-yet">
                  🔁 <RubyText text="まだ 合格では ありません。" index={index} show={show} />
                </p>
              ) : null}
              <Bubble who={name} index={index} show={show}>
                <RubyText text={reaction.text} index={index} show={show} />
                {translation && reaction.en ? (
                  <span className="text-ink-soft block text-xs font-medium">{reaction.en}</span>
                ) : null}
              </Bubble>
              {heard ? (
                <p className="text-ink-soft text-xs font-bold">
                  <RubyText text={`聞き取った 文：「${heard}」`} index={index} show={show} />
                </p>
              ) : null}
              <p
                className="rounded-xl px-3 py-2 text-sm font-black"
                style={{ background: "var(--color-cream)", color: "var(--color-coral-deep)" }}
              >
                💡 <RubyText text={reaction.hint} index={index} show={show} />
                {translation && reaction.hintEn ? (
                  <span className="text-ink-soft block text-xs font-medium">{reaction.hintEn}</span>
                ) : null}
              </p>
              {last.type === "unclear_audio" ? (
                <p className="text-ink-soft text-xs font-bold">
                  <RubyText
                    text="これは やり直しの 回数に 入りません。"
                    index={index}
                    show={show}
                  />
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onFace(null);
                  setPhase("talk");
                }}
                className="btn-island btn-game w-full px-6 py-3"
                data-testid="novel-again"
              >
                <RubyText text="もう 一度 話す" index={index} show={show} />
              </button>
            </div>
          ) : null}

          {phase === "error" || (phase === "talk" && aiDown) ? (
            <div className="space-y-2" data-testid="novel-error" data-reason={errorReason ?? ""}>
              <p
                role="status"
                className="rounded-xl px-3 py-2 text-sm font-bold"
                style={{ background: "var(--color-cream)", color: "var(--color-navy)" }}
              >
                <RubyText text={failNote(errorReason ?? "")} index={index} show={show} />
              </p>
              {phase === "error" && hasKey && heard ? (
                <button
                  type="button"
                  onClick={() => void judge(heard)}
                  className="btn-island btn-game w-full px-4 py-2.5"
                  data-testid="novel-resend"
                >
                  <RubyText text="もう 一度 送る" index={index} show={show} />
                </button>
              ) : null}
            </div>
          ) : null}

          {/* マイク（声かけ・本題）／テキスト入力（マイクが 使えない ときだけ） */}
          {phase === "call" || phase === "talk" || phase === "error" ? (
            textMode ? (
              <TextInput
                value={typed}
                onChange={setTyped}
                onSend={sendTyped}
                index={index}
                show={show}
              />
            ) : (
              <HoldMic voice={voice} listening={listening} index={index} show={show} />
            )
          ) : null}
        </>
      )}
    </div>
  );
}

function CardRow({
  n,
  glow,
  children,
}: {
  n: 1 | 2 | 3;
  glow: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className="rounded-lg px-1.5 py-0.5"
      style={glow ? { boxShadow: "0 0 0 3px var(--color-coral)", background: "white" } : undefined}
      data-glow={glow ? "1" : undefined}
    >
      {["①", "②", "③"][n - 1]} {children}
    </li>
  );
}

function Bubble({
  who,
  index,
  show,
  children,
}: {
  who: string;
  index: FuriganaIndex;
  show: boolean;
  children: React.ReactNode;
}) {
  const me = who === "me";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 px-3 py-2 text-sm font-bold ${me ? "ml-6" : "mr-6"}`}
      style={{
        borderColor: me ? "var(--color-sky)" : "var(--color-hairline)",
        background: me ? "var(--color-sky-soft)" : "white",
      }}
    >
      <p className="text-ink-soft text-[11px] font-black">
        {me ? "あなた" : <RubyText text={who} index={index} show={show} />}
      </p>
      <div className="text-navy">{children}</div>
    </motion.div>
  );
}

function HintBox({
  title,
  text,
  en,
  translation,
  index,
  show,
}: {
  title: string;
  text: string;
  en?: string;
  translation: boolean;
  index: FuriganaIndex;
  show: boolean;
}) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed px-3 py-2"
      style={{ borderColor: "var(--color-sun-deep)", background: "white" }}
      data-testid="novel-hint"
    >
      <p className="text-ink-soft text-xs font-black">
        <RubyText text={title} index={index} show={show} />
      </p>
      <p className="text-navy text-sm font-bold">
        <RubyText text={text} index={index} show={show} />
      </p>
      {translation && en ? <p className="text-ink-soft text-xs font-medium">{en}</p> : null}
    </div>
  );
}

/** 「もしも」— 画面を 暗く して、そのまま 進んだら 何が 起きるかを 1〜2行 見せる。 */
function WhatIf({
  lines,
  cast,
  translation,
  index,
  show,
  onDone,
}: {
  lines: readonly { speaker: string; text: string; en?: string }[];
  cast: Novel["cast"];
  translation: boolean;
  index: FuriganaIndex;
  show: boolean;
  onDone: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-2 rounded-2xl p-4"
      style={{ background: "var(--color-ink)" }}
      data-testid="novel-whatif"
    >
      <p className="text-xs font-black text-white/70">
        <RubyText text="もしも このまま 進んだら…" index={index} show={show} />
      </p>
      {lines.map((line, i) => {
        const person = cast.find((one) => one.id === line.speaker);
        const text = person ? `${person.name}さん「${line.text}」` : line.text;
        return (
          <p key={i} className="text-sm font-bold text-white">
            <RubyText text={text} index={index} show={show} />
            {translation && line.en ? (
              <span className="block text-xs font-medium text-white/70">{line.en}</span>
            ) : null}
          </p>
        );
      })}
      <p className="text-sm font-black" style={{ color: "var(--color-sun)" }}>
        <RubyText text="こう ならない ように、もう 一度 話しましょう。" index={index} show={show} />
      </p>
      <button type="button" onClick={onDone} className="btn-island btn-game w-full px-6 py-2.5">
        つぎへ
      </button>
    </motion.div>
  );
}

/**
 * マイクの ボタン — **押して いる あいだだけ 録音**（となりの 声を 拾いにくく する）。
 * 指を 離すと 送る。キーボードでは スペースを 押して いる あいだ。
 */
function HoldMic({
  voice,
  listening,
  index,
  show,
}: {
  voice: LiveVoice;
  /** 指を 離して、聞き取りの 文を 待って いる。 */
  listening: boolean;
  index: FuriganaIndex;
  show: boolean;
}) {
  const down = useRef(false);
  /* 押した まま 場面が 変わった（ボタンが 消えた）ら、録音を 止める */
  const stopRef = useRef(voice.stopTalking);
  useEffect(() => {
    stopRef.current = voice.stopTalking;
  }, [voice.stopTalking]);
  useEffect(
    () => () => {
      if (down.current) {
        down.current = false;
        stopRef.current();
      }
    },
    [],
  );
  if (voice.status !== "live") {
    const connecting = voice.status === "connecting";
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => void voice.start(LISTEN_ONLY)}
          disabled={connecting}
          className="btn-island btn-game w-full px-6 py-3 disabled:opacity-50"
          data-testid="novel-mic-connect"
        >
          {connecting ? (
            <RubyText text="マイクを つないで います…" index={index} show={show} />
          ) : (
            <RubyText text="🎤 マイクを つなぐ" index={index} show={show} />
          )}
        </button>
        {voice.status === "error" ? (
          <p className="text-ink-soft mt-1 text-xs font-bold">
            <RubyText
              text="つながりませんでした。もう 一度 押して ください。"
              index={index}
              show={show}
            />
          </p>
        ) : null}
      </div>
    );
  }
  const start = () => {
    if (down.current) return;
    down.current = true;
    voice.startTalking();
  };
  const stop = () => {
    if (!down.current) return;
    down.current = false;
    voice.stopTalking();
  };
  return (
    <div className="text-center">
      <button
        type="button"
        aria-pressed={voice.talking}
        aria-label="押して いる あいだ 話す"
        disabled={listening && !voice.talking}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            start();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            stop();
          }
        }}
        className="mx-auto grid h-20 w-20 touch-none place-items-center rounded-full text-3xl text-white shadow-lg select-none disabled:opacity-50"
        style={{
          background: voice.talking ? "#e64a5f" : "#58c273",
          boxShadow: `0 6px 0 ${voice.talking ? "#b93547" : "#3aa458"}`,
        }}
        data-testid="novel-mic"
      >
        {voice.talking ? "🔴" : "🎤"}
      </button>
      <p className="text-navy mt-2 text-sm font-black">
        {voice.talking ? (
          <RubyText text="話し終わったら 指を 離す" index={index} show={show} />
        ) : listening ? (
          <RubyText text="聞き取って います…" index={index} show={show} />
        ) : (
          <RubyText text="押して いる あいだ 話す" index={index} show={show} />
        )}
      </p>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  onSend,
  index,
  show,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  index: FuriganaIndex;
  show: boolean;
}) {
  return (
    <div className="space-y-1.5" data-testid="novel-text">
      <p className="text-ink-soft text-xs font-bold">
        <RubyText
          text="いまは 声が 使えないので、文を 書いて 送ります。"
          index={index}
          show={show}
        />
      </p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) onSend();
          }}
          className="border-hairline min-w-0 flex-1 rounded-xl border-2 bg-white px-3 py-2 text-sm"
          aria-label="相談の 文"
          placeholder="ここに かいて ください"
          data-testid="novel-text-input"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          className="btn-island btn-game px-4 py-2 disabled:opacity-40"
          data-testid="novel-text-send"
        >
          <RubyText text="送る" index={index} show={show} />
        </button>
      </div>
    </div>
  );
}
