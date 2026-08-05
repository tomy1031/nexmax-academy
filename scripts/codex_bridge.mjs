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
 * 公開するもの:
 *   GET  /api/codex/status  … { portOpen, managed, pid, starting, lastError, command }
 *   WS   /codex             … ws://127.0.0.1:17653 への素通しトンネル
 *
 * 本番（Cloudflare Tunnel）では、この 8790 番を cloudflared が公開し、
 * 手前の Cloudflare Access が管理者2人だけを通す（08 §0.1.1）。
 * このスクリプト自体は認証を持たない——loopback か、Access の内側でのみ使うこと。
 */
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || "127.0.0.1";
const CODEX_WS_HOST = process.env.CODEX_WS_HOST || "127.0.0.1";
const CODEX_WS_PORT = Number(process.env.CODEX_WS_PORT || 17653);
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const AUTO_START_CODEX = process.env.AUTO_START_CODEX !== "0";

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

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    // 管理画面（別オリジンの Next.js）から status を読めるようにする。
    // WS 側はブラウザが CORS を課さないためヘッダ不要。
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/codex/status") {
    codex.status().then((s) => sendJson(res, 200, s));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("codex_bridge: /api/codex/status か WS /codex だけを提供します");
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/codex") {
    socket.destroy();
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
