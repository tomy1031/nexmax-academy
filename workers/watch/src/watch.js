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
/** 続いて いる 異常を もう一度 知らせる 間。夜（22〜7時 ICT）は 念押し しない。 */
export const REMIND_MS = 2 * 60 * 60_000;
/**
 * 「直りました」と 言う までに 正常が 続く 長さ。1回 通った だけで 閉じると、
 * 時々だけ 落ちる 異常（3割だけ 1102 など）で「異常あり」と「直りました」が 交互に 届く。
 */
export const RECOVER_QUIET_MS = 60 * 60_000;
/**
 * 画面の エラーを 数える 幅と、知らせる 数。端末ごとに 同じ エラーは 30分に 1回まで
 * なので、3件は「3人」か「1人が ちがう 画面で 3回」——どちらも 見る 価値が ある。
 */
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
      // サービスバインディング越しでは 1102 は 画面では なく 例外で 返る
      const text = String(error?.message ?? "");
      code =
        error && error.name === "AbortError"
          ? "timeout"
          : /exceeded|resource limits|cpu time/i.test(text)
            ? "1102"
            : "network";
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

/**
 * 一時的に 黙らせる 警告（var `MUTE_WARNINGS`・カンマ区切りの 部分一致）。
 * **直しが 決まって いる 既知の 誤報だけ**に 使う。deploy の とき `--var` で 渡し、
 * wrangler.jsonc には 書かない——次の ふつうの deploy で 自然に 外れる ように。
 * 2026-10-11: 健康しらべが quest を 数えず 誤報を 出して いた（#598 で 直し中）ため。
 */
export function parseMutes(value) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 健康しらべの 警告を 1つの 印に する（同じ 警告が 続いて いるかを 見る ため）。 */
function warningsKey(warnings) {
  return warnings.slice().sort().join("\n").slice(0, 500);
}

/**
 * 画面の エラーの ページの 道を 見せて よい 形に する。道は **だれでも 書きこめる**
 * （公開の anon 鍵で 入る）ので、知らせの 文に そのまま 混ぜない。
 */
export function safePath(path) {
  return String(path ?? "?")
    .replace(/[^\w/.~%<>@:+-]/g, "?")
    .slice(0, 60);
}

/**
 * その 回の 結果から「異常」を 作る。
 *   confirmed … 知らせて よい（続いて いる）
 *   suspect   … まだ 1回だけ。新しくは 知らせないが、開いて いる 異常は 閉じない
 *   hold      … 測れなかった（健康しらべ・DB が 落ちた）。前の 回の 異常を そのまま 残す
 *               ——測れない ことを「直った」と 取り違えない ため
 * 返す recentFail・pending は 次の 回に 引き継ぐ もの。
 *
 * @param {any} prev
 * @param {any[]} probeResults
 * @param {any} clientErrors
 * @param {number} now
 * @param {{ mutes?: string[] }} [opts]
 */
