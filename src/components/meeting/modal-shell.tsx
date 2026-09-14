"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

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
 */
export function ModalShell({
  label,
  title,
  onClose,
  closeLabel = "とじる",
  children,
}: {
  /** 読み上げ用の 名前（`aria-label`）。 */
  label: string;
  /** 見出し。文字列でも 部品でも よい（ふりがなを 付けたい ことが ある）。 */
  title?: ReactNode;
  onClose: () => void;
  /** とじる ボタンの 字。 */
  closeLabel?: string;
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
        className="card-island max-h-[88vh] w-full max-w-md overflow-y-auto p-5 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        {title ? <p className="text-navy text-center text-lg font-black">{title}</p> : null}
        {children}
        <button
          type="button"
          onClick={onClose}
          className="btn-island btn-game mt-5 w-full px-6 py-3 text-base"
        >
          {closeLabel}
        </button>
      </motion.div>
    </div>
  );
}
