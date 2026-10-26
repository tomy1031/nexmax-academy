"use client";

import { useMemo, useState } from "react";
import type { QuizQuestion } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { fillinSlotAiMayAccept, fillinSlotOk } from "@/lib/quiz/draft";
import { fillinModelText, fillinSlots, fillinText } from "@/lib/quiz/fillin";
import type { QuizDraft } from "@/lib/quiz/draft";
import { aiReplyFurigana } from "@/lib/ai-kanji";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { useAnswerCheck, useWarmOnReady } from "./answer-check";
import { AiReviewCard } from "./ai-review-card";
import { CheckButton, CheckMark } from "./check-parts";
import { guardsCopy, noPasteProps, PASTE_BLOCKED_NOTE } from "./copy-guard";

/**
 * 初級：メールの 型を うめる（`fillin`）— **欄の となりで ⭕✗を 返す**
 *
 * 2026-09-21 の 指定:
 * 「入力項目に直接エラーメッセージのように正解不正解と、項目ごとにその下に
 *  何が良かったか（正解時）何がだめなのか（不正解時）書いて」
 * 「初級と上級はコンポーネントを分けてください」。
 *
 * ## ⭕✗は まず **アプリが** 決める
 * この もんだいは 欄ごとに 正解が ある（教材データ）。だから ⭕✗は まず `fillinSlotOk` が 決め、
 * AIは **欄ごとの ひとこと**と、必要な ときの **ブラッシュアップ**を 書く。
 * 鍵（Gemini）が 無い 端末でも ⭕✗は 出る——学習は 止まらない。
 *
 * アプリが ✗に した 欄は、AIが **中身で** ⭕に できる（2026-10-26 の 指定
 *「１言１句ではなく、内容を捉えられているか」）。数字・日にちが ちがう 欄は 渡さない
 *（`fillinSlotAiMayAccept`）。
 *
 * ## 答え（お手本）は ここでは 出さない
 * 「模範解答は答え合わせの時だけでいいです」（同日の 指定）。だから ✗の 欄にも
 * 正解は 書かない——ひとことで「何が 足りないか」だけを 返す。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["先", "さき"],
  ["書", "か"],
  ["押", "お"],
]);

/**
 * AIが ひとことを くれなかった ときの 逃げ道（鍵が 無い 端末・つながらない とき）。
 * **ひらがなだけ**で 書く——AIの 索引に 頼らずに 読める ように。
 */
const MEMO_AGAIN = "メモの ことばと ちがうようです。もう いちど メモを たしかめて ください。";

type Mail = Extract<QuizQuestion, { type: "fillin" }>;

/**
 * 欄の 色（チェックの あと）。⭕は みどりの 枠、**✗（やり直し）は うす赤の 欄**
 *（2026-10-26 の 指定「やり直しの場合は入力されたテキストボックスがうす赤色になるように」）。
 */
function fieldStyle(hit: { ok: boolean } | undefined): React.CSSProperties | undefined {
  if (!hit) return undefined;
  return hit.ok
    ? { borderColor: "#58c273", borderWidth: 2 }
    : { borderColor: "#f26fa7", borderWidth: 2, background: "#fff0f3" };
}

