"use client";

import { createJsonListStore } from "@/lib/json-asset-store";
import type { WordStage } from "@/content/schema";

/**
 * 単語テストの セットを **ブラウザが 取りに 行く**（2026-09-03）
 *
 * `/wordtest` は セット 10本を まるごと `ArcadeGame` に 渡して いた。213KB の
 * データが **作りおき 1.1MB** に なる（サーバ部品→クライアント部品の 受け渡しは
 * HTML と RSC の 両方に 積まれる）。理由と 実測は `src/lib/json-asset-store.ts`。
 *
 * 213KB・gzip 37KB。一覧の 行（見出し・語数）は 13KB しか ないので **サーバで 描いたまま**
 * ——押す ものは すぐ 出て、重い 中身だけが あとから 追いつく。
 */

/** 書き出し先は `scripts/lib/bake_wordsets.ts` の `WORDSETS_URL` と そろえる。 */
export const useLearnerWordSets = createJsonListStore<WordStage>("/wordtest/sets.json");
