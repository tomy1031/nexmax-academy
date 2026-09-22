"use client";

import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * こたえの チェックの 見た目（初級・上級で 同じに する ところだけ）
 *
 * 画面は 初級（メール）と 上級（Slack）で 分けて あるが、**⭕✗の しるし・
 * ひとこと・ブラッシュアップの 箱**は どちらでも 同じ 顔で 出す——
 * 同じ 意味の ものが 2つの 顔を 持つと、学習者は 別の ことだと 読む。
 *
 * しるしは **記号・ことば・色の 3つ**で 示す（色だけに たよらない）。
 */

/** 画面じたいの 文言の 読み辞書（教材の 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["直", "なお"],
  ["文", "ぶん"],
  ["回答", "かいとう"],
  ["次", "つぎ"],
  ["進", "すす"],
  ["手本", "てほん"],
  ["模範解答", "もはんかいとう"],
  ["言い方", "いいかた"],
]);

export const OK_COLOR = "#58c273";
export const NG_COLOR = "#f26fa7";

/** 欄の となりに 出す ⭕✗ の しるし。 */
export function CheckMark({ ok }: { ok: boolean }) {
  return (
    <span
      /* 文字色は クラスで（ふりがなも いっしょに 白に する・下の 覚え書き） */
      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-black text-white"
      style={{ background: ok ? OK_COLOR : NG_COLOR }}
    >
      {ok ? "⭕ OK" : "✗ なおす"}
    </span>
  );
}

/**
 * 欄の 下に 出す ひとこと（⭕なら よかった ところ・✗なら 足りない ところ）。
 *
 * **✗の ときは 何か 言う**（2026-09-21 の 指定「何がだめなのか 書いて」）。
 * AIに つながらなかった 回は ひとことが 空に なる——その まま 黙ると、
 * 学習者は ✗だけ 見せられて **直す 手がかりが 1つも 無い まま 関門の 前に 立つ**。
 * だから 呼ぶ 側が 逃げ道の 1行（`fallback`）を 渡す。
 */
export function CheckNote({
  ok,
  note,
  fallback = "",
  furigana,
}: {
  ok: boolean;
  note: string;
  /** ひとことが 空の ときに ✗の 欄だけ 出す 1行。 */
  fallback?: string;
  furigana: FuriganaIndex;
}) {
  const text = note !== "" ? note : ok ? "" : fallback;
  if (text === "") return null;
  return (
    <p
      className="mt-1 rounded-xl px-3 py-1.5 text-sm leading-relaxed font-bold"
      style={
        ok
          ? { background: "#e9f8ee", color: "#1f3a56" }
          : { background: "#fdeaf2", color: "#1f3a56" }
      }
    >
      {ok ? "⭕ " : "✗ "}
      <RubyText text={text} index={furigana} />
    </p>
  );
}

/**
 * ブラッシュアップ回答。
 *
 * **中身は 合って いるのに 言い方が よくない ときだけ** 出る（2026-09-21 の 指定）。
 * だから 見出しにも その ことを 書く——「まちがい」では ないと 分かる ように。
 */
export function BrushUp({ text, furigana }: { text: string; furigana: FuriganaIndex }) {
  if (text === "") return null;
  return (
    <div className="mt-3 rounded-2xl border-2 border-[#7c6cf0] bg-white px-3 py-2.5">
      <p className="text-[11px] font-black text-[#5f4fd6]">
        <RubyText
          text="✨ ブラッシュアップ回答（あなたの 文を もっと よい 言い方に）"
          index={UI_FURIGANA}
        />
      </p>
      <p className="text-ink mt-1 text-sm leading-relaxed font-bold whitespace-pre-line">
        <RubyText text={text} index={furigana} />
      </p>
    </div>
  );
}

/**
 * お手本（模範解答）。**答え合わせの ときだけ 出す**（2026-09-21 の 指定
 * 「模範解答は答え合わせの時だけでいいです。上級編も模範解答を表示するようにしてください」）。
 *
 * 書いて いる 途中に 出すと、考えずに 写せる。写した ものを AIが ⭕に すると、
 * 関門は 開くのに 学習は 何も 起きて いない。だから 出す 場所は 1つだけ。
 *
 * 「あなたの 文では ない」と 明記する——並べて 置くと、自分が 書いた ものと
 * 混ざって 記憶に 残る（朝礼の 点数画面で 同じ ことを して いる）。
 */
export function ModelAnswer({ text, furigana }: { text: string; furigana: FuriganaIndex }) {
  if (text === "") return null;
  return (
    <div className="mt-3 rounded-2xl border-2 border-[#4fa8e8] bg-white px-3 py-2.5">
      <p className="text-[11px] font-black text-[#2a7ab5]">
        <RubyText text="📝 お手本（模範解答）" index={UI_FURIGANA} />
      </p>
      <p className="text-ink mt-1 text-sm leading-relaxed font-bold whitespace-pre-line">
        <RubyText text={text} index={furigana} />
      </p>
      <p className="text-ink-soft mt-1.5 text-[11px] font-bold">
        <RubyText text="これは お手本です。あなたの 文では ありません。" index={UI_FURIGANA} />
      </p>
    </div>
  );
}

/**
 * その 問いの まとめの 帯。**はっきり 言う**（規律1）: OKか、いくつ 直すか。
 * OKの ときだけ「つぎへ すすめます」と 言う——進める 条件を 画面の ことばで 見せる。
 */
export function CheckBand({
  ok,
  left,
  aiNote,
  furigana,
}: {
  ok: boolean;
  /** 直す ところの 数（OKの ときは 0）。 */
  left: number;
  /** AIに つながらなかった ときの 一言（空なら つながった）。 */
  aiNote: string;
  furigana: FuriganaIndex;
}) {
  return (
    <div
      role="status"
      className="mt-3 rounded-2xl border-2 bg-white px-3 py-2.5"
      style={{ borderColor: ok ? OK_COLOR : NG_COLOR }}
    >
      <p className="text-ink text-sm font-black">
        {ok ? (
          <RubyText text="⭕ OKです。次の もんだいに 進めます" index={UI_FURIGANA} />
        ) : (
          <RubyText
            text={`✗ なおす ところが ${left}こ あります。直して もう いちど チェック`}
            index={UI_FURIGANA}
          />
        )}
      </p>
      {aiNote !== "" && (
        <p className="text-ink-soft mt-1 text-xs leading-relaxed font-bold">
          <RubyText text={aiNote} index={furigana} />
        </p>
      )}
    </div>
  );
}

/** チェックの ボタン（初級・上級で 同じ ことば）。 */
export function CheckButton({
  onClick,
  disabled,
  asking,
}: {
  onClick: () => void;
  disabled: boolean;
  asking: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || asking}
      className="btn-island btn-game mt-3 w-full px-6 py-2.5 text-sm disabled:opacity-50"
      style={{ "--btn-face": "#7c6cf0", "--btn-shadow": "#5f4fd6" } as React.CSSProperties}
    >
      <RubyText text={asking ? "チェックして います…" : "こたえの チェック"} index={UI_FURIGANA} />
    </button>
  );
}
