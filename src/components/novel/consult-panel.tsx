"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Novel, NovelFailureType, NovelScene } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { requestNovelJudge, warmNovelJudge } from "@/components/meeting/judge-api";
import type { LiveVoice } from "@/components/meeting/use-live-voice";
import { useIsAdmin } from "@/lib/admin-flag";
import { readsExample, retryLevel, starsForFails, type NovelJudgment } from "@/lib/novel/judge";
import {
  DESK_FEEDBACK,
  DESK_FEEDBACK_EN,
  cardView,
  missingParts,
  reactionFace,
  reactionFor,
  showsTiming,
  type NovelFace,
} from "@/lib/novel/state";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { DeskApproach } from "./desk-approach";
import { FaceIcon } from "./face-icon";
import { MemoCard, MemoMaker, MemoOthers, type NovelMemo } from "./memo-panel";
import { playNovelSe } from "./novel-sound";

type ConsultScene = Extract<NovelScene, { type: "consult" }>;
type NoticeScene = Extract<NovelScene, { type: "notice" }>;

/**
 * 相談 — マイクで 話して、Gemini が「伝わったか」を 判定する（仕様書 v4 §5・§6）。
 *
 * 流れ:
 * 0. 話しかける タイミング（相手に 席の 絵が ある とき・要望 #723）。大丈夫そうな ときに 相手を 押す
 * 1. 声かけ（「◯◯さん、今、お時間 よろしいですか」）→ 相手が「はい、どう しましたか」
 * 2. 本題を 話す（マイクを 1回 押して 話しはじめ、もう 1回 押して 終わる）
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
  | "memo"
  | "approach"
  | "call"
  | "reply"
  | "talk"
  | "confirm"
  | "judging"
  | "react"
  | "whatif"
  | "error"
  | "passed";

const LISTEN_ONLY = [
  "あなたは 相談の 練習の 聞き係です。",
  "学生が 話し終わったら、何も 言いません。声でも 文字でも 返事を しません。",
  "しつもんも しません。あいづちも 打ちません。ただ 聞くだけです。",
].join("\n");

/** 先生用の「合格に する」を 押しつづける 時間。 */
const TEACHER_HOLD_MS = 3000;

