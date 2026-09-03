#!/usr/bin/env node
/**
 * find_db_host — `SUPABASE_DB_URL` に 書く **ホスト名を、合言葉なしで 突き止める**。
 *
 * ## なぜ 要るか
 * ダッシュボードの「URI」は 直結（`db.<ref>.supabase.co`）で、そこには A レコードが
 * 無い —— GitHub の ランナー（IPv4）からは 届かない（scripts/lib/db_url.mjs）。
 * 正しいのは **Session pooler**（`aws-<n>-<region>.pooler.supabase.com:5432`）だが、
 * `<n>` と `<region>` は プロジェクトごとに ちがい、ふつうは ダッシュボードでしか 分からない。
 *
 * ここでは **Postgres の 接続の 最初の ひと言だけ**を 交わして 見わける。
 * 合言葉は 送らないし、要らない:
 *
 *   - その プーラーが この プロジェクトを 持って いる → 「合言葉を どうぞ」（'R'）が 返る
 *   - 持って いない                                   → 「Tenant or user not found」（'E'）が 返る
 *
 * つまり **どこにも ログインせずに** 正しいホストが 分かる。
 *
 * 使いかた:
 *   node scripts/find_db_host.mjs <project-ref>
 */

import { connect as tcpConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { poolerUrl } from "./lib/db_url.mjs";

const REGIONS = [
  "ap-southeast-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-south-1",
  "ap-southeast-2",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "ca-central-1",
  "sa-east-1",
];
const PREFIXES = ["aws-0", "aws-1"];

/** Postgres の 起動メッセージを 組む（合言葉は 入れない）。 */
function startupMessage(user) {
  const params = `user\0${user}\0database\0postgres\0client_encoding\0UTF8\0\0`;
  const body = Buffer.from(params, "utf8");
  const message = Buffer.alloc(8 + body.length);
  message.writeInt32BE(8 + body.length, 0);
  message.writeInt32BE(196608, 4); // プロトコル 3.0
  body.copy(message, 8);
  return message;
}

const SSL_REQUEST = (() => {
  const buffer = Buffer.alloc(8);
  buffer.writeInt32BE(8, 0);
  buffer.writeInt32BE(80877103, 4);
  return buffer;
})();

/** @returns {Promise<{host:string, verdict:"あり"|"なし"|"つながらない", detail:string}>} */
function probe(host, user, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (verdict, detail) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* すでに 閉じて いる */
      }
      resolve({ host, verdict, detail });
    };

    const socket = tcpConnect({ host, port: 5432 });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done("つながらない", "時間切れ"));
    socket.on("error", (error) => done("つながらない", error.message));

    socket.once("connect", () => socket.write(SSL_REQUEST));
    socket.once("data", (first) => {
      if (first[0] !== 0x53 /* 'S' */) return done("つながらない", "TLS を 断られた");
      const secure = tlsConnect({ socket, servername: host, rejectUnauthorized: false }, () => {
        secure.write(startupMessage(user));
      });
      secure.setTimeout(timeoutMs);
      secure.on("timeout", () => done("つながらない", "TLS のあと 時間切れ"));
      secure.on("error", (error) => done("つながらない", error.message));
      secure.once("data", (reply) => {
        const tag = String.fromCharCode(reply[0]);
        if (tag === "R") return done("あり", "「合言葉を どうぞ」が 返った");
        if (tag === "E") {
          const text = reply.toString("utf8").replace(/\0/g, " ").trim();
          /*
           * Supavisor の 文言は `tenant/user <name> not found`（小文字・語順もちがう）。
           * `Tenant or user not found` で 当てようとして 全部 取りこぼした（2026-09-03）。
           * **「見つからない」だけを 見る**。合言葉ちがい・SASL 要求は「あり」である。
           */
          const missing = /not found/i.test(text);
          return done(missing ? "なし" : "あり", text.slice(-90));
        }
        done("つながらない", `見なれない 返事（${tag}）`);
      });
    });
  });
}

/**
 * この プロジェクトを 持って いる Session pooler の ホスト名を 返す。
 * 見つからなければ null。合言葉は 一度も 送らない。
 */
export async function findPoolerHost(ref, log = () => {}) {
  const user = `postgres.${ref}`;
  const hosts = PREFIXES.flatMap((p) => REGIONS.map((r) => `${p}-${r}.pooler.supabase.com`));
  log(
    `■ ${hosts.length} 個の プーラーに 「${user} は そちらに いますか」と 聞きます（合言葉は 送りません）`,
  );

  const results = [];
  for (let i = 0; i < hosts.length; i += 8) {
    results.push(...(await Promise.all(hosts.slice(i, i + 8).map((h) => probe(h, user)))));
  }
  const hit = results.filter((r) => r.verdict === "あり");
  for (const r of hit) log(`✓ ${r.host}  ← ${r.detail}`);
  if (hit.length === 0) {
    log(
      "✗ 見つかりませんでした。project-ref を 確かめるか、ダッシュボードの Session pooler を 見てください。",
    );
    for (const r of results.filter((x) => x.verdict === "つながらない").slice(0, 3)) {
      log(`  （参考）${r.host}: ${r.detail}`);
    }
    return null;
  }
  return hit[0].host;
}

if (process.argv[1] && process.argv[1].endsWith("find_db_host.mjs")) {
  const ref = process.argv[2];
  if (!ref) {
    console.error("使いかた: node scripts/find_db_host.mjs <project-ref>");
    process.exit(1);
  }
  const host = await findPoolerHost(ref, console.log);
  if (!host) process.exit(1);
  console.log("");
  console.log("■ SUPABASE_DB_URL に 書く 形（[PASSWORD] は 自分の DB の 合言葉）");
  console.log(`  ${poolerUrl({ ref, host })}`);
}
