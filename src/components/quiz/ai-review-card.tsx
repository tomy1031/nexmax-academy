"use client";

import Image from "next/image";
import { RubyText } from "@/components/ruby-text";
import type { GrammarTip, ReviewItemResult } from "@/lib/quiz/ai-review";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import type { AnswerCheck } from "./answer-check";
import { BrushUp, CheckBand } from "./check-parts";

/**
 * AIの ひょうか — こたえの チェックの けっかを 1枚に まとめる（2026-10-26 の 指定）
 *
 * 指定:「AIのチェック結果ですが、すごくわかりにくいです。上記のような構成にできますか？」
 *「文法のアドバイスは上記の写真は文法ではないので、良い形にアレンジしてください」
 *「タイトルは①AIの〜ではなく、『AIのひょうか』でお願いします」
 *「タイトルの左にNEXMAXの画像を入れてください」。
 *
 * 上から 順に:
 * 1. 見出し（ネクマックス・「AIの ひょうか」・何問目か）と、OKか／いくつ 直すか（`CheckBand`）
 * 2. **なおすところ**（✗の 項目ごと）… 足りない こと → 書いた ところ → 直した 形、と
 *    **読む 人の しつもん**（「何の URL？」）。直した 形の 中の **まだ 書いて いない 中身は
 *    ？？？**（同日の A/B で「中身は『？』で 隠す」。メモから さがす 練習を 残す）
 * 3. **文法アドバイス**（助詞・ていねいな 形 など、学生の 文に ある 文法だけ。写真の 2つめ
 *   「変更前／変更後を 書く」は 何を 書くかの 話なので、ここでは なく 2 に 入る）
 * 4. ブラッシュアップ（中身は 合って いて 言い方だけ よく できる とき）
 *
 * 「あなたの メッセージ」と「よかったところ」は 置かない（同日 あとの 指定「いったん削除で
 * お願いします」）。書いた ものは 入力欄に ある——やり直しの ときは 欄を うす赤に する（呼ぶ 側）。
 *
 * 初級（メール）と 上級（Slack）で **同じ 顔**に する（同じ 意味の ものに 2つの 顔を 持たせない）。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["文法", "ぶんぽう"],
  ["例", "れい"],
  ["書", "か"],
]);

const NG_INK = "#e0475f";

export function AiReviewCard({
  check,
  labels,
  position,
  furigana,
  aiFurigana,
  gated,
  stale = false,
  fallback = "",
}: {
  check: AnswerCheck;
  /** 項目の id → 画面の 名前（観点・欄）。ひとことが 空の ときの 見出しに 使う。 */
  labels: ReadonlyMap<string, string>;
  /** 何問目か（1から）と 全部で 何問か。 */
  position?: { readonly at: number; readonly of: number };
  /** 教材の 読み辞書（欄・観点の 名前）。 */
  furigana: FuriganaIndex;
  /** AIの 文と 学生の 文に 使う 読み辞書（教材＋`AI_KANJI_FURIGANA`）。 */
  aiFurigana: FuriganaIndex;
  gated: boolean;
  /** チェックの あとに 書きかえたか（けっかは 出した まま、帯だけ 変える）。 */
  stale?: boolean;
  /** ✗なのに ひとことが 無い（AIに つながらなかった）ときの 1行。 */
  fallback?: string;
}) {
  const ng = check.items.filter((one) => !one.ok);
  const grammar = check.grammar ?? [];

  return (
    <section
      aria-label="AIの ひょうか"
      className="mt-4 grid gap-3 rounded-[var(--radius-card)] border-2 border-[#cfe5fa] bg-[#f6fbff] p-3"
    >
      <header className="flex items-center gap-2">
        <Image
          src="/img/characters/nexmax/guide.webp"
          alt="ネクマックス"
          width={56}
          height={56}
          // 絵の 白い 地を カードの 色に なじませる
          className="size-14 shrink-0 object-contain mix-blend-multiply"
        />
        <h3 className="text-navy text-2xl font-black">AIの ひょうか</h3>
        {position && (
          <span className="ml-auto shrink-0 rounded-full bg-[#e3f0fc] px-3 py-1 text-sm font-black text-[#2a7ab5]">
            {position.at}/{position.of}
          </span>
        )}
      </header>

      <CheckBand
        ok={check.ok}
        left={ng.length}
        aiNote={check.aiNote}
        furigana={aiFurigana}
        gated={gated}
        stale={stale}
      />

      {ng.length > 0 && (
        <div className="rounded-2xl border-2 border-[#f5a3b1] bg-[#fff6f8] p-3">
          <SectionTitle mark="!" color={NG_INK} text="なおすところ" />
          <ol className="mt-2 grid gap-2.5">
            {ng.map((one, i) => (
              <FixRow
                key={one.id}
                number={i + 1}
                fix={one}
                title={one.note !== "" ? one.note : withFallback(labels.get(one.id), fallback)}
                titleIndex={one.note !== "" ? aiFurigana : furigana}
                aiFurigana={aiFurigana}
              />
            ))}
          </ol>
        </div>
      )}

      {grammar.length > 0 && <GrammarBox tips={grammar} aiFurigana={aiFurigana} />}

      <BrushUp text={check.polished} furigana={aiFurigana} />
    </section>
  );
}

/** ひとことが 無い ✗の 見出し（欄・観点の 名前 ＋ 逃げ道の 1行）。 */
function withFallback(label: string | undefined, fallback: string): string {
  if (!label) return fallback;
  return fallback === "" ? label : `【${label}】${fallback}`;
}

