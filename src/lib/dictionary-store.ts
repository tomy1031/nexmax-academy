"use client";

import { createJsonListStore } from "@/lib/json-asset-store";
import type { DictionaryEntry } from "@/lib/dictionary";

/**
 * ポップアップ辞書を **ブラウザが 取りに 行く**（2026-09-03）
 *
 * 前は サーバで 701語を 読んで ページの props に 入れて いた。すると 読みもの・
 * もんだい・ミーティングの どのページにも 同じ 辞書が 丸ごと 入り、**作りおき 1件が
 * 1.5MB**に なる（辞書を 渡さない 同じ 読みものは 32KB）。理由と 実測は
 * `src/lib/json-asset-store.ts` と `scripts/lib/bake_dictionary.ts`。
 *
 * 250KB・gzip 49KB。取れるまでの あいだも **本文は ふつうに 読める**
 *（ルビは 教材 自身の 読み辞書が 付ける）。取れた 時点で 下線と ふきだしが 足される。
 */

/** 書き出し先は `scripts/lib/bake_dictionary.ts` の `DICTIONARY_URL` と そろえる。 */
export const useLearnerDictionary = createJsonListStore<DictionaryEntry>(
  "/dictionary/learner.json",
);
