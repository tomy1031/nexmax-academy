/**
 * 作りおき（KVキャッシュ）が本当に入ったかの見分け — STG も本番も同じ規則で見る。
 *
 * **「デプロイ成功」は「作りおきが入った」ではない。** KV の書き込み枠
 * （1000件/日）を使い切ると `populateCache` は中で落ちるのに、外へは
 * 成功として返ることがある——2026-08-26 の STG デプロイは 0件のまま
 * 「成功」で終わっていた（docs/deploy.md §0.9）。
 *
 * 作りおきが1件も無い版は、全アクセスがフルSSRになる。無料プランでは
 * それだけで CPU 上限（1リクエスト10ms）を超え、授業の人数が来れば
 * Error 1102 で入れなくなる。だから **終了コードだけを信じない**で、
 * 「何件入れたか」の一行が出ているところまで確かめる。
 *
 * **2026-08-27 から、STG では そもそも 温めない**（`shouldPopulateRemoteCache`）ので
 * ここを 通るのは **本番**（`cf:deploy`）と、KVモードで 上げる 例外的な エイリアスだけ。
 * 2026-08-26 の 事故（0件のまま「成功」）を 見張る 役目は 本番側で 続いている。
 *
 * 置き場所を分けている理由: STG は `scripts/preview_alias.mjs` が自前で
 * `populateCache` を呼ぶが、本番は `opennextjs-cloudflare deploy` が中で呼ぶ。
 * 入口は違っても **見分ける規則は1つ**にしておく（ずれると片方だけ素通りする）。
 */

/** 上げてよいと言い切れるときだけ true。 */
export function cachePopulated(status, output) {
  if ((status ?? 1) !== 0) return false;
  // opennextjs-cloudflare が最後に出す一行。件数が 0 のときは入っていない。
  const matched = /Successfully populated cache with (\d+) entries/i.exec(output);
  if (!matched) return false;
  return Number(matched[1]) > 0;
}

/** 止めるときに出す説明。STG も本番も同じことを言う。 */
export const CACHE_EMPTY_MESSAGE = [
  "",
  "✗ 作りおき（KVキャッシュ）が入りませんでした。**この版を使ってはいけません。**",
  "",
  "  作りおきが1件も無い版は、全アクセスがフルSSRになります。無料プランの",
  "  CPU 上限（1リクエスト10ms）を超えて Error 1102 が出て、授業で人が入れません",
  "  （docs/deploy.md §0.9・§0.10）。",
  "",
  "  いちばん多い原因は KV の書き込み枠（1000件/日）切れです。1回のデプロイが",
  "  約75件書くので、1日13回で尽きます。枠が戻るのは UTC 0時＝カンボジア朝7時・",
  "  日本の朝9時。それまでは上げ直さず、**前の版のまま置いておく**ほうが安全です",
  "  （前の版の作りおきは生きています）。",
  "",
].join("\n");
