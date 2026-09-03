"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Word, WordStage } from "@/content/schema";
import type { WordGroupHead } from "@/lib/wordstage-merge";
import { FeedbackMessage } from "@/components/feedback-message";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaEntry } from "@/lib/text/furigana";
import { isHiraganaInputReady } from "@/lib/text/normalize";
import { createProgressStore, recordContentProgress } from "@/lib/progress/store";
import {
  arcadeReducer,
  choiceSeconds,
  createSession,
  currentQuestion,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  sceneSpeed,
  START_LIFE,
  summarize,
  type ArcadeAction,
  type ArcadeMode,
  type ArcadeState,
  type Difficulty,
} from "./arcade-reducer";
import { ArcadeScene, HudChip } from "./arcade-scene";
import type { TermOutcome } from "./arcade-three";
import { ArcadeButton, ArcadePanel } from "./arcade-panel";
import { ApproachClock, DamageFlash, McqTerm, ScorePop, Verdict } from "./arcade-fx";
import { ArcadeResult } from "./arcade-result";
import { FlashcardDeck } from "./flashcard-deck";
import { MeaningChoice } from "./meaning-choice";
import { ReadingInput } from "./reading-input";
import { WordDictionary } from "./word-dictionary";
import { useLearnerWordSets } from "@/lib/wordset-store";
import { fieldForIndex } from "./scheduler";
import { useCountdown } from "./use-countdown";

/**
 * 単語テスト（旧 wordtest / DATA DIVE）。
 *
 * 旧アプリの画面構成をそのまま持ってくる:
 *   全画面の舞台の上に、四隅のHUD・中央の用語・下端の入力。
 *   画面の中の小さな枠に収めない。「迫ってくる」は画面を占有してこそ成立する。
 *
 * 世界と迫る用語は three.js（arcade-three.ts）。旧アプリのシーンをそのまま移した。
 * 変えたのは進行の持ち方だけ（グローバル変数 → 純関数reducer）で、
 * 遊び方・得点式・5モード・難易度の効き方は原典どおり。
 *
 * 読みの時間切れは秒数ではなく、用語がカメラに届いたとき（旧 `enemyZ > 30`）。
 * 距離と速さが時間を決めるので、難しさを変えると迫る速さがそのまま変わる。
 */

type Screen =
  | { kind: "stageSelect" }
  /** 一覧の 1行を 押した あと、その 中の セット（初級・中級…）を えらぶ。 */
  | { kind: "setSelect"; groupId: string }
  | { kind: "mode"; stageId: string }
  | { kind: "hiraCheck"; stageId: string; mode: ArcadeMode }
  | { kind: "play"; stageId: string }
  | { kind: "result"; stageId: string }
  | { kind: "flashcard"; stageId: string }
  | { kind: "dictionary"; stageId: string };

/**
 * えらぶ 画面の 1行。一段目（ステージ）でも 二段目（セット）でも 同じ 形にする——
 * 札の 中身が 場所で 変わると、学習者は 同じ ものを 2通りの 顔で 覚えることになる。
 */
type SelectItem = Omit<WordGroupHead, "setIds">;

function headItem(head: WordGroupHead): SelectItem {
  return {
    id: head.id,
    title: head.title,
    furigana: head.furigana,
    wordCount: head.wordCount,
    passRate: head.passRate,
    ...(head.label ? { label: head.label } : {}),
  };
}

function itemOfSet(set: WordStage): SelectItem {
  return {
    id: set.id,
    title: set.title,
    furigana: set.furigana,
    wordCount: set.words.length,
    passRate: set.passRate,
    ...(set.label ? { label: set.label } : {}),
  };
}

/** 解説の自動送り（旧アプリと同じく、押すと早送りできる）。 */
const EXPLAIN_MS = 2800;

