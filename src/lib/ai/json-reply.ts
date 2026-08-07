/**
 * AI の返事から JSON を取り出す
 *
 * 文章生成を Codex（ChatGPT の枠）に寄せると、返ってくるのは「ただの文章」になる。
 * Gemini の `responseSchema` のような、形を機械で縛る仕組みが無い。
 * だから受け取る側で頑丈にする。
 *
 * 実測（2026-08-07・codex-cli 0.145.0）: 「これだけを出力し、前置きもコードフェンスも
 * 付けないこと」と書けば、素の JSON がそのまま返る。ただし**毎回そうだとは限らない**ので、
 * よくある3つの崩れ方を吸収する:
 *
 *   1. ```json … ``` で囲む
 *   2. 「はい、作りました:」のような前置きが付く
 *   3. 後書き（「必要なら直します」）が付く
 *
 * 直せない崩れ（途中で切れている・鍵括弧が閉じていない）は null を返し、
 * 呼ぶ側が**理由を添えてもう一度頼む**。黙って部分的な結果を通さない
 * ——半端な教材が「作れた」ことにされると、先生が気づかないまま公開してしまう。
 */

/**
 * 最初の完全な JSON オブジェクト（または配列）を取り出す。
 *
 * 文字列の中の括弧を数えないよう、**クォートの中かどうかを見ながら**走査する。
 * 単純な `indexOf("{")` 〜 `lastIndexOf("}")` だと、
 * セリフに「」でなく {} が入っていたときに壊れる。
 */
export function extractJsonText(raw: string): string | null {
  const text = stripFence(raw).trim();
  if (text.length === 0) return null;

  const start = findStart(text);
  if (start < 0) return null;

  const opener = text[start] as "{" | "[";
  const closer = opener === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // 閉じないまま終わった＝途中で切れている。継ぎ足して通さない
  return null;
}

/** ```json … ``` の囲みを外す。中身が無いときは元の文字列のまま返す。 */
function stripFence(raw: string): string {
  const fenced = raw.match(/```(?:json|jsonc|JSON)?\s*\n([\s\S]*?)\n?```/);
  return fenced?.[1] ?? raw;
}

/** 最初に現れる `{` か `[`。どちらも無ければ -1。 */
function findStart(text: string): number {
  const brace = text.indexOf("{");
  const bracket = text.indexOf("[");
  if (brace < 0) return bracket;
  if (bracket < 0) return brace;
  return Math.min(brace, bracket);
}

/**
 * 取り出して JSON として読む。読めなければ null。
 *
 * 型の検査はしない——それは呼ぶ側の zod スキーマの仕事である
 *（`src/content/schema.ts` が唯一の契約。ここで別の判定を持つと二重管理になる）。
 */
export function parseJsonReply(raw: string): unknown {
  const text = extractJsonText(raw);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 形が違ったときに、AI へ返す「直してほしい」の文面。
 *
 * zod のエラーをそのまま貼らないのは、英語のパス表記（`beats.0.what`）だけだと
 * モデルが「どう直すか」を誤ることがあるため。**期待する形をもう一度見せる**。
 */
export function buildRetryNote(problem: string, shape: string): string {
  return [
    "さきほどの返事は、形が合っていませんでした。",
    `問題: ${problem}`,
    "",
    "もう一度、**下の形だけ**を出力してください。",
    "前置き・後書き・```（コードフェンス）を付けないでください。",
    "",
    shape,
  ].join("\n");
}
