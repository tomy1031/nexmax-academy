"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { AiWaitingOverlay } from "@/components/meeting/ai-waiting";
import { judgeFailNote, requestBugReview, warmBugReview } from "@/components/meeting/judge-api";
import { SpeakButton } from "@/components/meeting/speak-button";
import { useLiveVoice } from "@/components/meeting/use-live-voice";
import { aiReplyFurigana } from "@/lib/ai-kanji";
import type { QuizDraft } from "@/lib/quiz/draft";
import {
  BUG_REPORT_CHECKS,
  BUG_REPORT_FIELDS,
  BUG_REPORT_ITEM_POINTS,
  BUG_REPORT_PASS,
  BUG_REPORT_SHOW_ANSWER_AFTER,
  EMPTY_BUG_REPORT,
  bugReportFilled,
  bugReportPassed,
  bugReportScore,
  bugReportsPassed,
  bugReviewContext,
  composeBugReport,
  readAloudMatches,
  type BugReviewResult,
  type BugReportEntry,
  type BugReportFieldId,
  type BugReportQuestion,
} from "@/lib/quiz/bugreport";
import { getGeminiKey } from "@/lib/profile";
import { buildFuriganaIndex, uncoveredKanji, type FuriganaIndex } from "@/lib/text/furigana";
import { useAnswerCheckStore } from "./answer-check";
import { BrushUp, NG_COLOR, OK_COLOR } from "./check-parts";

/**
 * バグ報告（もんだい `bugreport`）— サイトを 使って、見つけた バグを 声で 報告する
 *
 * 元は 別ページ（`bug_report/`・2026-09-23 の 指定で 移植）。並びも 元の ページの まま:
 * 画面の 説明 → テストする サイト（iframe・リセットつき）→ 報告の 欄 ①〜④ →
 * 「まとめて 報告しましょう」。そこに 🎤 を 付けて、**話した ことば・ブラッシュアップ・点**を 出す。
 *
 * ## 点と 関門（2026-09-23 の 指定）
 * 「点数が60点以下の場合（内容が合っていない）場合には、次のページに行けないように制御して、
 * もう一度やり直しを促します」。点と ⭕✗は 下書きに 入れる（`BugReportEntry`）——
 * 関門は `quiz-runner` が 下書きから 決める（`bugReportsPassed`）。
 *
 * ## バグが 2つ ある 画面
 * 欄の まとまりを バグの 数だけ 縦に 並べ、上に「見つけた かず」の 帯を 置く。
 * どちらを 先に 見つけても よい（AIには その 画面の バグを ぜんぶ 渡す）。
 *
 * ## 鍵（Gemini）が 無い 端末
 * 声を 聞けない。**止めずに**、欄が 4つ うまれば 進める（朝礼と 同じ 決め）。
 * 登録は せっていの 画面へ うながす。
 */

/** 画面じたいの 文言の 読み（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["画面", "がめん"],
  ["何", "なに"],
  ["本当", "ほんとう"],
  ["例", "れい"],
  ["表示", "ひょうじ"],
  ["報告", "ほうこく"],
  ["使い方", "つかいかた"],
  ["見つけた", "みつけた"],
  ["点", "てん"],
  ["合格", "ごうかく"],
  ["話した", "はなした"],
  ["話して", "はなして"],
  ["話す", "はなす"],
  ["一度", "いちど"],
  ["欄", "らん"],
  ["見直して", "みなおして"],
  ["次", "つぎ"],
  ["進めます", "すすめます"],
  ["進めません", "すすめません"],
  ["以下", "いか"],
  ["登録", "とうろく"],
  ["入れる", "いれる"],
  ["声", "こえ"],
  ["聞けません", "きけません"],
  ["聞き取った", "ききとった"],
  ["言葉", "ことば"],
  ["書く", "かく"],
  ["書いて", "かいて"],
  ["書ける", "かける"],
  ["最初", "さいしょ"],
  ["押して", "おして"],
  ["内容", "ないよう"],
  ["合って", "あって"],
  ["見る", "みる"],
  ["出ます", "でます"],
  ["文", "ぶん"],
  ["見ながら", "みながら"],
  ["出して", "だして"],
  ["書き直して", "かきなおして"],
  ["使えません", "つかえません"],
  ["答え", "こたえ"],
  ["読んで", "よんで"],
  ["読めました", "よめました"],
  ["読みましょう", "よみましょう"],
  ["上", "うえ"],
  ["下", "した"],
  ["回", "かい"],
]);

/** 聞くだけの つなぎ（朝礼の `LISTEN_ONLY` と 同じ 決め——相手は 何も 言わない）。 */
const LISTEN_ONLY = [
  "あなたは テストの 報告を 聞いて いる 係です。",
  "学生が 話し終わったら、**何も 言いません**。声でも 文字でも 返事を しません。",
  "しつもんも しません。あいづちも 打ちません。ただ 聞くだけです。",
].join("\n");

