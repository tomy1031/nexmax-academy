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
 *   - service `PROD`        … 本番の Worker `academy`（PROD_URL へは これを 通して 行く）
 */

const UA = "nexmax-deploy-kicker";

/**
 * 鍵の 権限を 試す ときに 頼む ref。`..` を 含む 名前は git の ブランチに できないので、
 * GitHub は 必ず「No ref found」（422）で 断り、ランは 1本も 作られない。
 */
const PROBE_REF = "deploy-kicker..permission-probe";

/** GitHub の workflow_dispatch に 頼む（中身は body）。 */
function dispatch(env, body) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW}/dispatches`;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** 断られた ときの 番号を、何を 直せば よいかの 文に する。 */
function explainRefusal(status) {
  if (status === 401) return "鍵が 無効（期限切れ・消された・入れ間違い）。作り直して 入れ直す";
  if (status === 403)
    return "鍵に「Actions: Read and write」が 無い（Repository access に nexmax-academy が あるかも 見る）。鍵の 編集画面で 足す";
  if (status === 404) return "鍵から nexmax-academy が 見えない。Repository access に 足す";
  return `GitHub が ${status} で 断った`;
}

/** GitHub の workflow_dispatch を 叩く。 */
async function kick(env) {
  // ref=main は cron と 同じ（schedule は 既定ブランチで 始まる）。
  // target=auto が「cron と 同じ 道」＝ integration を 取り込む → 検査 →
  // main を 早送り → 本番へ 出す、を 通す。
  const res = await dispatch(env, { ref: "main", inputs: { target: "auto" } });
  // 成功は 204 No Content。
  if (res.status !== 204) {
    const body = await res.text();
    throw new Error(
      `workflow_dispatch が 失敗しました: ${res.status} ${explainRefusal(res.status)} ${body.slice(0, 300)}`,
    );
  }
}

/**
 * 鍵で 起こせるかを、デプロイを 起こさずに 確かめる。
 *
 * 2026-10-12・10-13 は 起こそうと した 6回が すべて 例外で 終わり、1本も 起きなかった。
 * 本番と integration を 読む ところは 鍵で 通って いた（10-15 は「同じ」で 正しく 止まった）ので、
 * 読めても 起こせない 鍵だった ことに なる。授業の 当日に 初めて 分かるのでは 遅いので、
 * 状態の ページで いつでも 見られる ように する。
 *
 * 無い ref（PROBE_REF）で 頼むと、権限が あれば 422（No ref found）、権限が 無ければ 403、
 * 鍵が 無効なら 401 が 返る。どれでも ランは 作られない。
 */
async function probeDispatch(env) {
  if (!env.GITHUB_TOKEN)
    return { ok: false, status: null, reason: "鍵（GITHUB_TOKEN）が 入って いない" };
  const res = await dispatch(env, { ref: PROBE_REF });
  if (res.status === 422) return { ok: true, status: 422 };
  return { ok: false, status: res.status, reason: explainRefusal(res.status) };
}

/** 本番と integration が そろって いるかを 読むだけで 見る。 */
async function status(env) {
  const headers = { "User-Agent": UA, Accept: "application/vnd.github+json" };
  // 鍵なしの 読みは IP ごとに 60回/時。Cloudflare の 出口 IP は 共有なので 使い切られて いて
  // 403 に なる ことが ある（2026-10-11 実測）。鍵を 付けると 鍵ごとの 枠に なる。
  // 公開リポジトリなので Actions だけの 鍵でも 読める。
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  // 本番は サービスバインディングで 読む（同じ アカウントの workers.dev は 公開 URL で 呼べない・1042）
  const prodFetch = env.PROD ? (url, init) => env.PROD.fetch(url, init) : fetch;
  const [liveRes, refRes] = await Promise.all([
    prodFetch(`${env.PROD_URL}/api/version`, { headers: { "User-Agent": UA } }),
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

  /**
   * 目で 見る ための 状態。鍵は 出さない。デプロイは ここからは 起こせない。
   * `canDispatch.ok` が false なら、授業前に 時計が 起きても GitHub に 断られる。
   */
  async fetch(request, env) {
    const [s, canDispatch] = await Promise.all([status(env), probeDispatch(env)]);
    return Response.json(
      { ...s, canDispatch, note: "読むだけの 画面です。ここから デプロイは 起きません。" },
      { headers: { "cache-control": "no-store" } },
    );
  },
};

export default handler;
