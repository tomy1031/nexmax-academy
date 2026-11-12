import {
  novelFailureTypes,
  type Novel,
  type NovelFailureType,
  type NovelScene,
  type NovelScreen,
  type novelFaces,
  type novelSteps,
} from "@/content/schema";

/**
 * 相談の 練習（サウンドノベル）の 状態 — 純粋な 関数だけ（React も localStorage も 持たない）
 *
 * ## 表示は 保存しない（仕様書 v4 §9）
 * 背景・立ち絵・開発中の 画面・今日の 目的カードは、**その日の 最初から いまの 場面までを
 * 読み直して 毎回 計算する**（`viewAt`）。保存するのは 日と 場面の 番号・クリアした もの・
 * 失敗の 回数・星・設定だけ。こう しておくと、どこへ 戻っても 表示が ずれない。
 */

export type NovelStep = (typeof novelSteps)[number];
export type NovelFace = (typeof novelFaces)[number];
export type NovelDay = Novel["days"][number];

export interface NovelSettings {
  readonly furigana: boolean;
  readonly translation: boolean;
  /** 効果音の 大きさ（0〜1）。 */
  readonly volume: number;
}

export interface NovelAttempt {
  /** 回数に 数える 失敗（聞き取れない は 数えない）。 */
  readonly fails: number;
  /** その 相談で 出た 失敗の 型（記録用・聞き取れない は 入れない）。 */
  readonly types: readonly NovelFailureType[];
}

export interface NovelSave {
  readonly version: 1;
  readonly day: number;
  readonly index: number;
  /** いちばん 先まで 進んだ 日（日を えらぶ ボタンが 開く 範囲）。 */
  readonly maxDay: number;
  /** クリアした notice・choose_person・consult・self_fix の 場面 id。 */
  readonly cleared: readonly string[];
  readonly attempts: Readonly<Record<string, NovelAttempt>>;
  readonly stars: Readonly<Record<string, number>>;
  readonly settings: NovelSettings;
  /** 5日 ぜんぶ 終えたか。 */
  readonly finished: boolean;
}

export const DEFAULT_SETTINGS: NovelSettings = { furigana: true, translation: false, volume: 0.6 };

export function emptySave(): NovelSave {
  return {
    version: 1,
    day: 0,
    index: 0,
    maxDay: 0,
    cleared: [],
    attempts: {},
    stars: {},
    settings: DEFAULT_SETTINGS,
    finished: false,
  };
}

/** 保存の 鍵（教材 id ごと）。 */
export function saveKey(contentId: string): string {
  return `nexmax.novel.${contentId}.v1`;
}

/**
 * 読んだ 保存を 教材に 合わせて 直す（教材が 変わって 日や 場面が 減っても 落ちない）。
 * 形が 崩れて いれば 空の 保存に する。
 */
export function normalizeSave(raw: unknown, novel: Novel): NovelSave {
  const base = emptySave();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<NovelSave>;
  const lastDay = novel.days.length - 1;
  const day = clampInt(value.day, 0, lastDay, 0);
  const scenes = novel.days[day]?.scenes.length ?? 1;
  const settings = (value.settings ?? {}) as Partial<NovelSettings>;
  return {
    version: 1,
    day,
    index: clampInt(value.index, 0, scenes - 1, 0),
    maxDay: Math.max(day, clampInt(value.maxDay, 0, lastDay, 0)),
    cleared: Array.isArray(value.cleared)
      ? value.cleared.filter((id): id is string => typeof id === "string")
      : [],
    attempts: cleanAttempts(value.attempts),
    stars: cleanStars(value.stars),
    settings: {
      furigana: typeof settings.furigana === "boolean" ? settings.furigana : true,
      translation: typeof settings.translation === "boolean" ? settings.translation : false,
      volume:
        typeof settings.volume === "number" && settings.volume >= 0 && settings.volume <= 1
          ? settings.volume
          : DEFAULT_SETTINGS.volume,
    },
    finished: value.finished === true,
  };
}

/** 失敗の 記録を 1件ずつ 確かめる（崩れた 保存で まとめの 画面が 落ちない ように）。 */
function cleanAttempts(raw: unknown): Record<string, NovelAttempt> {
  if (!isRecord(raw)) return {};
  const out: Record<string, NovelAttempt> = {};
  for (const [id, one] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRecord(one)) continue;
    const value = one as { fails?: unknown; types?: unknown };
    const types = Array.isArray(value.types)
      ? value.types.filter((type): type is NovelFailureType =>
          (novelFailureTypes as readonly string[]).includes(String(type)),
        )
      : [];
    out[id] = { fails: clampInt(value.fails, 0, 99, types.length), types };
  }
  return out;
}

