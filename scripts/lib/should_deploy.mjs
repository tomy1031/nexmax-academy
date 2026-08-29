/**
 * 本番へ 出す 必要が あるかの 見分け — 授業前の cron が 5本 あっても 出るのは 1回。
 *
 * **なぜ 要るか。** 2026-08-28（金）、唯一の cron（17:05 ICT）が **11時間5分 遅れて**
 * 届き、授業に 間に合わなかった。ラン自体は 成功して いるので 設定ミスでは なく、
 * GitHub が 時刻に 配らなかった（docs/deploy.md §0.11）。
 * そこで cron を **5本**（16:12〜17:12 ICT）に 増やした。
 *
 * ただし **そのままだと 1日 5回 本番へ 出る**。1回の 本番デプロイは KV へ 約75件 書き、
 * 枠は 1000件/日。授業中の ISR で 240〜480件 使う ことも あるので、5回 出すと
 * その日の 夕方に 枠が 尽きて「出せば 出すほど 壊れる」状態に なる（§0.6・§0.9）。
 *
 * だから **起こす 回数**と **出す 回数**を 切り離す。判断の 材料は 本番自身が 返す
 * `/api/version`（ビルド時の コミットSHA と 時刻。next.config.ts）だけなので、
 * **どこにも 状態を 保存しなくてよい**。
 *
 * 迷ったら **出す 側に 倒す**（fail-open）。本番が 落ちて いる・URL が 変わったと
 * いった ときに、黙って 出さなく なる ほうが 害が 大きい。
 */

/** 出すかどうかを決める。`{ needed, reason }` を返す。 */
export function shouldDeploy({ live, deploySha, nowMs, quietMinutes = 30 }) {
  // 読めなかった（本番が落ちている・JSON が壊れている等）→ 出す。
  if (!live || typeof live.sha !== "string" || live.sha === "") {
    return {
      needed: true,
      reason: "本番の /api/version が 読めません。安全側に 倒して 出します。",
    };
  }

  if (live.sha === deploySha) {
    return { needed: false, reason: "本番は すでに この コミットです。出しません（KV 0件）。" };
  }

  const builtMs = Date.parse(live.builtAt ?? "");
  if (Number.isNaN(builtMs)) {
    return { needed: true, reason: "本番の builtAt が 読めません。安全側に 倒して 出します。" };
  }

  const ageMin = Math.floor((nowMs - builtMs) / 60000);
  if (ageMin < quietMinutes) {
    return {
      needed: false,
      reason: `さっき 出した ばかりです（前の ビルドから ${ageMin} 分 / ${quietMinutes} 分 未満）。出しません（KV 0件）。次の cron が 拾います。`,
    };
  }

  return {
    needed: true,
    reason: `中身が 違い（${live.sha.slice(0, 7)} → ${deploySha.slice(0, 7)}）、前の ビルドから ${ageMin} 分 たって います。出します。`,
  };
}