/** 話し終えてから 聞き取りの 文が 届くまで 待つ 上限（それを 過ぎたら もう一度 押せる）。 */
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
  onApproach,
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
  /** 席の 絵を 見て いる あいだ（舞台の 立ち絵を 隠す——相手は まだ 席に いる）。 */
  onApproach: (on: boolean) => void;
  onFail: (type: NovelFailureType) => void;
  onPassed: (stars: number) => void;
  onNext: () => void;
}) {
  const isAdmin = useIsAdmin();
  /** 席の 絵（タイミングを 出す 相談だけ。悪い 知らせの 相談は 出さない——`showsTiming`）。 */
  const desk = showsTiming(novel, scene)
    ? novel.cast.find((one) => one.id === scene.to)?.desk
    : undefined;
  /** 席の 絵の あとの 段（席の 絵が あれば タイミングから）。 */
  const opening: Phase = desk ? "approach" : "call";
  /** 相談メモ（要望 #746）。あれば 話しかける 前に 作る。 */
  const [memo, setMemo] = useState<NovelMemo | null>(null);
  const [phase, setPhase] = useState<Phase>(cleared ? "passed" : scene.memo ? "memo" : opening);
  /** タイミングを 当てて 声かけに 来た（声かけの 上に「いい タイミング」を 出す）。 */
  const [timed, setTimed] = useState(false);
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
  /** 話し終えて、聞き取りの 文を 待って いる。 */
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

  /*
   * 席の 絵を 見て いる あいだは 舞台を 隠す。画面から 消える ときは 戻す。
   * 描く 前に 知らせる（`useLayoutEffect`）——ふつうの effect だと、相談に 入った
   * 1回目の 描画で 舞台が 一瞬 見える。
   */
  useLayoutEffect(() => {
    onApproach(phase === "approach");
  }, [phase, onApproach]);
  useLayoutEffect(() => () => onApproach(false), [onApproach]);

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

  /* 話し終えたら、文が 届くまで「聞き取って います」を 出す */
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
    setTimed(false);
    /* メモが まだ 無ければ メモから（合格して 戻って きた ときは メモを 作って いない） */
    setPhase(scene.memo && !memo ? "memo" : opening);
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
    <div
      className={phase === "approach" ? "flex h-full flex-col gap-2" : "space-y-3"}
      data-testid="novel-consult"
      data-phase={phase}
    >
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

      {/*
       * 相談メモ（あれば 気づきカードの かわり）。完成した 文は 出さず、ことばと 文の 枠だけ。
       */}
      {memo && phase !== "approach" && phase !== "memo" ? (
        <MemoCard memo={memo} frame={scene.memo?.frame} glow={glow} index={index} show={show} />
      ) : null}

      {/* 気づきカード（日ごとに 支えを 減らす）。席の 絵・メモを 作って いる ときは 出さない */}
      {notice && !memo && phase !== "approach" && phase !== "memo" ? (
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
                className="text-navy -my-1 rounded-full px-3 py-1.5 text-xs font-black underline"
                data-testid="novel-card-toggle"
              >
                {cardOpen ? "とじる" : "ひらく"}
              </button>
            ) : null}
          </div>
          {view ? (
            <ol className="text-navy mt-1 space-y-0.5 text-sm font-bold">
              <CardRow n={1} glow={glow.includes(1)} index={index} show={show}>
                <RubyText text={view.seen} index={index} show={show} />
              </CardRow>
              <CardRow n={2} glow={glow.includes(2)} index={index} show={show}>
                <RubyText text={view.diff} index={index} show={show} />
              </CardRow>
              <CardRow n={3} glow={glow.includes(3)} index={index} show={show}>
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
          {scene.memo ? (
            <div className="mt-2">
              <MemoOthers
                others={scene.memo.others}
                mine={memo?.ask ?? null}
                index={index}
                show={show}
                translation={translation}
              />
            </div>
          ) : null}
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
          {/* 0. 相談メモ（話しかける 前に 作る） */}
          {phase === "memo" && scene.memo ? (
            <MemoMaker
              spec={scene.memo}
              askForm={scene.askForm}
              index={index}
              show={show}
              translation={translation}
              onDone={(made) => {
                setMemo(made);
                setPhase(opening);
              }}
            />
          ) : null}

          {/* 0. 話しかける タイミング */}
          {phase === "approach" && desk ? (
            <div className="min-h-0 flex-1">
              <DeskApproach
                desk={desk}
                seed={scene.id}
                name={name}
                index={index}
                show={show}
                translation={translation}
                onWrong={() => playNovelSe("retry", volume)}
                onReady={() => {
                  playNovelSe("notice", volume);
                  setTimed(true);
                  setPhase("call");
                }}
              />
            </div>
          ) : null}

          {phase === "call" && timed ? (
            <p
              role="status"
              className="text-leaf-deep text-sm font-black"
              data-testid="novel-approach-ok"
            >
              ⭕ <RubyText text={DESK_FEEDBACK.ok} index={index} show={show} />
              {translation ? (
                <span className="text-ink-soft block text-xs font-medium">
                  {DESK_FEEDBACK_EN.ok}
                </span>
              ) : null}
            </p>
          ) : null}

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
                    text="①調べた こと ②わからない こと ③お願い を 話しましょう。"
                    index={index}
                    show={show}
                  />
                </p>
              ) : null}
              {showModel ? (
                <HintBox
                  title="お手本（1つの 例です）— 声に 出して 読みましょう"
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

          {/*
           * マイク（声かけ・本題）／テキスト入力（マイクが 使えない ときだけ）。
           * パネルの 下に はりつける——ヒントや お手本で 長く なっても、マイクは 見えた まま
           *（要望 #731「画面の 中に マイクなど 諸々の UI が 入るように」）。
           */}
          {phase === "call" || phase === "talk" || phase === "error" ? (
            <div
              className="sticky -bottom-3 z-10 -mx-2.5 border-t px-2.5 pt-2 pb-3 sm:-mx-3 sm:px-3"
              style={{ borderColor: "var(--color-hairline)", background: "var(--color-panel)" }}
              data-testid="novel-mic-dock"
            >
              {textMode ? (
                <TextInput
                  value={typed}
                  onChange={setTyped}
                  onSend={sendTyped}
                  index={index}
                  show={show}
                />
              ) : (
                <ToggleMic voice={voice} listening={listening} index={index} show={show} />
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CardRow({
  n,
  glow,
  index,
  show,
  children,
}: {
  n: 1 | 2 | 3;
  glow: boolean;
  index: FuriganaIndex;
  show: boolean;
  children: React.ReactNode;
}) {
  /* スキットと 同じ 型の 名前（調べた こと → わからない こと → お願い） */
  const label = ["調べた こと", "わからない こと", "お願い"][n - 1] ?? "";
  return (
    <li
      className="rounded-lg px-1.5 py-0.5"
      style={glow ? { boxShadow: "0 0 0 3px var(--color-coral)", background: "white" } : undefined}
      data-glow={glow ? "1" : undefined}
    >
      {["①", "②", "③"][n - 1]}{" "}
      <span className="text-ink-soft text-xs font-black">
        <RubyText text={label} index={index} show={show} />：
      </span>{" "}
      {children}
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
        /* 困って いる 人の 顔（立ち絵が ある 人だけ） */
        const face = person?.figures?.troubled;
        return (
          <p key={i} className="flex items-center gap-2 text-sm font-bold text-white">
            {face ? <FaceIcon src={face} size={44} /> : null}
            <span>
              <RubyText text={text} index={index} show={show} />
              {translation && line.en ? (
                <span className="block text-xs font-medium text-white/70">{line.en}</span>
              ) : null}
            </span>
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

/** 録音の 上限。押し忘れて 録音が つづかない ように、ここで 止めて 送る。 */
const TALK_LIMIT_MS = 60_000;
/** 押してから この 間は つぎの 押しを 無視する（二度押しで すぐ 切れない ように）。 */
const TAP_GUARD_MS = 300;

/**
 * マイクの ボタン — **1回 押して 話しはじめ、もう 1回 押して 終わる**（要望 #730）。
 * 以前は 押して いる あいだだけ 録音だったが、「押している間ではなく、一回クリックで
 * マイクON、もう一度クリックでマイクOFF」（tomy さん・2026-11-13）に した。
 * 押し忘れても {@link TALK_LIMIT_MS} で 止まる。
 */
function ToggleMic({
  voice,
  listening,
  index,
  show,
}: {
  voice: LiveVoice;
  /** 話し終えて、聞き取りの 文を 待って いる。 */
  listening: boolean;
  index: FuriganaIndex;
  show: boolean;
}) {
  const down = useRef(false);
  /* 録音した まま 場面が 変わった（ボタンが 消えた）ら、録音を 止める */
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
  const lastTap = useRef(0);
  /*
   * 録音が 外から 止まった（つなぎの 張り直し・30分の 期限）ら、こちらの 印も 戻す。
   * 戻さないと、つぎに 押しても `start` が 何も しなく なる（2026-11-13 の 検収）。
   */
  useEffect(() => {
    if (!voice.talking) down.current = false;
  }, [voice.talking]);
  /* 話して いる 秒数（止めたら 0 に 戻す——つぎの 話しはじめに 前の 秒数を 見せない） */
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!voice.talking) return;
    const began = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - began) / 1000)),
      500,
    );
    return () => {
      window.clearInterval(timer);
      setSeconds(0);
    };
  }, [voice.talking]);
  /* 押し忘れ: 上限で 止めて 送る */
  useEffect(() => {
    if (!voice.talking) return;
    const timer = window.setTimeout(() => {
      if (!down.current) return;
      down.current = false;
      stopRef.current();
    }, TALK_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [voice.talking]);
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
  const toggle = () => {
    /* すぐ 2回 押して、話す 前に 切れて しまうのを 防ぐ */
    const now = Date.now();
    if (now - lastTap.current < TAP_GUARD_MS) return;
    lastTap.current = now;
    if (voice.talking) stop();
    else start();
  };
  const left = Math.max(0, Math.ceil(TALK_LIMIT_MS / 1000) - seconds);
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        aria-pressed={voice.talking}
        aria-label={voice.talking ? "話し終わった" : "話す"}
        disabled={listening && !voice.talking}
        onClick={toggle}
        onKeyDown={(event) => {
          /* Enter を 押しっぱなしに した くり返しで、すぐ 切れない ように */
          if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
        }}
        className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full text-white shadow-lg select-none disabled:opacity-50"
        style={{
          background: voice.talking ? "#e64a5f" : "var(--color-coral)",
          boxShadow: `0 5px 0 ${voice.talking ? "#b93547" : "var(--color-coral-deep)"}`,
        }}
        data-testid="novel-mic"
      >
        {voice.talking ? (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 0 4px rgba(230,74,95,0.45)" }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.9, 0.2, 0.9] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            aria-hidden
          />
        ) : null}
        <span className="text-2xl leading-none" aria-hidden>
          {voice.talking ? "■" : "🎤"}
        </span>
      </button>
      <p className="text-navy min-w-0 text-left text-sm font-black" aria-live="polite">
        {voice.talking ? (
          <>
            <span className="text-coral-deep">
              ● <RubyText text="聞いて います…" index={index} show={show} />{" "}
              <span className="tabular-nums">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
              </span>
            </span>
            <span className="block text-xs">
              <RubyText
                text={
                  left <= 10
                    ? `あと ${left}秒。話し終わったら、もう 一度 押します。`
                    : "話し終わったら、もう 一度 押します。"
                }
                index={index}
                show={show}
              />
            </span>
          </>
        ) : listening ? (
          <RubyText text="聞き取って います…" index={index} show={show} />
        ) : (
          <RubyText text="押すと マイクが 入ります。" index={index} show={show} />
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
