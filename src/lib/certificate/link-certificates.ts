/**
 * ツール教材（link）の 修了証の 決まり（純粋な 関数・2026-11-20 相談の 練習問題）
 *
 * 画面の 手順（`src/components/link/use-link-certificates.ts`）から 切り出して、テストで 固める。
 */
import type { CertificateState } from "@/components/certificate/certificate-panel";
import { CERTIFICATE_ACK_MESSAGE, type LinkCertificateRequest } from "@/lib/answers/link-message";

export interface LinkCertificateSpec {
  /** レベル1〜4 の 修了証の 題。 */
  readonly main: string;
  /** 特別課題の 修了証の 題。 */
  readonly special: string;
  /** それぞれの 修了証に 書く レベル（この 組だけを 受ける）。 */
  readonly mainLevels: readonly number[];
  readonly specialLevels: readonly number[];
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
    mainLevels: [1, 2, 3, 4],
    specialLevels: [5],
    furigana: [
      ["相談", "そうだん"],
      ["練習問題", "れんしゅうもんだい"],
      ["特別課題", "とくべつかだい"],
    ],
    doneHint: "上の ページで レベル4まで やると ✅ に なります",
  },
};

export type LinkCertificateTier = LinkCertificateRequest["tier"];

/** 特別課題の 控えの 鍵（端末）。 */
export function specialCertificateKey(linkId: string): string {
  return `${linkId}:special`;
}

/** その 種類の 決まった レベルの 組と ちょうど 同じか（抜け・余り・ずれは 受けない）。 */
export function matchesTier(spec: LinkCertificateSpec, request: LinkCertificateRequest): boolean {
  const expected = request.tier === "special" ? spec.specialLevels : spec.mainLevels;
  const got = request.levels.map((level) => level.no).sort((a, b) => a - b);
  return got.length === expected.length && got.every((no, at) => no === expected[at]);
}

/**
 * ページに「出した」と 知らせて よいか。DB に 入った 修了証、または Supabase の 無い デモの 見本だけ。
 * 発行に 落ちた・ログインが 切れて 見本に なった ときは 知らせない（次に 開いた とき 頼み直す）。
 */
export function shouldAckIssued(state: CertificateState | null, demo: boolean): boolean {
  if (!state || state.status !== "ready") return false;
  return state.cert.official || demo;
}

export function ackTo(target: Window | null, linkId: string, tier: LinkCertificateTier): void {
  try {
    target?.postMessage(
      { type: CERTIFICATE_ACK_MESSAGE, id: linkId, tier },
      window.location.origin,
    );
  } catch {
    /* 知らせられなくても 次に 開いた ときに また 頼まれる（DB で 2枚目は 防ぐ） */
  }
}
