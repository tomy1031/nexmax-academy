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
 * - タイピング: 1文目から 最後の 文まで、この 回で 続けて 終える。**❌ は 許す**（数は 出す。
 *   同じ 外れを 打ち直さずに もう一度 判定しても 数えない）。同日の 指定「間違いがないよりも
 *   ちゃんと終わらせることが大切なので、ここは分けなくて良さそうです」。
 *   途中から 始めた 回（前の 回の しおりから 続けた）は 全部の 文を 打って いないので パーフェクトに しない
 * - もんだい（第2段・同日の 回答「満点」）: 全問 正解。こたえ（けっかの 画面の せつめい）を
 *   見た あとの やりなおし・前の 回の 続き・バグ報告で こたえの 文を 見た 回は パーフェクトに しない。
 *   点・割合・合否は 書く
 * - 単語テスト（第2段・同日の 回答「何回目でも満点なら金」）: テストの やりかたを 最後まで 終えて
 *   満点（読み・意味 ぜんぶ）。「まちがえた ことばだけ」の やりなおしは パーフェクトに しない。
 *   れんしゅう・もんだいだけ の やりかたには 出さない（テストでは ない）
 */

/** 種類の 名前は ステージの `contents[].type` と 同じ（DB の kind 列。移行SQLの 註）。 */
export type CertificateKind = "listening" | "typing" | "quizset" | "wordtest";

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
  /** 出した 人の id（見本は 空）。端末に 残した 控えを 見せる ときに 突き合わせる。 */
  readonly owner?: string;
}

/** リスニングの 1回ぶん（端末の 記録 `run.ts` から）。 */
export interface ListeningRunFacts {
  readonly score: number;
  readonly misses: number;
  readonly usedRescue: boolean;
  /** 100% に なる 前に こたえあわせ（原稿）を 見たか。 */
  readonly reviewedEarly: boolean;
  /** 前の 回の 続きから 始めた（回の 記録が 無い まま、原稿が もう 途中まで 開いて いた）。 */
  readonly partial?: boolean;
  /**
   * 前の 回で こたえあわせ（原稿）を 見た あとの やりなおし。
   * 「はじめから」で 回を 新しく しても、原稿を 見た ことは 消えない（code-critic の 指摘。
   * 見て 写して 打てば 100% に なる）。同日の 決定「こたえあわせを 見る 前に 100%」に 合わせる。
   */
  readonly sawScriptBefore?: boolean;
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
    perfect: !facts.usedRescue && !facts.reviewedEarly && !facts.partial && !facts.sawScriptBefore,
    score: facts.score,
    maxScore: null,
    misses: facts.misses,
    detail: {
      revealPercent: 100,
      usedRescue: facts.usedRescue,
      reviewedEarly: facts.reviewedEarly,
      partial: Boolean(facts.partial),
      sawScriptBefore: Boolean(facts.sawScriptBefore),
    },
  };
}

/** タイピングの 1回ぶん。 */
export interface TypingRunFacts {
  readonly total: number;
  /**
   * 文ごとの ❌ の 回数（並びは 文の 順）。**null = この 回では 打って いない 文**
   *（前の 回の 続きから 始めた とき。0 と 混ぜると「1回で 正解」に 数えて しまう）。
   */
  readonly missesBySentence: readonly (number | null)[];
  /** 前の 回の しおりから 続けた（1文目から 見て いない）。 */
  readonly partial: boolean;
}

export function typingResult(
  contentId: string,
  title: string,
  facts: TypingRunFacts,
): CertificateResult {
  const judged = facts.missesBySentence.filter((n): n is number => n !== null);
  const misses = judged.reduce((sum, n) => sum + n, 0);
  const firstTry = judged.filter((n) => n === 0).length;
  const partial = facts.partial || judged.length < facts.total;
  return {
    kind: "typing",
    contentId,
    title,
    // ❌ の 数では 分けない（成績として 出すだけ）。終わらせたか どうかで 分ける
    perfect: !partial,
    score: firstTry,
    maxScore: facts.total,
    misses,
    detail: { sentences: facts.total, firstTry, judged: judged.length, partial },
  };
}

