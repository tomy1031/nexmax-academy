/**
 * 進捗の保存層 — 差し替え可能な薄い抽象
 *
 * いまは localStorage、フェーズ1で Supabase（progress / test_results / game_scores）に
 * 差し替える（設計03 §3.1・§3.2）。画面から localStorage を直接触らないことで、
 * DB移行のときに書き換える場所をここ1か所に閉じる。
 *
 * 設計上の分離（P11）:
 *   TestResult … 教師が見る成績。初回の点数のみ正式。
 *   GameScore  … れんしゅうの星・コンボ。学習者を励ますためだけに使う。
 *   WordMastery … 出題スケジューラ（苦手語を先に出す）が読む学習履歴。
 */

const NAMESPACE = "nexmax:v1";

/** 保存の実体。テストや将来のDB実装のために差し替えられる。 */
export interface ProgressBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** SSR・localStorage 不許可環境でも落ちないメモリ実装。 */
export function createMemoryBackend(): ProgressBackend {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

function createLocalStorageBackend(): ProgressBackend {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* プライベートモード等では黙って諦める（学習は続けられる） */
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* 同上 */
      }
    },
  };
}

/** 既定のバックエンド。ブラウザなら localStorage、それ以外はメモリ。 */
export function defaultBackend(): ProgressBackend {
  return typeof window === "undefined" ? createMemoryBackend() : createLocalStorageBackend();
}

/* ------------------------------------------------------------------ *
 * 保存するかたち
 * ------------------------------------------------------------------ */

/**
 * 教師が見る成績。初回のみ正式（P11・旧 wordtest 改修指示書 §18）。
 *
 * 記録するのは ことばの テストだけではない。もんだい（quizset）の点も ここに残す
 * ——同じ「テスト」なのに、ことばの点だけが残って もんだいの点が消えるのは、
 * 先生から見ると 成績の 半分が 欠けているのと同じである。
 */
export interface TestResult {
  /** 成績のキー。ことばのテストは 単語ステージID、もんだいは 問題セットID。 */
  readonly stageId: string;
  /** ことばのテストは 読み1点＋意味1点＝1問2点。もんだいは 配点の合計。 */
  readonly score: number;
  readonly maxScore: number;
  /**
   * 読み／意味の内わけ。**ことばのテストにしか無い**数え方なので任意にする。
   * もんだい側に 0 を書かせると、先生の画面では「読みが 全部だめだった」と
   * 見分けが つかなくなる（無いことと 0点は ちがう）。
   */
  readonly readingCorrect?: number;
  readonly meaningCorrect?: number;
  /** 問題数（ことばのテストは 語の数）。 */
  readonly total: number;
  readonly passed: boolean;
  /** ISO8601。 */
  readonly at: string;
}

/** ゲーム側のスコア。合否には使わない。 */
export interface GameScore {
  readonly stageId: string;
  readonly bestScore: number;
  readonly bestCombo: number;
  readonly plays: number;
}

/**
 * ステージ内コンテンツ（manga / article / listening / quizset / scenario など）の進捗。
 * ステージ詳細の「4つ中2つ おわった」やレッスンカードの n/m がこれを数える（設計07 §3）。
 */
export interface ContentProgress {
  readonly status: "started" | "completed";
  /** 途中位置（しおり）。例: 漫画なら { page: 3, panel: 2 }。 */
  readonly position?: Record<string, number>;
}

/** 語ごとの学習履歴。スケジューラが「苦手」を判断する材料。 */
export interface WordMastery {
  readonly seen: number;
  readonly missed: number;
  /** 直近でまちがえた時刻（ISO8601）。新しいほど優先して出す。 */
  readonly lastMissedAt?: string;
}

export type MasteryMap = Record<string, WordMastery>;

/* ------------------------------------------------------------------ *
 * ストア
 * ------------------------------------------------------------------ */

/**
 * 変更の通知。React 側は useSyncExternalStore で購読できる
 *（effect の中で setState して同期する形を避けるため）。
 */
const listeners = new Set<() => void>();

export function subscribeProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function notifyProgressChanged(): void {
  for (const listener of listeners) listener();
}

