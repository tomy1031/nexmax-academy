"use client";

/**
 * Codex（ChatGPT の枠）で、決まった形の文章をつくる
 *
 * 絵の `codex-image.ts` と対になる。ちがいは1つだけ——
 * 絵はファイルの受け渡しが要るので作業フォルダを経由するが、
 * 文章は **WebSocket の返事そのもの**で完結する。
 *
 * ## 形をどう縛るか
 * `TurnStartParams.outputSchema` が実在する（codex-cli 0.145.0 で確認）。
 * "Optional JSON Schema used to constrain the final assistant message for this turn."
 * Gemini の `responseSchema` と同じ役目なので、**同じスキーマ定数を両方に渡せる**。
 * 定義が1か所で済み、片方だけ古くなる事故が起きない。
 *
 * それでも読む側の防御は外さない（`json-reply.ts`）。縛っても前置きが混ざる余地は
 * 残るし、形が合っていても中身が規律に反することはある。
 */

import { CodexTransport } from "@/lib/codex-transport";
import { codexSocketUrl, hasCodex, readCodexSettings } from "@/lib/codex-settings";

export type CodexTextResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * 教材をつくらせるときの役割の指示。
 *
 * ここに書くのは「毎回きく決まり」だけにする。教材ごとの中身は頼み文（prompt）側。
 * 分けておくと、頼み文を直しても規律が落ちない。
 *
 * 禁止語をそのまま並べているのは、**書かせないため**である。
 * `lint:content` は禁止語を含むソースも落とすので、この文字列は
 * `scripts/lint_content.ts` の走査対象（src/）に入っている——
 * 語をそのまま書くと自分の検査に落ちるため、意味で伝えている。
 */
export const CONTENT_INSTRUCTIONS = [
  "You write Japanese language-learning material for Cambodian IT students (JLPT N5-N3).",
  "Do not edit files, run commands, or browse. Reply with the requested JSON only.",
  "",
  "Hard rules for anything a learner will read:",
  "- Keep every sentence under 30 characters. Split long ones.",
  "- Never tell a learner their answer is wrong, mistaken, or no good.",
  "  Feedback is encouragement plus the single next action.",
  "- Never write ruby/furigana as HTML. Kanji readings go in the reading dictionary only.",
  "- Cover EVERY kanji that appears in learner-facing text with a reading-dictionary entry.",
  "  One uncovered kanji stops the learner dead.",
  "- Do not name countries other than 日本 and カンボジア.",
].join("\n");

/**
 * 形を決めて文章を作らせる。
 *
 * 使えないときは `ok:false` を返すだけで投げない——呼ぶ側が Gemini に回せるようにしておく。
 */
export async function generateJsonWithCodex<T>({
  prompt,
  shape,
  outputSchema,
  validate,
  instructions = CONTENT_INSTRUCTIONS,
  onProgress,
}: {
  prompt: string;
  /** 期待する形（言い直させるときに もう一度見せる文字列）。 */
  shape: string;
  /** JSON Schema。プロトコル層で形を縛る。 */
  outputSchema?: object;
  validate: (value: unknown) => { ok: true; value: T } | { ok: false; problem: string };
  instructions?: string;
  onProgress?: (text: string) => void;
}): Promise<CodexTextResult<T>> {
  const settings = readCodexSettings();
  if (!hasCodex(settings)) {
    return { ok: false, message: "Codex の 合言葉が ありません" };
  }

  const transport = new CodexTransport();
  try {
    await transport.connect(codexSocketUrl(settings), instructions);
    const value = await transport.runJson({ prompt, shape, outputSchema, validate, onProgress });
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    transport.disconnect();
  }
}