/** もんだいの 1回ぶん（`src/components/quiz/use-quiz-certificate.ts`）。 */
export interface QuizRunFacts {
  /** 出した 問題の 数（全問を 通した 回なら 教材の 問題の 数）。 */
  readonly total: number;
  readonly correct: number;
  /** 画面と 同じ 丸めた 割合（`summarizeQuiz`）。 */
  readonly percent: number;
  readonly passed: boolean;
  /** 正解の 無い 教材（自由記述だけ）。点・合否の 代わりに 書けた 数を 出す。 */
  readonly freeOnly: boolean;
  /** 前の 回の 続きから（書きかけを 開き直した・しおりで 途中から 始めた）。 */
  readonly partial: boolean;
  /** 前に こたえ（けっかの 画面の せつめい）を 見た あとの やりなおし。 */
  readonly sawScriptBefore: boolean;
  /** バグ報告で、3回 だめで こたえの 文を 見た。 */
  readonly sawModelAnswer: boolean;
}

export function quizResult(
  contentId: string,
  title: string,
  facts: QuizRunFacts,
): CertificateResult {
  const allCorrect = facts.total > 0 && facts.correct === facts.total;
  return {
    kind: "quizset",
    contentId,
    title,
    perfect: allCorrect && !facts.partial && !facts.sawScriptBefore && !facts.sawModelAnswer,
    score: facts.correct,
    maxScore: facts.total,
    misses: facts.total - facts.correct,
    detail: {
      questions: facts.total,
      percent: facts.percent,
      passed: facts.passed,
      freeOnly: facts.freeOnly,
      partial: facts.partial,
      sawScriptBefore: facts.sawScriptBefore,
      sawModelAnswer: facts.sawModelAnswer,
    },
  };
}

/** 単語テストの 1回ぶん（`src/components/arcade/use-word-test-certificate.ts`）。 */
export interface WordTestRunFacts {
  /** 読みと 意味を あわせた 点（`summarize` の score / maxScore。画面と 同じ）。 */
  readonly score: number;
  readonly maxScore: number;
  readonly readingCorrect: number;
  /** 読みを 聞いた 数（読みの 無い ことばは 聞かない）。 */
  readonly readingAsked: number;
  readonly meaningCorrect: number;
  /** 出た ことばの 数。 */
  readonly words: number;
  readonly passed: boolean;
  /** 「まちがえた ことばだけ」の やりなおし。 */
  readonly onlyMissed: boolean;
}

