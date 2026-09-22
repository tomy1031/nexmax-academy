"use client";

import type { ReactNode } from "react";

import { ModalShell } from "@/components/meeting/modal-shell";
import { RubyText } from "@/components/ruby-text";
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
  /**
   * **その 札を 開けた、学習者の ことば**（無ければ 空）。
   *
   * 2026-09-18 の 指定「あなたの答えと正しい回答を並べて表示できますか？」。
   * 前に 持って いた ころは **いつも 空**で、4つ ぜんぶ 言えた 日にも
   *「まだ 報告して いません。」が 並んで いた——照合の 結果から 逆に 引く
   * 手だてが 無かった ため。いまは **その 1本で 進んだ 札**を 控えに 残して
   * ある ので、そこから 本当に 引ける。
   */
  readonly said: string;
  /**
   * その 札の **ブラッシュアップ**（学習者の その ところを 職場の 日本語に 直した もの・AI）。
   *
   * 2026-09-19 の 指定「内容は 合って いて 日本語が おかしい 場合は、正しい 日本語を
   * ブラッシュアップと して 表で 出して」。**札が 開いた（中身が 合った）ときだけ** 入る——
   * AIは 学生の 数の まま 直すので、まちがった 数を 直した 文に 入れると
   * 正しい 数に 見える。無ければ 空。
   */
  readonly polished: string;
  /**
   * 言えて いない 札の **ヒント**（教材の 型文。答えは 入らない・`asakai-hint.ts`）。
   *
   * 2026-09-19 の 指定「数値など 正しく 言えて いない 場合は 答えは 出さず、
   * 『○○画面全体の 進捗は ○%です。』の ように ヒントに する」。無ければ 空。
   */
  readonly hint: string;
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
        {/*
          **「総合」の 字は 出さない**（2026-09-20 の 指定）。数字と 満点だけで 読める。
          鍵が 無い 日は AIの 2つを 見て いないので、何の 点かを「内容」で 断る。
        */}
        {score.total === null ? (
          <>
            <Ruby text="内容" index={index} /> {score.content}
            <span className="text-ink-soft text-base"> / {CONTENT_MAX}</span>
          </>
        ) : (
          <>
            {score.total}
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

/** 空白の ちがいだけの 文は 同じと 見る（「進捗は 45%です」と「進捗は45%です」）。 */
function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/gu, "") === b.replace(/\s+/gu, "");
}

/**
 * **項目ごとの まとめ**（「どのように 伝えられたか」を 表に する）
 *
 * 2026-09-19 の 指定「ブラッシュアップは 項目ごとに まとめて」「表に まとめて」
 *「まだです の ところも 表で 一括で まとめて」。前は 札 4枚・ブラッシュアップ（1本）・
 * やり直す ところ・日本語の 直し が 別々の 箱で、**どの 項目の 話か**を 画面の 中で
 * 行ったり 来たり して 探す ことに なって いた。
 *
 * 1行が 1項目。右の 列は 札の けっかで 中身が 変わる:
 * - **言えた**（中身が 合った）… AIの ブラッシュアップ（直す ところが 無ければ「このままで 通じます」）
 * - **まだです**（言って いない・数が ちがう など）… **答えは 出さず** 教材の 型文を ヒントに する
 *
 * ## 「やり直す ところ」は 表の 中へ（規律10 の 引き継ぎ）
 * 前の 箱は **司会が つぎに 聞く 1つ**を 見せて いた（次の 行動は 1つ・R5）。
 * その 役目は **👉 の 行**が 引き継ぐ——まだの 行の うち 最初の 1つにだけ、司会の
 * 聞き返しを 添える。
 *
 * 作業記録を そのまま 読み上げた ターンは ヒントを 出さない（やる ことは
 *「まとめて もう いちど」の 1つ。上の 赤い 帯が 言う）。
 */
