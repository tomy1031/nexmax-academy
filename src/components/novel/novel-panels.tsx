"use client";

import Image from "next/image";
import { Fragment, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Novel, NovelScene } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { assetUrl } from "@/lib/asset-url";
import type { FuriganaIndex } from "@/lib/text/furigana";

type NoticeScene = Extract<NovelScene, { type: "notice" }>;
type ChooseScene = Extract<NovelScene, { type: "choose_person" }>;
type SelfFixScene = Extract<NovelScene, { type: "self_fix" }>;
type Cast = Novel["cast"][number];

/** 2つ 選んでから 答えを 出すまでの 間（選んだ ことが 目で 分かる ように）。 */
const COMPARE_DELAY_MS = 500;

/**
 * 気づき — 2つの 資料を 並べ、合わない 行を 1つずつ 選ぶ。
 *
 * ## 何を するか 一目で 分かる ように（要望 #729・2026-11-13 の Fable の 設計）
 * - 上に「くらべる 台」（左の 行 ≠ 右の 行）を 置き、選んだ 行が そこに 入る。
 * - 手順を 1つずつ 出す: ① 左の 資料から 1行 → ② 右の 資料から 合わない 行。いま 押す 側の
 *   資料が 光り、もう 片方は 少し 薄く する（押しても よい・順は 決めない）。
 * - 2つ そろったら **自動で** くらべる（「くらべる」ボタンは 無い）。
 * - 片方だけ 正しい ときは、正しい 側を 残して「もう 片方を 選び直します」と 言う
 *   （1回目の まちがいで どちらが 正しいかが 分かる。「真ん中の 2つを 選ぶのは 至難の
 *   わざ」への 答えとして、ここは 易しく 倒した——要望 #729）。
 *
 * 答えは 先に 見せない。まちがえた ときは 3段で 強く する（仕様書 v4 §4）:
 * 1回目 = 見る 場所を 言う／2回目 = 片方の 正しい 行を 光らせる／3回目 = 両方を 光らせる。
 * 前の ステップへは 戻さない。
 */