/** 3回 だめで、答えを 見せて いる ところか。 */
function answerShownFor(entry: BugReportEntry): boolean {
  return (
    (entry.tries ?? 0) >= BUG_REPORT_SHOW_ANSWER_AFTER &&
    (entry.corrected ?? "") !== "" &&
    !bugReportPassed(entry)
  );
}

/**
 * 見かたの 鍵の 通し番号。**部品の 外に 置く**——問いを 行き来して 部品が 作り直されても
 * 0 に 戻らない（戻ると 同じ 鍵で 前の 回の つなぎが 使い回される。コード検収 2026-09-23）。
 */
let reviewRound = 0;

function initialReports(
  question: BugReportQuestion,
  draft: Extract<QuizDraft, { kind: "bugreport" }> | undefined,
): BugReportEntry[] {
  return question.bugs.map((_, i) => draft?.reports[i] ?? EMPTY_BUG_REPORT);
}

export function BugReportQuestionView({
  question,
  furigana,
  onSubmit,
  disabled,
  submitMode,
  draft,
}: {
  question: BugReportQuestion;
  furigana: FuriganaIndex;
  onSubmit: (reports: readonly BugReportEntry[]) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "bugreport" }>;
}) {
  const store = useAnswerCheckStore();
  const setId = store?.setId ?? "quiz";
  // 画面の 文字は この 部品が 持つ（親から 送り返すと 変換の 途中で 入れ替わる）
  const [reports, setReports] = useState<BugReportEntry[]>(() => initialReports(question, draft));
  /** 鍵の 有無（サーバの 描画では 分からないので、描いた あとに 読む）。 */
  const [hasKey, setHasKey] = useState(true);
  useEffect(() => {
    // 端末の 覚え書きを 読むだけ（描き直しの 連鎖は 起きない）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasKey(getGeminiKey() !== "");
  }, []);

  const [iframeKey, setIframeKey] = useState(0);
  /** いま 🎤 で 話して いる バグ（押した ときに 決める・聞き取りが 遅れて 届いても ずれない）。 */
  const speakingFor = useRef<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  /**
   * 話し終えて、聞き取りを 待って いる バグ。聞き取りは 指を はなして から 少し 遅れて
   * 届く（`use-live-voice` の FLUSH_AFTER_MS）ので、その あいだ ほかの 🎤 を 押させない。
   */
  const [pendingFor, setPendingFor] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  /** AIが 来なかった ときの ひとこと（バグごと）。 */
  const [failNotes, setFailNotes] = useState<Record<number, string>>({});

  // 採点の あいだに 相手の 声（「はい」など）を 鳴らさない（2026-09-23 の 指定）
  const voice = useLiveVoice({ listenOnly: true, muted: true });
  /** マイクが 使えない（許可が 無い・つながらない）——鍵が 無い ときと 同じく 止めない。 */
  const voiceBroken = voice.status === "notReady" || voice.status === "error";
  const noVoice = !hasKey || voiceBroken;
  const aiFurigana = useMemo(
    () => buildFuriganaIndex(aiReplyFurigana(furigana.entries)),
    [furigana],
  );

  /** いちばん 新しい 下書き（AIを 待つ あいだに 打った 字を 消さない ため）。 */
  const latest = useRef(reports);
  const commit = useCallback(
    (next: BugReportEntry[]) => {
      latest.current = next;
      setReports(next);
      if (submitMode) onSubmit(next);
    },
    [onSubmit, submitMode],
  );

  const change = (index: number, field: BugReportFieldId, value: string) => {
    const next = reports.map((entry, i) => {
      if (i !== index) return entry;
      /*
       * **欄を 書き直したら 前の 点は 消す**（点は 話した 報告に 付いて いる）。
       * 残すと、合格した あとに 欄を 何に 書き換えても「つぎ →」が 開いた ままに なり、
       * 先生の 記録にも 見て いない 報告の 横に 古い 点が 並ぶ（コード検収 2026-09-23）。
       */
      const edited = {
        ...entry,
        [field]: value,
        spoken: "",
        score: null,
        items: [],
        polished: "",
        readAnswer: false,
      };
      // 声を 聞けない 端末は、欄が うまれば 進める（理由は 画面に 出す）
      return { ...edited, skipped: noVoice };
    });
    commit(next);
  };

  /* マイクが 使えないと 分かったら、書いた 欄で 進めるように する */
  useEffect(() => {
    if (!voiceBroken || latest.current.every((entry) => entry.skipped)) return;
    commit(latest.current.map((entry) => ({ ...entry, skipped: true })));
  }, [voiceBroken, commit]);

  /* ぜんぶ 書けたら、見かたの つなぎを 先に 張る（押した あとの 待ちを 短く する） */
  const anyFilled = reports.some(bugReportFilled);
  useEffect(() => {
    if (anyFilled && hasKey) void warmBugReview(`${setId}:${question.id}:${reviewRound + 1}`);
  }, [anyFilled, hasKey, setId, question.id]);

  /* 話し終わった ことばを AIに 見せる */
  const heardAt = useRef(0);
  const review = useCallback(
    async (index: number, spoken: string) => {
      setAsking(true);
      // 鍵は 画面を またいで 増やす（同じ 鍵だと 前の 回の 返事が 返る・judge-api の 覚え書き）
      reviewRound += 1;
      const readable = (value: string) =>
        value === "" || uncoveredKanji(value, aiFurigana).length === 0;
      try {
        const result = await requestBugReview(
          `${setId}:${question.id}:${reviewRound}`,
          bugReviewContext(question, index, latest.current, spoken),
          (one: BugReviewResult) =>
            !(
              readable(one.polished) &&
              readable(one.corrected) &&
              one.items.every((item) => readable(item.note))
            ),
        );
        setFailNotes((prev) => ({
          ...prev,
          [index]: result.ok ? "" : judgeFailNote(result.reason),
        }));
        // 別の 見かたの 最中（busy）は 何も 付けない——押し直せば よい
        if (!result.ok && result.reason === "busy") return;
        // 待って いる あいだに 打った 字も 残す（いちばん 新しい 下書きから 作る）
        commit(
          latest.current.map((entry, i) => {
            if (i !== index) return entry;
            /*
             * AIが 来なかった（使いすぎ・つながらない）ときは **止めない**。
             * 欄が うまって いれば 進める（朝礼と 同じ 決め）。時間切れは
             * `requestBugReview` が 新しい つなぎで 1回 やり直して から ここへ 来る。
             */
            if (!result.ok) {
              return { ...entry, spoken, score: null, items: [], polished: "", skipped: true };
            }
            const items = result.review.items.map((item) => ({
              id: item.id,
              points: item.points,
              ok: item.points >= BUG_REPORT_ITEM_POINTS,
              note: readable(item.note) ? item.note : "",
            }));
            const score = bugReportScore(items, result.review.understandable);
            // 見せて いる 答え（3回 だめだった あと）。読んで いる 途中に 入れ替えない
            const shown = answerShownFor(entry) ? (entry.corrected ?? "") : "";
            const readAnswer = shown !== "" && readAloudMatches(shown, spoken);
            const passedNow = score > BUG_REPORT_PASS || readAnswer;
            const fresh = readable(result.review.corrected) ? result.review.corrected : "";
            return {
              ...entry,
              spoken,
              items,
              score,
              polished: readable(result.review.polished) ? result.review.polished : "",
              skipped: false,
              tries: passedNow ? (entry.tries ?? 0) : (entry.tries ?? 0) + 1,
              corrected:
                shown !== ""
                  ? shown
                  : fresh || entry.corrected || (question.bugs[index]?.model ?? ""),
              readAnswer,
            };
          }),
        );
      } finally {
        setAsking(false);
      }
    },
    [aiFurigana, commit, question, setId],
  );

  useEffect(() => {
    const heard = voice.lastUtterance;
    if (!heard || heard.id === heardAt.current) return;
    heardAt.current = heard.id;
    const index = speakingFor.current;
    // 効果の 中で そのまま 状態を 変えない（1つ 後ろへ ずらす）
    void Promise.resolve().then(() => {
      setPendingFor(null);
      if (index === null || !heard.text.trim()) return;
      void review(index, heard.text.trim());
    });
  }, [voice.lastUtterance, review]);

  /*
   * 聞き取りが 来なかった（声が 届かなかった・つなぎが 切れて いた）ときも、待ちは
   * 数秒で ほどき、**何が 起きたかを 言う**（黙って 何も 出ないのが いちばん 困る）。
   */
  useEffect(() => {
    if (pendingFor === null) return;
    const index = pendingFor;
    const timer = window.setTimeout(() => {
      setPendingFor(null);
      setFailNotes((prev) => ({
        ...prev,
        [index]: "こえが とどきませんでした。もう いちど 🎤を おして、はなして ください。",
      }));
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [pendingFor]);

  const multi = question.bugs.length > 1;
  const passedCount = reports.filter(bugReportPassed).length;
  const allPassed = bugReportsPassed(question, reports);

  return (
    <div className="grid gap-4">
      {/* この 画面は 何を する 画面か（元の ページの 灰色の 帯） */}
      <section className="border-hairline rounded-2xl border-2 border-l-[6px] bg-white p-4">
        <h3 className="text-navy text-base font-black">
          <RubyText text="この 画面は 何を する 画面ですか？" index={UI_FURIGANA} />
        </h3>
        <p className="text-ink mt-1 text-sm leading-relaxed font-bold">
          <RubyText text={question.about} index={furigana} />
        </p>
        <p className="text-ink mt-2 text-sm leading-relaxed font-bold">
          <span className="font-black">
            <RubyText text="使い方：" index={UI_FURIGANA} />
          </span>
          <RubyText text={question.usage} index={furigana} />
        </p>
      </section>

      {/* テストする サイト */}
      <section className="border-hairline rounded-2xl border-2 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-navy text-base font-black">テストする Webサイト</h3>
          <button
            type="button"
            onClick={() => setIframeKey((n) => n + 1)}
            className="border-hairline rounded-lg border-2 bg-white px-3 py-1.5 text-xs font-extrabold"
          >
            リセット
          </button>
        </div>
        <iframe
          key={iframeKey}
          src={question.site}
          title={question.screen}
          sandbox="allow-scripts allow-forms"
          className="h-[560px] w-full rounded-xl border-2 border-[#cfd5df] bg-white"
        />
      </section>

      {/* バグが 2つ ある 画面: いくつ 見つけたかを いつも 見せる */}
      {multi && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-2xl border-2 bg-white px-4 py-3"
          style={{ borderColor: allPassed ? OK_COLOR : "#f5b73b" }}
          role="status"
        >
          <span className="text-ink text-sm font-black">
            <RubyText
              text={`🐞 この 画面には バグが ${question.bugs.length}つ あります。見つけた かず: ${passedCount} / ${question.bugs.length}`}
              index={UI_FURIGANA}
            />
          </span>
          <span className="ml-auto flex gap-1.5">
            {question.bugs.map((_, i) => {
              const ok = reports[i] !== undefined && bugReportPassed(reports[i]);
              return (
                <a
                  key={i}
                  href={`#bug-${question.id}-${i}`}
                  className="rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white"
                  style={{ background: ok ? OK_COLOR : "var(--color-ink-faint)" }}
                >
                  {ok ? "⭕" : "…"} バグ {i + 1}
                </a>
              );
            })}
          </span>
        </div>
      )}

      {!hasKey && (
        <p className="bg-cream border-hairline text-ink rounded-2xl border-2 px-4 py-3 text-sm leading-relaxed font-bold">
          <RubyText
            text="Gemini（AI）の APIキーが 登録されて いません。登録すると、🎤で 話して 点が 出ます。いまは 欄を ぜんぶ 書くと 次へ 進めます。"
            index={UI_FURIGANA}
          />{" "}
          <Link href="/map/settings" className="text-navy underline">
            せってい へ
          </Link>
        </p>
      )}

      {hasKey && voiceBroken && (
        <p className="bg-cream border-hairline text-ink rounded-2xl border-2 px-4 py-3 text-sm leading-relaxed font-bold">
          <RubyText
            text="マイクが 使えません。いまは 欄を ぜんぶ 書くと 次へ 進めます。"
            index={UI_FURIGANA}
          />
        </p>
      )}

      {reports.map((entry, index) => (
        <BugCard
          key={index}
          id={`bug-${question.id}-${index}`}
          title={multi ? `見つけた バグ ${index + 1}` : "バグを 報告しましょう"}
          entry={entry}
          furigana={furigana}
          aiFurigana={aiFurigana}
          disabled={Boolean(disabled)}
          hasKey={hasKey}
          failNote={failNotes[index] ?? ""}
          onChange={(field, value) => change(index, field, value)}
          speak={
            <SpeakButton
              status={voice.status}
              reason={voice.reason}
              talking={voice.talking && target === index}
              disabled={
                Boolean(disabled) ||
                asking ||
                pendingFor !== null ||
                !bugReportFilled(entry) ||
                (voice.talking && target !== index)
              }
              waitNote={
                !bugReportFilled(entry)
                  ? "①〜④を ぜんぶ かくと はなせます"
                  : pendingFor !== null
                    ? "きいた ことばを まとめて います"
                    : voice.talking
                      ? "ほかの バグを はなして います"
                      : null
              }
              onConnect={() => void voice.start(LISTEN_ONLY)}
              onStartTalking={() => {
                speakingFor.current = index;
                setTarget(index);
                voice.startTalking();
              }}
              onStopTalking={() => {
                setPendingFor(index);
                voice.stopTalking();
              }}
            />
          }
        />
      ))}

      {/* 1問ずつ 答えを 見る やりかた（`one`）だけ。合格した ときに 出せる */}
      {!submitMode && (
        <button
          type="button"
          disabled={disabled || !allPassed}
          onClick={() => onSubmit(reports)}
          className="btn-island btn-game px-8 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      )}

      {asking ? <AiWaitingOverlay doing="聞いて います" index={UI_FURIGANA} /> : null}
    </div>
  );
}

function BugCard({
  id,
  title,
  entry,
  furigana,
  aiFurigana,
  disabled,
  hasKey,
  failNote,
  onChange,
  speak,
}: {
  id: string;
  title: string;
  entry: BugReportEntry;
  furigana: FuriganaIndex;
  aiFurigana: FuriganaIndex;
  disabled: boolean;
  hasKey: boolean;
  failNote: string;
  onChange: (field: BugReportFieldId, value: string) => void;
  speak: React.ReactNode;
}) {
  const passed = bugReportPassed(entry);
  const judged = entry.score !== null;
  const showAnswer = answerShownFor(entry);
  return (
    <section
      id={id}
      className="scroll-mt-16 rounded-2xl border-2 bg-white p-4"
      style={{ borderColor: judged ? (passed ? OK_COLOR : NG_COLOR) : "var(--color-hairline)" }}
    >
      <h3 className="text-navy mb-3 text-base font-black">
        <RubyText text={title} index={UI_FURIGANA} />
      </h3>
      <div className="grid gap-3">
        {BUG_REPORT_FIELDS.map((field) => (
          <label key={field.id} className="block">
            <span className="text-ink mb-1 block text-sm font-extrabold">
              <RubyText text={field.label} index={UI_FURIGANA} />
            </span>
            {field.id === "screen" ? (
              <input
                value={entry.screen}
                disabled={disabled}
                onChange={(e) => onChange("screen", e.target.value)}
                aria-label={field.label}
                autoComplete="off"
                className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-3 py-2 text-base font-bold"
              />
            ) : (
              <textarea
                value={entry[field.id]}
                disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
                aria-label={field.label}
                rows={2}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={field.placeholder}
                className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-3 py-2 text-base font-bold"
              />
            )}
          </label>
        ))}
      </div>

      {/* まとめて 報告しましょう（元の ページの 灰色の 箱）＋ 🎤 */}
      <div className="mt-4 rounded-xl bg-[#f8fafc] p-4">
        <h4 className="text-navy text-sm font-black">
          <RubyText text="まとめて 報告しましょう" index={UI_FURIGANA} />
        </h4>
        <p className="text-ink mt-1 text-base leading-loose font-bold whitespace-pre-line">
          <RubyText text={composeBugReport(entry)} index={furigana} />
        </p>
        {/*
          3回 うまく いかなかったら **答えの 文**を 出して、それを 読んで もらう
          （2026-09-23 の 指定）。🎤の すぐ 上に 置く——見ながら 読める ように。
        */}
        {showAnswer && (
          <div className="mt-3 rounded-2xl border-2 border-[#f5b73b] bg-white px-3 py-2.5">
            <p className="text-[12px] font-black text-[#b7791f]">
              <RubyText
                text={`📖 ${BUG_REPORT_SHOW_ANSWER_AFTER}回 うまく いきませんでした。この 答えの 文を 🎤で 読んで ください。`}
                index={UI_FURIGANA}
              />
            </p>
            <p className="text-ink mt-1 text-base leading-loose font-bold whitespace-pre-line">
              <RubyText text={entry.corrected ?? ""} index={aiFurigana} />
            </p>
          </div>
        )}
        {hasKey && (
          <div className="mt-3">
            <p className="text-ink-soft mb-2 text-xs font-bold">
              <RubyText
                text={
                  showAnswer
                    ? "上の 答えの 文を 見ながら、🎤で 読みましょう。"
                    : "この 文を 見ながら、🎤で 声に 出して 報告しましょう。"
                }
                index={UI_FURIGANA}
              />
            </p>
            {speak}
          </div>
        )}
      </div>

      {failNote !== "" && (
        <p className="text-ink-soft mt-2 text-xs leading-relaxed font-bold" role="status">
          <RubyText text={failNote} index={aiFurigana} />
        </p>
      )}

      {judged && (
        <>
          {/* **点を 最初に・大きく**（2026-09-23 の 指定「60 / 100 などの 表示で 大きく」） */}
          <div
            role="status"
            className="mt-3 rounded-2xl border-2 bg-white px-4 py-3 text-center"
            style={{ borderColor: passed ? OK_COLOR : NG_COLOR }}
          >
            <p className="text-ink font-black" data-testid="bug-score">
              <span className="text-5xl">{entry.score}</span>
              <span className="text-ink-soft text-2xl"> / 100</span>
            </p>
            <p className="mt-1">
              <span
                className="inline-block rounded-full px-4 py-1 text-lg font-black text-white"
                style={{ background: passed ? OK_COLOR : NG_COLOR }}
              >
                {passed ? "OK" : "もういちど"}
              </span>
            </p>
            <p className="text-ink mt-2 text-sm leading-relaxed font-bold">
              <RubyText
                text={
                  passed
                    ? entry.readAnswer
                      ? "答えの 文を 読めました。次へ 進めます。"
                      : "合格です。次へ 進めます。"
                    : `${BUG_REPORT_PASS}点 以下なので、次へ 進めません。下の ヒントを 見て、もう一度 🎤で 話して ください。`
                }
                index={UI_FURIGANA}
              />
            </p>
            {!passed && !showAnswer && (entry.tries ?? 0) > 0 && (
              <p className="text-ink-soft mt-1 text-xs font-bold">
                <RubyText
                  text={`${BUG_REPORT_SHOW_ANSWER_AFTER}回 うまく いかないと、答えの 文が 出ます（いま ${entry.tries}回）。`}
                  index={UI_FURIGANA}
                />
              </p>
            )}
          </div>

          {entry.spoken !== "" && (
            <div className="mt-3 rounded-2xl border-2 border-[#4fa8e8] bg-white px-3 py-2.5">
              <p className="text-[11px] font-black text-[#2a7ab5]">
                <RubyText text="🎤 あなたが 話した ことば" index={UI_FURIGANA} />
              </p>
              <p className="text-ink mt-1 text-sm leading-relaxed font-bold">
                <RubyText text={entry.spoken} index={furigana} />
              </p>
            </div>
          )}

          <ul className="mt-3 grid gap-2">
            {BUG_REPORT_CHECKS.map((check) => {
              const hit = entry.items.find((item) => item.id === check.id);
              if (!hit) return null;
              const points = hit.points ?? (hit.ok ? BUG_REPORT_ITEM_POINTS : 0);
              const full = points >= BUG_REPORT_ITEM_POINTS;
              const color = full ? OK_COLOR : points > 0 ? "#f5b73b" : NG_COLOR;
              return (
                <li key={check.id} className="border-hairline rounded-xl border-2 bg-white p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{full ? "⭕" : points > 0 ? "△" : "✗"}</span>
                    <span className="text-ink min-w-0 flex-1 text-sm font-bold">
                      <RubyText text={check.label} index={UI_FURIGANA} />
                    </span>
                    <span className="text-sm font-black" style={{ color }}>
                      {points} / {BUG_REPORT_ITEM_POINTS}
                    </span>
                  </div>
                  {hit.note !== "" && (
                    <p className="text-ink mt-1 text-sm leading-relaxed font-bold">
                      {!full && (
                        <span className="font-black text-[#b7791f]">
                          <RubyText text="💡 ヒント: " index={UI_FURIGANA} />
                        </span>
                      )}
                      <RubyText text={hit.note} index={aiFurigana} />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <BrushUp text={entry.polished} furigana={aiFurigana} />
        </>
      )}

      {!judged && entry.spoken !== "" && (
        <div className="mt-3 rounded-2xl border-2 border-[#4fa8e8] bg-white px-3 py-2.5">
          <p className="text-[11px] font-black text-[#2a7ab5]">
            <RubyText text="🎤 あなたが 話した ことば" index={UI_FURIGANA} />
          </p>
          <p className="text-ink mt-1 text-sm leading-relaxed font-bold">
            <RubyText text={entry.spoken} index={furigana} />
          </p>
        </div>
      )}
    </section>
  );
}
