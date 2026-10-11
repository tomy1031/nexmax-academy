/**
 * watch — 本番の 見張りの 中身（判定と 知らせの 文）。Cloudflare に 依らない 部分だけを
 * ここに 置き、tests/watch_worker.test.ts が そのまま 読む。入口は src/index.js。
 *
 * **なぜ 要るか。** 本番の 異常（Error 1102・5xx・画面の エラー・教材の 消えかけ）は
 * これまで 学習者や 先生の 申告で はじめて 分かって いた。ここが 10分ごと
 * （授業の 時間は 5分ごと）に 外から 見て、**続いて いれば** 知らせる。
 *
 * 守る こと:
 *   - **1回の つまずきでは 知らせない。** その 回の 中で 2回 失敗するか、
 *     前の 回に 続いて 失敗した ときだけ。教材の 警告と DB の 不通は 2回 続いたら。
 *   - **鳴らしっぱなしに しない。** 新しい 異常で 1回、続いて いれば 2時間ごとに 1回、
 *     直ったら 1回。最初の 1回は「見張りを はじめました」（知らせ先の 試しを 兼ねる）。
 *   - **KV に 書かない。** 状態は Durable Object（SQLite・無料枠）に 1件だけ。
 *     見に 行く ページは 作りおき（force-static）・門番の 転送・作りおき しない API だけ
 *     ——どれも 作り直しを 起こさないので、本番の KV の 書き込み枠を 1件も 使わない。
 */

/** 見に 行く ところ。ログインは しない（鍵を 持たない）。 */
export const PROBES = [
  // 全員が 最初に 開く 画面。作りおき（force-static）なので Next の サーバは 起きない
  { id: "title", label: "タイトル画面", path: "/", ok: [200] },
  // 門番（src/middleware.ts）を 通る 道。ログインなしは タイトルへ 307 で 返る のが 正常
  { id: "gate", label: "まなびマップ（門番）", path: "/map", ok: [200, 307, 308] },
  // Next の サーバ本体と DB を 通る 道。warnings が 空なら 教材も 健康
  { id: "health", label: "教材の 健康しらべ", path: "/api/health/content", ok: [200] },
];

/** 1回の 見張りで 1つの ページを 試す 回数と 間（その 回の 中で「続いたか」を 見る）。 */
export const ATTEMPTS = 3;
export const RETRY_WAIT_MS = 20_000;
export const TIMEOUT_MS = 15_000;
/** 前の 回の 失敗を「続いた」と 数える 長さ（10分 間隔 ＋ ゆとり）。 */
export const CARRY_MS = 25 * 60_000;
/** 続いて いる 異常を もう一度 知らせる 間。 */
export const REMIND_MS = 2 * 60 * 60_000;
/** 画面の エラーを 数える 幅と、知らせる 数。端末ごとに 間引いて あるので 3件 ＝ ほぼ 3人。 */
export const CLIENT_ERROR_MINUTES = 15;
export const CLIENT_ERROR_THRESHOLD = 3;

/** 応答が 正常か を 見分ける。正常なら null、だめなら 短い 印。 */
export function classifyResponse(probe, status, bodyText = "") {
  if (probe.ok.includes(status)) return null;
  if (status >= 500) {
    if (/\b1102\b|exceeded resource limits|exceeded cpu/i.test(bodyText)) return "1102";
    if (/\b1101\b|threw (a javascript )?exception/i.test(bodyText)) return "1101";
  }
  return String(status);
}