/** 星は 0〜3 の 整数だけ 残す。 */
function cleanStars(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, stars] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof stars === "number" && Number.isFinite(stars)) out[id] = clampInt(stars, 0, 3, 0);
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRecord(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** その日の いまの 場面で 画面に 出す もの（背景・立ち絵・開発中の 画面・目的カード）。 */
export interface NovelView {
  readonly bg: string;
  /** 立ち絵を 出す 人（`cast` の id）。出さない ときは null。 */
  readonly figure: string | null;
  readonly face: NovelFace;
  /** 小さい 窓に 出す 開発中の 画面。 */
  readonly screen: NovelScreen;
  /** 今日の 目的カード（goal を 通った あと）。 */
  readonly goal: string | null;
  readonly step: NovelStep;
  /** 画面を 暗く する 場面か（時間が たった）。 */
  readonly dark: boolean;
}

/**
 * その日の 最初から `index` までを 読み直して、いまの 表示を 計算する。
 *
 * - 背景: 日の `bg`、line の `bg` で 変わる
 * - 立ち絵: 立ち絵の ある 人が 話すと その人に 変わる。ナレーション・心の 声・メッセージ
 *   では そのまま 残る（話して いた 人が 急に 消えない）
 * - 開発中の 画面: screen の 場面を 通ったら `after` に なる（その 場面の 上では まだ `before`）
 * - 相談の 場面では 相談相手が 立つ
 */
export function viewAt(novel: Novel, dayIndex: number, index: number): NovelView {
  const day = novel.days[dayIndex] ?? novel.days[0];
  if (!day) {
    return {
      bg: "",
      figure: null,
      face: "neutral",
      screen: { title: "", rows: [] },
      goal: null,
      step: "intro",
      dark: false,
    };
  }
  const figures = new Set(novel.cast.filter((p) => p.figures).map((p) => p.id));
  let bgKey = day.bg;
  let figure: string | null = null;
  let face: NovelFace = "neutral";
  let screen = day.screen;
  let goal: string | null = null;
  const last = Math.min(index, day.scenes.length - 1);
  for (let i = 0; i <= last; i += 1) {
    const scene = day.scenes[i];
    if (!scene) continue;
    if (scene.type === "line") {
      if (scene.bg) bgKey = scene.bg;
      if (figures.has(scene.speaker) && scene.via !== "message") {
        figure = scene.speaker;
        face = scene.face ?? "neutral";
      }
    } else if (scene.type === "goal") {
      goal = scene.text;
    } else if (scene.type === "screen" && i < last) {
      screen = scene.after;
    } else if (scene.type === "consult") {
      figure = figures.has(scene.to) ? scene.to : figure;
      face = "neutral";
    }
  }
  const current = day.scenes[last];
  return {
    bg: novel.backgrounds[bgKey] ?? Object.values(novel.backgrounds)[0] ?? "",
    figure,
    face,
    screen,
    goal,
    step: current?.step ?? "intro",
    dark: current?.type === "line" && current.dark === true,
  };
}

/** 文字で 読む 場面（ログに 残す もの）。 */
export type ReadableScene = Extract<
  NovelScene,
  { type: "line" | "goal" | "point" | "screen" | "ending" }
>;

export function isReadable(scene: NovelScene): scene is ReadableScene {
  return (
    scene.type === "line" ||
    scene.type === "goal" ||
    scene.type === "point" ||
    scene.type === "screen" ||
    scene.type === "ending"
  );
}

/** 操作が 要る 場面（クリアするまで 先へ 進めない）。 */
export function isInteractive(scene: NovelScene): boolean {
  return (
    scene.type === "notice" ||
    scene.type === "choose_person" ||
    scene.type === "consult" ||
    scene.type === "self_fix"
  );
}

/** ログ: その日の 最初から `index` までの 文の 場面（番号つき）。 */
export function logUpTo(day: NovelDay, index: number): { index: number; scene: ReadableScene }[] {
  const out: { index: number; scene: ReadableScene }[] = [];
  day.scenes.forEach((scene, i) => {
    if (i <= index && isReadable(scene)) out.push({ index: i, scene });
  });
  return out;
}

/** 4つの ステップ（バーに 出す 順）。はじめに・おわりには 色を 付けない。 */
export const STEP_BAR: readonly { step: NovelStep; label: string }[] = [
  { step: "goal", label: "目的" },
  { step: "notice", label: "気づき" },
  { step: "consult", label: "相談" },
  { step: "result", label: "結果" },
];

/** 気づきカードを 支えの 段に あわせて 出す（仕様書 §2 の 表）。 */
export function cardView(
  card: { seen: string; diff: string; seenKey: string; diffKey: string },
  support: "form" | "sentence" | "keyword" | "closed",
  opened: boolean,
): { seen: string; diff: string; mode: "sentence" | "keyword" } | null {
  if (support === "closed" && !opened) return null;
  if (support === "keyword" || support === "closed") {
    return { seen: card.seenKey, diff: card.diffKey, mode: "keyword" };
  }
  return { seen: card.seen, diff: card.diff, mode: "sentence" };
}

/** その 相談の 前に ある いちばん 近い 気づき（カードの 中身）。 */
export function noticeBefore(
  day: NovelDay,
  index: number,
): Extract<NovelScene, { type: "notice" }> | null {
  for (let i = index; i >= 0; i -= 1) {
    const scene = day.scenes[i];
    if (scene?.type === "notice") return scene;
  }
  return null;
}

/** 相手の 反応と ヒント（`◯◯` を 相談の 話題に 置きかえる）。 */
export function reactionFor(
  novel: Novel,
  consult: Extract<NovelScene, { type: "consult" }>,
  type: NovelFailureType,
): { text: string; en?: string; hint: string; hintEn?: string } {
  const base = consult.reactions?.[type] ?? novel.reactions[type];
  const fill = (text: string | undefined) => text?.replaceAll("◯◯", consult.topic);
  return {
    text: fill(base?.text) ?? "",
    en: base?.en?.replaceAll("◯◯", consult.topic),
    hint: fill(base?.hint) ?? "",
    hintEn: base?.hintEn,
  };
}

/** 失敗の 型ごとの 相手の 顔（せめる・勝手に 決める・隠す は こまった 顔）。 */
export function reactionFace(type: NovelFailureType): NovelFace {
  return type === "blaming" || type === "decided_alone" || type === "hiding"
    ? "troubled"
    : "neutral";
}

/** 足りない 番号（1回目の 失敗で カードの その 番号を 光らせる）。 */
export function missingParts(judgment: {
  hasContext: boolean;
  hasProblem: boolean;
  hasAsk: boolean;
}): (1 | 2 | 3)[] {
  const out: (1 | 2 | 3)[] = [];
  if (!judgment.hasContext) out.push(1);
  if (!judgment.hasProblem) out.push(2);
  if (!judgment.hasAsk) out.push(3);
  return out;
}

/** 失敗を 1つ 足す（聞き取れない は 数えない）。 */
export function addFailure(
  attempts: Readonly<Record<string, NovelAttempt>>,
  consultId: string,
  type: NovelFailureType,
): Record<string, NovelAttempt> {
  if (type === "unclear_audio") return { ...attempts };
  const now = attempts[consultId] ?? { fails: 0, types: [] };
  return { ...attempts, [consultId]: { fails: now.fails + 1, types: [...now.types, type] } };
}

/** いちばん 多かった 失敗の 型（同じ 数なら 先に 出た もの）。1つも 無ければ null。 */
export function mostCommonFailure(
  attempts: Readonly<Record<string, NovelAttempt>>,
): NovelFailureType | null {
  const counts = new Map<NovelFailureType, number>();
  for (const attempt of Object.values(attempts)) {
    for (const type of attempt.types) {
      if (type === "unclear_audio") continue;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  let best: NovelFailureType | null = null;
  let bestCount = 0;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

/** その 教材の 相談の 場面（ぜんぶの 日・順に）。 */
export function allConsults(novel: Novel): Extract<NovelScene, { type: "consult" }>[] {
  return novel.days.flatMap((day) =>
    day.scenes.filter(
      (scene): scene is Extract<NovelScene, { type: "consult" }> => scene.type === "consult",
    ),
  );
}

/** 失敗の 型の 日本語の 名前（まとめの 画面）。 */
export const FAILURE_LABELS: Record<NovelFailureType, string> = {
  vague: "あいまい",
  no_ask: "質問が ない",
  blaming: "相手を せめる",
  decided_alone: "勝手に 決める",
  hiding: "問題を 隠す",
  off_topic: "話が ちがう",
  unclear_audio: "聞き取れない",
};
