/**
 * codex_bridge — ローカルの Codex App Server を管理画面から使うための中継（08 拡張経路）。
 *
 * なぜ要るか: `codex app-server` は loopback 以外の Origin を拒否するため、
 * ブラウザから直接 ws://127.0.0.1:17653 へは接続できない。この中継が
 * ハンドシェイクだけを自前で行い（Origin を上流に渡さない）、以後のフレームを素通しする。
 * kotoba-tensei の server.js から静的配信を外して移植したもの。
 *
 * 使い方:
 *   npm run codex:bridge          # codex app-server も自動起動する
 *   AUTO_START_CODEX=0 npm run codex:bridge
 *
 * 公開するもの（**すべて合言葉が要る**）:
 *   GET  /api/codex/hello   … { ok, workdir, portOpen, ... } 合言葉の確認もかねる
 *   PUT  /api/codex/file    … 参照画像を作業フォルダへ置く（?name=）
 *   GET  /api/codex/file    … 作業フォルダのファイルを返す（?name=）
 *   WS   /codex             … ws://127.0.0.1:17653 への素通しトンネル
 *
 * ## 合言葉が要る理由（ここを外すと危ない）
 *
 * 実測（2026-08-06）: **https のページからでも `ws://127.0.0.1` は開ける。**
 * `127.0.0.1` は「安全なオリジン」に数えられるので、混在コンテンツで弾かれない。
 * つまりこのブリッジは、公開中のアプリから使えると同時に、**先生が開いた
 * どのサイトからでも叩ける**。その先にいるのはシェルを実行できる Codex である。
 *
 * だから合言葉（トークン）を必須にする。ブラウザは相手のオリジンを詐称できないが、
 * オリジンの許可リストだけでは不十分で（非ブラウザからは自由に名乗れる）、
 * **境界は合言葉のほうである**。
 *
 * 合言葉は `~/.nexmax/codex-bridge-token` に置き、起動時に画面へ出す。
 * 先生はそれを「AI設定」に一度だけ貼る。
 *
 * ## 読み書きできる場所を1つの箱に閉じる
 *
 * ファイルの受け渡しを「好きなパス」で許すと、任意のファイルを読める穴になる。
 * そこで **作業フォルダ1つの中だけ**を読み書きの対象にし、名前も
 * `[a-z0-9_-].(png|jpg|jpeg|webp)` に限る（`..` を書きようがない）。
 * Codex にもこのフォルダを cwd として渡し、絵はここへ保存させる。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveInWorkdir as resolveIn } from "./lib/bridge_paths.mjs";

const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || "127.0.0.1";
const CODEX_WS_HOST = process.env.CODEX_WS_HOST || "127.0.0.1";
const CODEX_WS_PORT = Number(process.env.CODEX_WS_PORT || 17653);
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const AUTO_START_CODEX = process.env.AUTO_START_CODEX !== "0";

/** 合言葉。無ければ作る。ファイルは本人だけが読める権限にする。 */
const TOKEN = (() => {
  if (process.env.CODEX_BRIDGE_TOKEN) return process.env.CODEX_BRIDGE_TOKEN;
  const dir = path.join(os.homedir(), ".nexmax");
  const file = path.join(dir, "codex-bridge-token");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    // まだ無い。下で作る
  }
  const fresh = crypto.randomBytes(24).toString("base64url");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${fresh}\n`, { mode: 0o600 });
  return fresh;
})();

/**
 * 参照画像と生成結果を置く箱。ここ**だけ**が読み書きの対象。
 * 起動のたびに作り直す（前回の絵が残っていると、消し忘れが積もる）。
 */
const WORKDIR = path.join(os.tmpdir(), "nexmax-codex-bridge");
fs.rmSync(WORKDIR, { recursive: true, force: true });
fs.mkdirSync(WORKDIR, { recursive: true, mode: 0o700 });

/** 1枚あたりの上限。参照画像も生成結果もこれを超えない。 */
const MAX_FILE_BYTES = 12 * 1024 * 1024;

/** 長さの違いでも漏らさないよう、時間の一定な比較を使う。 */
function tokenOk(given) {
  if (typeof given !== "string" || given.length === 0) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const codex = {
  child: null,
  lastError: null,
  starting: false,

  isPortOpen() {
    return new Promise((resolve) => {
      const sock = net.connect({ host: CODEX_WS_HOST, port: CODEX_WS_PORT }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("error", () => resolve(false));
      sock.setTimeout(800, () => {
        sock.destroy();
        resolve(false);
      });
    });
  },

  async status() {
    return {
      portOpen: await this.isPortOpen(),
      managed: Boolean(this.child),
      pid: this.child ? this.child.pid : null,
      starting: this.starting,
      lastError: this.lastError,
      command: `${CODEX_BIN} app-server --listen ws://${CODEX_WS_HOST}:${CODEX_WS_PORT}`,
    };
  },

  async start() {
    if (this.starting) return { ok: true, message: "起動処理中です" };
    if (await this.isPortOpen()) return { ok: true, message: "すでに起動済みです" };
    this.starting = true;
    this.lastError = null;
    try {
      const args = ["app-server", "--listen", `ws://${CODEX_WS_HOST}:${CODEX_WS_PORT}`];
      const child = spawn(CODEX_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
      this.child = child;
      child.stdout.on("data", (d) => process.stdout.write(`[codex] ${d}`));
      child.stderr.on("data", (d) => process.stderr.write(`[codex] ${d}`));
      child.on("error", (err) => {
        this.lastError =
          err.code === "ENOENT"
            ? `'${CODEX_BIN}' が見つかりません。Codex CLI をインストールし PATH を通してください。`
            : String(err.message || err);
        this.child = null;
      });
      child.on("exit", (code) => {
        if (this.child === child) this.child = null;
        if (code && code !== 0) this.lastError = `codex app-server が終了しました (code ${code})`;
      });

      for (let i = 0; i < 20; i += 1) {
        if (this.lastError) break;
        if (await this.isPortOpen()) {
          this.starting = false;
          return { ok: true, message: "Codex App Server を起動しました" };
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      this.starting = false;
      return { ok: false, message: this.lastError ?? "起動を確認できませんでした" };
    } catch (err) {
      this.starting = false;
      this.lastError = String(err?.message ?? err);
      return { ok: false, message: this.lastError };
    }
  },
};

/**
 * CORS。管理画面は別オリジン（公開中の Workers）なので、返すヘッダが要る。
 * `*` にはせず、来たオリジンをそのまま返す——資格情報は使わないので安全側に倒れる。
 * **通してよいかどうかを決めるのはオリジンではなく合言葉**（冒頭の説明）。
 */
function corsHeaders(req) {
  return {
    "access-control-allow-origin": req.headers.origin ?? "*",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

function sendJson(req, res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
}

/**
 * 作業フォルダの中の1ファイルへ解決する。外へ出る名前は null。
 * 判定そのものは `scripts/lib/bridge_paths.mjs`（テストがある）。
 */
function resolveInWorkdir(name) {
  return resolveIn(WORKDIR, name);
}

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  // 合言葉が合わないものは、ここから先へ1歩も進ませない
  if (!tokenOk(url.searchParams.get("token"))) {
    sendJson(req, res, 401, { ok: false, reason: "badToken" });
    return;
  }

  if (url.pathname === "/api/codex/hello" && req.method === "GET") {
    codex.status().then((s) => sendJson(req, res, 200, { ok: true, workdir: WORKDIR, ...s }));
    return;
  }

  // 参照画像を置く（キャラクターシートなど。Codex は URL を読めないので実体が要る）
  if (url.pathname === "/api/codex/file" && req.method === "PUT") {
    const full = resolveInWorkdir(url.searchParams.get("name"));
    if (!full) {
      sendJson(req, res, 400, { ok: false, reason: "badName" });
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) {
        sendJson(req, res, 413, { ok: false, reason: "tooLarge" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      try {
        fs.writeFileSync(full, Buffer.concat(chunks), { mode: 0o600 });
        sendJson(req, res, 200, { ok: true, path: full });
      } catch (err) {
        sendJson(req, res, 500, { ok: false, reason: String(err?.message ?? err) });
      }
    });
    return;
  }

  // 生成結果を取りに来る（Codex がこのフォルダへ保存したもの）
  if (url.pathname === "/api/codex/file" && req.method === "GET") {
    const full = resolveInWorkdir(url.searchParams.get("name"));
    if (!full) {
      sendJson(req, res, 400, { ok: false, reason: "badName" });
      return;
    }
    let body;
    try {
      body = fs.readFileSync(full);
    } catch {
      sendJson(req, res, 404, { ok: false, reason: "notYet" });
      return;
    }
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(full)] ?? "application/octet-stream",
      "cache-control": "no-store",
      ...corsHeaders(req),
    });
    res.end(body);
    return;
  }

  sendJson(req, res, 404, { ok: false, reason: "noSuchEndpoint" });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/codex") {
    socket.destroy();
    return;
  }
  /*
   * ここが Codex への入口そのもの。合言葉が無い接続は上流に触らせない。
   * ブラウザの WebSocket は独自ヘッダを付けられないので、合言葉はクエリで受ける。
   */
  if (!tokenOk(url.searchParams.get("token"))) {
    socket.end("HTTP/1.1 401 Unauthorized\r\n\r\ncodex_bridge: 合言葉が違います");
    return;
  }
  const browserKey = req.headers["sec-websocket-key"];
  if (!browserKey) {
    socket.destroy();
    return;
  }

  const upstream = net.createConnection({ host: CODEX_WS_HOST, port: CODEX_WS_PORT }, () => {
    const upstreamKey = crypto.randomBytes(16).toString("base64");
    upstream.write(
      [
        `GET / HTTP/1.1`,
        `Host: ${CODEX_WS_HOST}:${CODEX_WS_PORT}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${upstreamKey}`,
        "Sec-WebSocket-Version: 13",
        "\r\n",
      ].join("\r\n"),
    );
  });

  let upstreamHeader = Buffer.alloc(0);
  upstream.on("data", function waitForHandshake(chunk) {
    upstreamHeader = Buffer.concat([upstreamHeader, chunk]);
    const headerEnd = upstreamHeader.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const headerText = upstreamHeader.slice(0, headerEnd).toString("utf8");
    if (!headerText.startsWith("HTTP/1.1 101")) {
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\nCodex App Server did not accept the upgrade");
      upstream.destroy();
      return;
    }

    const browserAccept = crypto
      .createHash("sha1")
      .update(`${browserKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${browserAccept}`,
        "\r\n",
      ].join("\r\n"),
    );

    const rest = upstreamHeader.slice(headerEnd + 4);
    upstream.removeListener("data", waitForHandshake);
    if (rest.length) socket.write(rest);
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  upstream.on("error", () => {
    if (!socket.destroyed) {
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\nCodex App Server is not reachable");
    }
  });
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, HOST, async () => {
  console.log(`codex_bridge: http://${HOST}:${PORT}`);
  console.log(`  WS /codex -> ws://${CODEX_WS_HOST}:${CODEX_WS_PORT}`);
  console.log(`  作業フォルダ: ${WORKDIR}`);
  console.log("");
  console.log("  ┌─ 管理画面「AI設定」に貼る合言葉 ────────────────");
  console.log(`  │  ${TOKEN}`);
  console.log("  └──────────────────────────────────────────────");
  console.log(`  （保存先: ${path.join(os.homedir(), ".nexmax", "codex-bridge-token")}）`);
  console.log(
    "  この合言葉を知っている相手だけが、あなたの Codex を使えます。人に見せないでください。",
  );
  console.log("");
  if (AUTO_START_CODEX) {
    if (await codex.isPortOpen()) {
      console.log("codex app-server: 起動済み");
    } else {
      const r = await codex.start();
      console.log(`codex app-server: ${r.message}`);
    }
  }
});

process.on("SIGINT", () => {
  codex.child?.kill("SIGTERM");
  process.exit(0);
});
process.on("SIGTERM", () => {
  codex.child?.kill("SIGTERM");
  process.exit(0);
});
