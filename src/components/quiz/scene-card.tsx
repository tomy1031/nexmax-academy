"use client";

import { useMemo } from "react";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import type { QuizQuestion } from "@/content/schema";
import { copyableTokens, NO_COPY_PROPS } from "./copy-guard";

/**
 * 場面の カード — **設問とは 別の 箱**で メモを 見せる
 *
 * 連絡文の 練習は「バラバラの メモから 必要な ものを さがす」問い。だから
 * メモは 設問文と 混ぜない——1つの かたまりに すると、どこまでが 指示で
 * どこからが 材料かが 読めなく なる（元の 別ページも ふきだしで 分けて いた）。
 *
 * ## 黄色い しるし（`marks`）
 * 元の 教材は **それぞれの パターンの 1問目にだけ** しるしを 付けて いた。
 * 2問目からは 自分で さがす——むずかしさの 階段が しるしの 有無で できて いる。
 * 移すときに そろえない（規律10「移植は 差分ゼロが 既定」）。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([["宛先", "あてさき"]]);

type Scene = NonNullable<QuizQuestion["scene"]>;

/** しるしの ところで 文を 切る（重なりは 起きない——左から 最長一致で 消費する）。 */
export function splitMarks(
  text: string,
  marks: readonly string[],
): { text: string; mark: boolean }[] {
  const wanted = [...marks].filter((mark) => mark !== "").sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return [{ text, mark: false }];
  const out: { text: string; mark: boolean }[] = [];
  let plain = "";
  let at = 0;
  while (at < text.length) {
    const hit = wanted.find((mark) => text.startsWith(mark, at));
    if (hit) {
      if (plain !== "") out.push({ text: plain, mark: false });
      plain = "";
      out.push({ text: hit, mark: true });
      at += hit.length;
      continue;
    }
    plain += text[at];
    at += 1;
  }
  if (plain !== "") out.push({ text: plain, mark: false });
  return out;
}

export function SceneCard({
  scene,
  furigana,
  noCopy = false,
}: {
  scene: Scene;
  furigana: FuriganaIndex;
  /** もとにする 情報を コピーできなく する（連絡文の 練習・`guardsCopy`）。 */
  noCopy?: boolean;
}) {
  const parts = useMemo(() => splitMarks(scene.text, scene.marks), [scene.text, scene.marks]);
  const chat = scene.style === "chat";

  return (
    <div
      className={`mt-3 rounded-[var(--radius-card)] border-2 px-4 py-3 ${noCopy ? "select-none" : ""}`}
      {...(noCopy ? NO_COPY_PROPS : {})}
      style={
        chat
          ? { borderColor: "#c8e6c9", background: "#eef8ef" }
          : { borderColor: "var(--color-hairline)", background: "var(--color-panel-tint)" }
      }
    >
      {scene.from && (
        <p className="text-xs font-black" style={{ color: chat ? "#2e7d32" : "var(--color-navy)" }}>
          {chat ? "💬 " : "🧑‍💻 "}
          <RubyText text={scene.from} index={furigana} />
        </p>
      )}
      {scene.to && (
        <p className="text-ink-soft mt-0.5 text-xs font-extrabold">
          <RubyText text="宛先：" index={UI_FURIGANA} />
          <SceneText text={scene.to} furigana={furigana} noCopy={noCopy} />
        </p>
      )}
      <p className="text-ink mt-1.5 leading-relaxed font-bold whitespace-pre-line">
        {parts.map((part, i) =>
          part.mark ? (
            /*
              しるしは **色だけに たよらない**（画面ぜんたいの 決めごと）。
              下線と 太字を 重ねて、色の 見え方が ちがう 目にも 差が 残る ように する。
            */
            <mark
              key={i}
              className="rounded px-1 font-black underline decoration-2 underline-offset-2"
              style={{ background: "#fff3cd", color: "var(--color-ink)" }}
            >
              <SceneText text={part.text} furigana={furigana} noCopy={noCopy} />
            </mark>
          ) : (
            <SceneText key={i} text={part.text} furigana={furigana} noCopy={noCopy} />
          ),
        )}
      </p>
    </div>
  );
}

/**
 * メモの 文。コピーを 止める ときは、**URL・@宛先 など 英数字の かたまりだけ**を 選べる
 * ように する（2026-10-26「URLとか、学習に関係のないものはコピーOKにしたい」）。
 */
function SceneText({
  text,
  furigana,
  noCopy,
}: {
  text: string;
  furigana: FuriganaIndex;
  noCopy: boolean;
}) {
  if (!noCopy) return <RubyText text={text} index={furigana} />;
  return (
    <>
      {copyableTokens(text).map((part, i) =>
        part.copyable ? (
          <span key={i} data-copyable className="select-text">
            {part.text}
          </span>
        ) : (
          <RubyText key={i} text={part.text} index={furigana} />
        ),
      )}
    </>
  );
}