export function NoticePanel({
  scene,
  index,
  show,
  translation,
  cleared,
  onWrong,
  onSolved,
  onNext,
}: {
  scene: NoticeScene;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  /** もう クリアして いる（戻って きた）。答えを 光らせた まま 見せる。 */
  cleared: boolean;
  onWrong: () => void;
  onSolved: () => void;
  onNext: () => void;
}) {
  const [left, setLeft] = useState<string | null>(cleared ? scene.answer[0] : null);
  const [right, setRight] = useState<string | null>(cleared ? scene.answer[1] : null);
  const [misses, setMisses] = useState(0);
  /** さいごの 判定（片方だけ 正しい・両方 ちがう）。選び直しを 始めたら 消す。 */
  const [verdict, setVerdict] = useState<"leftOk" | "rightOk" | "none" | null>(null);
  const [solved, setSolved] = useState(cleared);
  const [practice, setPractice] = useState(false);
  const done = solved && !practice;

  const glowLeft = done || misses >= 2;
  const glowRight = done || misses >= 3;

  /* 親の 描き直しで 待ち時間が 振り出しに 戻らない ように、知らせ先は ref で 持つ */
  const notify = useRef({ onSolved, onWrong });
  useEffect(() => {
    notify.current = { onSolved, onWrong };
  });

  /* 2つ そろったら、少し 待って 自動で くらべる */
  useEffect(() => {
    if (done || !left || !right) return;
    const timer = window.setTimeout(() => {
      const leftOk = left === scene.answer[0];
      const rightOk = right === scene.answer[1];
      if (leftOk && rightOk) {
        setVerdict(null);
        setSolved(true);
        setPractice(false);
        notify.current.onSolved();
        return;
      }
      setMisses((n) => n + 1);
      setVerdict(leftOk ? "leftOk" : rightOk ? "rightOk" : "none");
      if (!leftOk) setLeft(null);
      if (!rightOk) setRight(null);
      notify.current.onWrong();
    }, COMPARE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [left, right, done, scene.answer]);

  const pick = (side: "left" | "right", id: string) => {
    if (done) return;
    setVerdict(null);
    if (side === "left") setLeft(id);
    else setRight(id);
  };

  const retry = () => {
    setLeft(null);
    setRight(null);
    setMisses(0);
    setVerdict(null);
    setPractice(true);
  };

  /* いま 押す 側（左が まだなら 左、左が 済んで いれば 右） */
  const active: "left" | "right" | null = done ? null : !left ? "left" : !right ? "right" : null;
  const step =
    active === "left"
      ? `① 「${scene.left.title}」から、1行 押します。`
      : active === "right"
        ? `② 「${scene.right.title}」から、合わない 行を 1行 押します。`
        : null;
  const lineText = (side: "left" | "right", id: string | null) =>
    id ? (scene[side].lines.find((line) => line.id === id)?.text ?? "") : "";

  return (
    <div className="space-y-2.5" data-testid="novel-notice">
      {/* 何を するかを **毎回** 出す（つづきから 始めた 学生は 月曜の 説明を 見て いない） */}
      <p className="text-navy text-sm font-black" data-testid="novel-notice-prompt">
        🔍{" "}
        <RubyText
          text={scene.prompt ?? "2つの 資料から、合わない 行を 1つずつ 選びます。"}
          index={index}
          show={show}
        />
      </p>

      {/* くらべる 台: 選んだ 行が 入る。押すと 選び直せる */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5" data-testid="novel-tray">
        {(["left", "right"] as const).map((side, i) => {
          const id = side === "left" ? left : right;
          const ok =
            (side === "left" && verdict === "leftOk") ||
            (side === "right" && verdict === "rightOk");
          const slot = (
            <button
              key={side}
              type="button"
              disabled={done || !id}
              onClick={() => {
                setVerdict(null);
                if (side === "left") setLeft(null);
                else setRight(null);
              }}
              className="min-h-12 rounded-xl border-2 border-dashed px-2 py-1.5 text-left text-xs font-bold"
              style={{
                borderColor: active === side ? "var(--color-sun)" : "var(--color-hairline)",
                borderStyle: id ? "solid" : "dashed",
                background: id ? "var(--color-sky-soft)" : "white",
              }}
              data-slot={side}
            >
              {id ? (
                <>
                  {ok ? "✔ " : null}
                  <RubyText text={lineText(side, id)} index={index} show={show} />
                </>
              ) : (
                <span className="text-ink-soft">
                  <RubyText text={`${scene[side].title}の 行`} index={index} show={show} />
                </span>
              )}
            </button>
          );
          return i === 0 ? (
            slot
          ) : (
            <Fragment key={side}>
              <span className="text-coral-deep self-center text-lg font-black" aria-hidden>
                ≠
              </span>
              {slot}
            </Fragment>
          );
        })}
      </div>

      {step ? (
        <p
          className="rounded-xl px-3 py-1.5 text-sm font-black"
          style={{ background: "var(--color-cream)", color: "var(--color-navy)" }}
          data-testid="novel-notice-step"
        >
          👉 <RubyText text={step} index={index} show={show} />
        </p>
      ) : null}

      {!done && misses >= 1 && verdict ? (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-sm font-black"
          style={{ background: "var(--color-cream)", color: "var(--color-coral-deep)" }}
          data-testid="novel-notice-wrong"
          data-verdict={verdict}
        >
          <span className="block">
            ✖{" "}
            <RubyText
              text={
                verdict === "leftOk"
                  ? `不正解です。「${scene.left.title}」の 行は 正しいです。「${scene.right.title}」の 行を 選び直します。`
                  : verdict === "rightOk"
                    ? `不正解です。「${scene.right.title}」の 行は 正しいです。「${scene.left.title}」の 行を 選び直します。`
                    : "不正解です。もう 一度、①から 選びます。"
              }
              index={index}
              show={show}
            />
          </span>
          💡 <RubyText text={scene.hint} index={index} show={show} />
          {misses >= 2 ? (
            <span className="text-ink-soft ml-1 text-xs font-bold">
              （<RubyText text="光って いる 行を 見ましょう" index={index} show={show} />）
            </span>
          ) : null}
          {translation && scene.hintEn ? (
            <span className="text-ink-soft block text-xs font-medium">{scene.hintEn}</span>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {(["left", "right"] as const).map((side) => {
          const doc = scene[side];
          const picked = side === "left" ? left : right;
          const answer = side === "left" ? scene.answer[0] : scene.answer[1];
          const glow = side === "left" ? glowLeft : glowRight;
          const now = active === side;
          return (
            <section
              key={side}
              className="relative overflow-hidden rounded-xl border bg-white shadow-lg transition"
              style={{
                borderColor: now ? "var(--color-sun)" : "rgba(0,0,0,0.18)",
                boxShadow: now
                  ? "0 0 0 3px var(--color-sun), 0 8px 18px rgba(0,0,0,0.18)"
                  : "0 8px 18px rgba(0,0,0,0.15)",
                opacity: active && !now ? 0.75 : 1,
              }}
              data-doc={side}
              data-active={now ? "1" : undefined}
            >
              {/*
               * Mac の ウィンドウの ような 枠（2026-11-13 の 指定「Macのウィンドウのような UI」
               *「それぞれ Word ファイルや Excel のような アプリを 開いて いる デザインに」）。
               * 仕様書（doc）は 青い 窓の 文書、商品データ（table）は 緑の 窓の 表。
               */}
              <h3
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-black text-white"
                style={{ background: WINDOW[doc.look].bar }}
              >
                <span className="flex shrink-0 gap-1" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </span>
                <span aria-hidden>{WINDOW[doc.look].icon}</span>
                <span className="min-w-0">
                  <RubyText text={doc.title} index={index} show={show} />
                  <span className="font-medium opacity-80">{WINDOW[doc.look].ext}</span>
                </span>
                {now ? (
                  <span
                    className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black"
                    style={{ background: "var(--color-sun)", color: "var(--color-navy)" }}
                  >
                    <RubyText text="ここから" index={index} show={show} />
                  </span>
                ) : null}
              </h3>
              <div
                className="p-2.5"
                style={{ background: doc.look === "doc" ? "#eef1f6" : "white" }}
              >
                {doc.look === "table" ? (
                  /* 表（商品データ など）: 見出しの 行 ＋ 1行 ずつ 押せる 行 */
                  <div
                    className="overflow-hidden border"
                    style={{ borderColor: "#c8ccd2" }}
                    data-look="table"
                  >
                    {/* 表計算ソフトの ような 列の 記号（A・B…）と 行の 番号 */}
                    <div
                      className="grid text-[10px] font-bold"
                      style={{
                        gridTemplateColumns: `1.6rem repeat(${doc.columns?.length ?? 2}, minmax(0, 1fr))`,
                        background: "#eef0f2",
                        color: "#5f6b7a",
                      }}
                      aria-hidden
                    >
                      <span className="border-r px-1 py-0.5" style={{ borderColor: "#c8ccd2" }} />
                      {(doc.columns ?? []).map((column, c) => (
                        <span
                          key={column}
                          className="border-r px-2 py-0.5 text-center last:border-r-0"
                          style={{ borderColor: "#c8ccd2" }}
                        >
                          {String.fromCharCode(65 + c)}
                        </span>
                      ))}
                    </div>
                    <div
                      className="grid border-t text-xs font-black"
                      style={{
                        gridTemplateColumns: `1.6rem repeat(${doc.columns?.length ?? 2}, minmax(0, 1fr))`,
                        borderColor: "#c8ccd2",
                        background: "#e2efda",
                        color: "#1e5c36",
                      }}
                    >
                      <span
                        className="border-r px-1 py-1 text-center text-[10px]"
                        style={{ borderColor: "#c8ccd2", background: "#eef0f2", color: "#5f6b7a" }}
                        aria-hidden
                      >
                        1
                      </span>
                      {(doc.columns ?? []).map((column) => (
                        <span
                          key={column}
                          className="border-r px-2 py-1 last:border-r-0"
                          style={{ borderColor: "#c8ccd2" }}
                        >
                          <RubyText text={column} index={index} show={show} />
                        </span>
                      ))}
                    </div>
                    {doc.lines.map((line, i) => {
                      const on = picked === line.id;
                      const lit = glow && line.id === answer;
                      return (
                        <button
                          key={line.id}
                          type="button"
                          aria-pressed={on}
                          disabled={done}
                          onClick={() => pick(side, line.id)}
                          data-line={`${side}:${line.id}`}
                          className="grid w-full border-t text-left text-sm font-bold transition"
                          style={{
                            gridTemplateColumns: `1.6rem repeat(${doc.columns?.length ?? 2}, minmax(0, 1fr))`,
                            borderColor: "#c8ccd2",
                            background: on
                              ? "var(--color-sky-soft)"
                              : lit
                                ? "var(--color-cream)"
                                : "white",
                            boxShadow: on
                              ? "inset 0 0 0 2px var(--color-navy)"
                              : lit
                                ? "inset 0 0 0 3px var(--color-sun)"
                                : undefined,
                          }}
                        >
                          <span
                            className="border-r px-1 py-1.5 text-center text-[10px] font-bold"
                            style={{
                              borderColor: "#c8ccd2",
                              background: "#eef0f2",
                              color: "#5f6b7a",
                            }}
                            aria-hidden
                          >
                            {i + 2}
                          </span>
                          {line.text.split("：").map((cell, c) => (
                            <span
                              key={c}
                              className="border-r px-2 py-1.5 last:border-r-0"
                              style={{ borderColor: "#c8ccd2" }}
                            >
                              <RubyText text={cell} index={index} show={show} />
                            </span>
                          ))}
                          {translation && line.en ? (
                            <span className="text-ink-soft col-span-full px-2.5 pb-1 text-xs font-medium">
                              {line.en}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <ul
                    className={
                      doc.look === "doc"
                        ? "space-y-0.5 rounded-sm bg-white px-2 py-2.5 shadow"
                        : "space-y-1.5"
                    }
                    data-look={doc.look}
                  >
                    {doc.lines.map((line) => {
                      const on = picked === line.id;
                      const lit = glow && line.id === answer;
                      return (
                        <li key={line.id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            disabled={done}
                            onClick={() => pick(side, line.id)}
                            data-line={`${side}:${line.id}`}
                            className={`w-full rounded-xl border-2 px-3 py-1.5 text-left text-sm font-bold transition ${
                              doc.look === "code" || doc.look === "files" ? "font-mono" : ""
                            }`}
                            style={{
                              borderColor: on
                                ? "var(--color-navy)"
                                : lit
                                  ? "var(--color-sun)"
                                  : doc.look === "doc"
                                    ? "transparent"
                                    : "var(--color-hairline)",
                              background: on
                                ? "var(--color-sky-soft)"
                                : lit
                                  ? "var(--color-cream)"
                                  : doc.look === "doc"
                                    ? "white"
                                    : "var(--color-panel)",
                              boxShadow: lit ? "0 0 0 3px var(--color-sun)" : undefined,
                            }}
                          >
                            {doc.look === "doc" ? "・" : null}
                            <RubyText text={line.text} index={index} show={show} />
                            {translation && line.en ? (
                              <span className="text-ink-soft mt-0.5 block text-xs font-medium">
                                {line.en}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {done ? (
        <NoticeCard scene={scene} index={index} show={show} onNext={onNext} onRetry={retry} />
      ) : null}
    </div>
  );
}

/** 資料の 窓（アプリの 色・小さな 絵・ファイル名の 終わり）。 */
const WINDOW: Record<
  "doc" | "table" | "message" | "code" | "files",
  { bar: string; icon: string; ext: string }
> = {
  doc: { bar: "#2b579a", icon: "📝", ext: ".docx" },
  table: { bar: "#217346", icon: "📊", ext: ".xlsx" },
  message: { bar: "#3a8f5c", icon: "💬", ext: "" },
  code: { bar: "#2d3340", icon: "💻", ext: "" },
  files: { bar: "#5b6b82", icon: "📁", ext: "" },
};

function NoticeCard({
  scene,
  index,
  show,
  onNext,
  onRetry,
}: {
  scene: NoticeScene;
  index: FuriganaIndex;
  show: boolean;
  onNext: () => void;
  onRetry: () => void;
}) {
  /* 自動で 正解に なった とき、カード（と「つぎへ」）が パネルの 下に 隠れない ように */
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 p-3"
      style={{ borderColor: "var(--color-sun)", background: "var(--color-cream)" }}
      data-testid="novel-notice-card"
    >
      <p className="text-navy mb-1 text-sm font-black">
        ⭕ <RubyText text="正解です。気づきカードが できました。" index={index} show={show} />
      </p>
      <ol className="text-navy space-y-0.5 text-sm font-bold">
        <li>
          ① <RubyText text={scene.card.seen} index={index} show={show} />
        </li>
        <li>
          ② <RubyText text={scene.card.diff} index={index} show={show} />
        </li>
        <li className="text-ink-soft">③ ……</li>
      </ol>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onNext} className="btn-island btn-game flex-1 px-4 py-2.5">
          つぎへ
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="border-hairline bg-panel text-navy rounded-xl border-2 px-3 py-2 text-xs font-black"
        >
          <RubyText text="もう 一度 選ぶ" index={index} show={show} />
        </button>
      </div>
    </motion.div>
  );
}

/**
 * だれに 相談しますか — 3人の 顔と 役割。ちがう 人を 選ぶと、その 人が
 *「それは ◯◯さんに 聞いて ください」と 言い、選び直す（何回でも 同じ）。
 */
export function ChoosePanel({
  scene,
  cast,
  index,
  show,
  translation,
  cleared,
  onWrong,
  onSolved,
}: {
  scene: ChooseScene;
  cast: readonly Cast[];
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  cleared: boolean;
  onWrong: () => void;
  onSolved: () => void;
}) {
  const [wrongBy, setWrongBy] = useState<string | null>(null);
  const people = scene.options
    .map((id) => cast.find((person) => person.id === id))
    .filter((person): person is Cast => Boolean(person));
  const speaker = wrongBy ? people.find((person) => person.id === wrongBy) : null;

  return (
    <div className="space-y-3" data-testid="novel-choose">
      <p className="text-navy text-center text-base font-black">
        <RubyText text="だれに 相談しますか？" index={index} show={show} />
      </p>
      <div className="grid grid-cols-3 gap-2">
        {people.map((person) => {
          const right = cleared && person.id === scene.answer;
          return (
            <button
              key={person.id}
              type="button"
              data-person={person.id}
              onClick={() => {
                if (person.id === scene.answer) {
                  setWrongBy(null);
                  onSolved();
                } else {
                  setWrongBy(person.id);
                  onWrong();
                }
              }}
              className="flex flex-col items-center gap-1 rounded-2xl border-2 bg-white p-2 transition hover:-translate-y-0.5"
              style={{
                borderColor: right ? "var(--color-leaf)" : "var(--color-hairline)",
              }}
            >
              <Image
                src={assetUrl(`/img/characters/${person.id}/portrait.webp`) ?? ""}
                alt=""
                width={80}
                height={80}
                className="h-16 w-16 rounded-full object-cover sm:h-20 sm:w-20"
              />
              <span className="text-navy text-sm font-black">
                <RubyText text={`${person.name}さん`} index={index} show={show} />
              </span>
              <span className="text-ink-soft text-xs font-bold">
                <RubyText text={person.role} index={index} show={show} />
              </span>
              {person.duty ? (
                <span className="text-ink-soft text-[11px] leading-tight">
                  <RubyText text={person.duty} index={index} show={show} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {speaker ? (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-sm font-black"
          style={{ background: "var(--color-cream)", color: "var(--color-navy)" }}
          data-testid="novel-choose-wrong"
        >
          <RubyText text={`${speaker.name}さん：「${scene.wrong}」`} index={index} show={show} />
          {translation && scene.wrongEn ? (
            <span className="text-ink-soft block text-xs font-medium">{scene.wrongEn}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** 自分で 直す（水曜だけ）— ボタンを 押すと、コードの まちがいが 直る。 */
export function SelfFixPanel({
  scene,
  index,
  show,
  translation,
  cleared,
  onFixed,
  onNext,
}: {
  scene: SelfFixScene;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  cleared: boolean;
  /** 直した とき（クリアの 印を 付ける）。 */
  onFixed: () => void;
  /** 直した あとの「つぎへ」。 */
  onNext: () => void;
}) {
  const [fixed, setFixed] = useState(cleared);
  return (
    <div className="space-y-3" data-testid="novel-selffix">
      <p className="text-navy text-sm font-black">
        🛠 <RubyText text={scene.text} index={index} show={show} />
        {translation && scene.en ? (
          <span className="text-ink-soft block text-xs font-medium">{scene.en}</span>
        ) : null}
      </p>
      <div className="rounded-xl bg-white p-3 font-mono text-sm font-bold">
        src = &quot;
        <motion.span
          key={fixed ? "after" : "before"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ color: fixed ? "var(--color-leaf-deep)" : "var(--color-coral-deep)" }}
        >
          {fixed ? scene.after : scene.before}
        </motion.span>
        &quot;
      </div>
      <button
        type="button"
        onClick={() => {
          if (fixed) {
            onNext();
            return;
          }
          setFixed(true);
          onFixed();
        }}
        className="btn-island btn-game w-full px-6 py-3"
        data-testid="novel-selffix-button"
      >
        {fixed ? "つぎへ" : <RubyText text="自分で 直す" index={index} show={show} />}
      </button>
    </div>
  );
}
