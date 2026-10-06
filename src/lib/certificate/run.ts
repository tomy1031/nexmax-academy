/**
 * 修了証の ための **1回ぶんの 記録**（端末に 置く）と、出した 修了証の 控え
 *
 * 画面の 中の 数（リスニングの ミス・タイピングの ❌）は **開き直すと 0に 戻る**。
 * 修了証は「この 回を どう 終えたか」の 証明なので、回の あいだは 端末に 積んで おく。
 *
 * 鍵は 進み具合（`nexmax:v1:content:<id>`）と **別**に する。進み具合は DB へ 写す
 * 道（`src/lib/records/sync.ts`）が 走査して いるので、形を 混ぜると 写しが 壊れる。
 *
 * 端末ごとの 記録なので、途中で 端末を 替えた 回は 数えられない（範囲外。願い #562）。
 */
import type { IssuedCertificate } from "./model";

const RUN_PREFIX = "nexmax:v1:cert-run:";
const ISSUED_PREFIX = "nexmax:v1:cert:";

/** 1回ぶんの 記録（リスニング・タイピング 共通。使う 欄は 種類ごと）。 */
export interface CertificateRun {
  /** 回を 始めた 時刻（端末の 時計。参考。修了証の 時刻には 使わない）。 */
  readonly startedAt: string;
  /** リスニング: ミスの 回数（開き直しても 積む）。 */
  readonly misses?: number;
  /** リスニング: あいことばを 使った。 */
  readonly usedRescue?: boolean;
  /** リスニング: 100% に なる 前に こたえあわせを 見た。 */
  readonly reviewedEarly?: boolean;
  /** タイピング: 文ごとの ❌ の 回数。 */
  readonly missesBySentence?: readonly number[];
  /** タイピング: 前の 回の しおりから 続けた。 */
  readonly partial?: boolean;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* 容量切れ・プライベートモード。修了証の ために 学習を 止めない */
  }
}

export function readRun(contentId: string): CertificateRun | null {
  return readJson<CertificateRun>(RUN_PREFIX + contentId);
}

/** 回を 始める（前の 回の 記録は 捨てる）。 */
export function startRun(contentId: string, extra: Partial<CertificateRun> = {}): CertificateRun {
  const run: CertificateRun = { startedAt: new Date().toISOString(), ...extra };
  writeJson(RUN_PREFIX + contentId, run);
  return run;
}

/** 回の 記録を 書きかえる（無ければ 始める）。 */
export function updateRun(
  contentId: string,
  change: (run: CertificateRun) => CertificateRun,
): CertificateRun {
  const next = change(readRun(contentId) ?? { startedAt: new Date().toISOString() });
  writeJson(RUN_PREFIX + contentId, next);
  return next;
}

/** 回を 終える（修了証を 出したら 消す。次は 新しい 回）。 */
export function endRun(contentId: string): void {
  try {
    storage()?.removeItem(RUN_PREFIX + contentId);
  } catch {
    /* 消せなくても 次の 回で 上書きされる */
  }
}

/** 出した 修了証の 控え（あとで 画像を 保存し直せる ように。最新の 1枚だけ）。 */
export function readIssued(contentId: string): IssuedCertificate | null {
  return readJson<IssuedCertificate>(ISSUED_PREFIX + contentId);
}

export function saveIssued(cert: IssuedCertificate): void {
  writeJson(ISSUED_PREFIX + cert.contentId, cert);
}