export function wordTestResult(
  contentId: string,
  title: string,
  facts: WordTestRunFacts,
): CertificateResult {
  return {
    kind: "wordtest",
    contentId,
    title,
    perfect: facts.maxScore > 0 && facts.score === facts.maxScore && !facts.onlyMissed,
    score: facts.score,
    maxScore: facts.maxScore,
    misses: facts.maxScore - facts.score,
    detail: {
      words: facts.words,
      readingCorrect: facts.readingCorrect,
      readingAsked: facts.readingAsked,
      meaningCorrect: facts.meaningCorrect,
      passed: facts.passed,
      onlyMissed: facts.onlyMissed,
    },
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
      ...(cert.detail.partial ? [{ label: "はじめかた", value: "前の 回の 続きから" }] : []),
      ...(cert.detail.sawScriptBefore
        ? [{ label: "やりなおし", value: "前に こたえあわせを 見た あと" }]
        : []),
    ];
  }
  if (cert.kind === "wordtest") {
    const words = Number(cert.detail.words ?? 0);
    return [
      { label: "点", value: `${cert.score ?? 0} / ${cert.maxScore ?? 0}` },
      {
        label: "読み",
        value: `${Number(cert.detail.readingCorrect ?? 0)} / ${Number(cert.detail.readingAsked ?? 0)}`,
      },
      { label: "意味", value: `${Number(cert.detail.meaningCorrect ?? 0)} / ${words}` },
      /*
       * 「まちがえた ことばだけ」の 回は 合否を 書かない——数語の やりなおしの「合格」は、
       * テストに 合格した ように 読める（規律1・code-critic の 指摘）
       */
      ...(cert.detail.onlyMissed
        ? [{ label: "はじめかた", value: "まちがえた ことばだけ" }]
        : [{ label: "けっか", value: cert.detail.passed ? "合格" : "不合格" }]),
    ];
  }
  if (cert.kind === "quizset") {
    const how = [
      ...(cert.detail.partial ? [{ label: "はじめかた", value: "前の 回の 続きから" }] : []),
      ...(cert.detail.sawScriptBefore
        ? [{ label: "やりなおし", value: "前に こたえを 見た あと" }]
        : []),
    ];
    // 正解の 無い 教材は 点も 合否も 出さない（けっかの 画面と 同じ。2026-08-27 の 指定）
    if (cert.detail.freeOnly) {
      return [
        { label: "書けた もんだい", value: `${cert.score ?? 0} / ${cert.maxScore ?? 0}` },
        ...how,
      ];
    }
    return [
      { label: "正解", value: `${cert.score ?? 0} / ${cert.maxScore ?? 0}問` },
      { label: "正解の 割合", value: `${Number(cert.detail.percent ?? 0)}%` },
      { label: "けっか", value: cert.detail.passed ? "合格" : "不合格" },
      ...how,
    ];
  }
  return [
    { label: "1回で 正解した 文", value: `${cert.score ?? 0} / ${cert.maxScore ?? 0}文` },
    { label: "❌ の 回数", value: `${cert.misses ?? 0}回` },
    ...(cert.detail.partial
      ? [
          { label: "はじめかた", value: "前の 回の 続きから" },
          {
            label: "この 回で 入力した 文",
            value: `${Number(cert.detail.judged ?? 0)} / ${cert.maxScore ?? 0}文`,
          },
        ]
      : []),
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
      ...(cert.detail.partial ? ["前の 回の 続きから 始めました。"] : []),
      ...(cert.detail.sawScriptBefore ? ["前に こたえあわせを 見た あとの やりなおしです。"] : []),
    ];
  }
  if (cert.kind === "wordtest") {
    const missed = cert.misses ?? 0;
    return [
      ...(missed > 0 ? [`まちがえた ところが ${missed}つ あります。`] : []),
      ...(cert.detail.onlyMissed ? ["まちがえた ことばだけの やりなおしです。"] : []),
    ];
  }
  if (cert.kind === "quizset") {
    const missed = cert.misses ?? 0;
    return [
      ...(missed > 0
        ? [
            cert.detail.freeOnly
              ? `書いて いない もんだいが ${missed}つ あります。`
              : `まちがえた もんだいが ${missed}問 あります。`,
          ]
        : []),
      ...(cert.detail.partial ? ["前の 回の 続きから 始めました。"] : []),
      ...(cert.detail.sawScriptBefore ? ["前に こたえを 見た あとの やりなおしです。"] : []),
      ...(cert.detail.sawModelAnswer ? ["バグ報告で こたえの 文を 見ました。"] : []),
    ];
  }
  return cert.detail.partial ? ["前の 回の 続きから 始めました。"] : [];
}

/** パーフェクトに する ための 次の 一手（1行）。 */
export function nextStepForPerfect(cert: CertificateResult): string {
  if (cert.kind === "wordtest") {
    return "パーフェクトを めざすなら、もう一度 テストを ぜんぶ やって、満点を とりましょう。";
  }
  if (cert.kind === "quizset") {
    /*
     * けっかの 画面で こたえと せつめいを 見たので、この あとの やりなおしは もう
     * パーフェクトに ならない。できない ことを「めざそう」と 言わない（規律1）。
     */
    return "パーフェクトに なるのは、こたえを 見る 前の 1回目だけです。つぎの もんだいでは、出す 前に 見直しましょう。";
  }
  return cert.kind === "listening"
    ? "パーフェクトを めざすなら、はじめから やりなおして、こたえあわせを 見る 前に 100%に しましょう。"
    : "パーフェクトを めざすなら、1文目から 最後の 文まで 続けて 入力しましょう。";
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
