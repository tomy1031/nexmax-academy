/**
 * 朝礼・夕礼の しおり — 5日を 1回の 授業で 終わらせない ための 保存
 *
 * ## なぜ ミーティングの しおりに 相乗りしないか
 * `resume.ts` の しおりは **しつもんの 番号・開いた札・答えた ことば・ハート**で
 * できて いる。こちらは **曜日**と **その日の けっか**で できて いて、
 * 同じ 欄が 1つも 無い。同じ 器に 押し込むと、片方を 直すたびに もう片方が
 * 黙って 動く（`AsakaiSession` を `MeetingSession` と 分けたのと 同じ 理由）。
 *
 * ## 戻す 単位は **日**（場面の 途中には 戻さない）
 * 設計 #366 の 1.3 は「途中で 閉じても だまって つづきから 始まる ので、
 * 授業 2回に 分けられます」。分ける 切れ目は **日**なので、水曜の 報告の
 * 途中で 閉じた 人は **水曜の はじめ**から 話し直す。
 *
 * 場面の 途中（開きかけの カード・チャットの 記録・聞き返しの 回数）まで 戻すと、
 * 保存する ものが 一気に 増えるうえ、**話の 途中から 再開する**ことに なる——
 * 相手が 何を 聞いた ところだったかを 学習者が 覚えて いない ので、
 * かえって 分からなく なる。1日は 4枚 ぶんの 短い やりとりで、話し直せる。
 *
 * ## 曜日は 数えない。**終わった日の けっか**が 正
 * `sceneAt` を 別に 持つと、`done` と ずれた ときに どちらが 正なのかが
 * データから 読めなく なる。終わった日の 数が そのまま 次の 曜日に なる。
 *
 * ## 5日 終わったら 消す
 * 話しきった 人が もう一度 開いたら **はじめから 話せる**のが 正しい
 *（`resume.ts` と 同じ 流儀）。完走の 記録は 進捗ストアの `completed` が 持つ。
 */

import { z } from "zod";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

/**
 * 1日の けっか。**合否に 数える もの**と、週の 表に 出す ものを 分けて 持つ。
 *
 * `units` の 意味は レベルで ちがう——かんたんは 開いた カードの 数、
 * むずかしいは 言えた 行の 数（`asakai.pass.units` と 同じ ものさし）。
 * ここで 数えて おかないと、週の おわりに 数え直せない
 *（そのころには その日の カードの 状態は もう 画面に 無い）。
 */
const dayResultSchema = z.object({
  day: z.string(),
  kind: z.enum(["asa", "yuu"]),
  cards: z.number().int().min(0),
  cardTotal: z.number().int().min(0),
  units: z.number().int().min(0),
  unitTotal: z.number().int().min(0),
  komariOpen: z.boolean().default(false),
  komariBoxes: z.number().int().min(0).default(0),
  komariTotal: z.number().int().min(0).default(0),
  probes: z.number().int().min(0).default(0),
  chips: z.array(z.object({ label: z.string(), open: z.boolean() })).default([]),
});

export type DayResult = z.infer<typeof dayResultSchema>;

/**
 * **報告の 途中**（その日の 板・聞き返しの 回数・チャット）。
 *
 * 2026-09-17 の 指定「回答結果が リセットされて しまう。曜日を 切り替えた 場合や
 * 画面を 切り替えた 場合。ストレージ保管して 再現できるように」。
 *
 * ここまでは **終わった 日**しか 残して いなかった（「戻す 単位は 日」）ので、
 * 火曜を 話しかけた まま 月曜の タブを 見に 行くと、戻った ときには 板が 空に なって いた。
 * 授業では「前の 日を もう一度 見る」が ふつうに 起きる。
 *
 * **日ごとに 1つ**持つ。1つだけ 持つ 形に すると、済んだ 日を 見に 行った だけで
 * 途中の 日が 消える。チャットも そのまま 残す——板だけ 戻して 会話が 空だと、
 * 相手が 何を 聞いた ところだったかが 画面から 読めない。
 */
const chatLineSchema = z.object({
  who: z.string().default(""),
  speakerId: z.string().default(""),
  text: z.string(),
  self: z.boolean().optional(),
  audio: z.string().optional(),
});

const panelStateSchema = z.object({
  id: z.string(),
  said: z.array(z.string()).default([]),
  open: z.boolean().default(false),
  full: z.boolean().default(false),
  gaveUp: z.boolean().default(false),
});

/**
 * その日 送った ことば 1本（きょうの 評価の「あなたの 回答」に 並ぶ）。
 *
 * **控えに 入れる**（2026-09-18 の 通しプレイ検収）。持って いなかった ころ、
 * 開き直した 直後は 空に 戻り、**❌ の 札が 押せなく なって いた**
 *（押せるかは「1本 送ったか」で 決めて いる）——打ち切られた すぐ あとに
 * やり直したい 人が、そこだけ 行き止まりに なる。ふりかえりの 中身も 消えて いた。
 */
const sayLogSchema = z.object({
  question: z.string().default(""),
  answer: z.string().default(""),
  heard: z.boolean().default(false),
  opened: z.number().int().min(0).optional(),
  /** この 1本で 進んだ 札の id（「あなたの 答え」を 項目ごとに 引くため）。 */
  panels: z.array(z.string()).optional(),
});

