"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";

/**
 * ポップアップの 殻 — **ミーティングと 朝礼で 同じ もの**を 使う
 *
 * ## なぜ 1つに まとめたか
 * 同じ 骨（暗い 幕 ＋ 白い 島 ＋ とじる ボタン）が **3か所に 写し**で 置かれて いた
 *（ヒント・報告の 見かた・じぶんの 担当）。写しで 置くと、片方だけ 直る——
 * 実際に「幕を 押したら 閉じる」は ヒントに しか 無く、「Escape で 閉じる」は
 * 報告の 見かたに しか 無かった。**どちらも ぜんぶの ポップアップに 要る**。
 *
 * 中身（見出しの 下）は 呼ぶ側が 決める。殻が 決めるのは
 * **どこを 押せば 閉じるか**と **画面に どう 収まるか**だけ。
 *
 * ## 収まりかた
 * 高さは 画面の 88%まで。超えたら 中で 縦に すべる（小さい 端末で 上下が
 * 切れて、とじる ボタンに 手が 届かなく なる のを 防ぐ）。
 *
 * 幅は ふだん `max-w-md`。中身が 表や 何段もの 箱に なる ものは `wide` を 渡して
 * `max-w-2xl` に する——PC で `max-w-md` の ままだと **細長い 短冊**に なり、
 * 10行の 表が 1行ずつ 折り返して 縦に 伸びる（2026-09-16 の 指定
 *「PC版で 報告メモが 細長すぎる ので、もう少し 横幅を 持たせて。縦スクロールも OK」）。
 *
 * ## とじる ボタンの ふりがな
 * `closeLabel` は **殻が ふりがなを 合成する**（`index` を 渡した ときだけ）。
 * 呼ぶ側が `<RubyText>` を 作って 渡す 形に すると、読み上げの 名前に ふりがなが
 * 混ざって しまう ので、字は 文字列の まま 受けとり、`aria-label` に そのまま 使う。
 *
 * 既定の「とじる」には 漢字が 無いので これまで 気づかなかったが、朝礼・夕礼の
 * 報告の 見かたは「みんなの 報告を 聞く ▶」を 渡して いて、**報告が 通るたびに
 * 毎回 裸の 漢字**が 出て いた（2026-09-15 の 通しプレイ検収。既存の e2e は
 * モーダルを **閉じた あと**に 裸漢字を 数えて いた ので すり抜けて いた）。
 */
export function ModalShell({
  label,
  title,
  onClose,
  closeLabel = "とじる",
  index,
  wide = false,
  children,
}: {
  /** 読み上げ用の 名前（`aria-label`）。 */
  label: string;
  /** 見出し。文字列でも 部品でも よい（ふりがなを 付けたい ことが ある）。 */
  title?: ReactNode;
  onClose: () => void;
  /** とじる ボタンの 字。 */
  closeLabel?: string;
  /** 読み辞書。渡すと とじる ボタンに ふりがなを 合成する。 */
  index?: FuriganaIndex;
  /** 中身が 表や 何段もの 箱の ときに 広げる（`max-w-md` → `max-w-2xl`）。 */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(15,34,51,0.55)" }}
      /* 幕を 押しても、Escape でも 閉じる（どちらか 片方だけ、を くり返さない）。 */
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      {/*
        指は **島そのもの**に 置く（とじる ボタンでは なく）。
        ボタンに `autoFocus` を 置いて いた ころ、中身が 長い ポップアップは
        **開いた 瞬間に いちばん 下へ スクロール**して いた——夕礼の
        「じぶんの 担当」は 作業記録が 14行 ある ので、担当と 進捗率の 付せんが
        画面の 外に 出た まま 開いて いた（2026-09-14 に 390px で 実確認）。
        島に 置けば 指は ポップアップの 中に 入り、見える のは 頭から。
      */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        tabIndex={-1}
        autoFocus
        className={`card-island max-h-[88vh] w-full overflow-y-auto p-5 outline-none ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? <p className="text-navy text-center text-lg font-black">{title}</p> : null}
        {children}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="btn-island btn-game mt-5 w-full px-6 py-3 text-base"
        >
          {index ? <RubyText text={closeLabel} index={index} show /> : closeLabel}
        </button>
      </motion.div>
    </div>
  );
}
