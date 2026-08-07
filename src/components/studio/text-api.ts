"use client";

/**
 * 文章をつくる（ブラウザ側の入口）
 *
 * 絵の `image-api.ts` と同じ形にそろえてある。**Codex を先に使い、
 * 届かなければ Gemini に回る。**
 *
 * Codex を先にする理由は2つ:
 *   1. Gemini の無料枠が少ない（教材1本で十数回の生成になる）
 *   2. 同じ JSON Schema をそのまま `outputSchema` に渡せるので、形の縛りが落ちない
 *
 * 黙って Gemini に回すのは、先生が待っている場面で「ブリッジが止まっている」
 * というだけで手が止まるのは割に合わないため。どちらで作ったかは戻り値の
 * `via` で分かるので、画面に出せる（先生は枠の消費を知りたい）。
 */

import { generateJsonWithCodex } from "@/lib/codex-text";
import { hasCodex } from "@/lib/codex-settings";

export type TextVia = "codex" | "gemini";

export type TextResult<T> = { ok: true; value: T; via: TextVia } | { ok: false; message: string };

/**
 * @param viaGemini いままでの経路（サーバのプロキシ）。そのまま渡す。
 *   Codex が使えないとき・失敗したときだけ呼ばれる。
 */
export async function generateStructured<T>({
  prompt,
  shape,
  outputSchema,
  validate,
  viaGemini,
  onProgress,
}: {
  prompt: string;
  shape: string;
  outputSchema?: object;
  validate: (value: unknown) => { ok: true; value: T } | { ok: false; problem: string };
  viaGemini: () => Promise<{ ok: true; value: T } | { ok: false; message: string }>;
  onProgress?: (text: string) => void;
}): Promise<TextResult<T>> {
  if (hasCodex()) {
    const made = await generateJsonWithCodex({
      prompt,
      shape,
      outputSchema,
      validate,
      onProgress,
    });
    if (made.ok) return { ok: true, value: made.value, via: "codex" };
    // 合言葉はあるのに届かない・形がそろわない → Gemini に回す
  }

  const fallback = await viaGemini();
  return fallback.ok ? { ok: true, value: fallback.value, via: "gemini" } : fallback;
}
