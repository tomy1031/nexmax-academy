/**
 * スライド挿絵の一括生成ドライバ（codex bridge 経由）。
 *
 * 使い方:
 *   npm run codex:bridge   # 別ターミナルで（合言葉は ~/.nexmax/codex-bridge-token）
 *   node scripts/slides/gen_images.mjs scripts/slides/<教材ID>/prompts.json <出力フォルダ>
 *   例: node scripts/slides/gen_images.mjs scripts/slides/ai_jidai/prompts.json /tmp/ai_jidai_png
 *
 * - プロンプト台帳（prompts.json）の scenes を上から順に、**1スレッドで一括**生成する
 *   （セッションをまたぐと絵柄がぶれる。docs/skills/codex_image_generation.md §2）。
 * - 参照画像は毎回 reference.png ＋ 1枚目の合格画像（絵柄アンカー）。
 * - 出力は PNG。コミットするときは JPEG（1080px・q72 目安）へ変換して
 *   `scripts/slides/<教材ID>/img/` に置く（同 §7.2。PDF が JPEG をそのまま抱き込むため）。
 * - 出力フォルダに既にあるファイルは飛ばすので、途中で止まっても再実行で続きから走る。
 *
 * プロトコルは src/lib/codex-transport.ts の runImage を踏襲。1つ違いがある:
 * **タイムアウトした turn と同じスレッドへ次の turn を投げてはいけない**（app-server が
 * 詰まって以後の応答が返らなくなる。2026-08-17 実測）。タイムアウト時は WS ごと張り直す。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [ledgerPath, outDirArg] = process.argv.slice(2);
if (!ledgerPath || !outDirArg) {
  console.error("usage: node scripts/slides/gen_images.mjs <prompts.json> <出力フォルダ>");
  process.exit(1);
}

const BRIDGE = process.env.CODEX_BRIDGE_URL ?? "http://127.0.0.1:8790";
const TOKEN =
  process.env.CODEX_BRIDGE_TOKEN ??
  fs.readFileSync(path.join(os.homedir(), ".nexmax", "codex-bridge-token"), "utf8").trim();
const LEDGER = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const OUT_DIR = path.resolve(outDirArg);
const REFERENCE = path.resolve("public/img/characters/nexmax/reference.png");
const IMAGE_TIMEOUT_MS = 420_000;
const REQUEST_TIMEOUT_MS = 30_000;

/** src/lib/codex-transport.ts の IMAGE_INSTRUCTIONS と同文（逐語）。 */
const IMAGE_INSTRUCTIONS = [
  "You generate a single illustration with the built-in image_gen tool.",
  "Save the result to the exact output path given in the request, inside the current directory.",
  "Generate exactly once. Never regenerate because of colour variance, line wobble, or size.",
  "If the produced file is not the requested size, resize it — do not generate again.",
  "Do not write, read, or modify any other file. Do not browse.",
].join(" ");

/** src/lib/codex-transport.ts の buildImageTurn と同文（逐語）。 */
function buildImageTurn(prompt, outName) {
  return [
    "Generate ONE image with the built-in image_gen tool and save it as:",
    `  ./${outName}`,
    "(relative to the current directory — do not save anywhere else).",
    "",
    "Use this prompt verbatim. Do not summarise, rephrase, or translate it:",
    "---",
    prompt,
    "---",
    "",
    "Generate exactly once. Do not regenerate because of colour variance or small details.",
    "When the file is saved, reply with just: saved",
  ].join("\n");
}

function scenePrompt(scene) {
  return [
    LEDGER.style,
    scene.nexmaxInScene ? LEDGER.nexmax : null,
    scene.scene,
    `Output: one landscape illustration, ${LEDGER.output ?? "1536x1024"}.`.replace(
      / PNG.*\.$/,
      ".",
    ),
    LEDGER.noText,
    LEDGER.negative,
  ]
    .filter(Boolean)
    .join("\n");
}

async function api(pathname, opts = {}) {
  const url = new URL(pathname, BRIDGE);
  url.searchParams.set("token", TOKEN);
  if (opts.name) url.searchParams.set("name", opts.name);
  return fetch(url, { method: opts.method ?? "GET", body: opts.body });
}

