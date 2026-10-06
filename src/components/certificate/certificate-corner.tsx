"use client";

import type { FuriganaIndex } from "@/lib/text/furigana";
import { CertificatePanel } from "./certificate-panel";
import { PreviousCertificate } from "./previous-certificate";
import type { useCertificateIssuer } from "./use-certificate-issuer";

/**
 * 会話の 練習の **始める 前の 画面**に 置く 修了証の 置き場（願い #562 の 第2段）。
 *
 * - 前の 回の 発行に 落ちた・途中で 閉じた → 「もう一度 ためす」
 * - 前に 出した 修了証が ある → 「前に 出した 修了証を ひらく」（画像を 保存し直す）
 */
export function CertificateCorner({
  issuer,
  contentId,
  furigana,
}: {
  issuer: ReturnType<typeof useCertificateIssuer>;
  contentId: string;
  furigana: FuriganaIndex;
}) {
  if (issuer.certificate) {
    return (
      <CertificatePanel
        state={issuer.certificate}
        furigana={furigana}
        show
        onRetry={issuer.retry}
      />
    );
  }
  return <PreviousCertificate contentId={contentId} show onOpen={issuer.open} />;
}
