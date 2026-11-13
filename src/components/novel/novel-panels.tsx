"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "motion/react";
import type { Novel, NovelScene } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { assetUrl } from "@/lib/asset-url";
import type { FuriganaIndex } from "@/lib/text/furigana";

type NoticeScene = Extract<NovelScene, { type: "notice" }>;
type ChooseScene = Extract<NovelScene, { type: "choose_person" }>;
type SelfFixScene = Extract<NovelScene, { type: "self_fix" }>;
type Cast = Novel["cast"][number];

/**
 * 気づき — 2つの 資料を 横に 並べ（スマホでは 上下）、合わない 行を 1つずつ 選ぶ。
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
  const [solved, setSolved] = useState(cleared);
  const [practice, setPractice] = useState(false);
  const done = solved && !practice;

  const glowLeft = done || misses >= 2;
  const glowRight = done || misses >= 3;

  const compare = () => {
    if (!left || !right) return;
    if (left === scene.answer[0] && right === scene.answer[1]) {
      setSolved(true);
      setPractice(false);
      onSolved();
      return;
    }
    setMisses((n) => n + 1);
    onWrong();
  };

  const retry = () => {
    setLeft(null);
    setRight(null);
    setMisses(0);
    setPractice(true);
  };

  return (
    <div className="space-y-3" data-testid="novel-notice">
      {/* 何を するかを **毎回** 出す（つづきから 始めた 学生は 月曜の 説明を 見て いない） */}
      <p className="text-navy text-sm font-black" data-testid="novel-notice-prompt">
        🔍{" "}
        <RubyText
          text={scene.prompt ?? "2つの 資料から、合わない 行を 1つずつ 選びます。"}
          index={index}
          show={show}
        />
        <span className="text-ink-soft block text-xs font-bold">
          <RubyText text="選んだら「くらべる」を 押します。" index={index} show={show} />
        </span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["left", "right"] as const).map((side) => {
          const doc = scene[side];
          const picked = side === "left" ? left : right;
          const pick = side === "left" ? setLeft : setRight;
          const answer = side === "left" ? scene.answer[0] : scene.answer[1];
          const glow = side === "left" ? glowLeft : glowRight;
          return (
            <section
              key={side}
              className="rounded-2xl border-2 bg-white p-3"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <h3 className="text-navy mb-2 flex items-center gap-1.5 text-sm font-black">
                <span aria-hidden>{LOOK_ICON[doc.look]}</span>
                <RubyText text={doc.title} index={index} show={show} />
              </h3>
              <ul className="space-y-1.5">
                {doc.lines.map((line) => {
                  const on = picked === line.id;
                  const lit = glow && line.id === answer;
                  return (
                    <li key={line.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={done}
                        onClick={() => pick(line.id)}
                        data-line={`${side}:${line.id}`}
                        className={`w-full rounded-xl border-2 px-3 py-2 text-left text-sm font-bold transition ${
                          doc.look === "code" || doc.look === "files" ? "font-mono" : ""
                        }`}
                        style={{
                          borderColor: on
                            ? "var(--color-navy)"
                            : lit
                              ? "var(--color-sun)"
                              : "var(--color-hairline)",
                          background: on
                            ? "var(--color-sky-soft)"
                            : lit
                              ? "var(--color-cream)"
                              : "var(--color-panel)",
                          boxShadow: lit ? "0 0 0 3px var(--color-sun)" : undefined,
                        }}
                      >
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
            </section>
          );
        })}
      </div>

      {done ? (
        <NoticeCard scene={scene} index={index} show={show} onNext={onNext} onRetry={retry} />
      ) : (
        <div className="space-y-2">
          {misses >= 1 ? (
            <p
              role="status"
              className="rounded-xl px-3 py-2 text-sm font-black"
              style={{ background: "var(--color-cream)", color: "var(--color-coral-deep)" }}
            >
              <span className="block">
                ❌{" "}
                <RubyText
                  text="その 2つでは ありません。もう 一度 選んで ください。"
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
          <button
            type="button"
            onClick={compare}
            disabled={!left || !right}
            className="btn-island btn-game w-full px-6 py-3 disabled:opacity-40"
            data-testid="novel-compare"
          >
            くらべる
          </button>
        </div>
      )}
    </div>
  );
}

const LOOK_ICON: Record<string, string> = { doc: "📄", message: "💬", code: "💻", files: "📁" };

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
  return (
    <motion.div
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
