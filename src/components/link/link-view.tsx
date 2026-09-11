"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LinkContent } from "@/content/schema";
import { NexMax } from "@/components/nexmax";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import {
  readContentProgress,
  recordContentProgress,
  subscribeProgress,
} from "@/lib/progress/store";
import { parseLinkAnswers, saveLinkAnswers } from "@/lib/answers/link-answers-db";
import { readLinkMessage } from "@/lib/answers/link-message";

/**
 * リンク教材 — 1枚で完結する練習ページを、ステージの中から 全画面で 開く
 *
 * ## なぜ「開く」を1回はさむのか
 * 開いた瞬間に 画面を 覆わない。全画面を いきなり 出すと、学習者は
 * 「どこに 来たのか」「どう 戻るのか」が 分からないまま 知らない画面に 立たされる。
 * だから まず **何をする ところか**（見出し・ひとこと）を 出し、
 * 自分で「ひらく」を 押してから 中へ 入る。戻り方も その画面に 置く。
 *
 * ブラウザの 本物の全画面（`requestFullscreen`）は **人が 押した ときにしか
 * 呼べない**ので、この1回の タップが そのまま 全画面の きっかけにもなる。
 *
 * ## 全画面は2段構え（スライドと同じ考え方）
 * iPhone の Safari では `requestFullscreen()` が 要素に 効かない。それだけに
 * 頼ると 半分の 学習者が 全画面に できないので、
 *   ① 自前で 画面いっぱいに 広げる（どの端末でも 効く）
 *   ② そのうえで 本物の全画面も 頼む（効く端末では ブラウザの枠まで 消える）
 * の順に 重ねる。②が 断られても ①が 残る。
 *
 * ## おわりの しるし
 * 中で 何が 起きたかは アプリからは 見えない。だから
 *   - 学習者が 押す「おわりました」ボタン
 *   - 中のページからの 合図（`postMessage` — 同じ置き場のページだけ）
 * の2つで 記録する。関門ではない（schema.ts の linkSchema）ので、
 * 記録が 無くても 先へは 進める。
 */

/*
 * 中のページから 届く 合図（「おわった」「おわりの しるしは こちらで 出す」
 * 「学習者の 書いた もの」）の 読み取りは `@/lib/answers/link-message` に 置いて ある。
 * 画面の 効果の 中では テストから 通しにくい のに、**関門の 鍵と 学習者の こたえ**を
 * 運ぶ 道で 取りちがえの 害が いちばん 大きい ため。
 */