/** 1本のWS接続＋1スレッド。詰まったら丸ごと捨てて作り直す。 */
class Session {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.activeTurn = null;
    this.ws = null;
    this.threadId = null;
  }

  async open(workdir) {
    const url = new URL("/codex", BRIDGE.replace("http", "ws"));
    url.searchParams.set("token", TOKEN);
    this.ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("WS connect failed")), {
        once: true,
      });
    });
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data)));
    this.ws.addEventListener("close", () => {
      for (const p of this.pending.values()) p.reject(new Error("WS closed"));
      this.pending.clear();
      if (this.activeTurn) {
        const t = this.activeTurn;
        this.activeTurn = null;
        clearTimeout(t.timer);
        t.reject(new Error("WS closed"));
      }
    });
    await this.request("initialize", {
      clientInfo: { name: "nexmax-academy", title: "slide image gen", version: "0.1.0" },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: null,
      },
    });
    this.notify("initialized");
    const started = await this.request("thread/start", {
      cwd: workdir,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      serviceName: "Nexmax Academy",
      personality: "pragmatic",
      ephemeral: true,
      sessionStartSource: "startup",
      threadSource: "user",
      developerInstructions: IMAGE_INSTRUCTIONS,
    });
    this.threadId = started.thread.id;
    console.log("thread:", this.threadId);
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
  }

  request(method, params) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request ${method} timeout (30s)`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  notify(method, params) {
    this.ws.send(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if ("id" in msg && ("result" in msg || "error" in msg)) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? "request failed"));
      else p.resolve(msg.result);
      return;
    }
    if ("id" in msg && msg.method) {
      // サーバからの対話リクエスト（承認要求など）は使わない
      this.ws.send(
        JSON.stringify({
          id: msg.id,
          error: { code: -32000, message: "interactive server requests are not implemented." },
        }),
      );
      return;
    }
    if (msg.method === "turn/completed" && this.activeTurn) {
      const turn = msg.params?.turn;
      const t = this.activeTurn;
      this.activeTurn = null;
      clearTimeout(t.timer);
      if (turn?.error) t.reject(new Error(turn.error.message ?? JSON.stringify(turn.error)));
      else t.resolve();
    }
  }

  runImage(prompt, outName, refPaths) {
    const completed = new Promise((resolve, reject) => {
      this.activeTurn = {
        resolve,
        reject,
        timer: setTimeout(() => {
          if (this.activeTurn) {
            const t = this.activeTurn;
            this.activeTurn = null;
            const err = new Error("turn timeout");
            err.stuck = true;
            t.reject(err);
          }
        }, IMAGE_TIMEOUT_MS),
      };
    });
    const input = [
      // 参照画像を先、テキストを後（逆だとモデルが画像を弱く扱う）
      ...refPaths.map((p) => ({ type: "localImage", path: p })),
      { type: "text", text: buildImageTurn(prompt, outName), text_elements: [] },
    ];
    return this.request("turn/start", {
      threadId: this.threadId,
      input,
      effort: "low",
      personality: "pragmatic",
    }).then(
      () => completed,
      (err) => {
        if (this.activeTurn) {
          clearTimeout(this.activeTurn.timer);
          this.activeTurn = null;
        }
        throw err;
      },
    );
  }
}

async function fetchResult(outName, dest) {
  for (let i = 0; i < 10; i += 1) {
    const res = await api("/api/codex/file", { name: outName });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      return buf.length;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return 0;
}

// --- main ----------------------------------------------------------------
const hello = await (await api("/api/codex/hello")).json();
if (!hello.ok || !hello.portOpen) {
  console.error("bridge/app-server が動いていない。先に `npm run codex:bridge` を起動する:", hello);
  process.exit(1);
}
const workdir = hello.workdir;
fs.mkdirSync(OUT_DIR, { recursive: true });

const putRef = await api("/api/codex/file", {
  method: "PUT",
  name: "ref_nexmax.png",
  body: fs.readFileSync(REFERENCE),
});
if (!putRef.ok) {
  console.error("参照画像を置けない:", await putRef.text());
  process.exit(1);
}
const refNexmax = path.join(workdir, "ref_nexmax.png");

// 絵柄アンカー: 1枚目の合格画像を以後の参照に足す（既にあればそれを使う）
let styleAnchor = null;
const first = LEDGER.scenes[0];
const firstLocal = path.join(OUT_DIR, `${first.out}.png`);
if (fs.existsSync(firstLocal)) {
  const put = await api("/api/codex/file", {
    method: "PUT",
    name: "anchor.png",
    body: fs.readFileSync(firstLocal),
  });
  if (put.ok) styleAnchor = path.join(workdir, "anchor.png");
}

let session = new Session();
await session.open(workdir);

const failures = [];
for (const scene of LEDGER.scenes) {
  const outName = `${scene.out}.png`;
  const dest = path.join(OUT_DIR, outName);
  if (fs.existsSync(dest)) {
    console.log(`skip ${outName} (exists)`);
    continue;
  }
  const refs = styleAnchor ? [refNexmax, styleAnchor] : [refNexmax];
  console.log(`[${new Date().toISOString()}] generating ${outName} — ${scene.title}`);
  let ok = false;
  for (let attempt = 1; attempt <= 2 && !ok; attempt += 1) {
    try {
      await session.runImage(scenePrompt(scene), outName, refs);
      const size = await fetchResult(outName, dest);
      if (size > 0) {
        console.log(`  saved ${outName} (${(size / 1024).toFixed(0)} KB)`);
        ok = true;
      } else {
        console.log(`  ${outName}: turn done but file missing (attempt ${attempt})`);
      }
    } catch (err) {
      console.log(`  ${outName}: ${err.message} (attempt ${attempt})`);
      if (err.stuck || /WS closed|timeout/.test(String(err.message))) {
        console.log("  reconnecting session...");
        session.close();
        session = new Session();
        await session.open(workdir);
      }
    }
  }
  if (!ok) failures.push(scene.out);
  if (ok && !styleAnchor) styleAnchor = path.join(workdir, outName);
}

console.log(failures.length ? `FAILED: ${failures.join(", ")}` : "ALL DONE");
session.close();
process.exit(failures.length ? 2 : 0);