export function MailQuestion({
  question,
  furigana,
  onSubmit,
  disabled,
  submitMode,
  draft,
  position,
}: {
  question: Mail;
  furigana: FuriganaIndex;
  /**
   * `checked` … こたえの チェックで いまの 文の まま ⭕か（1問ずつ の 採点を ⭕に そろえる。
   * AIが 中身で ⭕に した 欄は、字だけの 採点では ✗に なる ため）。
   */
  onSubmit: (inputs: readonly string[], checked?: boolean) => void;
  disabled?: boolean;
  submitMode?: boolean;
  draft?: Extract<QuizDraft, { kind: "fillin" }>;
  /** 何問目か（「AIの ひょうか」の 右上に 出す）。 */
  position?: { readonly at: number; readonly of: number };
}) {
  const slots = useMemo(() => fillinSlots(question), [question]);
  // 画面の 文字は この部品が 持つ（親から 送り返すと 変換の 途中で 入れ替わる）
  const [inputs, setInputs] = useState<string[]>(() => slots.map((_, i) => draft?.inputs[i] ?? ""));
  const written = fillinText(question, inputs);
  const { check, shown, stale, phase, run, warm, waiting, ready } = useAnswerCheck(
    question,
    written,
  );
  /** 貼り付けを 止めた ところか（理由を 1行 出す）。 */
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const noPaste = guardsCopy(question) ? noPasteProps(() => setPasteBlocked(true)) : {};
  /*
   * **AIが 書いた 文だけ**は、教材の 辞書に `AI_KANJI_FURIGANA` を 重ねた 索引で 描く。
   * 通す／通さないの 検査（`answer-check.tsx`）は もう その 索引で 見て いるので、
   * ここを 教材の 辞書だけに すると「検査は 通るのに 画面では ルビが 付かない」が 起きる
   *（2026-09-21 の 読み検収）。教材データ（欄の 名前・件名）は `furigana` の まま。
   */
  const aiFurigana = useMemo(
    () => buildFuriganaIndex(aiReplyFurigana(furigana.entries)),
    [furigana],
  );

  const empty = inputs.every((value) => value.trim() === "");
  const filled = inputs.every((value) => value.trim() !== "");
  /*
   * ぜんぶ 書けた ところで **つなぎを 先に 張る**（2026-09-21「AI読み取りの反応が遅い」）。
   * したく（短命トークン＋接続＋合図待ち）は 数秒 かかる。押してから 払うと、
   * 学習者は その ぶん ずっと 待つ。押しそうな ところで 先に 済ませて おく。
   */
  useWarmOnReady(warm, filled && !disabled);

  const change = (index: number, next: string) => {
    setPasteBlocked(false);
    const updated = inputs.map((value, i) => (i === index ? next : value));
    setInputs(updated);
    if (submitMode) onSubmit(updated);
  };

  const ask = () => {
    /*
     * 欄ごとの ⭕✗を 先に 決めて から 渡す（AIは ⭕を ✗に できない。✗を ⭕に できるのは
     * `aiJudges` の 欄だけ）。
     * id は 欄の 並び（`fillinSlots`）で 付ける——名前が 同じ 欄が あっても ずれない。
     */
    const items = slots.map((slot, i) => {
      const ok = fillinSlotOk(slot, inputs[i] ?? "");
      return {
        id: `f${i + 1}`,
        label: slot.label,
        value: (inputs[i] ?? "").trim(),
        answer: slot.answer,
        ok,
        aiJudges: !ok && fillinSlotAiMayAccept(slot, inputs[i] ?? ""),
      };
    });
    void run({
      items,
      itemKind: "field",
      model: fillinModelText(question),
      scene: question.scene?.text ?? "",
      furigana,
      // 欄の 正解が ある ので、AIが 来なくても ⭕✗は 決められる
      okWithoutAi: items.every((item) => item.ok),
    });
  };

  const box =
    "border-hairline bg-panel text-ink min-w-0 flex-1 rounded-[var(--radius-button)] border-2 px-3 py-2 text-base font-bold";
  /** 本文の 上の 行（宛先）の 欄は 先頭から、本文の 欄は その あと（`fillinSlots` の 並び）。 */
  let slot = 0;
  /*
   * 欄の ⭕✗は **前の チェックの まま**出す（書きかえても 消さない・2026-10-26 の 指定）。
   * もう いちど チェックするまで 変わらない——関門は `check`（いまの 文）で 見る。
   */
  const noteOf = (index: number) => shown?.items.find((one) => one.id === `f${index + 1}`);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitMode && !disabled && !empty) onSubmit(inputs, check?.ok === true);
      }}
    >
      <div className="border-hairline overflow-hidden rounded-[var(--radius-card)] border-2 bg-white">
        {question.formTitle && (
          <p className="bg-panel-tint border-hairline text-ink border-b-2 px-3 py-2 text-sm font-extrabold">
            <RubyText text={question.formTitle} index={furigana} />
          </p>
        )}
        {question.head.map((row, i) => {
          const index = row.kind === "write" ? slot++ : -1;
          const hit = index >= 0 ? noteOf(index) : undefined;
          return (
            <div key={`${row.label}-${i}`} className="border-hairline border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-ink-soft w-16 shrink-0 text-xs font-extrabold">
                  <RubyText text={row.label} index={furigana} />
                </span>
                {row.kind === "fixed" ? (
                  <span className="text-ink min-w-0 flex-1 text-sm font-bold">
                    <RubyText text={row.text} index={furigana} />
                  </span>
                ) : (
                  <input
                    type="text"
                    size={1}
                    value={inputs[index] ?? ""}
                    disabled={disabled}
                    onChange={(e) => change(index, e.target.value)}
                    {...noPaste}
                    autoComplete="off"
                    aria-label={`${row.label}を 入力する`}
                    placeholder={row.placeholder}
                    className={box}
                    style={fieldStyle(hit)}
                  />
                )}
                {hit && <CheckMark ok={hit.ok} />}
              </div>
            </div>
          );
        })}
        <div className="grid gap-2 px-3 py-3">
          {question.intro && (
            <p className="text-ink text-sm leading-relaxed font-bold">
              <RubyText text={question.intro} index={furigana} />
            </p>
          )}
          {question.blanks.map((blank, i) => {
            const index = slot + i;
            const hit = noteOf(index);
            return (
              <div key={`${blank.label}-${i}`}>
                <div className="flex items-center gap-2">
                  <span className="text-ink w-24 shrink-0 text-xs font-extrabold">
                    <RubyText text={`【${blank.label}】`} index={furigana} />
                  </span>
                  <input
                    type="text"
                    size={1}
                    value={inputs[index] ?? ""}
                    disabled={disabled}
                    onChange={(e) => change(index, e.target.value)}
                    {...noPaste}
                    autoComplete="off"
                    aria-label={`${blank.label}を 入力する`}
                    placeholder={blank.placeholder}
                    className={box}
                    style={fieldStyle(hit)}
                  />
                  {hit && <CheckMark ok={hit.ok} />}
                </div>
              </div>
            );
          })}
          {question.outro && (
            <p className="text-ink text-sm leading-relaxed font-bold">
              <RubyText text={question.outro} index={furigana} />
            </p>
          )}
        </div>
      </div>

      {pasteBlocked && (
        <p className="mt-1.5 text-xs font-bold text-[#c2185b]" role="status">
          {PASTE_BLOCKED_NOTE}
        </p>
      )}

      {!submitMode && (
        <button
          type="submit"
          disabled={disabled || empty}
          className="btn-island btn-game mt-3 px-8 py-3 disabled:opacity-50"
        >
          こたえる
        </button>
      )}

      {/* チェックは **ぜんぶの 欄を うめてから**（空の 欄は「まだ」であって まちがいでは ない） */}
      {ready && (
        <>
          <CheckButton
            onClick={ask}
            disabled={Boolean(disabled) || !filled}
            asking={phase === "asking"}
          />
          {!filled && (
            <p className="text-ink-faint mt-1.5 text-xs font-bold">
              <RubyText text="ぜんぶの 欄を 書くと 押せます。" index={FIELD_FURIGANA} />
            </p>
          )}
          {waiting !== "" && (
            <p className="text-ink-soft mt-1.5 text-xs leading-relaxed font-bold" role="status">
              <RubyText text={waiting} index={aiFurigana} />
            </p>
          )}
          {/*
            欄の となりは ⭕✗の しるしだけ。ひとこと・直した 形・読む 人の しつもんは
            「AIの ひょうか」1枚に まとめる（2026-10-26 の 指定「すごくわかりにくい」）。
          */}
          {shown && (
            <AiReviewCard
              check={shown}
              stale={stale}
              labels={new Map(slots.map((one, i) => [`f${i + 1}`, one.label]))}
              position={position}
              furigana={furigana}
              aiFurigana={aiFurigana}
              gated
              fallback={MEMO_AGAIN}
            />
          )}
        </>
      )}
    </form>
  );
}

/** 「欄」の 読み（この 部品でしか 使わない）。 */
const FIELD_FURIGANA = buildFuriganaIndex([
  ["欄", "らん"],
  ["書", "か"],
  ["押", "お"],
  ...UI_FURIGANA.entries,
]);
