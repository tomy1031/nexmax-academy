"use client";

/**
 * 絵をつくる（ブラウザ側の入口）
 *
 * エリアの絵・キャラクターシート・まんがのコマが、みんなこれを通る。
 * 呼ぶ場所ごとに fetch を書くと、失敗の言い方が画面ごとにばらける。
 *
 * ## 経路は2つ。合言葉があれば Codex を先に使う
 *
 * 1. **Codex**（ChatGPT の枠・`gpt-image-2`）— 「AI設定」で合言葉を入れてあるとき。
 *    公開中のURLからでも、先生のPCで動く `codex:bridge` を通して使える
 *    （`ws://127.0.0.1` は https のページからでも開けることを実測した）。
 * 2. **Gemini**（BYOK）— 合言葉が無いとき、または Codex に届かないとき。
 *    サーバのプロキシ（/api/studio/image）へ頼み、画像だけ受け取る。
 *    キーも上流の応答本文も返ってこない（AGENTS.md 規律4）。
 *
 * Codex を先にするのは、絵の水準がこちらのほうが高いため。ただし
 * **落ちたら黙って Gemini に回す**——先生が絵を待っている場面で、
 * ブリッジが止まっているというだけで手が止まるのは割に合わない。
 */

import { generateWithCodex } from "@/lib/codex-image";
import { hasCodex } from "@/lib/codex-settings";

export type ImageResult = { ok: true; file: File } | { ok: false; message: string };

export async function generateImage({
  apiKey,
  prompt,
  references = [],
}: {
  apiKey: string;
  prompt: string;
  /** 参照画像のURL（キャラクターシートなど）。顔や服をぶれさせないために渡す。 */
  references?: readonly string[];
}): Promise<ImageResult> {
  if (hasCodex()) {
    const viaCodex = await generateWithCodex({ prompt, references });
    if (viaCodex.ok) return viaCodex;
    // キーも無いなら、Codex の理由をそのまま見せる（Gemini の言い訳より役に立つ）
    if (!apiKey) return viaCodex;
  }

  let response: Response;
  try {
    response = await fetch("/api/studio/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, prompt, references }),
    });
  } catch {
    return { ok: false, message: "つうしんに 失敗しました。ネットワークを たしかめてください。" };
  }

  let body: { data?: unknown; mimeType?: unknown; reason?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // 本文が読めない＝理由も分からない。下の言い分けに任せる
  }
  if (!response.ok || typeof body.data !== "string") {
    return {
      ok: false,
      message: messageForReason(typeof body.reason === "string" ? body.reason : ""),
    };
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/png";
  const bytes = Uint8Array.from(atob(body.data), (char) => char.charCodeAt(0));
  const extension = mimeType.split("/")[1] ?? "png";
  return { ok: true, file: new File([bytes], `image.${extension}`, { type: mimeType }) };
}

function messageForReason(reason: string): string {
  switch (reason) {
    case "noKey":
      return "AIの キーが まだ ありません。「AI設定」で 登録してください。";
    case "invalidPrompt":
      return "説明が ながすぎます。みじかく してください。";
    case "noImage":
      return "絵が かえって きませんでした。書き方を 少し 変えて ためしてください。";
    case "forbidden":
      return "この そうさは 先生（管理者）だけです。";
    default:
      return "絵を つくれませんでした。少し 待って もう一度 ためしてください。";
  }
}
