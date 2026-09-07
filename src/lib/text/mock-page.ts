/**
 * 事前調査の 模擬ページ（`scenario.research.pages[].html`）を、**描く前に 木へ ほどく**。
 *
 * ## なぜ innerHTML を やめたか
 * この HTML は 教材データで、`/admin` から 先生が 直せる。はじめは 正規表現で
 * 危ない ところを 消してから `dangerouslySetInnerHTML` に 渡して いたが、
 * それは **破れる**（2026-09-07 のコード検収が 実機 Chromium で 実証した）。
 * HTML の 読み手は 引用符の 直後の `/` を 属性の 区切りと 見るので、
 * `<img src="x"/onerror="alert(1)">` の `onerror` は「空白で 始まる 属性」を
 * 探す 正規表現に 当たらない。実体参照（`&#106;avascript:`）や `<base>` も 同じ。
 * 消す 側で 追いかけるかぎり、書く 側が いつでも 先に 行ける。
 *
 * だから **通す ものだけ 通す**形に した。ここが 返すのは タグ名と class と style だけを
 * 持つ 木で、画面は それを React の 要素に 組み立てる（`research-step.tsx`）。
 * 属性は 許した 2つ以外 **1つも 生き残らない**ので、`onerror` も `href` も `<base>` も
 * そもそも 木に 入らない。文字は 文字として 入る——もう一度 HTML として 読み直す 場所が
 * どこにも 無い。
 *
 * ## Worker でも 動く
 * DOM を 使わない 純関数。DOMPurify は `document` を 要る ので Cloudflare Workers では
 * 動かせない（`next build` は サーバでも この 木を 組む）。
 */

/** 通す タグ。いまの 模擬ページ9枚が 使って いる ものだけ。 */
export const MOCK_TAGS = [
  "div",
  "span",
  "p",
  "b",
  "br",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "ruby",
  "rt",
  "rp",
] as const;

export type MockTag = (typeof MOCK_TAGS)[number];

const TAG_SET: ReadonlySet<string> = new Set(MOCK_TAGS);

/** 中身を 持たない タグ。 */
const VOID_TAGS: ReadonlySet<string> = new Set(["br"]);

/**
 * 中身ごと 捨てる タグ。
 *
 * 許可リストの 外なので タグ自体は どのみち 消えるが、この2つだけは
 * **中の 文字も 消す**——`<script>alert(1)</script>` の 中身が 地の文として
 * 画面に 出ると、教材が 壊れて 見える（危険では ないが、読めない）。
 */
const DROP_WITH_CONTENT: ReadonlySet<string> = new Set(["script", "style", "title", "textarea"]);

export type MockNode =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "element";
      readonly tag: MockTag;
      readonly className?: string;
      readonly style?: Readonly<Record<string, string>>;
      readonly children: readonly MockNode[];
    };

/* ------------------------------------------------------------------ *
 * 文字
 * ------------------------------------------------------------------ */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  yen: "¥",
  middot: "·",
  hellip: "…",
};

