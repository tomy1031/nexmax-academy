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
import type { CertificateResult, IssuedCertificate } from "./model";

/*
 * 鍵は「nexmax.」で 始める——ログアウトで `clearNexmaxCache()` が まとめて 消す。
 * 教室の 共有 PC で、前の 人の 回の 記録や 修了証（名前・番号）が 次の 人に 見えない ように
 *（code-critic の 指摘）。ログアウトしない 人の ために、持ち主（owner）も 記録して 突き合わせる。
 */
const RUN_PREFIX = "nexmax.cert-run.v1:";
const ISSUED_PREFIX = "nexmax.cert.v1:";
/** この 教材の こたえあわせ（原稿）を 見た ことが あるか（「はじめから」でも 消さない）。 */
const SAW_PREFIX = "nexmax.cert-saw.v1:";
/**
 * もんだい（第2段）: どの 回で こたえを 見たか。**回の 名札（startedAt）付き**で 残す——
 * 1問ずつの やりかたは 答える たびに こたえを 見せるので、同じ 回の 中で 見た ことは
 * 数えない。ほかの 回（前の 回・別の タブ）で 見た ことだけを 数える。
 */
const ANSWERS_PREFIX = "nexmax.cert-answers.v1:";

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
  /** タイピング: 文ごとの ❌ の 回数（null = この 回では 打って いない 文）。 */
  readonly missesBySentence?: readonly (number | null)[];
  /** 前の 回の 続きから 始めた（タイピングの しおり・リスニングの 開いた 原稿）。 */
  readonly partial?: boolean;
  /** リスニング: 回を 始めた 時点で、もう こたえあわせを 見た ことが あった。 */
  readonly sawScriptBefore?: boolean;
  /** 回を 始めた 人（ログインして いれば 本人の id。発行の ときに 突き合わせる）。 */
  readonly owner?: string;
  /**
   * 終えた のに まだ 発行できて いない 成績（もんだい）。発行の 途中で 閉じた・落ちた ときに
   * 次に 開いた 画面で「もう一度 ためす」から 出し直す（黙って 消さない）。
   */
  readonly pending?: { readonly result: CertificateResult; readonly attemptId: string };
  /**
   * 会話の 練習: この 回の 修了証は もう 出した。同じ 回を 開き直して 終えても 2枚目を 出さない
   *（回は 次に「はじめから」始めた ときに 置きかわる）。
   */
  readonly issued?: boolean;
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

/** こたえあわせ（原稿）を 見た 印を 付ける（その 教材では 以後 ずっと 残る）。 */
export function markSawScript(contentId: string): void {
  writeJson(SAW_PREFIX + contentId, true);
}

export function sawScript(contentId: string): boolean {
  return readJson<boolean>(SAW_PREFIX + contentId) === true;
}

interface AnswersSeen {
  /** 見た 回の 名札（`CertificateRun.startedAt`）。 */
  readonly run: string;
  readonly at: string;
}

/** この 回で こたえを 見た 印を 付ける（もんだい）。 */
export function markSawAnswers(contentId: string, runStartedAt: string): void {
  writeJson(ANSWERS_PREFIX + contentId, {
    run: runStartedAt,
    at: new Date().toISOString(),
  } satisfies AnswersSeen);
}

/** どこかの 回で こたえを 見た ことが あるか（回を 始める 時に 見る）。 */
export function sawAnyAnswers(contentId: string): boolean {
  return readJson<AnswersSeen>(ANSWERS_PREFIX + contentId) !== null;
}

/**
 * **ほかの 回**で こたえを 見たか（終える 時に 見る）。2つの タブで 同じ もんだいを 開き、
 * 片方で 出して こたえを 見てから、もう片方で 出す——を 止める（code-critic の 指摘）。
 */
export function sawAnswersOutside(contentId: string, runStartedAt: string): boolean {
  const seen = readJson<AnswersSeen>(ANSWERS_PREFIX + contentId);
  return seen !== null && seen.run !== runStartedAt;
}