const asakaiDraftSchema = z.object({
  states: z.array(panelStateSchema).default([]),
  attempts: z.record(z.string(), z.number().int().min(0)).default({}),
  probes: z.number().int().min(0).default(0),
  askedId: z.string().nullable().default(null),
  lines: z.array(chatLineSchema).default([]),
  log: z.array(sayLogSchema).default([]),
});

export type AsakaiDraft = z.infer<typeof asakaiDraftSchema>;

/**
 * 端末に 残す かたち。
 *
 * 欄を 足す ときは **かならず `.default()` を 付ける**——付けないと
 * 古い しおりが まるごと 落ちて、**全員が 月曜に 戻る**（fable の 罠7）。
 */
const asakaiResumeSchema = z.object({
  meetingId: z.string(),
  done: z.array(dayResultSchema).default([]),
  /** 話しかけて いる 日（曜日の id → 途中）。終わった 日は `done` が 持つ。 */
  drafts: z.record(z.string(), asakaiDraftSchema).default({}),
});

export type AsakaiResume = z.infer<typeof asakaiResumeSchema>;

/** 画面が これから 始める ところ。 */
export interface AsakaiStart {
  /** 何日目から 始めるか（0始まり）。 */
  readonly sceneAt: number;
  /** 終わった日の けっか（週の 表に そのまま 出る）。 */
  readonly results: readonly DayResult[];
  /** 途中から 戻ったか（画面の 組み立てに 使う。**学習者には 出さない**）。 */
  readonly resumed: boolean;
}

export const FRESH_ASAKAI: AsakaiStart = { sceneAt: 0, results: [], resumed: false };

function keyOf(meetingId: string): string {
  return `${NAMESPACE}:asakai-resume:${meetingId}`;
}

/* ------------------------------------------------------------------ *
 * どこから 始めるか（純粋）
 * ------------------------------------------------------------------ */

/**
 * 保存されて いた ものから、始める ところを 決める。
 *
 * 規則は 3つ:
 * 1. 保存が 無い・空なら 月曜から
 * 2. 終わった日が 場面の 数に とどいて いれば 月曜から（＝完走ずみ。何度でも 話せる）
 * 3. 教材が 直されて 場面が 減った ときも、はみ出す なら 月曜から
 */
export function startAsakaiFrom(
  /* 見るのは `done` だけ（途中は 日ごとに 別で 読む）。 */
  saved: Pick<AsakaiResume, "done"> | null,
  sceneCount: number,
): AsakaiStart {
  const done = saved?.done ?? [];
  if (done.length === 0) return FRESH_ASAKAI;
  if (done.length >= sceneCount) return FRESH_ASAKAI;
  return { sceneAt: done.length, results: done, resumed: true };
}

/* ------------------------------------------------------------------ *
 * 読み書き
 * ------------------------------------------------------------------ */

export function readAsakaiResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): AsakaiResume | null {
  const raw = backend.get(keyOf(meetingId)) ?? "";
  if (raw === "") return null;
  try {
    const parsed = asakaiResumeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // 壊れた保存値は「まだ無い」として扱う（学習は続けられる）
    return null;
  }
}

export function saveAsakaiResume(
  meetingId: string,
  done: readonly DayResult[],
  backend: ProgressBackend = defaultBackend(),
): void {
  /* **途中（`drafts`）を 巻き込んで 消さない**——読んでから 書く。 */
  const drafts = readAsakaiResume(meetingId, backend)?.drafts ?? {};
  backend.set(keyOf(meetingId), JSON.stringify({ meetingId, done, drafts }));
}

/** その日の 途中を 読む（無ければ null）。 */
export function readAsakaiDraft(
  meetingId: string,
  day: string,
  backend: ProgressBackend = defaultBackend(),
): AsakaiDraft | null {
  return readAsakaiResume(meetingId, backend)?.drafts?.[day] ?? null;
}

/** その日の 途中を 残す（話すたび・板が 動くたび）。 */
export function saveAsakaiDraft(
  meetingId: string,
  day: string,
  draft: AsakaiDraft,
  backend: ProgressBackend = defaultBackend(),
): void {
  const saved = readAsakaiResume(meetingId, backend);
  const drafts = { ...(saved?.drafts ?? {}), [day]: draft };
  backend.set(keyOf(meetingId), JSON.stringify({ meetingId, done: saved?.done ?? [], drafts }));
}

/** その日が 終わったら 途中を 捨てる（けっかは `done` に 移る）。 */
export function clearAsakaiDraft(
  meetingId: string,
  day: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  const saved = readAsakaiResume(meetingId, backend);
  if (!saved) return;
  const drafts = { ...saved.drafts };
  if (!(day in drafts)) return;
  delete drafts[day];
  backend.set(keyOf(meetingId), JSON.stringify({ meetingId, done: saved.done, drafts }));
}

/** 完走したとき・やり直すときに 消す。 */
export function clearAsakaiResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.remove(keyOf(meetingId));
}

/** 端末に 残って いる ものを 読んで、始める ところを 組み立てる。 */
export function restoreAsakai(
  meetingId: string,
  sceneCount: number,
  backend: ProgressBackend = defaultBackend(),
): AsakaiStart {
  return startAsakaiFrom(readAsakaiResume(meetingId, backend), sceneCount);
}
