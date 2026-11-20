"use client";

/**
 * ツール教材（link）の 修了証（2026-11-20・相談の 練習問題）
 *
 * tomy さんの 指定「レベル4までで修了証を作成できるようにして、レベル5をもっと特別に」→ 選択
 *「アプリの修了証」「レベル5の特別な修了証」「すでに終えた学生には1回だけ出す」。
 *
 * - 中の ページは 成績の 数だけを 送る（`nexmax:link-certificate`）。題と 種類は ここで 持つ
 *   （ページから 受け取らない）
 * - 受けるのは **自分が 埋めた iframe から 来た もの だけ**（origin と `event.source` の 両方）
 * - 2種類（レベル1〜4・特別課題）を **別々の 手順**で 出す。DB の content_id は どちらも 教材の id
 *   （先生の 記録で 同じ 教材の 欄に 並ぶ）。端末の 控えの 鍵だけ 分ける
 * - 同じ 種類は 1人 1枚。DB に もう あれば 出さない（確かめられない ときも 出さない——2枚目を 作らない）
 * - 出した（または もう あった）ら ページに 知らせる（`nexmax:link-certificate-ack`）。ページは
 *   それを 見て、次から 頼まない
 */
import { useEffect, useRef, type RefObject } from "react";
import { useCertificateIssuer } from "@/components/certificate/use-certificate-issuer";
import {
  CERTIFICATE_ACK_MESSAGE,
  readLinkCertificateMessage,
  type LinkCertificateRequest,
} from "@/lib/answers/link-message";
import { hasIssuedLinkCertificate } from "@/lib/certificate/certificate-db";
import { linkCertificateResult } from "@/lib/certificate/model";

export interface LinkCertificateSpec {
  /** レベル1〜4 の 修了証の 題。 */
  readonly main: string;
  /** 特別課題の 修了証の 題。 */
  readonly special: string;
  /** 題の 読み（修了証の カードの ルビ）。 */
  readonly furigana: readonly (readonly [string, string])[];
  /** 埋め込みの 下の 文（✅ が 付く とき）。 */
  readonly doneHint: string;
}

/** 修了証を 出す ツール教材（いまは 相談の 練習問題だけ）。 */
export const CERTIFICATE_LINKS: Readonly<Record<string, LinkCertificateSpec>> = {
  soudan_renshu: {
    main: "相談の 練習問題（レベル1〜4）",
    special: "相談の 練習問題 特別課題（レベル5）",
    furigana: [
      ["相談", "そうだん"],
      ["練習問題", "れんしゅうもんだい"],
      ["特別課題", "とくべつかだい"],
    ],
    doneHint: "上の ページで レベル4まで やると ✅ に なります",
  },
};

/** 特別課題の 控えの 鍵（端末）。 */
export function specialCertificateKey(linkId: string): string {
  return `${linkId}:special`;
}

export function useLinkCertificates(linkId: string, frameRef: RefObject<HTMLIFrameElement | null>) {
  const spec = CERTIFICATE_LINKS[linkId] ?? null;
  const main = useCertificateIssuer(linkId);
  const special = useCertificateIssuer(specialCertificateKey(linkId));
  /** この 画面で もう 受けた 種類（確かめて いる 最中に 2つ目を 受けない）。 */
  const handledRef = useRef<{ main: boolean; special: boolean }>({ main: false, special: false });

  const beginMain = main.begin;
  const finishMain = main.finish;
  const beginSpecial = special.begin;
  const finishSpecial = special.finish;

  useEffect(() => {
    if (!spec) return;
    const ack = (target: Window | null, tier: LinkCertificateRequest["tier"]) => {
      try {
        target?.postMessage(
          { type: CERTIFICATE_ACK_MESSAGE, id: linkId, tier },
          window.location.origin,
        );
      } catch {
        /* 知らせられなくても 次に 開いた ときに また 頼まれる（DB で 2枚目は 防ぐ） */
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const request = readLinkCertificateMessage(event.data, linkId);
      if (!request) return;
      const tier = request.tier;
      if (handledRef.current[tier]) return;
      handledRef.current[tier] = true;
      const target = event.source as Window | null;
      void hasIssuedLinkCertificate(linkId, tier === "special").then((has) => {
        if (has === null) {
          // 確かめられない。出さずに おき、次の 頼みを 受けられる ように 戻す
          handledRef.current[tier] = false;
          return;
        }
        if (has) {
          ack(target, tier);
          return;
        }
        const result = linkCertificateResult(
          linkId,
          tier === "special" ? spec.special : spec.main,
          { special: tier === "special", levels: request.levels },
        );
        if (tier === "special") {
          beginSpecial({ resumed: false });
          finishSpecial(result);
        } else {
          beginMain({ resumed: false });
          finishMain(result);
        }
        ack(target, tier);
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [spec, linkId, frameRef, beginMain, finishMain, beginSpecial, finishSpecial]);

  return { spec, main, special };
}
