"use client";

import { useSyncExternalStore } from "react";
import type { DictionaryEntry } from "@/lib/dictionary";

/**
 * ポップアップ辞書を **ブラウザが 取りに 行く**（2026-09-03）
 *
 * 前は サーバで 701語を 読んで ページの props に 入れて いた。すると 読みもの・
 * もんだい・ミーティングの どのページにも 同じ 辞書が 丸ごと 入り、**作りおき 1件が
 * 1.5MB**に なる（辞書を 渡さない 同じ 読みものは 32KB）。作りおきに **当たって いても**
 * Worker は その 1.5MB を 毎回 JSON から 起こし直して 指紋を 取り直すので、
 * 1リクエスト 50〜137ms かかって いた。無料枠の CPU 上限は 10ms
 *（docs/deploy.md §0.13・scripts/lib/bake_dictionary.ts）。
 *
 * いまは `public/dictionary/learner.json`（250KB・gzip 49KB）を ブラウザが 1回だけ
 * 取る。`public/` の ファイルは Cloudflare が **Worker を 起こさずに** 返すので、
 * この ぶんの CPU は 0 に なる。
 *
 * ## 取れるまでの あいだ
 * 本文は ふつうに 出る（ルビは 教材 自身の 読み辞書が 付ける）。取れた 時点で
 * 下線と ふきだしが 足される。**取れなくても 本文は 読める**——ここが 落ちても
 * 学習が 止まらない ように、意図して この 順に して ある。
 *
 * ## 1回しか 取らない
 * 束は モジュールに 1つ 持つ。ページを 行き来しても（画面内の 移動なら）取り直さない。
 */

/** 書き出し先は `scripts/lib/bake_dictionary.ts` の `DICTIONARY_URL` と そろえる。 */
const DICTIONARY_URL = "/dictionary/learner.json";

const EMPTY: readonly DictionaryEntry[] = [];

let entries: readonly DictionaryEntry[] = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function fetchOnce(): void {
  if (started) return;
  started = true;
  void fetch(DICTIONARY_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => {
      if (!Array.isArray(data) || data.length === 0) return;
      entries = data as readonly DictionaryEntry[];
      for (const notify of listeners) notify();
    })
    .catch(() => {
      /* 取れなくても 本文は 読める（下線と ふきだしが 出ないだけ）。 */
    });
}

function subscribe(onChange: () => void): () => void {
  fetchOnce();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * 学習者に 出す 辞書。**取れるまでは 空**（本文は そのまま 出る）。
 *
 * サーバでの 描画では 必ず 空に なる —— それが ねらいで、ここに 中身が 入ると
 * 作りおきが また ふくらむ。
 */
export function useLearnerDictionary(): readonly DictionaryEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => entries,
    () => EMPTY,
  );
}