/**
 * 実体参照を 文字に 戻す。
 *
 * **ほどく 前では なく、文字として 置く ときに だけ** 戻すのが 肝。先に 戻すと
 * `&lt;script&gt;` が タグに 化ける（消した はずの ものが 復活する 典型）。
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? safeChar(code) : whole;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? safeChar(code) : whole;
    }
    return NAMED_ENTITIES[lower] ?? whole;
  });
}

/** 記号に 戻すと タグに 見える 3文字は 戻さない（戻した 先で 読み直されない ためのだめ押し）。 */
function safeChar(code: number): string {
  if (code === 0x3c || code === 0x3e || code === 0x26) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * 属性
 * ------------------------------------------------------------------ */

/** class に 許す 形（英数字・ハイフン・下線・空白だけ）。 */
const CLASS_OK = /^[A-Za-z0-9_ -]+$/;

/** style の 値に 1つでも あれば その 宣言を 捨てる。 */
const STYLE_POISON = /url\(|expression|javascript:|behaviou?r|@import|[<>\\]/i;

/** `background-color` → `backgroundColor`。 */
function camel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * style を **文字列では なく 組**に して 返す（React に 渡す 形）。
 *
 * 文字列の まま 渡す 道が 無いので、ここを 抜けた 値は
 * 「property は 名前だけ・value は 危ない 語を 含まない」ものに 限られる。
 */
export function parseStyle(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const at = decl.indexOf(":");
    if (at < 0) continue;
    const prop = decl.slice(0, at).trim().toLowerCase();
    const value = decl.slice(at + 1).trim();
    if (!/^[a-z-]+$/.test(prop) || prop.startsWith("--")) continue;
    if (!value || value.length > 200 || STYLE_POISON.test(value)) continue;
    out[camel(prop)] = value;
  }
  return out;
}

/** 開始タグの 中から class と style だけ 拾う（ほかは 見ない＝残らない）。 */
function readAttributes(raw: string): { className?: string; style?: Record<string, string> } {
  const result: { className?: string; style?: Record<string, string> } = {};
  const attr = /(class|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = attr.exec(raw)) !== null) {
    const name = m[1]!.toLowerCase();
    const value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    if (name === "class") {
      if (CLASS_OK.test(value)) result.className = value.trim();
    } else {
      const style = parseStyle(value);
      if (Object.keys(style).length > 0) result.style = style;
    }
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * ほどく
 * ------------------------------------------------------------------ */

/** タグ1つ分の 形。属性の 中の `>` は 引用符で 守る。 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;

/**
 * 模擬ページの HTML を、通す タグだけの 木に ほどく。
 *
 * 許可リストの 外の タグは **中身を 残して 自分だけ 消える**（`<a>` の 文字は 出る）。
 * 閉じ忘れ・順番ちがいは 黙って 直す——先生の 書きかけで 画面が 落ちない ように。
 */
export function parseMockPage(html: string): MockNode[] {
  const root: MockNode[] = [];
  /** いま 開いて いる 要素の 積み。中身の 行き先は いつも 先頭。 */
  const stack: { tag: string; kept: Extract<MockNode, { kind: "element" }> | null }[] = [];
  /** 中身ごと 捨てる タグを 開いた 深さ（0 なら 捨てて いない）。 */
  let dropping = 0;

  const sink = (): MockNode[] => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const kept = stack[i]!.kept;
      if (kept) return kept.children as MockNode[];
    }
    return root;
  };

  const pushText = (raw: string) => {
    if (dropping > 0) return;
    const text = decodeEntities(raw);
    if (text) sink().push({ kind: "text", text });
  };

  let last = 0;
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html)) !== null) {
    pushText(html.slice(last, m.index));
    last = TAG.lastIndex;

    const closing = m[1] === "/";
    const name = m[2]!.toLowerCase();
    const rest = m[3] ?? "";

    if (DROP_WITH_CONTENT.has(name)) {
      if (closing) dropping = Math.max(0, dropping - 1);
      else if (!rest.trimEnd().endsWith("/")) dropping += 1;
      continue;
    }
    if (dropping > 0) continue;

    if (closing) {
      // 対応する 開始タグまで 巻き戻す（無ければ 何も しない）
      const at = stack.map((f) => f.tag).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }

    const known = TAG_SET.has(name);
    const selfClosed = rest.trimEnd().endsWith("/") || VOID_TAGS.has(name);

    if (!known) {
      // 知らない タグは 自分だけ 消える。中身は 親へ 流す。
      if (!selfClosed) stack.push({ tag: name, kept: null });
      continue;
    }

    const node: Extract<MockNode, { kind: "element" }> = {
      kind: "element",
      tag: name as MockTag,
      ...readAttributes(rest),
      children: [],
    };
    sink().push(node);
    if (!selfClosed) stack.push({ tag: name, kept: node });
  }
  pushText(html.slice(last));

  return root;
}
