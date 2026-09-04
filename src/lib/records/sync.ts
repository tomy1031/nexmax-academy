/**
 * 端末の きろくを 台帳へ 写す — **変わったぶんだけ、10秒に 1回**
 *
 * ## 何を 解いた ものか
 * 教材の 進み具合（`content:<id>`）と リスニングで 当てた ことば（`listening:<id>`）は、
 * ずっと **その端末の localStorage にしか 無かった**。学習者の 画面は 数えて いるのに
 *（ステージの「4つ中2つ おわった」）、先生からは **一度も** 見えず、端末を 変えれば
 * 学期ぶんが 消えた。
 *
 * ## なぜ 画面ごとに 送らないか
 * 記録する 場所は 11種別に 散って いる（まんが・ページ・スライド・リスニング・
 * もんだい・たいわ・ミーティング・ことば・リンク・スキット・クエスト）。そこへ
 * 1つずつ 通信を 書き足すと、**1か所 書き忘れた 教材だけが 先生から 見えない**
 * ——しかも 抜けて いる ことは 画面のどこにも 出ない（2026-08-26 の
 * 「DBだけが 遅れる」事故と 同じ 型）。だから **端末の 保存を 走査して 写す**
 * 1か所に する。教材を 足しても、ここに 手を 入れる 必要が ない。
 *
 * ## 書く 回数（Cloudflare $5 / Supabase の 枠）
 * 教室は ふつう 1本の 回線＝**1つの IP** から 出るので、書き込みは 人数ぶん 同じ 枠を
 * 削り合う（docs/deploy.md §0.10）。だから:
 *
 *   * ためる 時間は **10秒**。まんがを 20ページ めくっても 送るのは 1回。
 *   * **前に 送った ものと 同じなら 送らない**（`records-sent` に 写しを 置く）。
 *     開き直すだけの 学習者は 0回。
 *   * 1回の 送りは **表ごとに 1つの upsert**（行が 何本 あっても 往復は 1）。
 *   * 画面を 閉じる とき（`pagehide` / タブを 隠す）にも 流す——授業の チャイムで
 *     閉じた ぶんが 消えない ように。
 *
 * 1人が 1コマ 学ぶと、進み具合は だいたい **2〜6回**（開いた／おわった／しおり）。
 * 30人 × 45分でも 数百回で、`quiz_results` の 1回ぶんと 変わらない。
 *
 * ## 落ちない・止めない
 * 台帳は **あとから 見る ため**の もので、いま 学んで いる 人の ためでは ない。
 * 鍵が 無くても（デモモード）、ログインして いなくても、通信が 落ちても、
 * 学習は そのまま 進む。だから ここは 何が あっても 投げない。
 * ただし **黙って 消える**のは 別の 問題なので、supabase-js が 投げずに 返す
 * `{ error }` は 必ず 受けて 開発時に 出す。
 */
"use client";

import {
  CONTENT_KEY_PREFIX,
  LISTENING_KEY_PREFIX,
  contentIdOfKey,
  defaultBackend,
  listeningIdOfKey,
  readContentProgress,
  readListeningResult,
  type ProgressBackend,
} from "@/lib/progress/store";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

/** 送った ものの 写し。ここに あるのと 同じなら 送り直さない。 */
const SENT_KEY = `${NAMESPACE}:records-sent`;

/**
 * ためる 時間。
 *
 * 短くすると 書き込みが 増え、長くすると 先生の 画面が 遅れる。10秒に したのは、
 * まんが1本を めくり切る 時間（1〜3分）より じゅうぶん 短く、かつ 1ページごとの
 * 記録を 確実に 1回に たためる 長さだから。
 */
export const FLUSH_DELAY_MS = 10_000;

/**
 * 1回に 送る 行の 上限。
 *
 * ふだんは 数行しか 溜まらない。効くのは **鍵の 無い デモモードで 学期ぶん ためた
 * 端末が、はじめて ログインした 瞬間**で、そこで 何百行を 1回で 送ると
 * タイムアウトして **1行も 入らない**。上限を 置けば、残りは 次の 流しで 入る。
 */
const MAX_ROWS = 100;

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/* ------------------------------------------------------------------ *
 * 送る かたち
 * ------------------------------------------------------------------ */

/**
 * 送る 列は これだけ。**時こくの 列（`completed_at` / `updated_at`）は 送らない**——
 * 打つのは DB（移行SQL の トリガ）である。ブラウザに 打たせると 時計の 狂った 1台で
 * 並びが 崩れ、しかも 読み直すたびに「おわった とき」が 上書きされる。
 */
export interface ContentProgressRow {
  readonly profile_id: string;
  readonly content_id: string;
  readonly status: "started" | "completed";
  readonly position: Record<string, number>;
}

export interface ListeningResultRow {
  readonly profile_id: string;
  readonly listening_id: string;
  readonly inputs: string[];
  readonly reveal_percent: number;
  readonly keywords_left: number;
}

/**
 * 送る 行と、その もとに なった 端末の 鍵・写しの 印。
 *
 * 3つを 束ねて 持つのは、**送れた 行だけに 印を つける**ため。行と 印を 別々の
 * 入れ物で 運ぶと、片方だけ 落ちた ときに「送って いないのに 送った 印」が つき、
 * その 記録は **二度と 送られない**（黙って 消える いちばん 悪い かたち）。
 */