function readJson<T>(backend: ProgressBackend, key: string, fallback: T): T {
  const raw = backend.get(`${NAMESPACE}:${key}`);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(backend: ProgressBackend, key: string, value: unknown): void {
  backend.set(`${NAMESPACE}:${key}`, JSON.stringify(value));
  notifyProgressChanged();
}

export interface ProgressStore {
  /** 解錠済みステージ（パスワード演出用。真のゲートは将来サーバ側）。 */
  isUnlocked(stageId: string): boolean;
  unlock(stageId: string): void;

  /** 初回のみ記録する正式な成績。2回目以降は上書きしない。 */
  readTestResult(stageId: string): TestResult | null;
  recordFirstTestResult(result: TestResult): TestResult;

  readGameScore(stageId: string): GameScore | null;
  recordGameScore(stageId: string, score: number, combo: number): GameScore;

  readMastery(stageId: string): MasteryMap;
  recordAttempts(stageId: string, attempts: readonly WordAttempt[], now?: Date): MasteryMap;

  clear(stageId: string): void;
}

/** 1語ぶんの結果（読み・意味の両方が正解なら missed ではない）。 */
export interface WordAttempt {
  readonly wordId: string;
  readonly correct: boolean;
}

export function createProgressStore(backend: ProgressBackend = defaultBackend()): ProgressStore {
  return {
    isUnlocked(stageId) {
      return readJson<string[]>(backend, "unlocked", []).includes(stageId);
    },
    unlock(stageId) {
      const list = readJson<string[]>(backend, "unlocked", []);
      if (!list.includes(stageId)) writeJson(backend, "unlocked", [...list, stageId]);
    },

    readTestResult(stageId) {
      return readJson<TestResult | null>(backend, `test:${stageId}`, null);
    },
    recordFirstTestResult(result) {
      const existing = readJson<TestResult | null>(backend, `test:${result.stageId}`, null);
      if (existing) return existing; // 初回の点数が正式（再挑戦で上書きしない）
      writeJson(backend, `test:${result.stageId}`, result);
      return result;
    },

    readGameScore(stageId) {
      return readJson<GameScore | null>(backend, `game:${stageId}`, null);
    },
    recordGameScore(stageId, score, combo) {
      const prev = readJson<GameScore | null>(backend, `game:${stageId}`, null);
      const next: GameScore = {
        stageId,
        bestScore: Math.max(prev?.bestScore ?? 0, score),
        bestCombo: Math.max(prev?.bestCombo ?? 0, combo),
        plays: (prev?.plays ?? 0) + 1,
      };
      writeJson(backend, `game:${stageId}`, next);
      return next;
    },

    readMastery(stageId) {
      return readJson<MasteryMap>(backend, `mastery:${stageId}`, {});
    },
    recordAttempts(stageId, attempts, now = new Date()) {
      const map = { ...readJson<MasteryMap>(backend, `mastery:${stageId}`, {}) };
      for (const { wordId, correct } of attempts) {
        const prev = map[wordId] ?? { seen: 0, missed: 0 };
        map[wordId] = {
          seen: prev.seen + 1,
          missed: prev.missed + (correct ? 0 : 1),
          lastMissedAt: correct ? prev.lastMissedAt : now.toISOString(),
        };
      }
      writeJson(backend, `mastery:${stageId}`, map);
      return map;
    },

    clear(stageId) {
      backend.remove(`${NAMESPACE}:test:${stageId}`);
      backend.remove(`${NAMESPACE}:game:${stageId}`);
      backend.remove(`${NAMESPACE}:mastery:${stageId}`);
    },
  };
}

/* ------------------------------------------------------------------ *
 * コンテンツ進捗（stage 内の manga / article / listening / quizset / scenario）
 * ------------------------------------------------------------------ */

export function readContentProgress(
  contentId: string,
  backend: ProgressBackend = defaultBackend(),
): ContentProgress | null {
  return readJson<ContentProgress | null>(backend, `content:${contentId}`, null);
}

/**
 * コンテンツ進捗を記録する。completed は started で上書きされない
 * （読み直しても「おわった」は消えない）。position（しおり）は常に最新を残す。
 * writeJson 経由なので subscribeProgress の購読者に通知が飛ぶ。
 */
export function recordContentProgress(
  contentId: string,
  value: ContentProgress,
  backend: ProgressBackend = defaultBackend(),
): ContentProgress {
  const existing = readContentProgress(contentId, backend);
  const status = existing?.status === "completed" ? "completed" : value.status;
  const position = value.position ?? existing?.position;
  const next: ContentProgress = position ? { status, position } : { status };
  writeJson(backend, `content:${contentId}`, next);
  return next;
}

/* ------------------------------------------------------------------ *
 * リスニングで当てた言葉
 * ------------------------------------------------------------------ */

/**
 * 一度ひらいた原稿は、次に来ても ひらいたままにする。
 *
 * 保存するのは**開いた位置ではなく入力した言葉**。位置は台本を1文字直すだけで
 * ずれるが、言葉なら意味が変わらない（listening-checks の replayListening が
 * これを流し込んで状態を組み直す）。
 *
 * DBには置かない。1画面ぶんの「しおり」に毎回の入力を送るのは重すぎるし、
 * 消えても学習が止まらない種類のデータである。
 */
export function readListeningFinds(
  contentId: string,
  backend: ProgressBackend = defaultBackend(),
): string[] {
  const saved = readJson<unknown>(backend, `listening:${contentId}`, []);
  return Array.isArray(saved)
    ? saved.filter((item): item is string => typeof item === "string")
    : [];
}

export function saveListeningFinds(
  contentId: string,
  inputs: readonly string[],
  backend: ProgressBackend = defaultBackend(),
): void {
  writeJson(backend, `listening:${contentId}`, [...inputs]);
}
