"use client";

/**
 * Codex（ChatGPT の枠）で絵を1枚つくる
 *
 * 流れ:
 *   1. 参照画像をブリッジの作業フォルダへ置く（PUT /api/codex/file）
 *   2. Codex に「そのフォルダへ保存して」と頼む（WebSocket）
 *   3. できた絵をブリッジから取る（GET /api/codex/file）
 *
 * ブリッジは**作業フォルダ1つの中だけ**を読み書きの対象にしている。
 * 生成結果のパスをブラウザが自由に指定できると、任意のファイルを読める穴になるため
 *（scripts/codex_bridge.mjs 冒頭）。ファイル名もこちらで決めて渡す。
 *
 * 参照画像はアプリ側では URL（`/img/characters/hendy/sheet.webp`）で持っている。
 * Codex はローカルのパスしか読めないので、いったん取ってきて置き直す。
 */

import { CodexTransport } from "@/lib/codex-transport";
import {
  codexHttpUrl,
  codexSocketUrl,
  hasCodex,
  readCodexSettings,
  type CodexSettings,
} from "@/lib/codex-settings";

export type CodexImageResult = { ok: true; file: File } | { ok: false; message: string };

/** ブリッジが受け取るファイル名の形（あちらの SAFE_NAME と同じ約束）。 */
function safeName(prefix: string, extension: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}.${extension}`;
}

async function hello(settings: CodexSettings): Promise<{ workdir: string } | null> {
  try {
    const response = await fetch(codexHttpUrl(settings, "/api/codex/hello"), { method: "GET" });
    if (!response.ok) return null;
    const body = (await response.json()) as { workdir?: unknown };
    return typeof body.workdir === "string" ? { workdir: body.workdir } : null;
  } catch {
    return null;
  }
}

/** 参照画像を1枚、作業フォルダへ置く。置けたらローカルの絶対パスを返す。 */
async function putReference(settings: CodexSettings, url: string): Promise<string | null> {
  let bytes: Blob;
  try {
    const source = await fetch(url);
    if (!source.ok) return null;
    bytes = await source.blob();
  } catch {
    return null;
  }
  const extension = (bytes.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
  const name = safeName("ref", extension === "webp" ? "webp" : extension === "jpg" ? "jpg" : "png");
  try {
    const response = await fetch(
      codexHttpUrl(settings, "/api/codex/file").toString() + `&name=${name}`,
      {
        method: "PUT",
        body: bytes,
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { path?: unknown };
    return typeof body.path === "string" ? body.path : null;
  } catch {
    return null;
  }
}

/**
 * 絵を1枚つくる。使えないときは `ok:false` を返すだけで、投げない
 * ——呼ぶ側は Gemini に回せるようにしておく。
 */
export async function generateWithCodex({
  prompt,
  references = [],
}: {
  prompt: string;
  references?: readonly string[];
}): Promise<CodexImageResult> {
  const settings = readCodexSettings();
  if (!hasCodex(settings)) {
    return {
      ok: false,
      message: "Codex の 合言葉が まだ ありません。「AI設定」で 入れてください。",
    };
  }

  const info = await hello(settings);
  if (!info) {
    return {
      ok: false,
      message:
        "Codex に つながりません。`npm run codex:bridge` が このPCで 動いているか、合言葉が 合っているか たしかめてください。",
    };
  }

  // 参照画像は「無くても描ける」ものとして扱う。1枚落ちても止めない
  const refPaths = (
    await Promise.all(references.slice(0, 4).map((url) => putReference(settings, url)))
  ).filter((path): path is string => path !== null);

  const outName = safeName("out", "png");
  const transport = new CodexTransport();
  try {
    await transport.connect(codexSocketUrl(settings));
    await transport.runImage({ prompt, outName, workdir: info.workdir, refPaths });
  } catch (error) {
    transport.disconnect();
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  transport.disconnect();

  let file: Blob;
  try {
    const response = await fetch(
      codexHttpUrl(settings, "/api/codex/file").toString() + `&name=${outName}`,
    );
    if (!response.ok) {
      return {
        ok: false,
        message: "絵は できたはずですが、受け取れませんでした。もう一度 ためしてください。",
      };
    }
    file = await response.blob();
  } catch {
    return { ok: false, message: "絵を 受け取れませんでした。もう一度 ためしてください。" };
  }

  return { ok: true, file: new File([file], outName, { type: file.type || "image/png" }) };
}
