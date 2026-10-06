/**
 * 修了証（しゅうりょうしょう）の 中身 — 純関数（2026-10-06 の 指定・願い #562）
 *
 * ## なぜ 要るか
 * 終わった ことの 確認に 画面の スクリーンショットを 出させて いたが、それを 横見して、
 * 答えを 見ながら タイピングする などの 不正が 見られた。修了証には
 *   * 終了時刻 … あとで こっそり やるのを 防ぐ（DB が 押す。端末の 時計は 使わない）
 *   * 名前     … 人の ものを 写すのを 防ぐ（DB が アカウントから 写す）
 *   * 成績     … パーフェクトか どうかが 一目で 分かる
 * を 入れる。**答えや 原稿は 載せない**（横見して 写す 元に なる）。
 *
 * ## パーフェクトの 条件（同日の 決定）
 * - リスニング: こたえあわせ（原稿）を 見る 前に 100%・あいことばを 使わない。
 *   **ミスは 許す**（数は 出す）
 * - タイピング: ❌ が 1回も 無い（同じ 外れを 打ち直さずに もう一度 判定しても 数えない）。
 *   途中から 始めた 回（前の 回の しおりから 続けた）は 全部の 文を 見て いないので パーフェクトに しない
 */

export type CertificateKind = "listening" | "typing";

/** 1回ぶんの 成績（端末が まとめて DB へ 送る）。 */
export interface CertificateResult {
  readonly kind: CertificateKind;
  readonly contentId: string;
  /** 教材の 題（「リスニング：作業完了の 報告」）。DB には 送らない（教材から 引ける）。 */
  readonly title: string;
  readonly perfect: boolean;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly misses: number | null;
  /** 画面に 出す 内訳（DB の detail 列へ そのまま）。 */
  readonly detail: Readonly<Record<string, number | boolean>>;
}

/** 発行された 修了証（DB が 時刻・名前・番号・何回目かを 押した あと）。 */
export interface IssuedCertificate extends CertificateResult {
  /** 照合番号（8桁）。見本（デモ）では 空。 */
  readonly code: string;
  /** 終えた 時刻（ISO）。正式な 修了証では DB の 時刻。 */
  readonly issuedAt: string;
  readonly learnerName: string;
  readonly attempt: number;
  /** DB が 押した 正式な もの か（false = 見本。ログインして いない・デモ）。 */
  readonly official: boolean;
}

/** リスニングの 1回ぶん（端末の 記録 `run.ts` から）。 */
export interface ListeningRunFacts {
  readonly score: number;
  readonly misses: number;
  readonly usedRescue: boolean;
  /** 100% に なる 前に こたえあわせ（原稿）を 見たか。 */
  readonly reviewedEarly: boolean;
}

export function listeningResult(
  contentId: string,
  title: string,
  facts: ListeningRunFacts,
): CertificateResult {
  return {
    kind: "listening",
    contentId,
    title,
    perfect: !facts.usedRescue && !facts.reviewedEarly,
    score: facts.score,
    maxScore: null,
    misses: facts.misses,
    detail: {
      revealPercent: 100,
      usedRescue: facts.usedRescue,
      reviewedEarly: facts.reviewedEarly,
    },
  };
}

/** タイピングの 1回ぶん。 */
export interface TypingRunFacts {
  readonly total: number;
  /** 文ごとの ❌ の 回数（並びは 文の 順）。 */
  readonly missesBySentence: readonly number[];
  /** 前の 回の しおりから 続けた（1文目から 見て いない）。 */
  readonly partial: boolean;
}

export function typingResult(
  contentId: string,
  title: string,
  facts: TypingRunFacts,
): CertificateResult {
  const misses = facts.missesBySentence.reduce((sum, n) => sum + n, 0);
  const firstTry = facts.missesBySentence.filter((n) => n === 0).length;
  return {
    kind: "typing",
    contentId,
    title,
    perfect: misses === 0 && !facts.partial,
    score: firstTry,
    maxScore: facts.total,
    misses,
    detail: { sentences: facts.total, firstTry, partial: facts.partial },
  };
}

/** 修了証の 成績の 1行（ラベルと 値。画面の カードと 画像の 両方が 使う）。 */
export interface CertificateLine {
  readonly label: string;
  readonly value: string;
}

/** 成績の 行。**画面と 画像で 同じ 行を 使う**（ずれを 作らない）。 */
export function certificateLines(cert: CertificateResult): CertificateLine[] {
  if (cert.kind === "listening") {
    return [
      { label: "原稿を 開いた 割合", value: "100%" },
      { label: "スコア", value: `${cert.score ?? 0}点` },
      { label: "ミス", value: `${cert.misses ?? 0}回` },
      { label: "あいことば", value: cert.detail.usedRescue ? "使った" : "使わなかった" },
      {
        label: "こたえあわせ",
        value: cert.detail.reviewedEarly ? "100%の 前に 見た" : "100%の あとに 見た",
      },
    ];
  }
  return [
    { label: "1回で 正解した 文", value: `${cert.score ?? 0} / ${cert.maxScore ?? 0}文` },
    { label: "❌ の 回数", value: `${cert.misses ?? 0}回` },
    ...(cert.detail.partial ? [{ label: "はじめかた", value: "前の 回の 続きから" }] : []),
  ];
}

/**
 * パーフェクトで ない 理由（はっきり 書く・規律1）。パーフェクトなら 空。
 * 次に どう すれば パーフェクトに なるかも 1行 添える。
 */
export function notPerfectReasons(cert: CertificateResult): string[] {
  if (cert.perfect) return [];
  if (cert.kind === "listening") {
    return [
      ...(cert.detail.usedRescue ? ["あいことばを 使いました。"] : []),
      ...(cert.detail.reviewedEarly ? ["100%に なる 前に こたえあわせを 見ました。"] : []),
    ];
  }
  return [
    ...((cert.misses ?? 0) > 0 ? [`❌ が ${cert.misses}回 ありました。`] : []),
    ...(cert.detail.partial ? ["前の 回の 続きから 始めました。"] : []),
  ];
}

/** パーフェクトに する ための 次の 一手（1行）。 */
export function nextStepForPerfect(cert: CertificateResult): string {
  return cert.kind === "listening"
    ? "パーフェクトを めざすなら、はじめから やりなおして、こたえあわせを 見る 前に 100%に しましょう。"
    : "パーフェクトを めざすなら、1文目から もう一度、❌ なしで 入力しましょう。";
}

/**
 * 終えた 時刻の 書き方。**カンボジアの 時刻に 固定**して「（ICT）」を 付ける（端末の 時差に よらない）。
 * 「年・月・日」の 漢字は 使わない——「6日（むいか）」「10日（とおか）」の ように 読みが 変わる 字に
 * ルビを 付けるより、数字と「/」の ほうが 学習者にも 先生にも 読みまちがえが ない。
 */
export function formatIssuedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const pad = (value: string) => value.padStart(2, "0");
  return `${get("year")}/${pad(get("month"))}/${pad(get("day"))} ${get("hour")}:${get("minute")}（ICT）`;
}

/** 画像の ファイル名（`nexmax-certificate_<教材ID>_<yyyymmdd-hhmm>.png`。時刻は ICT）。 */
export function certificateFileName(contentId: string, iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(Number.isNaN(date.getTime()) ? new Date(0) : date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const stamp = `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}`;
  return `nexmax-certificate_${contentId}_${stamp}.png`;
}