function ItemTable({
  rows,
  words,
  showHints,
  index,
}: {
  rows: readonly RowView[];
  words: Record<RowMark, string>;
  /** ヒントと 👉 を 出すか（作業記録の 読み上げを 差し戻した ターンは 出さない）。 */
  showHints: boolean;
  index: FuriganaIndex;
}) {
  const nextId = showHints
    ? rows.find((row) => row.mark === "missing" && row.advice !== "")?.id
    : undefined;
  return (
    <div className="mt-3">
      <Cap text="どのように 伝えられたか" index={index} />
      <table className="border-hairline mt-1 w-full border-collapse overflow-hidden rounded-xl border bg-white text-left">
        <thead>
          <tr className="bg-panel-tint text-ink-soft text-[10px] leading-[1.9] font-black">
            <th scope="col" className="w-[36%] px-2 py-1 sm:w-[24%]">
              <Ruby text="項目" index={index} />
            </th>
            <th scope="col" className="hidden w-[20%] px-2 py-1 sm:table-cell">
              <Ruby text="けっか" index={index} />
            </th>
            <th scope="col" className="px-2 py-1">
              <Ruby text="ブラッシュアップ ／ ヒント" index={index} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const face = MARK_FACE[row.mark];
            const badge = (
              <span
                className={`inline-flex items-center gap-1 rounded-full border-2 px-1.5 py-0.5 text-[11px] leading-[1.9] font-black whitespace-nowrap ${face.cls}`}
              >
                <span aria-hidden>{face.mark}</span>
                <Ruby text={words[row.mark]} index={index} />
              </span>
            );
            return (
              <tr key={row.id} className="border-hairline border-t align-top">
                <td className="px-2 py-2">
                  <p className="text-ink text-[11px] leading-[1.9] font-black break-words">
                    <Ruby text={row.label} index={index} />
                  </p>
                  {/* スマホでは けっかの 列を 置かず、項目の 下に 出す（318px に 3列は 入らない）。 */}
                  <p className="mt-0.5 sm:hidden">{badge}</p>
                </td>
                <td className="hidden px-2 py-2 sm:table-cell">{badge}</td>
                <td className="px-2 py-2">
                  <BrushCell
                    row={row}
                    showHint={showHints}
                    next={row.id === nextId}
                    index={index}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 表の 右の 列（ブラッシュアップ か ヒント）。
 *
 * **あなたの 発言と ブラッシュアップは 枠で 分け、ブラッシュアップを 目立たせる**
 *（2026-09-20 の 指定）。前は 同じ 段に 小さく 並べて いたので、どちらが
 * 直した 文かが ひと目で 分からなかった。
 */
function BrushCell({
  row,
  showHint,
  next,
  index,
}: {
  row: RowView;
  showHint: boolean;
  next: boolean;
  index: FuriganaIndex;
}) {
  const yours =
    row.said !== "" ? (
      <div className="border-hairline bg-panel-tint rounded-lg border px-2 py-1">
        <Cap text="あなたの 発言" index={index} />
        <p className="text-ink mt-0.5 text-[13px] leading-[1.9] font-bold">
          <Ruby text={row.said} index={index} />
        </p>
      </div>
    ) : null;
  /** 目立つ 枠（ブラッシュアップ・ヒント）。 */
  const box = (tone: { border: string; face: string; cap: string }, cap: string, text: string) => (
    <div className={`mt-1 rounded-lg border-2 px-2 py-1.5 ${tone.border} ${tone.face}`}>
      <Cap text={cap} index={index} tone={tone.cap} />
      <p className="text-navy mt-0.5 text-sm leading-[1.9] font-black">
        <Ruby text={text} index={index} />
      </p>
    </div>
  );
  const BRUSH = { border: "border-sky-deep", face: "bg-sky-soft", cap: "text-sky-deep" };
  const HINT = { border: "border-sun-deep", face: "bg-cream", cap: "text-sun-deep" };
  if (row.mark !== "missing") {
    if (row.polished === "") {
      /* AIが 見て いない（鍵が 無い・届かなかった）。見て いない ものに「いいです」と 言わない。 */
      return (
        <>
          {yours}
          <p className="text-ink-faint text-sm font-black">—</p>
        </>
      );
    }
    if (row.said !== "" && sameText(row.polished, row.said)) {
      return (
        <>
          {yours}
          <p className="text-leaf-deep mt-1 text-[11px] leading-[1.9] font-black">
            ✅ <Ruby text="このままで 通じます" index={index} />
          </p>
        </>
      );
    }
    return (
      <>
        {yours}
        {box(BRUSH, "✨ ブラッシュアップ", row.polished)}
      </>
    );
  }
  if (!showHint || row.hint === "") {
    return (
      <>
        {yours}
        <p className="text-ink-faint text-sm font-black">—</p>
      </>
    );
  }
  return (
    <>
      {yours}
      {box(HINT, "💡 ヒント（この 形で 言って みましょう）", row.hint)}
      {next ? (
        <p className="text-coral-deep mt-1 text-[11px] leading-[1.9] font-black">
          {/* **短く 1行**（2026-09-20 の 指定）。何を 聞かれるかは 司会が 声で 言う。 */}
          👉 <Ruby text="つぎに 聞かれます" index={index} />
        </p>
      ) : null}
    </>
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

/* ================================================================== *
 * 1) 報告の あと（まだ その日は 終わって いない）
 * ================================================================== */

export function ReportScoreModal({
  score,
  rows,
  good,
  advice,
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

      {/* 言った ことは **1回だけ** まるごと 出す（表の 中は 項目ごとの ところだけ）。 */}
      <div className="border-hairline bg-panel mt-3 rounded-xl border px-3 py-2">
        <Cap text="あなたの 報告" index={index} />
        <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
          <Ruby text={utterance} index={index} />
        </p>
      </div>

      <ItemTable rows={rows} words={FIRST_WORD} showHints={!readLog} index={index} />

      <GoodAdvice good={good} advice={advice} index={index} />
    </ModalShell>
  );
}

/* ================================================================== *
 * 2) 聞き返しへの こたえ の あと
 * ================================================================== */

/**
 * 聞き返しへの こたえの あと — **「いまの 報告」と 同じ 骨**
 *
 * 2026-09-20 の 指定「質問の ときの 判定モーダルを 今の 報告で 統一に して。
 * こちらに 新しく 追加された ものを 増やして いく 形で。点数も 増える ごとに 積み上げ」。
 * 点（積み上げ）→ 伝わったかの 札 → しつもんと こたえ → **項目ごとの 表**の 順で、
 * 報告の あとの ポップアップと 同じ ものが 同じ 場所に 出る。
 * 表は 毎回 その 日の ぜんぶの 項目を 出す ので、こたえる たびに ⭕ が 増えて いく。
 */
export function ProbeScoreModal({
  heard,
  question,
  answer,
  good,
  advice,
  score,
  rows,
  hasKey,
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
  /** ここまでの 点（内容は 開いた 札の 数なので、こたえる たびに 増える）。 */
  score: ScoreView;
  /** その日の 札 ぜんぶ（報告の あとの ポップアップと 同じ 表を 出す）。 */
  rows: readonly RowView[];
  hasKey: boolean;
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
  const toFix =
    advice !== "" || rows.some((row) => row.polished !== "" && row.said !== row.polished);
  const left = rows.filter((row) => row.mark === "missing").length;
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
      <ScoreHead
        lead="ここまでの 報告"
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

      {/*
        **報告の あとと 同じ 表**（2026-09-20 の 指定）。ブラッシュアップも ヒントも
        この 中に 出る ので、別の 箱を 並べない——同じ ものが 2か所に 出ない。
      */}
      <ItemTable rows={rows} words={FIRST_WORD} showHints index={index} />

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
          <Cap text="項目ごとに 見くらべる" index={index} />
          <ul className="mt-1 space-y-2">
            {rows
              .filter((row) => row.example !== "")
              .map((row) => (
                <li
                  key={`ex/${row.id}`}
                  className="border-hairline bg-panel rounded-xl border px-3 py-2"
                >
                  <p className="text-ink-soft text-[11px] leading-[1.9] font-black">
                    {MARK_FACE[row.mark].mark} <Ruby text={row.label} index={index} />
                  </p>
                  {/*
                    **自分の ことばと お手本を 横に 並べる**（2026-09-18 の 指定）。
                    別々の 欄に 置いて いた ころは、どこが ちがうのかを
                    画面の 中で 行ったり 来たり して さがす ことに なって いた。
                  */}
                  <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div
                      className={`rounded-xl border px-3 py-2 ${
                        row.said !== ""
                          ? "border-hairline bg-panel-tint"
                          : "border-coral bg-blossom"
                      }`}
                    >
                      <Cap text="あなたの 答え" index={index} />
                      <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
                        {row.said !== "" ? (
                          <Ruby text={row.said} index={index} />
                        ) : (
                          <span className="text-coral-deep">
                            <Ruby text="言えませんでした" index={index} />
                          </span>
                        )}
                      </p>
                      {/*
                        **ブラッシュアップは 項目ごと**（2026-09-19 の 指定）。前は 1日ぶんを
                        1本に まとめた 文が 表の 上に あり、どの 項目の 直しかが 読めなかった。
                        1本で ぜんぶ 言えた 日は この ポップアップしか 出ない ので、ここに 置く。
                      */}
                      {row.polished !== "" && !sameText(row.polished, row.said) ? (
                        <p className="text-sky-deep mt-1 text-sm leading-[1.9] font-bold">
                          ✨ <Ruby text={`ブラッシュアップ: ${row.polished}`} index={index} />
                        </p>
                      ) : null}
                    </div>
                    <div className="border-leaf bg-sky-soft rounded-xl border px-3 py-2">
                      <Cap text="正しい 回答" index={index} tone="text-leaf-deep" />
                      <p className="text-navy mt-0.5 text-sm leading-[1.9] font-bold">
                        <Ruby text={row.example} index={index} />
                      </p>
                    </div>
                  </div>
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