/** 印を 人の ことばに する。 */
export function describeCode(code) {
  switch (code) {
    case "1102":
      return "Error 1102（Worker の 上限を 超えた）";
    case "1101":
      return "Error 1101（Worker が 例外で 止まった）";
    case "timeout":
      return `${TIMEOUT_MS / 1000}秒 待っても 返事が 無い`;
    case "network":
      return "つながらない";
    case "bad-json":
      return "返事の 形が おかしい（JSON で ない）";
    default:
      return `HTTP ${code}`;
  }
}

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(fetchImpl, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 1つの ページを 最大 ATTEMPTS 回 試す（成功したら そこで やめる）。
 * 返すのは 失敗の 数・最後まで だめなら その 印（code）・途中の 失敗の 印（lastFailCode）・
 * 健康しらべの 中身（取れたとき）。
 */
export async function runProbe(probe, { baseUrl, fetchImpl, sleep = sleepDefault }) {
  let failures = 0;
  let lastFailCode = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_WAIT_MS);
    let code = null;
    let body = null;
    try {
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}${probe.path}`, {
        redirect: "manual",
        headers: { "User-Agent": "nexmax-watch", "Cache-Control": "no-cache" },
      });
      // 本文は「だめな とき」と 健康しらべ だけ 読む（CPU を 使わない）
      if (probe.ok.includes(res.status) && probe.id !== "health") {
        await res.body?.cancel();
      } else {
        const text = await res.text();
        code = classifyResponse(probe, res.status, text);
        if (!code) {
          try {
            body = JSON.parse(text);
          } catch {
            code = "bad-json";
          }
        }
      }
    } catch (error) {
      code = error && error.name === "AbortError" ? "timeout" : "network";
    }
    if (!code) {
      return { id: probe.id, failures, attempts: attempt + 1, code: null, lastFailCode, body };
    }
    failures++;
    lastFailCode = code;
  }
  return {
    id: probe.id,
    failures,
    attempts: ATTEMPTS,
    code: lastFailCode,
    lastFailCode,
    body: null,
  };
}

/** 画面の エラーの 数を DB から 読む（鍵が 無ければ 見ない）。 */
export async function readClientErrors(env, fetchImpl) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { skipped: true };
  try {
    const res = await fetchWithTimeout(
      fetchImpl,
      `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/client_error_counts`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_minutes: CLIENT_ERROR_MINUTES }),
      },
    );
    if (!res.ok) return { failed: `HTTP ${res.status}` };
    const rows = await res.json();
    return { rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    return { failed: error && error.name === "AbortError" ? "timeout" : "network" };
  }
}

/** 健康しらべの 警告を 1つの 印に する（同じ 警告が 続いて いるかを 見る ため）。 */
function warningsKey(warnings) {
  return warnings.slice().sort().join("\n").slice(0, 500);
}

/**
 * その 回の 結果から「異常」を 作る。
 *   confirmed … 知らせて よい（続いて いる）
 *   suspect   … まだ 1回だけ。新しくは 知らせないが、開いて いる 異常は 閉じない
 * 返す next は、次の 回に 引き継ぐ もの（recentFail・pending）。
 */
export function judge(prev, probeResults, clientErrors, now) {
  const findings = [];
  const recentFail = {};
  const pending = {};
  const lastFail = prev?.recentFail ?? {};
  const lastPending = prev?.pending ?? {};

  for (const r of probeResults) {
    const probe = PROBES.find((p) => p.id === r.id);
    if (!probe) continue;

    // 健康しらべの 警告（教材が 隠れる・404 に なる）。2回 続いたら 知らせる
    const warnings = Array.isArray(r.body?.warnings) ? r.body.warnings : [];
    if (r.id === "health" && !r.code && warnings.length > 0) {
      const key = warningsKey(warnings);
      pending.health = key;
      findings.push({
        key: "content",
        level: lastPending.health === key ? "confirmed" : "suspect",
        text: `教材の 健康しらべに 警告 ${warnings.length}件 — ${String(warnings[0]).slice(0, 160)}`,
      });
    }

    if (r.failures === 0) continue;
    recentFail[r.id] = now;
    // 続いた ＝ この 回で 2回 失敗した か、前の 回に 続いて 失敗した。
    // 後者が 無いと「3割だけ 1102」の ような 間欠的な 異常を 拾えない（毎回 2回目で 通る）
    const carried = typeof lastFail[r.id] === "number" && now - lastFail[r.id] <= CARRY_MS;
    const level = r.failures >= 2 || carried ? "confirmed" : "suspect";
    const tail = r.code ? "" : "・いまは 通る";
    findings.push({
      key: `page:${r.id}`,
      level,
      text: `${probe.label}（${probe.path}）: ${describeCode(r.lastFailCode)}（${r.attempts}回中 ${r.failures}回 失敗${tail}）`,
    });
  }

  if (clientErrors && !clientErrors.skipped) {
    if (clientErrors.failed) {
      pending.db = true;
      findings.push({
        key: "db",
        level: lastPending.db ? "confirmed" : "suspect",
        text: `DB（Supabase）に 届かない: ${clientErrors.failed}`,
      });
    } else {
      const rows = clientErrors.rows ?? [];
      const total = rows.reduce((sum, row) => sum + (Number(row.n) || 0), 0);
      if (total >= CLIENT_ERROR_THRESHOLD) {
        const where = rows
          .slice(0, 3)
          .map(
            (row) =>
              `${row.path} ${row.n}件${row.kind === "stale" ? "（読み直しでも 直らず）" : ""}`,
          )
          .join("・");
        findings.push({
          key: "client-errors",
          level: "confirmed",
          text: `画面の エラーが ${CLIENT_ERROR_MINUTES}分で ${total}件（${where}）`,
        });
      }
    }
  }

  return { findings, recentFail, pending };
}

/** 時刻を カンボジア時間（UTC+7・夏時間 なし）で 短く。 */
export function ictLabel(now) {
  const d = new Date(now + 7 * 60 * 60_000).toISOString();
  return `${d.slice(5, 10).replace("-", "/")} ${d.slice(11, 16)} ICT`;
}

/**
 * 前の 状態と その 回の 異常から、知らせる 文と 次の 状態を 決める。
 * 知らせは 1回に 1通まで（まとめて 送る）。
 */
export function decide(prev, judged, now, prodUrl) {
  const open = { ...(prev?.open ?? {}) };
  const fresh = [];
  const reminded = [];
  const recovered = [];

  const byKey = new Map(judged.findings.map((f) => [f.key, f]));
  for (const f of judged.findings) {
    const was = open[f.key];
    if (f.level === "confirmed") {
      if (!was) {
        open[f.key] = { since: now, notifiedAt: now, text: f.text };
        fresh.push(f.key);
      } else {
        const remind = now - was.notifiedAt >= REMIND_MS;
        open[f.key] = { ...was, text: f.text, notifiedAt: remind ? now : was.notifiedAt };
        if (remind) reminded.push(f.key);
      }
    } else if (was) {
      // まだ ゆれて いる。閉じも 鳴らしも しない
      open[f.key] = { ...was, text: f.text };
    }
  }
  for (const [key, was] of Object.entries(prev?.open ?? {})) {
    if (!byKey.has(key)) {
      delete open[key];
      recovered.push({ key, text: was.text, since: was.since });
    }
  }

  const time = ictLabel(now);
  const lines = (keys, mark) => keys.map((key) => `${mark} ${open[key].text}`);
  const messages = [];

  if (!prev?.startedAt) {
    const openKeys = Object.keys(open);
    messages.push({
      kind: "start",
      title: "本番の 見張りを はじめました",
      text: [
        `👀 本番の 見張りを はじめました（${time}）`,
        "10分ごと（授業の 火・水・金 17:05〜18:55 は 5分ごと）に 見ます。",
        "知らせるのは 異常が 続いた とき・2時間ごとの 念押し・直った ときだけです。",
        openKeys.length === 0
          ? "✅ いまは ぜんぶ 正常です。"
          : `いま 開いて いる 異常:\n${lines(openKeys, "・").join("\n")}`,
        prodUrl,
      ].join("\n"),
    });
  } else if (fresh.length > 0 || reminded.length > 0) {
    const others = Object.keys(open).filter((k) => !fresh.includes(k) && !reminded.includes(k));
    messages.push({
      kind: "alert",
      title: fresh.length > 0 ? "本番に 異常が あります" : "本番の 異常が 続いて います",
      text: [
        `${fresh.length > 0 ? "🚨 本番に 異常が あります" : "⏰ 本番の 異常が 続いて います"}（${time}）`,
        ...lines(fresh, "🆕"),
        ...lines(reminded, "・"),
        ...lines(others, "・"),
        `たしかめる: ${prodUrl}/api/health/content`,
      ].join("\n"),
    });
  }
  if (prev?.startedAt && recovered.length > 0) {
    const stillOpen = Object.keys(open).length;
    messages.push({
      kind: "recovered",
      title: "本番の 異常が 直りました",
      text: [
        `✅ 直りました（${time}）`,
        ...recovered.map(
          (r) => `・${r.text}（${Math.max(1, Math.round((now - r.since) / 60_000))}分 続いた）`,
        ),
        stillOpen > 0
          ? `まだ 開いて いる 異常が ${stillOpen}件 あります。`
          : "いまは ぜんぶ 正常です。",
      ].join("\n"),
    });
  }

  const next = {
    startedAt: prev?.startedAt ?? now,
    lastRunAt: now,
    open,
    recentFail: judged.recentFail,
    pending: judged.pending,
  };
  return { messages, next };
}

/**
 * 知らせる。どこへ 送るかは 入って いる 鍵で 決まる（両方 入って いれば 両方）。
 *   Slack … SLACK_WEBHOOK_URL（Incoming Webhook）
 *   メール … RESEND_API_KEY ＋ ALERT_EMAIL_TO（Resend。無料枠 1日100通）
 * 返すのは { configured, sent }。configured が 0 なら ログに 出すだけ。
 */
export async function notify(env, message, fetchImpl) {
  const jobs = [];
  if (env.SLACK_WEBHOOK_URL) {
    jobs.push(
      fetchImpl(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text }),
      }),
    );
  }
  if (env.RESEND_API_KEY && env.ALERT_EMAIL_TO) {
    jobs.push(
      fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.ALERT_EMAIL_FROM || "NexmaxAcademy 見張り <onboarding@resend.dev>",
          to: env.ALERT_EMAIL_TO.split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          subject: `[NexmaxAcademy] ${message.title}`,
          text: message.text,
        }),
      }),
    );
  }
  const results = await Promise.allSettled(jobs);
  const sent = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  return { configured: jobs.length, sent };
}

/**
 * 1回の 見張り。Cloudflare の ものは 全部 外から 渡す（テストで 差しかえる ため）。
 *   deps.fetch / deps.sleep / deps.now / deps.loadState / deps.saveState / deps.log
 */
export async function runWatch(env, deps) {
  const baseUrl = (env.PROD_URL || "").replace(/\/+$/, "");
  const prev = await deps.loadState();
  const now = deps.now();

  const [probeResults, clientErrors] = await Promise.all([
    Promise.all(
      PROBES.map((probe) => runProbe(probe, { baseUrl, fetchImpl: deps.fetch, sleep: deps.sleep })),
    ),
    readClientErrors(env, deps.fetch),
  ]);

  const judged = judge(prev, probeResults, clientErrors, now);
  const { messages, next } = decide(prev, judged, now, baseUrl);

  let delivered = true;
  for (const message of messages) {
    const { configured, sent } = await notify(env, message, deps.fetch);
    deps.log(`[${message.kind}] ${message.text}`);
    if (configured > 0 && sent === 0) delivered = false;
  }

  // 知らせが 1通も 届かなかったら、次の 回に もう一度 知らせる（黙って 落とさない）
  const saved = delivered
    ? next
    : { ...next, startedAt: prev?.startedAt ?? null, open: prev?.open ?? {} };
  await deps.saveState({
    ...saved,
    last: {
      at: now,
      probes: probeResults.map((r) => ({ id: r.id, code: r.code, failures: r.failures })),
      clientErrors: clientErrors.skipped
        ? "見ていない（SUPABASE_URL が 無い）"
        : (clientErrors.failed ??
          (clientErrors.rows ?? []).reduce((s, r) => s + (Number(r.n) || 0), 0)),
      delivered,
    },
  });
  return { messages, delivered, findings: judged.findings };
}
