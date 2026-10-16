/*
 * NexmaxAcademy への「おわった」の 合図（アプリ側で 足した ファイル。ゲーム本体では ない）
 *
 * ゲーム「空気読み〜IT業界編〜」を アプリの「リンク」教材として iframe で 開いた とき、
 * **50ステージを 1回ずつ 遊び終えたら** 親の 画面へ `nexmax:link-done` を 1回 送る。
 * 親（`src/components/link/link-view.tsx`）は 同じ 置き場からの 合図だけを 受け、
 * 学習の 記録に「おわった」を 残す。
 *
 * - 画面には 何も 出さない（2026-10-16 の 指定「UIその他は変えないでそのままに」）。
 * - 単独で 開いた とき（iframe で ない）は 何も しない。
 * - ゲームの `KY.store.recordBest`（1ステージ ごとの 記録）を 包んで、記録の あとに 数える。
 *   数え方は ゲームの タイトル画面と 同じ `KY.ui.progress()`（遊んだ 数／全部の 数）。
 * - ゲームが 名前を 変えて つながらなく なったら `tests/kuuki_yomi_tool.test.ts` が 落ちる。
 */
(function (root) {
  "use strict";
  /** アプリの 教材 id（`content/links/kuuki_yomi_game.json`）。 */
  var LINK_ID = "kuuki_yomi_game";
  var KY = root.KY;
  if (root.parent === root) return;
  if (!KY || !KY.store || !KY.ui || typeof KY.ui.progress !== "function") return;

  var sent = false;
  function notifyWhenAllPlayed() {
    if (sent) return;
    var progress = KY.ui.progress();
    if (!progress.ids.length || progress.played < progress.ids.length) return;
    sent = true;
    root.parent.postMessage({ type: "nexmax:link-done", id: LINK_ID }, root.location.origin);
  }

  var recordBest = KY.store.recordBest;
  KY.store.recordBest = function () {
    var result = recordBest.apply(this, arguments);
    notifyWhenAllPlayed();
    return result;
  };

  // 前の 日に もう ぜんぶ 遊んで いた 人の ぶん（開いた だけで 届く）
  notifyWhenAllPlayed();
})(window);