function SectionTitle({ mark, color, text }: { mark: string; color: string; text: string }) {
  return (
    <p className="flex items-center gap-2 text-lg font-black" style={{ color }}>
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full text-sm text-white"
        style={{ background: color }}
      >
        {mark}
      </span>
      <RubyText text={text} index={UI_FURIGANA} />
    </p>
  );
}

function NumberBadge({ number, color }: { number: number; color: string }) {
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-black text-white"
      style={{ background: color }}
    >
      {number}
    </span>
  );
}

/**
 * なおすところ 1つ。
 *
 * 書いた ところ（ピンク）→ 直した 形（みどり）を 並べ、右に **読む 人の しつもん**を 置く。
 * 何が 足りないかを「規則」では なく「相手が こまる こと」で 見せる——連絡文の ねらいは
 * 相手が すぐ 動ける ことに ある。スマホの 幅では 縦に 積む（矢印も 下向き）。
 *
 * 吹き出しと 書いた ところ・直した 形は **上ぞろえ**（同日 あとの 指定）。
 */
function FixRow({
  number,
  fix,
  title,
  titleIndex,
  aiFurigana,
}: {
  number: number;
  fix: ReviewItemResult;
  title: string;
  titleIndex: FuriganaIndex;
  aiFurigana: FuriganaIndex;
}) {
  /*
   * 写し（before）は 3つの 場合が ある: 無い（AIの 写しが 学生の 文に 見つからなかった
   * ——出さない）、空（AIが「書いて いない」と 言った）、文。直した 形が 無ければ 並びごと 出さない
   *（矢印の 先が 空に なる）。
   */
  const before = fix.before;
  const after = fix.after ?? "";
  const ask = fix.ask ?? "";
  return (
    <li className="rounded-xl bg-white p-3">
      <div className="flex items-start gap-2">
        <NumberBadge number={number} color="#f2697f" />
        <p className="text-ink min-w-0 flex-1 pt-0.5 text-base leading-relaxed font-black">
          <RubyText text={title} index={titleIndex} />
        </p>
      </div>

      <div className="mt-2 grid items-start gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        {after !== "" && (
          <div
            className={`grid items-start gap-1.5 ${before === undefined ? "" : "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"}`}
          >
            {before !== undefined && (
              <>
                <p className="text-ink rounded-xl bg-[#fde8ec] px-3 py-2 text-sm leading-relaxed font-bold break-words whitespace-pre-line">
                  {before !== "" ? (
                    <RubyText text={before} index={aiFurigana} />
                  ) : (
                    <RubyText text="（書いて いません）" index={UI_FURIGANA} />
                  )}
                </p>
                <span
                  aria-hidden
                  className="self-center text-center text-xl font-black text-[#9aa8b8]"
                >
                  <span className="hidden sm:inline">→</span>
                  <span className="sm:hidden">↓</span>
                </span>
              </>
            )}
            <p className="text-ink rounded-xl bg-[#e6f6ea] px-3 py-2 text-sm leading-relaxed font-bold break-words whitespace-pre-line">
              <RubyText text={after} index={aiFurigana} />
            </p>
          </div>
        )}
        {ask !== "" && (
          <div className="flex items-start justify-end gap-1.5" aria-label="読む 人の しつもん">
            <p className="text-ink relative max-w-[14rem] rounded-2xl bg-[#fdecef] px-3 py-2 text-sm leading-relaxed font-bold whitespace-pre-line">
              <RubyText text={ask} index={aiFurigana} />
            </p>
            <div className="relative h-20 w-16 shrink-0 overflow-hidden">
              <Image
                src="/img/characters/hendy/stand_think.webp"
                alt=""
                width={1024}
                height={1536}
                className="absolute top-0 left-1/2 h-auto w-[150%] max-w-none -translate-x-1/2"
              />
              <span
                aria-hidden
                className="absolute top-0 right-0 text-lg font-black"
                style={{ color: NG_INK }}
              >
                ？
              </span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * 文法アドバイス。**学生の 文に ある 文法だけ**（助詞の ぬけ・ていねいな 形・文の おわり）。
 * 何を 書くか（中身・順番）は なおすところに 入れる——写真の 2つめ（変更前／変更後）は
 * 文法では ない、と いう 指定（2026-10-26）。
 */
function GrammarBox({
  tips,
  aiFurigana,
}: {
  tips: readonly GrammarTip[];
  aiFurigana: FuriganaIndex;
}) {
  return (
    <div className="rounded-2xl border-2 border-[#f3d37f] bg-[#fffaea] p-3">
      <SectionTitle mark="💡" color="#c98a00" text="文法アドバイス" />
      <div className={`mt-2 grid gap-2 ${tips.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {tips.map((tip, i) => (
          <div key={`${tip.point}-${i}`} className="rounded-xl bg-white p-3">
            <div className="flex items-start gap-2">
              <NumberBadge number={i + 1} color="#f5b82e" />
              <p className="text-ink min-w-0 flex-1 pt-0.5 text-base font-black">
                <RubyText text={`「${tip.point}」`} index={aiFurigana} />
              </p>
            </div>
            {tip.explain !== "" && (
              <p className="text-ink mt-1.5 text-sm leading-relaxed font-bold">
                <RubyText text={tip.explain} index={aiFurigana} />
              </p>
            )}
            {tip.example !== "" && (
              <p className="text-ink mt-2 flex items-start gap-2 rounded-xl bg-[#eaf4fe] px-3 py-2 text-sm leading-relaxed font-bold">
                <span className="shrink-0 rounded-md bg-[#3b8fe0] px-1.5 py-0.5 text-xs font-black text-white">
                  <RubyText text="例" index={UI_FURIGANA} />
                </span>
                <span className="min-w-0 break-words">
                  <RubyText text={tip.example} index={aiFurigana} />
                </span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
