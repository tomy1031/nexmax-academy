/**
 * デプロイで 入れ替わった 部品（JS/CSS）を 取りに行って 失敗した、を 見分ける。
 *
 * ## なにが 起きているか
 * Cloudflare Workers の 静的アセットは **いま出ているデプロイの分しか 置かれない**。
 * ファイル名には 中身のハッシュが入る（`app/map/page-106e9023f0b62dd6.js`）ので、
 * 新しいデプロイが 入った瞬間に **古い名前は 404** になる。
 * ずっと開いたままのタブは 古い名前のまま 次のページを取りに行くため、
 * `ChunkLoadError` が出て、Next の 既定のエラー画面（英語の "This page couldn't load"）
 * に なる。学習者は 何が起きたか 分からず、そこで 止まる。
 *
 * 直しかたは 更新（再読み込み）だけ——サーバは 正しい新しい名前を返すので、
 * 一度 読み直せば 必ず 直る。だから **アプリが 自分で 読み直す**（src/app/global-error.tsx）。
 *
 * ## 見分けかた
 * ブラウザごとに 文言が 違うので 名前と 文言の 両方で 見る。
 *  - webpack: `ChunkLoadError` / "Loading chunk 5823 failed" / "Loading CSS chunk"
 *  - Chrome:  "Failed to fetch dynamically imported module"
 *  - Firefox: "error loading dynamically imported module"
 *  - Safari:  "Importing a module script failed"
 *
 * サーバ側で起きたエラーは 本番では 文面が伏せられる（digest だけ）ので、ここには
 * 引っかからない＝読み直しは 起きない。読み直しても 直らない失敗で 往復しないため。
 */

/** 部品の取りこぼしだけに 当てる。ふつうの不具合で 読み直すと 原因が 見えなくなる。 */
const STALE_ASSET_MESSAGE =
  /loading chunk|loading css chunk|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

export function isStaleAssetError(error: unknown): boolean {
  if (typeof error === "string") return STALE_ASSET_MESSAGE.test(error);
  if (!error || typeof error !== "object") return false;

  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return typeof message === "string" && STALE_ASSET_MESSAGE.test(message);
}

/** 自動で読み直した時刻の しるし。タブを閉じれば消える（sessionStorage）。 */
export const RELOAD_MARK = "nexmax:stale-asset-reload";

/** この間に 二度目が来たら、読み直しでは 直らないと みなす。 */
export const RELOAD_GAP_MS = 30_000;

/**
 * いま 自動で 読み直してよいか（よければ しるしを 付けて true）。
 *
 * **読み直しの ループを 作らないことが 最優先**。直前に 自動で読み直したばかりなら
 * false を返し、画面は ボタン（手で押す）に 切り替える。しるしを 置けない設定の
 * ブラウザでも false ——「押せば直る」に 落ちるだけで、ぐるぐる回るよりは よい。
 */
export function takeReloadTicket(
  store: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  now: number,
): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(RELOAD_MARK));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GAP_MS) return false;
    store.setItem(RELOAD_MARK, String(now));
    return true;
  } catch {
    // プライベートモード等で 書けないことがある。読み直しは あきらめる。
    return false;
  }
}
