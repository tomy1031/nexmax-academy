"use client";

import { useSyncExternalStore } from "react";
import { RubyText } from "@/components/ruby-text";
import { currentOwner } from "@/lib/certificate/certificate-db";
import type { IssuedCertificate } from "@/lib/certificate/model";
import { readIssued } from "@/lib/certificate/run";
import { CERTIFICATE_UI_FURIGANA } from "./ui-furigana";

/** 端末の 控えは この 画面の あいだ 変わらない（読むのは 最初の 描画の あとだけ）。 */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * 前に 出した 修了証を ひらく（画像を 保存し直す ため）。端末の 控えを 読むので、
 * サーバと 最初の 描画では 出さない。**持ち主を 突き合わせて から** 出す
 *（共有 PC で 前の 人の 名前・番号を 見せない）。
 *
 * タイピング（第1段）から 切り出して、どの 教材でも 同じ ものを 使う。
 */
export function PreviousCertificate({
  contentId,
  onOpen,
  show,
  label = "前に 出した 修了証を ひらく",
}: {
  /** 控えの 鍵（ふだんは 教材の id）。 */
  contentId: string;
  onOpen: (cert: IssuedCertificate) => void;
  show: boolean;
  /** ボタンの 文（1つの 教材で 2種類 出す ときに 分ける）。 */
  label?: string;
}) {
  const stored = useSyncExternalStore(
    subscribeNever,
    () => (readIssued(contentId) ? "yes" : "no"),
    () => "no",
  );
  if (stored !== "yes") return null;
  return (
    <p className="text-center">
      <button
        type="button"
        onClick={() => {
          const cert = readIssued(contentId);
          if (!cert) return;
          void currentOwner().then((owner) => {
            if ((cert.owner ?? "") === (owner ?? "")) onOpen(cert);
          });
        }}
        className="border-hairline text-navy bg-panel rounded-2xl border px-4 py-2 text-sm font-extrabold"
      >
        🎓 <RubyText text={label} index={CERTIFICATE_UI_FURIGANA} show={show} />
      </button>
    </p>
  );
}
