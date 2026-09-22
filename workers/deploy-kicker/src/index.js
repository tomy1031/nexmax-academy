/**
 * deploy-kicker — 授業前の 本番デプロイを **時間通りに** 起こす ための 外の 時計。
 *
 * **なぜ 要るか。** GitHub の `schedule`（cron）は この リポジトリでは
 * **毎回 3〜5時間 遅れて** 届く。2026-09-01〜09-18 の 46本を 測った 結果:
 *
 * | イベント | ラン作成までの 時間 |
 * | --- | --- |
 * | `push` | **3秒**（直近20本 すべて） |
 * | `schedule` | **3時間15分〜4時間43分**（中央値 3時間45分・最大 11時間） |
 *
 * cron を 5本に 増やす 対策（2026-08-29・docs/deploy.md §0.11）は **効かなかった**。
 * 5本とも 同じだけ 遅れる＝ 別々の 待ち行列では なく 同じ 1つの 遅れだった から。
 * 時差でも ない（`12 9 UTC` = `16:12 ICT` は 正しい）。遅れ幅が 日ごとに 88分 ぶれるので
 * 固定の ずれでも なく、時刻を 早めても 直らない。
 *
 * **`push` が 3秒で 走る** 以上、詰まって いるのは Actions では なく
 * **schedule の 配達**だけ。だから 時計を GitHub の 外（ここ）へ 出して、
 * `workflow_dispatch` を 叩く。Cloudflare の Cron Trigger は 秒〜分の 精度で 届く。
 *
 * **出しすぎない 仕組みは ワークフロー側に ある。** ここは ただ 起こすだけで、
 * 出すか どうかは デプロイ側の「出す必要が あるか 決める」
 * （`scripts/lib/should_deploy.mjs`）が 本番の `/api/version` を 見て 決める。
 * 中身が 同じ／前の ビルドから 30分 未満 なら 空振りに なり、KV を 1件も 使わない。
 * だから ここが 2回 起こしても 本番へ 出るのは 必要な ときだけ。
 *
 * 設定:
 *   - secret `GITHUB_TOKEN` … 細粒度 PAT（このリポジトリのみ・Actions: Read and write）
 *   - var    `GITHUB_REPO`  … "tomy1031/nexmax-academy"
 *   - var    `WORKFLOW`     … "deploy.yml"
 *   - var    `PROD_URL`     … "https://academy.nexmax.workers.dev"
 */

const UA = "nexmax-deploy-kicker";

/** GitHub の workflow_dispatch を 叩く。 */
async function kick(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      "Content-Type": "application/json",
    },
    // ref=main は cron と 同じ（schedule は 既定ブランチで 始まる）。
    // target=auto が「cron と 同じ 道」＝ integration を 取り込む → 検査 →
    // main を 早送り → 本番へ 出す、を 通す。
    body: JSON.stringify({ ref: "main", inputs: { target: "auto" } }),
  });
  // 成功は 204 No Content。
  if (res.status !== 204) {
    const body = await res.text();
    throw new Error(`workflow_dispatch が 失敗しました: ${res.status} ${body.slice(0, 300)}`);
  }
}

/** 本番と integration が そろって いるかを 読むだけで 見る（鍵は 要らない）。 */
async function status(env) {
  const headers = { "User-Agent": UA, Accept: "application/vnd.github+json" };
  const [liveRes, refRes] = await Promise.all([
    fetch(`${env.PROD_URL}/api/version`, { headers: { "User-Agent": UA } }),
    fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/commits/integration`, { headers }),
  ]);
  const live = liveRes.ok ? await liveRes.json() : null;
  const integration = refRes.ok ? (await refRes.json()).sha : null;
  return {
    prodSha: live?.sha ?? null,
    prodBuiltAt: live?.builtAt ?? null,
    integrationSha: integration,
    same: Boolean(live?.sha && integration && live.sha === integration),
  };
}

const handler = {
  /** Cron Trigger（UTC）。wrangler.jsonc の triggers.crons を 参照。 */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const before = await status(env);
        if (before.same) {
          console.log(`本番は すでに integration と 同じ（${before.prodSha}）。起こしません。`);
          return;
        }
        await kick(env);
        console.log(
          `起こしました cron=${event.cron} 本番=${before.prodSha} → integration=${before.integrationSha}`,
        );
      })(),
    );
  },

  /** 目で 見る ための 状態。鍵は 出さない。デプロイは ここからは 起こせない。 */
  async fetch(request, env) {
    const s = await status(env);
    return Response.json(
      { ...s, note: "読むだけの 画面です。ここから デプロイは 起きません。" },
      { headers: { "cache-control": "no-store" } },
    );
  },
};

export default handler;
