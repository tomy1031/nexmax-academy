"use client";

import type { ReactNode } from "react";

import { ModalShell } from "@/components/meeting/modal-shell";
import { RubyText } from "@/components/ruby-text";
import type { AsakaiFix } from "@/lib/meeting/asakai-judge";
import { CLARITY_MAX, CONTENT_MAX, JAPANESE_MAX, type RowMark } from "@/lib/meeting/asakai-score";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * 採点の ポップアップ — **報告の あと・聞き返しの あと・その日の おわり**の 3つ
 *
 * 2026-09-17 の 指定「モーダルや 最終結果の UIの 情報が 足りません。添付のように
 * なるように、AI側の 採点などを しっかりと 作って ください。全て モーダルが よいです」。
 *
 * 前は「開いた カード / まだの カード」の 2行だけ だった。**何が どう よくて、
 * 何を 直すのか**が 読めないので、学習者は 同じ ところで つまずき つづける。
 *
 * ## 3つとも 同じ 骨
 * 見出し（点）→ どのように 伝えられたか → 中身の ふりかえり → よかった こと／アドバイス。
 * 骨を そろえるのは、**同じ ものを 同じ 場所で 読める**ように する ため
 *（画面ごとに 並びが 変わると、毎回 探す ところから 始まる）。
 *
 * ## 鍵が 無い 端末では 内容だけ
 * 伝わりやすさと 仕事の 日本語は AIが 見る（BYOK）。鍵が 無い ときは
 * **「—」と 出して 総合を 出さない**——見て いない ものに 0点を つけると、
 * 言えて いるのに 落とされたと 読める（規律1）。
 */

/** 3つの ものさし（鍵が 無い ときは 内容だけ）。 */
export interface ScoreView {
  readonly content: number;
  readonly clarity: number | null;
  readonly japanese: number | null;
  readonly total: number | null;
}

/** 1つの 札の ふりかえり。 */
export interface RowView {
  readonly id: string;
  readonly label: string;
  readonly mark: RowMark;
  /**
   * 直す ときの ひとこと（無ければ 空）。
   *
   * **札ごとの「言った ところ」は 持たない。** 照合は 報告 まるごとに 対して
   * かかる ので、どの 1文が どの 札を 開けたかは 分けられない。持って いた ころは
   * 空文字の まま 画面に 渡って いて、4つ ぜんぶ 言えた 日にも 全行に
   *「まだ 報告して いません。」が 並んで いた（2026-09-17 の 通しプレイ検収）。
   * 言った ことは ポップアップの 中で **1回だけ**（`utterance`）出す。
   */
  readonly advice: string;
  /**
   * **その 札の 正しい 回答**（教材の 見本）。その日の ふりかえりにだけ 出す。
   *
   * 2026-09-18 の 指定「各項目に ついて、正しい 回答を 表示して ください」。
   * 練習の 途中では 出さない——写して 終わりに なる（答えを 見せない の 決まり）。
   * 日が 終わった あとの ふりかえりは、見くらべる 場なので 別。
   */
  readonly example: string;
}

const MARK_FACE: Record<RowMark, { readonly mark: string; readonly cls: string }> = {
  first: { mark: "✅", cls: "border-leaf bg-sky-soft text-leaf-deep" },
  probe: { mark: "💬", cls: "border-sun-deep bg-cream text-sun-deep" },
  fixed: { mark: "🔁", cls: "border-sun-deep bg-cream text-sun-deep" },
  missing: { mark: "❗", cls: "border-coral bg-blossom text-coral-deep" },
};

/** その日の おわりの ことば（何が 起きたかを 名前で 言う）。 */
const DAY_WORD: Record<RowMark, string> = {
  first: "最初から 言えました",
  probe: "しつもんの あとで 言えました",
  fixed: "しつもんの あとで 直しました",
  missing: "言えませんでした",
};

/** 報告の 直後の ことば（まだ 聞かれて いない ものが ある）。 */
const FIRST_WORD: Record<RowMark, string> = {
  first: "言えました",
  probe: "言い直しました",
  fixed: "数を 直しました",
  missing: "まだです",
};

function Ruby({ text, index }: { text: string; index: FuriganaIndex }) {
  return <RubyText text={text} index={index} show />;
}

/** 小さな 見出し（箱の 名前）。 */
function Cap({ text, index, tone = "" }: { text: string; index: FuriganaIndex; tone?: string }) {
  return (
    <p className={`text-[11px] leading-[1.9] font-black ${tone || "text-ink-soft"}`}>
      <Ruby text={text} index={index} />
    </p>
  );
}

