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
 *    **この端末から Google へ直接**頼む（2026-08-17）。サーバのプロキシを通すと、
 *    香港のデータセンターで キーが 復号されるうえ、Google に 断られる。
 *
 * Codex を先にするのは、絵の水準がこちらのほうが高いため。ただし
 * **落ちたら黙って Gemini に回す**——先生が絵を待っている場面で、
 * ブリッジが止まっているというだけで手が止まるのは割に合わない。
 */

import { generateImageFromBrowser } from "@/lib/ai/generate-browser";
import { DEFAULT_IMAGE_MODEL } from "@/lib/ai/models";
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

  /*
   * この端末から Google に直接描いてもらう（2026-08-17 から サーバは 通さない）。
   * うちの Worker は香港で動くことがあり、そこを通すと Google に断られるうえ、
   * キーが香港で復号される。BYOK のキーはこの端末にある。
   */
  const direct = await generateImageFromBrowser({
    apiKey,
    model: DEFAULT_IMAGE_MODEL,
    prompt,
    references,
  });
  if (!direct.ok) return { ok: false, message: messageForReason(direct.reason) };
  return { ok: true, file: fileFrom(direct.mimeType, direct.data) };
}

/** base64 の絵を File にする。 */
function fileFrom(mimeType: string, data: string): File {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  const extension = mimeType.split("/")[1] ?? "png";
  return new File([bytes], `image.${extension}`, { type: mimeType });
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