export interface PendingRow<Row> {
  readonly key: string;
  readonly fingerprint: string;
  readonly row: Row;
}

export interface PendingRecords {
  readonly progress: readonly PendingRow<ContentProgressRow>[];
  readonly listening: readonly PendingRow<ListeningResultRow>[];
}

type SentMap = Record<string, string>;

function readSent(backend: ProgressBackend): SentMap {
  const raw = backend.get(SENT_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    // 壊れた 写しは「まだ 何も 送って いない」として 扱う（もう一度 送るだけ）。
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as SentMap)
      : {};
  } catch {
    return {};
  }
}

function writeSent(backend: ProgressBackend, sent: SentMap): void {
  backend.set(SENT_KEY, JSON.stringify(sent));
}

/**
 * 端末を 走査して、**前に 送ってから 変わった ぶん**だけを 組み立てる。
 *
 * 純関数に して あるので、ブラウザが 無い ところでも 単体テストで 確かめられる。
 */
export function collectPending(
  profileId: string,
  backend: ProgressBackend = defaultBackend(),
): PendingRecords {
  const sent = readSent(backend);
  const progress: PendingRow<ContentProgressRow>[] = [];
  const listening: PendingRow<ListeningResultRow>[] = [];

  for (const key of backend.keys(CONTENT_KEY_PREFIX)) {
    if (progress.length >= MAX_ROWS) break;
    const contentId = contentIdOfKey(key);
    if (contentId === "") continue;
    const value = readContentProgress(contentId, backend);
    if (!value) continue;
    const position = value.position ?? {};
    const fingerprint = `${value.status}:${JSON.stringify(position)}`;
    if (sent[key] === fingerprint) continue;
    progress.push({
      key,
      fingerprint,
      row: { profile_id: profileId, content_id: contentId, status: value.status, position },
    });
  }

  for (const key of backend.keys(LISTENING_KEY_PREFIX)) {
    if (listening.length >= MAX_ROWS) break;
    const listeningId = listeningIdOfKey(key);
    if (listeningId === "") continue;
    const value = readListeningResult(listeningId, backend);
    // 1つも 当てて いない 行は 送らない（「開いただけ」は 進み具合が すでに 持って いる）。
    if (value.inputs.length === 0) continue;
    const fingerprint = JSON.stringify(value);
    if (sent[key] === fingerprint) continue;
    listening.push({
      key,
      fingerprint,
      row: {
        profile_id: profileId,
        listening_id: listeningId,
        inputs: [...value.inputs],
        reveal_percent: value.revealPercent,
        keywords_left: value.keywordsLeft,
      },
    });
  }

  return { progress, listening };
}

export function pendingCount(pending: PendingRecords): number {
  return pending.progress.length + pending.listening.length;
}

/* ------------------------------------------------------------------ *
 * 流す
 * ------------------------------------------------------------------ */

/** 同時に 2つ 流れない ようにする（タブの 切り替えと 時間切れが 重なる）。 */
let flushing = false;

/**
 * ためた ぶんを 送る。**送れた ものだけ**「送った」と 印を つける。
 *
 * 送れなかった ら 印を つけない——次の 流しで もう一度 送れる
 *（`flushMeetingTurns` と 同じ 流儀。黙って 消えるのを 作らない）。
 */
export async function flushRecords(backend: ProgressBackend = defaultBackend()): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const supabase = createClient();
    if (!supabase) return;
    const profileId = await readOwnId(supabase).catch(() => null);
    // ログインして いない（デモモード）ときは **印を つけずに 残す**。
    // 消すと、あとで ログインしても もう 送れない。
    if (!profileId) return;

    const pending = collectPending(profileId, backend);
    if (pendingCount(pending) === 0) return;

    const done: SentMap = {};
    const mark = (rows: readonly PendingRow<unknown>[]) => {
      for (const { key, fingerprint } of rows) done[key] = fingerprint;
    };

    if (pending.progress.length > 0) {
      const { error } = await supabase.from("content_progress").upsert(
        pending.progress.map((one) => one.row),
        { onConflict: "profile_id,content_id" },
      );
      if (error) warn("進み具合", error);
      else mark(pending.progress);
    }

    if (pending.listening.length > 0) {
      const { error } = await supabase.from("listening_results").upsert(
        pending.listening.map((one) => one.row),
        { onConflict: "profile_id,listening_id" },
      );
      if (error) warn("リスニング", error);
      else mark(pending.listening);
    }

    if (Object.keys(done).length > 0) writeSent(backend, { ...readSent(backend), ...done });
  } catch {
    // 写せなくても 学習は 続く（台帳は あとから 見る ための もの）
  } finally {
    flushing = false;
  }
}

function warn(what: string, error: { code?: string; message: string }): void {
  // 表が まだ 無い（移行SQL 未適用）のは 壊れて いるのでは ない。静かに 諦める。
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return;
  console.warn(`[records] ${what}を 写せませんでした:`, error.message);
}