/** 画面じたいの 文言の 読み辞書（教材データの 辞書は UIの 文言まで 覆わない・規律2）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["中", "なか"],
  ["出", "だ"],
]);

export function LinkView({ link, embedded }: { link: LinkContent; embedded?: boolean }) {
  const furigana = useMemo(() => buildFuriganaIndex(link.furigana ?? []), [link.furigana]);
  const [furiganaOn, setFuriganaOn] = useState(true);

  /** 埋め込みを 開いているか。`inline` は 最初から 開いた状態で 置く。 */
  const [open, setOpen] = useState(link.view === "inline");
  /** 画面いっぱいに 広げているか。 */
  const [wide, setWide] = useState(false);

  const shellRef = useRef<HTMLDivElement | null>(null);

  /*
   * おわった かどうかは 保存層から 読む（画面に 別の 控えを 置かない）。
   * サーバでは いつも false を 返し、ブラウザに 着いてから 本当の値に なる
   *——ここを 自前の state で 持つと、保存層と 画面の 2か所に 同じ事実が 生まれる。
   */
  const done = useSyncExternalStore(
    subscribeProgress,
    () => readContentProgress(link.id)?.status === "completed",
    () => false,
  );

  const markDone = useCallback(() => {
    recordContentProgress(link.id, { status: "completed" });
  }, [link.id]);

  /** 中のページが おわりの しるしを 自分で 出すと 名乗ったか（`OWNS_DONE_MESSAGE`）。 */
  const [ownsDone, setOwnsDone] = useState(false);

  /*
   * 中のページからの 合図。**同じ置き場（origin）から 来たものだけ** 受ける。
   * 外のサイトを 埋めている 場合、その中身は こちらの 管理外なので、
   * 差出人を 見ないと 誰でも「おわった」に できてしまう。
   */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // 差出人は ここで 見る（**同じ 置き場から 来た ものだけ**）
      if (event.origin !== window.location.origin) return;
      const message = readLinkMessage(event.data, link.id);
      if (!message) return;
      if (message.kind === "owns-done") {
        setOwnsDone(true);
        return;
      }
      if (message.kind === "answers") {
        /*
         * 記録は **送りっぱなし**。`saveLinkAnswers` は 自分で 例外を 握るが、
         * ここでも 受けて おく——`void` で 捨てた 約束が 落ちると、
         * 画面にも コンソールにも 何も 出ない まま こたえが 消える。
         */
        void saveLinkAnswers({
          linkId: link.id,
          answers: parseLinkAnswers(message.answers),
        }).catch(() => {
          /* 記録できなくても 学習は 止めない */
        });
        return;
      }
      markDone();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [link.id, markDone]);

  const expand = useCallback(() => {
    setOpen(true);
    setWide(true);
    // 本物の全画面も 頼む。断られても（iPhone など）自前の 広げ表示が 残る
    void shellRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const collapse = useCallback(() => {
    setWide(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  /**
   * 開いたことを「とちゅう」として 記録する。
   * `recordContentProgress` は **completed を started で 上書きしない**ので、
   * 一度 おえた 教材を 見直しても ✅ は 消えない（progress/store.ts）。
   */
  const openInline = useCallback(() => {
    setOpen(true);
    recordContentProgress(link.id, { status: "started" });
  }, [link.id]);

  const start = useCallback(() => {
    openInline();
    if (link.view === "fullscreen") expand();
  }, [expand, link.view, openInline]);

  // ブラウザの全画面を Esc で 抜けたときに、自前の 広げ表示だけ 残さない
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setWide(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 広げているあいだは 後ろのページを 動かさない
  useEffect(() => {
    if (!wide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [wide]);

  // 全画面APIが 効かない端末のために、Esc でも もどす
  useEffect(() => {
    if (!wide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, collapse]);

  /** 別のタブで 開く（埋め込みを 断るサイト・自分で 開きたい人のため）。 */
  const openTab = useCallback(() => {
    recordContentProgress(link.id, { status: "started" });
    window.open(link.url, "_blank", "noopener,noreferrer");
  }, [link.id, link.url]);

  const embed = open ? (
    <div
      ref={shellRef}
      className={
        wide
          ? "fixed inset-0 z-50 flex flex-col gap-2 bg-[#0b2138] p-2"
          : "mt-3 flex flex-col gap-2"
      }
    >
      <div
        className={`relative w-full overflow-hidden rounded-2xl bg-white ${
          wide ? "min-h-0 flex-1" : ""
        }`}
        style={wide ? undefined : { height: `${link.height}px` }}
      >
        <iframe
          src={link.url}
          title={link.title}
          className="h-full w-full border-0"
          /*
           * 中で 動くのは 自分たちの 練習ページか、先生が 選んだ ページ。
           * 書き込みや ダウンロード（修了証の 絵）は 使うので許すが、
           * **このページを 乗っ取る系**（top-navigation・popups）は 渡さない。
           * allow-downloads が 無いと、中で 作った 修了証が **黙って 落ちない**
           *（ブラウザは 理由を 出さない）。
           */
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
          allow="fullscreen; clipboard-write"
        />
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-2 ${
          wide ? "shrink-0 px-1" : ""
        }`}
      >
        <button
          type="button"
          onClick={wide ? collapse : expand}
          className={`rounded-full border-2 px-4 py-1.5 text-xs font-black ${
            wide
              ? "border-white/40 bg-white/95 text-[#0b2138]"
              : "border-hairline text-navy bg-white"
          }`}
        >
          {wide ? "✕ もどす" : "⛶ 大きく する"}
        </button>
        {ownsDone && !done ? (
          /*
            中で「出す」と ✅ に なる ページ。手で 押す ボタンは 出さない
            ——押すだけで 関門が 開いては、出す ことに 意味が 無くなる。
          */
          <span
            className={`rounded-full px-4 py-1.5 text-xs font-black ${
              wide ? "bg-white/90 text-[#0b2138]" : "bg-sky-soft text-navy"
            }`}
          >
            <RubyText text="中で 出すと ✅ に なります" index={UI_FURIGANA} />
          </span>
        ) : (
          <button
            type="button"
            onClick={markDone}
            className={
              done
                ? `rounded-full px-4 py-1.5 text-xs font-black ${
                    wide ? "bg-white/90 text-[#0b2138]" : "bg-sky-soft text-navy"
                  }`
                : "btn-game px-5 py-1.5 text-xs [--btn-face:#58c273] [--btn-shadow:#3aa458]"
            }
          >
            {done ? "✅ おわりました" : "おわりました"}
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6"}>
      <section className="card-island p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <NexMax variant="guide" size={72} bob />
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-2xl font-extrabold break-words sm:text-3xl">
              <RubyText text={link.title} index={furigana} show={furiganaOn} />
            </h1>
            <p className="text-ink-soft mt-1 font-bold break-words">
              <RubyText text={link.description} index={furigana} show={furiganaOn} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFuriganaOn((on) => !on)}
            aria-pressed={furiganaOn}
            className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${
              furiganaOn ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
            }`}
          >
            ふりがな {furiganaOn ? "ON" : "OFF"}
          </button>
        </div>

        {link.note ? (
          <p className="bg-panel-tint text-ink mt-4 rounded-2xl px-4 py-3 leading-relaxed font-bold">
            <RubyText text={link.note} index={furigana} show={furiganaOn} />
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {link.newTab ? (
            <button
              type="button"
              onClick={openTab}
              className="btn-game px-6 py-3 [--btn-face:#0288d1] [--btn-shadow:#0272ae]"
            >
              ▶ べつの タブで ひらく
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="btn-game px-6 py-3 [--btn-face:#0288d1] [--btn-shadow:#0272ae]"
            >
              {open ? "⛶ もういちど 大きく する" : "▶ ひらく"}
            </button>
          )}

          {/*
            埋め込みの 中で 動かない ことがある（外のサイトが 断る・ブラウザの設定）。
            そのときの 逃げ道を 最初から 見せておく——白い枠を 見た学習者が
            そこで 止まらないように。
          */}
          {link.newTab ? null : (
            <button
              type="button"
              onClick={openTab}
              className="text-sky text-sm font-black underline underline-offset-4"
            >
              べつの タブで ひらく ↗
            </button>
          )}

          {done ? (
            <span className="text-leaf-deep ml-auto text-sm font-black">✅ おわりました</span>
          ) : null}
        </div>
      </section>

      {embed}
    </div>
  );
}