/**
 * 点の 見出し。**総合は AIの 2つが そろった ときだけ**。
 *
 * 鍵が 無い ときは 内容の 点を 大きく 出し、ほかの 2つは 「—」。
 * 何を 見て いないかを その場に 書く（黙って 空に すると 0点に 見える）。
 */
function ScoreHead({
  lead,
  score,
  note,
  hasKey,
  index,
}: {
  lead: string;
  score: ScoreView;
  note?: ReactNode;
  /** 端末に AIの 鍵が あるか（無い ときと 届かなかった ときで 理由が ちがう）。 */
  hasKey: boolean;
  index: FuriganaIndex;
}) {
  const axes = [
    { key: "content", name: "報告の 内容", value: score.content, max: CONTENT_MAX, icon: "📋" },
    { key: "clarity", name: "伝わりやすさ", value: score.clarity, max: CLARITY_MAX, icon: "💬" },
    {
      key: "japanese",
      name: "仕事の 日本語",
      value: score.japanese,
      max: JAPANESE_MAX,
      icon: "📊",
    },
  ] as const;
  return (
    <div className="border-hairline bg-panel-tint mt-3 rounded-2xl border-2 p-3">
      <Cap text={lead} index={index} />
      <p className="text-navy mt-1 text-3xl font-black">
        {score.total === null ? (
          <>
            <Ruby text="内容" index={index} /> {score.content}
            <span className="text-ink-soft text-base"> / {CONTENT_MAX}</span>
          </>
        ) : (
          <>
            <Ruby text="総合" index={index} /> {score.total}
            <span className="text-ink-soft text-base"> / 100</span>
          </>
        )}
      </p>
      {note}
      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
        {axes.map((axis) => (
          <div
            key={axis.key}
            className="border-hairline bg-panel rounded-xl border px-2 py-2 sm:px-3"
          >
            <p className="text-ink-soft text-[11px] leading-[1.9] font-bold">
              {axis.icon} <Ruby text={axis.name} index={index} />
            </p>
            <p className="text-navy text-lg font-black">
              {axis.value === null ? (
                <span className="text-ink-faint text-sm">—</span>
              ) : (
                <>
                  {axis.value}
                  <span className="text-ink-soft text-xs"> / {axis.max}</span>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
      <p className="text-ink-soft mt-2 text-[11px] leading-[1.9] font-bold">
        <Ruby text="合格に 効くのは 報告の 内容です。" index={index} />
      </p>
      {score.total === null ? (
        <p className="text-ink-soft mt-1 text-[11px] leading-[1.9] font-bold">
          <Ruby
            text={
              hasKey
                ? "いまは AIの 見かたが 届きませんでした。内容の 点だけ 出します。"
                : "伝わりやすさと 仕事の 日本語は、AIの 鍵が ある ときに 出ます。"
            }
            index={index}
          />
        </p>
      ) : null}
    </div>
  );
}

/** 「どのように 伝えられたか」の 帯。 */
function MarkRow({
  rows,
  words,
  index,
}: {
  rows: readonly RowView[];
  words: Record<RowMark, string>;
  index: FuriganaIndex;
}) {
  return (
    <div className="mt-3">
      <Cap text="どのように 伝えられたか" index={index} />
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((row) => {
          const face = MARK_FACE[row.mark];
          return (
            <div key={row.id} className={`rounded-xl border-2 px-3 py-2 ${face.cls}`}>
              <p className="text-[11px] leading-[1.9] font-bold opacity-80">
                <Ruby text={row.label} index={index} />
              </p>
              <p className="text-sm leading-[1.9] font-black">
                {face.mark} <Ruby text={words[row.mark]} index={index} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * **ブラッシュアップ** — こたえを 職場の 日本語に 書き直した もの（AIの ことば）。
 *
 * 2026-09-18 の 指定「あなたの 報告の 下に『ブラッシュアップ』より よい 日本語を
 * 入れて ください。あなたの 回答を ベースに 作成して ください。言ってない 言葉は
 * 補わないで」。**中身を 足さない**のが 要——補うと、言えて いない ことに
 * 気づけない まま「これで よかった」と 読む（規律1）。
 */
function Polish({ text, index }: { text: string; index: FuriganaIndex }) {
  if (text === "") return null;
  return (
    <div className="border-sky-deep bg-sky-soft mt-2 rounded-xl border-2 px-3 py-2">
      <Cap text="✨ ブラッシュアップ（より よい 日本語）" index={index} tone="text-sky-deep" />
      <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
        <Ruby text={text} index={index} />
      </p>
    </div>
  );
}

/** よかった こと ／ アドバイス（どちらも AIの ことば。無ければ 出さない）。 */
function GoodAdvice({
  good,
  advice,
  index,
}: {
  good: string;
  advice: string;
  index: FuriganaIndex;
}) {
  if (good === "" && advice === "") return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {good !== "" ? (
        <div className="border-leaf bg-sky-soft rounded-xl border-2 px-3 py-2">
          <Cap text="✨ よかった こと" index={index} tone="text-leaf-deep" />
          <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
            <Ruby text={good} index={index} />
          </p>
        </div>
      ) : null}
      {advice !== "" ? (
        <div className="border-sun-deep bg-cream rounded-xl border-2 px-3 py-2">
          <Cap text="💡 アドバイス" index={index} tone="text-sun-deep" />
          <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
            <Ruby text={advice} index={index} />
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** 日本語の 直し（あなたの 表現 → 自然な 表現）。 */
function FixList({ fixes, index }: { fixes: readonly AsakaiFix[]; index: FuriganaIndex }) {
  if (fixes.length === 0) return null;
  return (
    <div className="border-sun-deep bg-cream mt-3 rounded-xl border-2 px-3 py-2">
      <Cap text="💡 日本語を 直しましょう" index={index} tone="text-sun-deep" />
      {fixes.map((fix) => (
        <div key={`${fix.said}/${fix.natural}`} className="mt-1">
          <p className="flex flex-wrap items-center gap-1 text-xs leading-[1.9] font-black">
            <span className="border-hairline text-ink-soft rounded-full border bg-white px-2">
              <Ruby text="あなたの 言い方" index={index} />
            </span>
            <span className="bg-blossom text-coral-deep rounded-full px-2">
              <Ruby text={fix.said} index={index} />
            </span>
            <span aria-hidden>→</span>
            <span className="bg-sky-soft text-leaf-deep rounded-full px-2">
              <Ruby text={fix.natural} index={index} />
            </span>
          </p>
          {fix.note !== "" ? (
            <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
              <Ruby text={fix.note} index={index} />
            </p>
          ) : null}
        </div>
      ))}
      <p className="text-ink-soft mt-1 text-[11px] leading-[1.9] font-bold">
        🔊 <Ruby text="直した 文を 声に 出して 言って みましょう。" index={index} />
      </p>
    </div>
  );
}

/* ================================================================== *
 * 1) 報告の あと（まだ その日は 終わって いない）
 * ================================================================== */

export function ReportScoreModal({
  score,
  rows,
  good,
  advice,
  polished,
  fixes,
  readLog,
  nextLabel,
  utterance,
  hasKey,
  index,
  onClose,
}: {
  score: ScoreView;
  rows: readonly RowView[];
  good: string;
  advice: string;
  /** こたえを 職場の 日本語に 書き直した もの（無ければ 出さない）。 */
  polished: string;
  fixes: readonly AsakaiFix[];
  /** 夕礼で 作業記録を そのまま 読み上げて いた（この ぶんは 数えて いない）。 */
  readLog: boolean;
  /** とじる ボタンの 字（まだ つづく／その日は おわり）。 */
  nextLabel: string;
  /** 学習者が いま 言った こと（そのまま 出す）。 */
  utterance: string;
  hasKey: boolean;
  index: FuriganaIndex;
  onClose: () => void;
}) {
  const left = rows.filter((row) => row.mark === "missing").length;
  return (
    <ModalShell
      label="報告の 見かた"
      title={<Ruby text="いまの 報告" index={index} />}
      onClose={onClose}
      closeLabel={nextLabel}
      index={index}
      wide
    >
      {readLog ? (
        <div className="border-coral bg-blossom text-coral-deep mt-3 rounded-xl border-2 px-3 py-2 text-sm leading-[1.9] font-bold">
          <Ruby
            text="作業記録を そのまま 読み上げて います。この ぶんは 数えて いません。大きな 作業を 2つか 3つに まとめて、もう いちど 言って ください。"
            index={index}
          />
        </div>
      ) : null}

      <ScoreHead
        lead="いまの 報告"
        score={score}
        hasKey={hasKey}
        index={index}
        note={
          left > 0 ? (
            <p className="text-coral-deep text-sm leading-[1.9] font-black">
              ❗ <Ruby text={`まだ 言う ことが ${left}つ あります`} index={index} />
            </p>
          ) : (
            <p className="text-leaf-deep text-sm leading-[1.9] font-black">
              ✅ <Ruby text={`${rows.length}つ ぜんぶ 言えました`} index={index} />
            </p>
          )
        }
      />

      <MarkRow rows={rows} words={FIRST_WORD} index={index} />

      {/* 言った ことは **1回だけ** 出す（札ごとに 分けられないので、分けた ふりを しない）。 */}
      <div className="border-hairline bg-panel mt-3 rounded-xl border px-3 py-2">
        <Cap text="あなたの 報告" index={index} />
        <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
          <Ruby text={utterance} index={index} />
        </p>
      </div>
      <Polish text={polished} index={index} />

      {/*
        **読み上げを 差し戻した ターンは、札ごとの 直しを 出さない。**
        司会の 声は `if (readLog) sayRedo(); else if (followup) say(followup);` で
        片方に 絞って あるのに（`asakai-session.tsx`）、ポップアップだけ
        「まとめて もう いちど」と 札4枚ぶんの 聞き返しを **同時に** 並べて いた
        ——次の 行動は 1つ（規律1・2026-09-17 の R5 再検収）。
      */}
      {/*
        **出すのは 1つだけ。** 司会は 1つしか 聞かない
        （`asakai-session.tsx` の `if (readLog) sayRedo(); else if (followup) say(followup);`）
        のに、ここに 4枚ぶんの 聞き返しが 同時に 並んで いた——次の 行動は 1つ
        （規律1・2026-09-18 の R5 検収）。
      */}
      {!readLog && rows.some((row) => row.advice !== "") ? (
        <div className="mt-3">
          <Cap text="やり直す ところ" index={index} />
          <ul className="mt-1 space-y-2">
            {rows
              .filter((row) => row.advice !== "")
              .slice(0, 1)
              .map((row) => (
                <li
                  key={row.id}
                  className="border-hairline bg-panel rounded-xl border px-3 py-2 sm:flex sm:gap-3"
                >
                  <p className="text-ink-soft min-w-0 text-[11px] leading-[1.9] font-black sm:w-40 sm:shrink-0">
                    <Ruby text={row.label} index={index} />
                  </p>
                  <p className="text-coral-deep min-w-0 flex-1 text-sm leading-[1.9] font-bold">
                    ❗ <Ruby text={row.advice} index={index} />
                  </p>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <FixList fixes={fixes} index={index} />
      <GoodAdvice good={good} advice={advice} index={index} />
    </ModalShell>
  );
}

/* ================================================================== *
 * 2) 聞き返しへの こたえ の あと
 * ================================================================== */

export function ProbeScoreModal({
  heard,
  question,
  answer,
  good,
  advice,
  polished,
  fixes,
  nextLabel,
  rest,
  judged,
  index,
  onRetry,
  onClose,
}: {
  /** 中身が 伝わったか（この 1本で 札が 進んだか）。 */
  heard: boolean;
  question: string;
  answer: string;
  good: string;
  /**
   * つぎに 直す こと（AIの ことば）。
   *
   * 日の おわりまで 出さずに 溜めて いた ころ、**直しかたが いちばん 要る
   * 「言い直す」の 直前**に 何も 無かった（2026-09-17 の R5 再検収）。
   */
  advice: string;
  /** こたえを 職場の 日本語に 書き直した もの（無ければ 出さない）。 */
  polished: string;
  fixes: readonly AsakaiFix[];
  /** とじる ボタンの 字（つぎの しつもん／みんなの 報告を 聞く）。 */
  nextLabel: string;
  /** まだ ⭕ に なって いない 札の 名前（無ければ 空）。 */
  rest: string;
  /** AIが 日本語を 見たか。見て いない ときは「いいです」と 言わない（規律1）。 */
  judged: boolean;
  index: FuriganaIndex;
  /**
   * 言い直す（この ポップアップを 閉じて、同じ しつもんに もう いちど 答える）。
   *
   * **その日の さいごの 1枚では 渡さない。** 渡して いた ころ、押すと
   * 司会の 受け止めも メンバーの 報告も 流れない まま 板だけ ⭕ に なり、
   *「きょうの 評価」も「つぎの 日へ 進む」も **成功したように 見える**のに、
   * しおりには 1日も 記録されて いなかった——開き直すと 月曜の 途中に
   * 逆もどりする（2026-09-17 の 通しプレイ検収）。
   * 言い直す ところが もう 無い 画面に、言い直す ボタンを 置かない。
   */
  onRetry?: () => void;
  onClose: () => void;
}) {
  const toFix = advice !== "" || fixes.length > 0;
  return (
    <ModalShell
      label="追加の しつもんへの こたえ"
      title={
        <Ruby text={heard ? "こたえが 伝わりました" : "もう いちど お願いします"} index={index} />
      }
      onClose={onClose}
      closeLabel={nextLabel}
      secondary={onRetry ? { label: "言い直す", onClick: onRetry } : undefined}
      index={index}
      wide
    >
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`rounded-xl border-2 px-3 py-1 text-xs leading-[1.9] font-black ${
            heard
              ? "border-leaf bg-sky-soft text-leaf-deep"
              : "border-coral bg-blossom text-coral-deep"
          }`}
        >
          {heard ? "✅" : "❗"}{" "}
          <Ruby
            text={heard ? "内容: 伝わりました" : "内容: まだ 伝わって いません"}
            index={index}
          />
        </span>
        {/*
          **直す ところが あるかは `advice` も 見る。**
          日本語の 直しかたは `advice` に 書かせる 形に した（`asakai-judge.ts`）ので、
          `fixes` だけを 見て いると、下の「💡 アドバイス」に「文に しましょう」が
          出て いるのに この 札は「✅ そのままで いいです」に なる——同じ 画面が
          反対の ことを 言う（規律1・2026-09-18 の R5 検収）。
        */}
        <span
          className={`rounded-xl border-2 px-3 py-1 text-xs leading-[1.9] font-black ${
            !judged
              ? "border-hairline bg-panel-tint text-ink-soft"
              : toFix
                ? "border-sun-deep bg-cream text-sun-deep"
                : "border-leaf bg-sky-soft text-leaf-deep"
          }`}
        >
          {!judged ? "—" : toFix ? "💬" : "✅"}{" "}
          <Ruby
            text={
              !judged
                ? "日本語: 見て いません"
                : toFix
                  ? "日本語: 直す ところが あります"
                  : "日本語: そのままで いいです"
            }
            index={index}
          />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="border-hairline bg-panel-tint rounded-xl border px-3 py-2">
          <Cap text="ヘンディさんの しつもん" index={index} tone="text-sky-deep" />
          <p className="text-navy mt-0.5 text-sm leading-[1.9] font-black">
            <Ruby text={question} index={index} />
          </p>
        </div>
        <div className="border-hairline bg-panel rounded-xl border px-2 py-2 sm:px-3">
          <Cap text="あなたの こたえ" index={index} />
          <p className="text-navy mt-0.5 text-sm leading-[1.9] font-black">
            {/* 学習者が 打った 字にも ルビを 通す（教材の 辞書で 覆える ぶんだけ 付く）。 */}
            <Ruby text={answer} index={index} />
          </p>
        </div>
      </div>

      <Polish text={polished} index={index} />

      <FixList fixes={fixes} index={index} />
      <GoodAdvice good={good} advice={advice} index={index} />

      {rest !== "" ? (
        <p className="text-ink-soft mt-3 text-[11px] leading-[1.9] font-bold">
          {/*
            **「まだ 聞かれて いない」とは 言わない。** `rest` は ⭕ で ない 札 ぜんぶ
            なので、**いま 聞かれて 答えられなかった 札**も ここに 並ぶ——同じ
            ポップアップの 上で「❗ 内容: まだ 伝わって いません」と 言って いるのに、
            下で「まだ 聞かれて いない」と 呼ぶと、未達成の 表示が 事実と ちがう
            （2026-09-17 の R5 再検収）。
          */}
          ☰ <Ruby text={`まだ 言えて いない ところ: ${rest}`} index={index} />
        </p>
      ) : null}
    </ModalShell>
  );
}

/* ================================================================== *
 * 3) その日の おわり
 * ================================================================== */

export function DayScoreModal({
  dayName,
  kindName,
  at,
  total,
  score,
  rows,
  probes,
  good,
  advice,
  fixes,
  nextLabel,
  hasKey,
  index,
  onRetry,
  onClose,
}: {
  dayName: string;
  /** 「朝礼」「夕礼」（教材で ちがう ので 直書きしない）。 */
  kindName: string;
  /** 何日目か（1始まり）。 */
  at: number;
  /** ぜんぶで 何日か。 */
  total: number;
  score: ScoreView;
  rows: readonly RowView[];
  /** その日 送った ことば ぜんぶ（「あなたの 回答」に 並べる）。 */
  probes: readonly {
    readonly question: string;
    readonly answer: string;
    readonly heard: boolean;
    /** 1本目（しつもん無し）の とき、その 1本で 新しく ⭕ に なった 枚数。 */
    readonly opened?: number;
  }[];
  good: string;
  advice: string;
  fixes: readonly AsakaiFix[];
  /** とじる ボタンの 字（「木曜日へ 進む ▶」「週の けっかを 見る ▶」）。 */
  nextLabel: string;
  hasKey: boolean;
  index: FuriganaIndex;
  /** もう いちど 報告する（その日を はじめから）。 */
  onRetry: () => void;
  onClose: () => void;
}) {
  const shut = rows.filter((row) => row.mark === "missing").length;
  /** 1回に まとめた お手本（教材の 札の 見本を つないだ もの）。 */
  const brushUp = rows
    .map((row) => row.example)
    .filter((one) => one !== "")
    .join("");
  return (
    <ModalShell
      label="今日の 評価"
      title={<Ruby text={`${dayName}の ${kindName} きょうの 評価`} index={index} />}
      onClose={onClose}
      closeLabel={nextLabel}
      secondary={{ label: "もう いちど 報告する", onClick: onRetry }}
      index={index}
      wide
    >
      <ScoreHead
        lead={`${dayName}の 報告`}
        score={score}
        hasKey={hasKey}
        index={index}
        note={
          shut === 0 ? (
            <p className="text-leaf-deep text-sm leading-[1.9] font-black">
              ✅ <Ruby text={`${rows.length}つ ぜんぶ 伝えられました`} index={index} />
            </p>
          ) : (
            <p className="text-coral-deep text-sm leading-[1.9] font-black">
              ❗ <Ruby text={`${shut}つ 言えませんでした`} index={index} />
            </p>
          )
        }
      />

      {score.clarity !== null ? (
        <p className="text-ink-soft mt-1 text-[11px] leading-[1.9] font-bold">
          <Ruby
            text="伝わりやすさと 仕事の 日本語は、AIが さいごに 見た ときの 点です。"
            index={index}
          />
        </p>
      ) : null}

      <MarkRow rows={rows} words={DAY_WORD} index={index} />

      {/*
        **「あなたの 回答」**（2026-09-18 の 指定）。前は「しつもんと こたえの ふりかえり」で、
        **聞き返しへの こたえしか 出て いなかった**——1本目で うまく 言えた 人の
        できた ことが ふりかえりから 消えて いた。いまは その日 送った ことば ぜんぶ。
        1本目は しつもんが 無いので「さいしょの 報告」と 置く。
      */}
      {probes.length > 0 ? (
        <div className="mt-3">
          <Cap text="あなたの 回答" index={index} />
          <ul className="mt-1 space-y-2">
            {probes.map((one, at2) => (
              <li
                key={`${at2}/${one.question}`}
                className="border-hairline bg-panel rounded-xl border px-3 py-2 sm:flex sm:gap-3"
              >
                <p className="text-ink-soft text-[11px] leading-[1.9] font-black sm:w-40 sm:shrink-0">
                  {at2 + 1}.{" "}
                  <Ruby
                    text={one.question !== "" ? one.question : "さいしょの 報告"}
                    index={index}
                  />
                </p>
                <div className="min-w-0 flex-1">
                  <p className="text-navy text-sm leading-[1.9] font-bold">
                    <Ruby text={one.answer} index={index} />
                  </p>
                  {/*
                    **1本目は 枚数で 言う。**「どれか 1つでも 当たれば ✅」で 出して いた ころ、
                    3枚 足りない 報告にも「✅ 内容は 伝わりました」と 出て、同じ 画面の 上の
                    「❗ 3つ 言えませんでした」と 食いちがって いた（2026-09-18 の R5 検収）。
                  */}
                  <p
                    className={`mt-0.5 text-sm leading-[1.9] font-bold ${
                      (one.opened !== undefined ? one.opened > 0 : one.heard)
                        ? "text-leaf-deep"
                        : "text-coral-deep"
                    }`}
                  >
                    {(one.opened !== undefined ? one.opened > 0 : one.heard) ? "✅" : "❗"}{" "}
                    <Ruby
                      text={
                        one.opened !== undefined
                          ? one.opened > 0
                            ? `${one.opened}つ 伝わりました`
                            : "1つも 伝わりませんでした"
                          : one.heard
                            ? "内容は 伝わりました"
                            : "内容が 伝わりませんでした"
                      }
                      index={index}
                    />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        **項目ごとの 正しい 回答**（同じ 指定）。日が 終わった あとの ふりかえりは
        見くらべる 場なので、ここでは お手本を 出す——練習の 途中では 出さない
        （答えを 写して 終わりに なる）。ことばは 教材の 見本 そのまま。
      */}
      {rows.some((row) => row.example !== "") ? (
        <div className="mt-3">
          <Cap text="項目ごとの 正しい 回答" index={index} />
          <ul className="mt-1 space-y-2">
            {rows
              .filter((row) => row.example !== "")
              .map((row) => (
                <li
                  key={`ex/${row.id}`}
                  className="border-hairline bg-panel rounded-xl border px-3 py-2 sm:flex sm:gap-3"
                >
                  <p className="text-ink-soft min-w-0 text-[11px] leading-[1.9] font-black sm:w-40 sm:shrink-0">
                    {MARK_FACE[row.mark].mark} <Ruby text={row.label} index={index} />
                  </p>
                  <p className="text-navy min-w-0 flex-1 text-sm leading-[1.9] font-bold">
                    <Ruby text={row.example} index={index} />
                  </p>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {brushUp !== "" ? (
        <div className="border-sky-deep bg-sky-soft mt-3 rounded-xl border-2 px-3 py-2">
          <Cap
            text="✨ ブラッシュアップ回答（1回に まとめた お手本）"
            index={index}
            tone="text-sky-deep"
          />
          {/*
            **だれの 文かを 書く。** 報告の ポップアップの「ブラッシュアップ」は
            学習者の こたえを 直した ものだが、ここは **教材の お手本**（言って いない
            中身も 入って いる）。同じ 名前で 並ぶので、断らないと
            自分の 文が 直った ものだと 読める（2026-09-18 の R5 検収）。
          */}
          <p className="text-ink-soft mt-0.5 text-[11px] leading-[1.9] font-bold">
            <Ruby text="これは お手本です。あなたの 文では ありません。" index={index} />
          </p>
          <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
            <Ruby text={brushUp} index={index} />
          </p>
        </div>
      ) : null}

      {/*
        **お手本を 見た あとの やり直しは 点に 入らない**（同検収）。
        書いて おかないと、写して 満点に できる 道が 画面から 読めて しまう。
      */}
      {brushUp !== "" ? (
        <p className="text-ink-soft mt-2 text-[11px] leading-[1.9] font-bold">
          ※{" "}
          <Ruby
            text="お手本を 見た あとの やり直しは、練習に なりますが 点は 変わりません。"
            index={index}
          />
        </p>
      ) : null}

      <FixList fixes={fixes} index={index} />
      <GoodAdvice
        /*
         * **手ぶらで 帰さない**（P8・R5-2）。合否は 上で はっきり 言って あるので、
         * ここは **やった ことの 事実**を 置く——鍵が 無い 日は AIの ことばが
         * 1つも 来ない ので、0点の 日の 画面に 肯定の 文が 1つも 無かった
         *（2026-09-18 の R5 検収）。ほめことばでは なく 数える。
         */
        good={
          good !== ""
            ? good
            : probes.length > 0
              ? `きょうは ${probes.length}回 話しました。声に 出した ぶんは 練習に なって います。`
              : ""
        }
        /*
         * **言えなかった 日にも つぎの 一手を 置く**（規律1 後段・R5-2）。
         * AIの ことばは 鍵が ある ときだけ 来る ので、無い ときの 1行を 用意する。
         */
        advice={
          advice !== ""
            ? advice
            : shut > 0
              ? "つぎは 報告メモの やる ことを、上から 1つずつ 声に 出して 言って みましょう。"
              : ""
        }
        index={index}
      />

      <p className="text-ink-soft mt-3 text-[11px] leading-[1.9] font-bold">
        📅 <Ruby text={`${dayName} おわり ${at}日目 / ${total}日`} index={index} />
      </p>
    </ModalShell>
  );
}