export function ArcadeGame({
  /**
   * 遊ぶ セット。**渡さないと ブラウザが 取りに 行く**（`src/lib/wordset-store.ts`）。
   *
   * ぜんぶ 見せる 入口（`/wordtest` と、どの ステージにも 付いて いない ことば）で
   * セット 10本を ここに 渡して いた ころは、213KB の データが **作りおき 1.1MB**に
   * なって いた —— サーバ部品から クライアント部品への 受け渡しは HTML と RSC の
   * 両方に 積まれる ため（docs/deploy.md §0.14）。
   *
   * ステージから 来た ときは **その ステージの セットだけ**を 渡す（数十KB）。
   * ここを 取りに 行かせると、二段目の えらぶ 画面に よその 課の ことばが 並ぶ。
   */
  stages: provided,
  /** レッスンから直接呼ばれたときの入り口。単語だけで開いたときは未指定。 */
  initialStageId,
  /**
   * 出るときの 行き先（ふつうは `/<ステージID>`）。
   *
   * 単語テストは **ステージから 直行できる**（`/[stage]` の
   * 「さいしょに ことばを おぼえる」）。そこから 来た 学習者を マップへ 出すと、
   * つづきの 教材が ある ステージを 地図の 上から 探し直す ことに なる。
   * 出どころは クエリでなく データから 引く（`wordStageOwner`）ので、
   * URLを 直接 開いた 人にも 同じ 戻り道が 出る。
   *
   * どの ステージにも 付いて いない ことばでは 未指定。そのときは これまでどおり マップ。
   */
  backTo,
  /**
   * 出口の 札に 出す **ステージの 名前**（`backTo` の 行き先の 名前）。
   *
   * セットの 見出しから 借りない——セット名の 付いた ものは 自分の 見出しを
   * 持って いる ので（「報連相：連絡の ことば」）、押した 先（`/renraku`）と
   * 札の 字が ずれる。行き先を 決める 側が 名前も わたす。
   */
  backTitle,
  /**
   * 一覧（`/wordtest`）の 行。**1ステージ 1行**で、中に セットが 入って いる。
   *
   * これを 渡すと 画面が **二段**に なる（願い #280 の 直し・2026-08-31
   *「会社を知るを選ぶと、初級・中級・上級が選択できるようにしてください」）:
   * 一覧の 行 → セットを えらぶ → やりかたを えらぶ。セットが 1つの 行は
   * えらぶ 画面を はさまず、そのまま やりかた選びに 入る。
   *
   * ステージから 来た ときは 未指定。手わたされる `stages` が すでに
   * **その ステージの セットだけ**なので、一段目が 要らない。
   */
  groups,
}: {
  stages?: readonly WordStage[];
  initialStageId?: string;
  backTo?: string;
  backTitle?: { title: string; furigana?: readonly FuriganaEntry[] };
  groups?: readonly WordGroupHead[];
}) {
  const fetched = useLearnerWordSets();
  const stages = provided ?? fetched;
  /*
   * 取りに 行って いる あいだ。一覧の 行（`groups`）は サーバで 描いて あるので
   * **押す ものは すぐ 出る**。中身が 要る 画面（セット選び・やりかた選び）だけ
   * ここで 待たせる。
   */
  const waiting = stages.length === 0;
  const router = useRouter();
  const store = useMemo(() => createProgressStore(), []);
  const [screen, setScreen] = useState<Screen>(() =>
    initialStageId ? { kind: "mode", stageId: initialStageId } : { kind: "stageSelect" },
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [session, setSession] = useState<ArcadeState | null>(null);
  const savedRef = useRef<string | null>(null);

  const stageId = "stageId" in screen ? screen.stageId : (initialStageId ?? stages[0]?.id);
  const stage = stages.find((s) => s.id === stageId) ?? null;
  const furigana = useMemo(() => buildFuriganaIndex(stage?.furigana ?? []), [stage?.furigana]);

  /*
   * セットを えらぶ 画面から 出る ときの 行き先の 名前。**わたされた 名前**を 使い、
   * 無ければ 先頭の セットの 見出しで 代える（どの ステージにも 付いて いない
   * ことばには ステージの 名前が 無い）。
   */
  const ownerTitle = useMemo(() => {
    const head = backTitle ?? stages[0];
    return head ? { title: head.title, furigana: buildFuriganaIndex(head.furigana) } : null;
  }, [backTitle, stages]);

  const dispatch = useCallback((action: ArcadeAction) => {
    setSession((prev) => (prev ? arcadeReducer(prev, action) : prev));
  }, []);

  const start = useCallback(
    (target: WordStage, mode: ArcadeMode, onlyWordIds?: readonly string[]) => {
      const mastery = store.readMastery(target.id);
      setSession(createSession({ stage: target, mode, difficulty, mastery, onlyWordIds }));
      savedRef.current = null;
      savedCountRef.current = 0;
      setScreen({ kind: "play", stageId: target.id });
    },
    [difficulty, store],
  );

  // ロックは置かない（願い #26）。どのグループもすぐ開ける。
  // データの `password` は残っているが、もう見ない。
  const openStage = useCallback((id: string) => {
    setScreen({ kind: "mode", stageId: id });
  }, []);

  /**
   * 一覧の 行を 押した とき。セットが 2つ以上 なら **えらぶ 画面**を はさむ。
   * 1つなら そのまま やりかた選びへ（余計な 1画面を 見せない）。
   */
  const openGroup = useCallback(
    (id: string) => {
      const group = groups?.find((g) => g.id === id);
      if (group && group.setIds.length > 1) setScreen({ kind: "setSelect", groupId: id });
      else setScreen({ kind: "mode", stageId: group?.setIds[0] ?? id });
    },
    [groups],
  );

  /** その 行の 中の セット（ならびは `stageWordSets` の 順のまま）。 */
  const setsOfGroup = useCallback(
    (groupId: string) => {
      const ids = groups?.find((g) => g.id === groupId)?.setIds ?? [];
      return ids.flatMap((id) => stages.filter((set) => set.id === id));
    },
    [groups, stages],
  );

  const leave = useCallback(() => router.push(backTo ?? "/map"), [router, backTo]);

  /*
   * やりかた選びから 戻る 先。**近い ほうから** 見る:
   * その 行の セット選び（初級・中級…）→ 一覧 → 来た ステージ（または マップ）。
   * 画面の 状態では なく データから 決めるので、URLを 直接 開いた 人にも 同じ 道が 出る。
   */
  const modeGroup = groups?.find((group) => group.setIds.includes(stageId ?? ""));
  const modeBack: "sets" | "list" | "leave" =
    modeGroup && modeGroup.setIds.length > 1
      ? "sets"
      : (groups ? groups.length : stages.length) > 1
        ? "list"
        : "leave";
  const goBackFromMode = useCallback(() => {
    if (modeBack === "sets" && modeGroup) setScreen({ kind: "setSelect", groupId: modeGroup.id });
    else if (modeBack === "list") setScreen({ kind: "stageSelect" });
    else leave();
  }, [modeBack, modeGroup, leave]);

  /*
   * **1問 ごとに 進み具合を 書く**（2026-08-26）。
   *
   * 前は けっか画面に たどり着いた ときに まとめて 書いて いた。
   * セットの ことばを **全問 出す**ように した ので、1回が 長く なる——
   * 途中で 閉じた 学習者の 30問ぶんが まるごと 消えるのは 割に 合わない。
   * 書くのは 端末の 中（localStorage）なので、書く 回数が 増えても 通信は しない。
   */
  const savedCountRef = useRef(0);

  // ステージの進み具合に反映する（設計07 §3）。けっか画面まで来たら「おわった」。
  const finished = screen.kind === "result";
  useEffect(() => {
    if (!stage) return;
    recordContentProgress(stage.id, { status: finished ? "completed" : "started" });
  }, [stage, finished]);

  // 舞台の景色。遊んでいる間は問題の進みに合わせて変わる（旧 fieldForIndex）。
  const playing = screen.kind === "play" && session !== null;
  const field =
    session && screen.kind === "play"
      ? fieldForIndex(session.fieldSequence, session.index, session.questions.length)
      : (stage?.fieldSequence[0] ?? "forest");
  const question = session ? currentQuestion(session) : null;

  return (
    <ArcadeScene
      world={{
        field,
        speed: session ? sceneSpeed(session.mode, session.difficulty) : 0.7,
        // 旧 gameLoop は PLAY / MCQ / MESSAGE / EVAL の間だけ景色を流していた。
        moving: playing,
        termKey: playing && session && question ? `${session.stageId}:${session.index}` : null,
        termText: question?.word.term ?? "",
        termReading: question?.word.reading ?? "",
        showFurigana: session?.furiganaOn ?? false,
        outcome: session ? termOutcomeOf(session) : null,
        onCollide: () => dispatch({ type: "readingTimeout" }),
      }}
      /*
       * 揺れは **どの モードでも**。前は `tookDamage`（れんしゅうで ライフが 減った とき）
       * だけに 付いて いたので、テストでは 外しても 時間切れでも 画面が 静かなままで、
       * 「合って いた」ように 見えて いた（2026-08-26 の 指摘4）。
       */
      impactSeq={session && session.flash !== "hit" ? session.flashSeq : 0}
      impactKind={session?.flash === "retry" ? "nudge" : "damage"}
    >
      {screen.kind === "play" && session && stage ? (
        <PlayLayer
          state={session}
          furigana={furigana}
          dispatch={dispatch}
          store={store}
          savedCountRef={savedCountRef}
          onFinished={() => setScreen({ kind: "result", stageId: stage.id })}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-y-auto p-4">
          <div className="pointer-events-none w-full max-w-2xl">
            {screen.kind === "stageSelect" && (
              <StageSelect
                items={groups ? groups.map(headItem) : stages.map(itemOfSet)}
                onPick={groups ? openGroup : openStage}
                onLeave={leave}
                leaveLabel={
                  backTo && ownerTitle ? (
                    <BackToStage title={ownerTitle.title} furigana={ownerTitle.furigana} />
                  ) : (
                    "マップに もどる"
                  )
                }
              />
            )}

            {/*
              一覧の 行の 中の セット（初級・中級・上級）。1行に 1セットしか 無ければ
              `openGroup` が ここを 飛ばす ので、この 画面が 出るのは 2つ以上の ときだけ。
            */}
            {screen.kind === "setSelect" && (
              <StageSelect
                items={setsOfGroup(screen.groupId).map(itemOfSet)}
                onPick={openStage}
                onLeave={() => setScreen({ kind: "stageSelect" })}
                leaveLabel="← ほかの ことばを えらぶ"
              />
            )}

            {screen.kind === "mode" && stage && (
              <ModeSelect
                stage={stage}
                furigana={furigana}
                difficulty={difficulty}
                /*
                  えらびなおす 先が あれば、まず **そこへ 戻る**道を 出す
                  （その 行の セット → 一覧の 順に 近い ほうへ）。ここに 並ぶのは
                  その ステージの セット（初級・中級…）だけなので、よその 課の
                  ことばを 選ばせる ことには ならない。
                  戻る 先が 無ければ、来た ステージへ そのまま 帰す。
                */
                backLabel={
                  modeBack !== "leave" ? (
                    "ほかの セットを えらぶ"
                  ) : backTo ? (
                    <BackToStage title={stage.title} furigana={furigana} />
                  ) : (
                    "マップに もどる"
                  )
                }
                onDifficulty={setDifficulty}
                onPick={(mode) => {
                  if (mode === "test") setScreen({ kind: "hiraCheck", stageId: stage.id, mode });
                  else start(stage, mode);
                }}
                onFlashcard={() => setScreen({ kind: "flashcard", stageId: stage.id })}
                onDictionary={() => setScreen({ kind: "dictionary", stageId: stage.id })}
                onBack={goBackFromMode}
              />
            )}

            {/*
              セットを 取りに 行って いる あいだ（`src/lib/wordset-store.ts`）。
              一覧の 行は サーバで 描いて あるので、ここに 来るのは 行を 押した あと。
            */}
            {waiting && (screen.kind === "setSelect" || screen.kind === "mode") && (
              <div className="pointer-events-none rounded-3xl bg-black/60 p-8 text-center">
                <p className="text-lg font-black text-white">
                  ことばを よみこんで います<span className="sr-only">。</span>
                </p>
              </div>
            )}

            {screen.kind === "hiraCheck" && stage && (
              <HiraganaCheck
                onReady={() => start(stage, screen.mode)}
                onCancel={() => setScreen({ kind: "mode", stageId: stage.id })}
              />
            )}

            {screen.kind === "result" && session && stage && (
              <ResultLayer
                stage={stage}
                state={session}
                furigana={furigana}
                store={store}
                savedRef={savedRef}
                onRetryWrong={(ids) => start(stage, session.mode, ids)}
                onBack={() => setScreen({ kind: "mode", stageId: stage.id })}
                /* おわった 直後が いちばん 出たい 瞬間。ステージから 来た ときだけ 出す */
                onLeave={backTo ? leave : undefined}
                leaveLabel={backTo ? <BackToStage title={stage.title} furigana={furigana} /> : null}
              />
            )}

            {screen.kind === "flashcard" && stage && (
              <div className="pointer-events-auto">
                <FlashcardDeck
                  words={stage.words}
                  furigana={furigana}
                  onBack={() => setScreen({ kind: "mode", stageId: stage.id })}
                />
              </div>
            )}

            {screen.kind === "dictionary" && stage && (
              <div className="pointer-events-auto">
                <WordDictionary
                  words={stage.words}
                  furigana={furigana}
                  onBack={() => setScreen({ kind: "mode", stageId: stage.id })}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </ArcadeScene>
  );
}

/**
 * 迫っている用語の決着のつき方（旧 resolveReading → startMcqPhase の分岐）。
 * null は「まだ迫っている最中」。
 */
function termOutcomeOf(state: ArcadeState): TermOutcome | null {
  const phase = state.phase;
  if (phase.kind !== "meaning") return null;
  // 問題だけモードは読みを聞かないので、迫らせずにそのまま砕く（旧 mode === "quiz"）。
  if (phase.readingOk === null) return "skipped";
  return phase.readingOk ? "hit" : "missed";
}

/* ------------------------------------------------------------------ *
 * プレイ中 — 四隅HUD・中央の用語・下端の入力
 * ------------------------------------------------------------------ */

function PlayLayer({
  state,
  furigana,
  dispatch,
  store,
  savedCountRef,
  onFinished,
}: {
  state: ArcadeState;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  dispatch: (action: ArcadeAction) => void;
  store: ReturnType<typeof createProgressStore>;
  /** どこまで 書いたか。**1問ごとに 書く**ので、途中で 閉じても 消えない。 */
  savedCountRef: React.RefObject<number>;
  onFinished: () => void;
}) {
  const question = currentQuestion(state);
  const phase = state.phase;
  const resetKey = `${state.index}:${phase.kind}`;

  const onMeaningExpire = useCallback(() => dispatch({ type: "meaningTimeout" }), [dispatch]);

  // 読みのフェーズに秒数のカウントは無い。用語がカメラに届いた時が時間切れで、
  // それは3Dの世界が知らせてくる（ArcadeScene の onCollide）。
  const meaningLeft = useCountdown({
    seconds: choiceSeconds(state.difficulty),
    active: phase.kind === "meaning",
    onExpire: onMeaningExpire,
    resetKey,
  });

  /*
   * **1問 片づくたびに 進み具合を 書く**（2026-08-26）。
   *
   * 前は けっか画面に たどり着いた ときに まとめて 書いて いた。
   * セットの ことばを 全問 出す ように した ので 1回が 長い——
   * 途中で 閉じた 学習者の 30問ぶんが まるごと 消えるのは 割に 合わない。
   * 書き先は 端末の 中（localStorage）なので、回数が 増えても 通信は しない。
   */
  useEffect(() => {
    if (phase.kind !== "explain") return;
    const done = state.outcomes.length;
    if (done <= savedCountRef.current) return;
    const fresh = state.outcomes.slice(savedCountRef.current);
    savedCountRef.current = done;
    store.recordAttempts(
      state.stageId,
      fresh.map((o) => ({ wordId: o.wordId, correct: o.meaningOk && o.readingOk !== false })),
    );
  }, [phase.kind, state.outcomes, state.stageId, store, savedCountRef]);

  useEffect(() => {
    if (phase.kind !== "explain") return;
    const advance = () => dispatch({ type: "advance" });
    const timer = setTimeout(advance, EXPLAIN_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase.kind, state.index, dispatch]);

  useEffect(() => {
    if (phase.kind === "finished") onFinished();
  }, [phase.kind, onFinished]);

  if (!question) return null;
  const { word, choices } = question;
  const isPractice = state.mode === "practice";
  const readingMissed = phase.kind === "meaning" && phase.readingOk === false;

  return (
    <>
      {/*
        4択の間。旧アプリは時計だけを近づけ、用語は撃破して消していた。
        ここでは旧「問題だけ」モードの #mcq-term をどのモードでも出しておく。
        選んでいる間も言葉が見えるほうが覚えられる。時計はその後ろで近づく。
      */}
      {phase.kind === "meaning" && (
        <>
          <ApproachClock remaining={meaningLeft} />
          <McqTerm term={word.term} reading={word.reading} />
        </>
      )}

      {/* 迫ってくる用語・出現の輪・撃破の粒は three.js の中（arcade-three.ts）。 */}

      {/* 加点ポップ（旧 scorePop） */}
      {state.lastGain > 0 && (
        <ScorePop id={`${resetKey}:${state.flashSeq}`} label={`+${state.lastGain}`} />
      )}

      {/*
        ⭕／❌ の しるし。**当たっても 外しても 必ず 出す**（2026-08-26 の 指摘2・3）。
        読みの あとにも、意味の あとにも 出る ので、学習者は 1問に 2回 手ごたえを 受け取る。
      */}
      {/*
        打ち直し（`retry`）では **大きな しるしを 出さない**。まだ 番が つづいて いる ので、
        毎回 画面いっぱいの ❌ を 出すと 手が 止まる。合図は 横揺れと 入力欄の 赤だけ。
      */}
      {state.flash && state.flash !== "retry" && <Verdict id={state.flashSeq} kind={state.flash} />}
      {state.flash && state.flash !== "hit" && state.flash !== "retry" && (
        <DamageFlash id={state.flashSeq} tone={state.flash === "timeup" ? "timeup" : "miss"} />
      )}

      {/* 四隅のHUD（旧アプリと同じ配置。中央は用語のために空ける） */}
      <div className="pointer-events-none absolute inset-x-0 top-12 flex items-start justify-between px-4 sm:px-8">
        <div className="flex flex-col items-start gap-2">
          {isPractice && <HudChip label="SCORE" value={state.score} accent="#f0a819" />}
          <HudChip
            label="もんだい"
            value={`${Math.min(state.index + 1, state.questions.length)} / ${state.questions.length}`}
          />
          {isPractice && state.combo >= 2 && (
            <span className="animate-pulse rounded-full bg-[#f26fa7] px-3 py-1 text-sm font-black text-white">
              {state.combo} COMBO!! 🔥
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <HudChip label="MODE" value={MODE_LABEL[state.mode]} accent="#0272ae" />
          {isPractice && (
            <HudChip
              label="LIFE"
              value={
                <span aria-label={`のこり ライフ ${state.life}`}>
                  {"❤️".repeat(Math.max(0, state.life))}
                  {"🤍".repeat(Math.max(0, START_LIFE - Math.max(0, state.life)))}
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* 下端 — 入力／4択／解説 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-5 sm:pb-8">
        {phase.kind === "reading" && (
          <>
            {/*
              打ち直しの 合図は **❌ の しるしだけ**（2026-08-27）。
              文を 出すと 読む ぶん 手が 止まり、その間も ことばは 近づいて くる。
              `hint` が 出るのは 漢字・英字が 混ざった ときだけ——これは
              「答え」では なく **操作の 案内**なので、文で 出す 値打ちが ある。
            */}
            {state.flash === "retry" && (
              <p key={state.flashSeq} className="text-4xl leading-none" aria-label="ちがう">
                ❌
              </p>
            )}
            {state.hint && (
              <div className="pointer-events-auto w-full max-w-2xl">
                <FeedbackMessage messageKey={state.hint} />
              </div>
            )}
            <p
              className="text-lg font-black sm:text-xl"
              style={{ color: "#1f3a56", WebkitTextStroke: "3px #fff", paintOrder: "stroke fill" }}
            >
              よみを ひらがなで 入力して、Enter！
            </p>
            <div className="pointer-events-auto w-full max-w-2xl">
              <ReadingInput
                key={resetKey}
                shake={Boolean(state.hint)}
                shakeKey={state.flash === "retry" ? state.flashSeq : 0}
                onSubmit={(input) => dispatch({ type: "submitReading", input })}
              />
            </div>
          </>
        )}

        {phase.kind === "meaning" && (
          <>
            {readingMissed && (
              /*
               * 外した ときは **❌ と 正しい よみ**を 並べる。
               * 前は「よみ: かいしゃ」だけで、当たった ときと 見た目が ほとんど 同じだった。
               */
              <p className="rounded-full border-4 border-white bg-[#fffaf0]/96 px-4 py-1 text-lg font-black text-[#a3182f]">
                ❌ ただしい よみ: {word.reading}
              </p>
            )}
            <p
              className="text-xl font-black sm:text-2xl"
              style={{ color: "#1f3a56", WebkitTextStroke: "3px #fff", paintOrder: "stroke fill" }}
            >
              英語の 意味を えらぼう！
            </p>
            <div className="pointer-events-auto w-full max-w-3xl">
              <MeaningChoice
                choices={choices}
                remaining={meaningLeft}
                onChoose={(choice) => dispatch({ type: "chooseMeaning", choice })}
              />
            </div>
          </>
        )}

        {phase.kind === "explain" && (
          <button
            type="button"
            onClick={() => dispatch({ type: "advance" })}
            className="pointer-events-auto w-full max-w-2xl rounded-[24px] border-4 bg-[#fffaf0]/97 p-4 text-left shadow-[0_7px_0_#b8deed,0_18px_32px_rgba(0,79,141,.25)]"
            style={{ borderColor: phase.ok ? "#3aa458" : "#f2654a" }}
          >
            {/*
              **正解だけに 焦点を あてる**（2026-08-27 の 指定
              「正解が何かをわかるようにそこだけフォーカス」）。
              励ましの 2行（「いっしょに かくにんしよう／下の せつめいを 読んで…」）は 出さない——
              遊んで いる 最中に 読ませる 文では なかった。出すのは
              **⭕か ❌か**と、**正しい こたえ**だけ。
            */}
            <p
              className="flex items-center gap-2 text-lg font-black"
              style={{ color: phase.ok ? "#1c7f3e" : "#a3182f" }}
            >
              <span aria-hidden>{phase.ok ? "⭕" : "❌"}</span>
              {phase.ok ? "せいかい" : phase.feedback === "meaning.timeup" ? "時間切れ" : "ちがう"}
              {!phase.ok && phase.chosen && (
                <span className="text-ink-faint text-sm font-bold">（{phase.chosen}）</span>
              )}
            </p>
            {/* 正しい こたえ。この カードで いちばん 大きい 字に する。 */}
            <p className="mt-2 flex items-baseline gap-2 text-2xl font-black text-[#1c7f3e]">
              <span aria-hidden>⭕</span>
              {word.meaningEn}
            </p>
            <p className="text-ink mt-1 text-lg font-black">
              <ruby>
                {word.term}
                <rt>{word.reading}</rt>
              </ruby>
            </p>
            <p className="text-ink-soft mt-1 font-bold">
              <RubyText text={word.explanationJa} index={furigana} />
            </p>
            <p className="text-ink-faint mt-2 text-sm">
              <RubyText text={word.example} index={furigana} />
            </p>
            <p className="text-ink-faint mt-2 text-xs font-bold">（おす／Enter で つぎへ）</p>
          </button>
        )}

        <div className="pointer-events-auto flex gap-2">
          {state.mode !== "test" && (
            <ArcadeButton
              tone={state.furiganaOn ? "info" : "quiet"}
              className="px-4 py-2 text-sm"
              onClick={() => dispatch({ type: "toggleFurigana" })}
            >
              ふりがな {state.furiganaOn ? "ON" : "OFF"}
            </ArcadeButton>
          )}
          <ArcadeButton
            tone="quiet"
            className="px-4 py-2 text-sm"
            onClick={() => dispatch({ type: "quit" })}
          >
            やめる
          </ArcadeButton>
        </div>
      </div>
    </>
  );
}

const MODE_LABEL: Record<ArcadeMode, string> = {
  practice: "れんしゅう",
  test: "テスト",
  quiz: "もんだい",
};

/* ------------------------------------------------------------------ *
 * ステージ選択（単語だけで開いたときの入り口）
 * ------------------------------------------------------------------ */

/**
 * えらぶ 画面。**一段目（ステージの 一覧）でも 二段目（その中の セット）でも 同じ**
 * ——札の 中身が 場所で 変わると、同じ ものを 2通りの 顔で 覚えることになる。
 */
function StageSelect({
  items,
  onPick,
  onLeave,
  leaveLabel,
}: {
  items: readonly SelectItem[];
  onPick: (id: string) => void;
  onLeave: () => void;
  /** 出る ボタンの 字。行き先を 決める 親が 言葉も 決める。 */
  leaveLabel: ReactNode;
}) {
  return (
    <ArcadePanel kicker="Select Set" title="ことばの セットを えらぶ">
      <p className="text-ink-soft mt-1 text-sm font-bold">
        まなびたい ことばの セットを えらんでね。
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const index = buildFuriganaIndex(item.furigana);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item.id)}
                className="border-hairline hover:border-sky w-full rounded-[20px] border-2 bg-white p-4 text-left transition hover:scale-[1.02]"
              >
                <p className="text-sky text-xs font-black">
                  ことば {item.wordCount}こ ／ 合格 {item.passRate}%
                </p>
                <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <RubyText
                    className="text-ink block text-lg font-black"
                    text={item.title}
                    index={index}
                  />
                  {/* セット名（初級・中級…）。同じ 見出しが ならぶので、ここが 目じるし。 */}
                  {item.label ? <SetBadge label={item.label} index={index} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ArcadeButton tone="quiet" className="mt-4 w-full" onClick={onLeave}>
        {leaveLabel}
      </ArcadeButton>
    </ArcadePanel>
  );
}

/**
 * セット名の 札（初級・中級…）。
 *
 * 濃い 地に 白文字なので、ふりがなも 白に する（`RUBY_ON_COLOR` と 同じ 向き・
 * docs/constraints.md 2026-08-18/21）。`.text-white rt` が currentColor を 継ぐ。
 */
function SetBadge({
  label,
  index,
}: {
  label: string;
  index: ReturnType<typeof buildFuriganaIndex>;
}) {
  return (
    <RubyText
      className="bg-sky rounded-full px-2 py-0.5 text-xs font-black text-white"
      text={label}
      index={index}
    />
  );
}

/**
 * 「← <ステージ名>に もどる」の 札。
 *
 * 中身を **1つの span に まとめる**のは、狭い画面で ばらばらの 要素が
 * それぞれ 折り返し、「ほう／こく に もどる」のように 語の 途中で 割れるため
 *（content-frame.tsx の LockedNotice と 同じ 理由。390px の 実機で 発生）。
 * ステージ名には 漢字が 入りうるので ルビを 合成する（規律2）。
 */
function BackToStage({
  title,
  furigana,
}: {
  title: string;
  furigana: ReturnType<typeof buildFuriganaIndex>;
}) {
  return (
    <span className="text-center leading-relaxed">
      ← <RubyText text={title} index={furigana} />に もどる
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * モード選択（旧アプリの5モード＋難易度をそのまま）
 * ------------------------------------------------------------------ */

function ModeSelect({
  stage,
  furigana,
  difficulty,
  backLabel,
  onDifficulty,
  onPick,
  onFlashcard,
  onDictionary,
  onBack,
}: {
  stage: WordStage;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  difficulty: Difficulty;
  /** 出る ボタンの 字。行き先を 決める 親が 言葉も 決める（ここで 場合分けしない）。 */
  backLabel: ReactNode;
  onDifficulty: (d: Difficulty) => void;
  onPick: (mode: ArcadeMode) => void;
  onFlashcard: () => void;
  onDictionary: () => void;
  onBack: () => void;
}) {
  return (
    <ArcadePanel
      kicker="Mission Select"
      /*
       * 見出しは ステージの 名前。漢字が 入りうるので ルビを 合成する（規律2）。
       * セット名が あれば 横に 出す——同じ 見出しの セットが ならぶ ので、
       * いま どれを 開いて いるかが 分からないと 迷う。
       */
      title={
        <span className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
          <RubyText text={stage.title} index={furigana} />
          {stage.label ? <SetBadge label={stage.label} index={furigana} /> : null}
        </span>
      }
      className="text-center"
    >
      <p className="text-ink-soft mt-1 text-sm font-bold">
        <RubyText text={stage.description} index={furigana} />
      </p>
      <p className="text-ink-faint mt-1 text-xs font-bold">
        ことば {stage.words.length}こ ／ 1回の もんだい {stage.questionCount}こ ／ 合格{" "}
        {stage.passRate}%
      </p>
      {/*
        **ルールを 先に 見せる**（2026-08-26 の 指摘5「ルールに 何が 書いて あるか わからない」）。
        テストと れんしゅうは「よみ」と「いみ」の 2つを 数える ので、満点は もんだいの 2倍に なる。
        ここを 出して おかないと、けっか画面の 点が どこから 来たのか 分からない。
      */}
      <p className="text-ink-soft border-hairline mt-2 rounded-[var(--radius-card)] border-2 px-3 py-2 text-xs font-bold">
        ⭕ よみ（ひらがな）と いみ（英語）を 1つずつ 数えます。
        {stage.questionCount * 2}点 中 {Math.ceil((stage.questionCount * 2 * stage.passRate) / 100)}
        点で 合格です。「もんだいだけ」は いみだけを 数えます。
      </p>

      <p className="text-ink-soft mt-5 text-sm font-black">
        むずかしさ（スピードと 時間だけが かわるよ）
      </p>
      <div className="mt-2 flex justify-center gap-2">
        {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onDifficulty(key)}
            aria-pressed={difficulty === key}
            className={`rounded-full border-2 px-4 py-2 text-sm font-black transition ${
              difficulty === key
                ? "border-[#f26fa7] bg-[#f26fa7] text-white"
                : "border-hairline text-ink-soft bg-white"
            }`}
          >
            {DIFFICULTY[key].label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ArcadeButton tone="go" className="flex-col py-4" onClick={() => onPick("practice")}>
          <span className="text-lg">れんしゅう</span>
          <span className="text-xs opacity-90">たのしく おぼえる</span>
        </ArcadeButton>
        <ArcadeButton tone="primary" className="flex-col py-4" onClick={() => onPick("test")}>
          <span className="text-lg">テスト</span>
          <span className="text-xs opacity-90">点数を 見る</span>
        </ArcadeButton>
        <ArcadeButton tone="sub" className="flex-col py-4" onClick={() => onPick("quiz")}>
          <span className="text-lg">もんだいだけ</span>
          <span className="text-xs opacity-90">入力なしで 意味クイズ</span>
        </ArcadeButton>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ArcadeButton tone="info" className="flex-col py-4" onClick={onFlashcard}>
          <span className="text-lg">フラッシュカード</span>
          <span className="text-xs opacity-90">カードを めくって おぼえる</span>
        </ArcadeButton>
        <ArcadeButton tone="quiet" className="flex-col py-4" onClick={onDictionary}>
          <span className="text-lg">辞書</span>
          <span className="text-xs opacity-80">ことばを しらべる</span>
        </ArcadeButton>
      </div>

      <ArcadeButton tone="quiet" className="mt-4 px-6 py-2 text-sm" onClick={onBack}>
        {backLabel}
      </ArcadeButton>
    </ArcadePanel>
  );
}

/* ------------------------------------------------------------------ *
 * ひらがな入力チェック（テストの前に一度だけ）
 * ------------------------------------------------------------------ */

const HIRA_TARGETS = ["あいうえお", "ようけんていぎ"] as const;

function HiraganaCheck({ onReady, onCancel }: { onReady: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState("");
  const [miss, setMiss] = useState(false);
  const target = HIRA_TARGETS[step]!;

  const submit = () => {
    if (!isHiraganaInputReady(value, target)) {
      setMiss(true);
      return;
    }
    setMiss(false);
    setValue("");
    if (step + 1 >= HIRA_TARGETS.length) onReady();
    else setStep(step + 1);
  };

  return (
    <ArcadePanel kicker="Input Check" title="ひらがな入力チェック" className="text-center">
      <p className="text-ink-soft mt-2 font-bold">つぎの ことばを 入力してください。</p>
      <p className="text-navy mt-4 text-4xl font-black">{target}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMiss(false);
        }}
        onKeyDown={(e) => {
          /*
           * 日本語入力（IME）の **変換を確定する Enter** で けってい しない。
           *
           * 「あいうえお」を打って Enter を押した瞬間、Chrome はまだ変換の途中なので
           * `keyCode` は 229 で `isComposing` が true（`key` は "Enter" のまま来る）。
           * ここで進めてしまうと、次のお題に切り替えたあとで IME が確定した文字を
           * 入力欄に入れ直すため、**打った字が消えないまま残る**（2026-08-25 実発生）。
           * 確定の Enter は IME に渡し、学習者が次に押す Enter だけを けってい にする。
           */
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          if (e.key === "Enter") submit();
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="ひらがなで 入力する"
        className="border-hairline bg-panel text-ink mt-4 w-full rounded-[var(--radius-button)] border-2 px-4 py-3 text-center text-2xl font-black"
      />
      {miss && (
        <div className="mt-3 text-left">
          <FeedbackMessage messageKey="reading.needHiragana" />
        </div>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <ArcadeButton onClick={submit}>けってい</ArcadeButton>
        <ArcadeButton tone="quiet" onClick={onCancel}>
          やめる
        </ArcadeButton>
      </div>
    </ArcadePanel>
  );
}

/* ------------------------------------------------------------------ *
 * けっか
 * ------------------------------------------------------------------ */

function ResultLayer({
  stage,
  state,
  furigana,
  store,
  savedRef,
  onRetryWrong,
  onBack,
  onLeave,
  leaveLabel,
}: {
  stage: WordStage;
  state: ArcadeState;
  furigana: ReturnType<typeof buildFuriganaIndex>;
  store: ReturnType<typeof createProgressStore>;
  savedRef: React.RefObject<string | null>;
  onRetryWrong: (ids: readonly string[]) => void;
  onBack: () => void;
  onLeave?: () => void;
  leaveLabel?: ReactNode;
}) {
  const summary = useMemo(() => summarize(state), [state]);
  const byId = useMemo(() => new Map(stage.words.map((w) => [w.id, w])), [stage.words]);
  const missedWords = summary.missedWordIds
    .map((id) => byId.get(id))
    .filter((w): w is Word => Boolean(w));

  useEffect(() => {
    const token = `${stage.id}:${state.mode}:${state.outcomes.length}:${summary.score}`;
    if (savedRef.current === token) return;
    savedRef.current = token;

    // ことばの 出来ぐあいは **1問ごとに** 書いてある（ArcadeGame の savedCountRef）。
    // ここで もう一度 書くと 同じ 問題を 2回 数えて しまう。
    store.recordGameScore(stage.id, state.score, state.bestCombo);
    if (state.mode === "test") {
      store.recordFirstTestResult({
        stageId: stage.id,
        score: summary.score,
        maxScore: summary.maxScore,
        readingCorrect: summary.readingCorrect,
        meaningCorrect: summary.meaningCorrect,
        total: summary.total,
        passed: summary.passed,
        at: new Date().toISOString(),
      });
    }
  }, [stage.id, state, summary, store, savedRef]);

  return (
    <div className="pointer-events-auto">
      <ArcadeResult
        summary={summary}
        gameScore={state.score}
        bestCombo={state.bestCombo}
        isTest={state.mode === "test"}
        missedWords={missedWords}
        furigana={furigana}
        onRetryWrong={() => onRetryWrong(summary.missedWordIds)}
        onBack={onBack}
        onLeave={onLeave}
        leaveLabel={leaveLabel}
      />
    </div>
  );
}
