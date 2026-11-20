"use client";

/**
 * ツール教材（link）の 修了証（2026-11-20・相談の 練習問題）
 *
 * tomy さんの 指定「レベル4までで修了証を作成できるようにして、レベル5をもっと特別に」→ 選択
 *「アプリの修了証」「レベル5の特別な修了証」「すでに終えた学生には1回だけ出す」。
 *
 * - 中の ページは 成績の 数だけを 送る（`nexmax:link-certificate`）。題と 種類は ここで 持つ
 *   （ページから 受け取らない）。種類ごとに 決まった レベルの 組だけを 受ける
 * - 受けるのは **自分が 埋めた iframe から 来た もの だけ**（origin と `event.source` の 両方）
 * - 2種類（レベル1〜4・特別課題）を **別々の 手順**で 出す。DB の content_id は どちらも 教材の id
 *   （先生の 記録で 同じ 教材の 欄に 並ぶ）。端末の 控えの 鍵だけ 分ける
 * - 同じ 種類は 1人 1枚。DB に もう あれば 出さない（確かめられない ときも 出さない——2枚目を 作らない）。
 *   「もう一度 ためす」の 前にも 確かめる
 * - **DB に 入った（または もう あった）ときだけ** ページに 知らせる（`nexmax:link-certificate-ack`）。
 *   発行に 落ちた・見本に なった（ログインが 切れて いた）ときは 知らせない——ページは 次に 開いた
 *   とき また 頼む（コードの 検収「ack を 先に 送ると 修了証が 永久に 出ない」）。
 *   Supabase の 無い デモ（見本しか 出せない）だけは 見本でも 知らせる
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { CertificateState } from "@/components/certificate/certificate-panel";
import { useCertificateIssuer } from "@/components/certificate/use-certificate-issuer";
import { readLinkCertificateMessage } from "@/lib/answers/link-message";
import { hasIssuedLinkCertificate } from "@/lib/certificate/certificate-db";
import {
  CERTIFICATE_LINKS,
  ackTo,
  matchesTier,
  shouldAckIssued,
  specialCertificateKey,
  type LinkCertificateTier as Tier,
} from "@/lib/certificate/link-certificates";
import { linkCertificateResult } from "@/lib/certificate/model";
import { createClient } from "@/lib/supabase/client";

export { CERTIFICATE_LINKS, specialCertificateKey };

export function useLinkCertificates(linkId: string, frameRef: RefObject<HTMLIFrameElement | null>) {
  const spec = CERTIFICATE_LINKS[linkId] ?? null;
  const main = useCertificateIssuer(linkId);
  const special = useCertificateIssuer(specialCertificateKey(linkId));
  /** この 画面で もう 受けた 種類（確かめて いる 最中に 2つ目を 受けない）。 */
  const handledRef = useRef<Record<Tier, boolean>>({ main: false, special: false });
  /** 発行の 結果を 待って いる 種類と、知らせる 先（ページの 窓）。 */
  const awaitingRef = useRef<Record<Tier, Window | null>>({ main: null, special: null });

  const beginMain = main.begin;
  const finishMain = main.finish;
  const beginSpecial = special.begin;
  const finishSpecial = special.finish;

  useEffect(() => {
    if (!spec) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const request = readLinkCertificateMessage(event.data, linkId);
      if (!request || !matchesTier(spec, request)) return;
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
          ackTo(target, linkId, tier);
          return;
        }
        awaitingRef.current[tier] = target;
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
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [spec, linkId, frameRef, beginMain, finishMain, beginSpecial, finishSpecial]);

  /* 発行の 結果を 見て、DB に 入ったら（デモは 見本でも）ページに 知らせる */
  const mainState = main.certificate;
  const specialState = special.certificate;
  useEffect(() => {
    const demo = createClient() === null;
    const settle = (tier: Tier, state: CertificateState | null) => {
      const target = awaitingRef.current[tier];
      if (!target || !shouldAckIssued(state, demo)) return;
      awaitingRef.current[tier] = null;
      ackTo(target, linkId, tier);
    };
    settle("main", mainState);
    settle("special", specialState);
  }, [linkId, mainState, specialState]);

  /*
   * 「もう一度 ためす」の 前に DB を 確かめる。返事だけが 届かなかった（行は 入った）ときに
   * 2枚目を 出さない（コードの 検収）。もう あれば 出し直さずに 閉じる。
   */
  const retryMain = main.retry;
  const resetMain = main.reset;
  const retrySpecial = special.retry;
  const resetSpecial = special.reset;
  const retryChecked = useCallback(
    (tier: Tier) => {
      void hasIssuedLinkCertificate(linkId, tier === "special").then((has) => {
        if (has === null) return;
        if (has) {
          if (tier === "special") resetSpecial();
          else resetMain();
          const target = awaitingRef.current[tier];
          awaitingRef.current[tier] = null;
          ackTo(target, linkId, tier);
          return;
        }
        if (tier === "special") retrySpecial();
        else retryMain();
      });
    },
    [linkId, retryMain, resetMain, retrySpecial, resetSpecial],
  );

  return {
    spec,
    main: { ...main, retry: () => retryChecked("main") },
    special: { ...special, retry: () => retryChecked("special") },
  };
}