export function judge(prev, probeResults, clientErrors, now, { mutes = [] } = {}) {
  const findings = [];
  const recentFail = {};
  const pending = {};
  const lastFail = prev?.recentFail ?? {};
  const lastPending = prev?.pending ?? {};
  const lastOpen = prev?.open ?? {};
  const hold = (key) => {
    if (lastOpen[key]) findings.push({ key, level: "hold", text: lastOpen[key].text });
  };

  for (const r of probeResults) {
    const probe = PROBES.find((p) => p.id === r.id);
    if (!probe) continue;

    // 健康しらべの 警告（教材が 隠れる・404 に なる）。2回 続いたら 知らせる
    if (r.id === "health") {
      const warnings = (Array.isArray(r.body?.warnings) ? r.body.warnings : []).filter(
        (w) => !mutes.some((m) => String(w).includes(m)),
      );
      if (r.code) {
        // 測れなかった。警告の 続きぐあいも 異常も 前の まま
        if (lastPending.health) pending.health = lastPending.health;
        hold("content");
      } else if (warnings.length > 0) {
        const key = warningsKey(warnings);
        pending.health = key;
        findings.push({
          key: "content",
          level: lastPending.health === key ? "confirmed" : "suspect",
          text: `教材の 健康しらべに 警告 ${warnings.length}件 — ${String(warnings[0]).slice(0, 160)}`,
        });
      }
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
      hold("client-errors");
    } else {
      const rows = clientErrors.rows ?? [];
      const total = rows.reduce((sum, row) => sum + (Number(row.n) || 0), 0);
      if (total >= CLIENT_ERROR_THRESHOLD) {
        const where = rows
          .slice(0, 3)
          .map(
            (row) =>
              `${safePath(row.path)} ${Number(row.n) || 0}件${row.kind === "stale" ? "（部品の 読みこみ）" : ""}`,
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

/** 夜（22〜7時 ICT）か。念押しだけ 止める（新しい 異常と 直った 知らせは 送る）。 */
export function isQuietHour(now) {
  const hour = new Date(now + 7 * 60 * 60_000).getUTCHours();
  return hour >= 22 || hour < 7;
}

/**
 * 前の 状態と その 回の 異常から、知らせる 文と 次の 状態を 決める。
 *
 *   開く   … confirmed が 新しく 出た とき（🆕 で 1通）
 *   念押し … 開いた まま 2時間 たった とき（夜は 送らない）
 *   閉じる … **30分 続けて** 何も 出なかった とき（✅ で 1通）。その 間に また 出たら
 *            黙って 開いた まま に 戻す（行き来で 鳴らさない）
 *
 * @param {any} prev
 * @param {any} judged
 * @param {number} now
 * @param {string} prodUrl
 * @param {{ mutes?: string[] }} [opts]
 */
export function decide(prev, judged, now, prodUrl, { mutes = [] } = {}) {
  const open = {};
  const fresh = [];
  const reminded = [];
  const recovered = [];

  for (const [key, was] of Object.entries(prev?.open ?? {})) open[key] = { ...was };

  const seen = new Set();
  for (const f of judged.findings) {
    seen.add(f.key);
    const was = open[f.key];
    if (f.level === "confirmed") {
      if (!was) {
        open[f.key] = { since: now, notifiedAt: now, text: f.text, quietSince: null };
        fresh.push(f.key);
      } else {
        const remind = now - was.notifiedAt >= REMIND_MS && !isQuietHour(now);
        open[f.key] = {
          ...was,
          text: f.text,
          quietSince: null,
          notifiedAt: remind ? now : was.notifiedAt,
        };
        if (remind) reminded.push(f.key);
      }
    } else if (was) {
      // ゆれて いる／測れない。閉じも 鳴らしも しない
      open[f.key] = { ...was, text: f.level === "hold" ? was.text : f.text, quietSince: null };
    }
  }
  for (const [key, was] of Object.entries(open)) {
    if (seen.has(key)) continue;
    const quietSince = typeof was.quietSince === "number" ? was.quietSince : now;
    if (now - quietSince >= RECOVER_QUIET_MS) {
      delete open[key];
      recovered.push({ key, text: was.text, since: was.since, until: quietSince });
    } else {
      open[key] = { ...was, quietSince };
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
        "知らせるのは 異常が 続いた とき・2時間ごとの 念押し（夜は なし）・直った ときだけです。",
        openKeys.length === 0
          ? "✅ いまは ぜんぶ 正常です。"
          : `いま 開いて いる 異常:\n${lines(openKeys, "・").join("\n")}`,
        ...(mutes.length > 0
          ? [`（直し待ちの 既知の 誤報は 知らせません: ${mutes.join("・")}）`]
          : []),
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
        `✅ 直りました（${time}・${RECOVER_QUIET_MS / 60_000}分 正常が 続いた）`,
        ...recovered.map(
          (r) => `・${r.text}（${Math.max(1, Math.round((r.until - r.since) / 60_000))}分 続いた）`,
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
 * Slack の mrkdwn で 意味を 持つ 3文字を 消す。知らせの 文には だれでも 書きこめる
 * 部分（画面の エラーの 道）が 混ざるので、`<!channel>` や `<https://…|…>` を 効かせない。
 */
export function escapeSlack(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Telegram の 送り先（chat_id）を 探す。鍵（TELEGRAM_BOT_TOKEN）を 入れて、
 * ボットに 1通 送って もらえば 見つかる（グループに 入れた ときは その グループ）。
 * **いちばん 古い 1件**を とる——ボットを 作った 直後に 送るのは 作った 本人だから。
 * 見つけたら 状態に 覚えて、もう 探さない（TELEGRAM_CHAT_ID が あれば そちらが 勝つ）。
 */
export async function findTelegramChat(env, fetchImpl) {
  try {
    const res = await fetchWithTimeout(
      fetchImpl,
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`,
      { method: "GET" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    for (const update of Array.isArray(data?.result) ? data.result : []) {
      const chat = update?.message?.chat ?? update?.my_chat_member?.chat;
      if (chat && (typeof chat.id === "number" || typeof chat.id === "string")) {
        return String(chat.id);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 知らせる。どこへ 送るかは 入って いる 鍵で 決まる（いくつ 入って いても 全部へ）。
 *   Telegram … TELEGRAM_BOT_TOKEN（送り先は findTelegramChat が 見つける）。**2026-10-11 に tomy さんが 選んだ 本命**
 *   Slack    … SLACK_WEBHOOK_URL（Incoming Webhook）
 *   メール   … RESEND_API_KEY ＋ ALERT_EMAIL_TO（Resend。無料枠 1日100通）
 * 返すのは { configured, sent }。configured が 0 なら ログに 出すだけ。
 * Telegram は 飾りの ない 文で 送る（parse_mode を 付けない）ので、文に 何が 混ざっても 書式に ならない。
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ kind: string, title: string, text: string }} message
 * @param {(url: string, init: RequestInit) => Promise<Response>} fetchImpl
 * @param {{ telegramChatId?: string | null }} [opts]
 */
export async function notify(env, message, fetchImpl, { telegramChatId = null } = {}) {
  const jobs = [];
  if (env.TELEGRAM_BOT_TOKEN) {
    // 送り先が まだ 分からない あいだは「送れなかった」に 数える（次の 回に 送り直す）
    jobs.push(
      telegramChatId
        ? fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: message.text,
              disable_web_page_preview: true,
            }),
          })
        : Promise.reject(new Error("Telegram の 送り先が まだ 分からない")),
    );
  }
  if (env.SLACK_WEBHOOK_URL) {
    jobs.push(
      fetchImpl(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: escapeSlack(message.text) }),
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
 *   deps.probeFetch … 本番を 見る ときだけ 使う fetch（無ければ deps.fetch）。
 *     **同じ アカウントの Worker は workers.dev の 公開 URL では 呼べない**（2026-10-11 に
 *     3か所とも 404 が 返った）ので、本番の Worker へは サービスバインディング（env.PROD）で 行く
 */
export async function runWatch(env, deps) {
  const baseUrl = (env.PROD_URL || "").replace(/\/+$/, "");
  const prev = await deps.loadState();
  const now = deps.now();

  const [probeResults, clientErrors] = await Promise.all([
    Promise.all(
      PROBES.map((probe) =>
        runProbe(probe, { baseUrl, fetchImpl: deps.probeFetch ?? deps.fetch, sleep: deps.sleep }),
      ),
    ),
    readClientErrors(env, deps.fetch),
  ]);

  const mutes = parseMutes(env.MUTE_WARNINGS);
  const judged = judge(prev, probeResults, clientErrors, now, { mutes });
  const { messages, next } = decide(prev, judged, now, baseUrl, { mutes });

  // Telegram の 送り先。入れて あれば それ、覚えて いれば それ、無ければ 探す
  let telegramChatId = env.TELEGRAM_CHAT_ID || prev?.telegramChatId || null;
  if (env.TELEGRAM_BOT_TOKEN && !telegramChatId) {
    telegramChatId = await findTelegramChat(env, deps.fetch);
  }

  let delivered = true;
  for (const message of messages) {
    const { configured, sent } = await notify(env, message, deps.fetch, { telegramChatId });
    deps.log(`[${message.kind}] ${message.text}${configured === 0 ? "（知らせ先が 未設定）" : ""}`);
    if (sent === 0) delivered = false;
  }

  // 知らせが 1通も 届かなかったら、次の 回に もう一度 知らせる（黙って 落とさない）。
  // 知らせ先が まだ 無い ときも 同じ——鍵を 入れた あとの 最初の 回に「はじめました」が 届く
  const saved = delivered
    ? next
    : { ...next, startedAt: prev?.startedAt ?? null, open: prev?.open ?? {} };
  await deps.saveState({
    ...saved,
    telegramChatId: env.TELEGRAM_CHAT_ID ? (prev?.telegramChatId ?? null) : telegramChatId,
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
