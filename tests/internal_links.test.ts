import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTENT_REF_TYPES,
  type ContentRefType,
  type StageContentRef,
} from "../src/content/schema";
import { contentHref } from "../src/lib/content-kinds";
import {
  NO_STANDALONE_PAGE,
  replacedContent,
  resolveStageContent,
  splitContentSegment,
  stageContentPath,
  standaloneContent,
} from "../src/lib/stage-routes";

/**
 * アプリの 中の リンクが「この ページは ありません」に 落ちない ことを 見張る（2026-10-16）
 *
 * 朝礼・夕礼の 前ばなしの ページに ある「つぎは これ」カードが `/meeting/<ID>` を 指して
 * いたのに、その URL を 受ける ページが どこにも 無かった。`/[stage]` の ページが
 * 1段目を ステージID と 読んで しまうので、**ルートの 形だけ 見ると 当たって 見える**
 *（`/meeting/x` は `[stage]/[content]` に 当たる）。だから ここでは 形では なく、
 * **その URL で 実際に 何が 出るか**を、ページと 同じ 関数で 引いて 確かめる。
 *
 * 見る ものは 3つ:
 *  1. 教材データの 中の リンク（記事の「つぎは これ」カード・ステージの 並び・単語セット）
 *  2. 画面の 部品に 直に 書いた 行き先（`href="/map"` など）
 *  3. public/ の 静的ページ（学習用サイト・練習ツール）の 中の リンクと 画像
 *
 * 外の サイトへの リンク（extlink）は ネットに 出ないと 確かめられないので ここでは 見ない。
 */

const ROOT = process.cwd();
const APP = join(ROOT, "src", "app");
const PUBLIC = join(ROOT, "public");

/* ------------------------------------------------------------------ *
 * 教材データ（git）
 * ------------------------------------------------------------------ */

type Json = Record<string, unknown>;

function readContent(): Json[] {
  const out: Json[] = [];
  for (const dir of readdirSync(join(ROOT, "content"))) {
    const full = join(ROOT, "content", dir);
    if (!statSync(full).isDirectory()) continue;
    for (const file of readdirSync(full)) {
      if (!file.endsWith(".json")) continue;
      const data = JSON.parse(readFileSync(join(full, file), "utf8")) as Json;
      out.push({ ...data, __file: `content/${dir}/${file}` });
    }
  }
  return out;
}

const CONTENT = readContent();
const IDS = new Set(CONTENT.map((item) => `${String(item.kind)}:${String(item.id)}`));
const STAGES = CONTENT.filter((item) => item.kind === "stage") as unknown as {
  id: string;
  status?: string;
  contents: StageContentRef[];
  wordStageIds?: string[];
  __file: string;
}[];

function exists(type: ContentRefType, id: string): boolean {
  return IDS.has(`${type}:${id}`);
}

/** その教材が 入って いる ステージの URL（`canonicalContentPath` と 同じ 引き方）。 */
function canonical(type: ContentRefType, id: string): string | null {
  for (const stage of STAGES) {
    const index = stage.contents.findIndex((item) => item.ref === id && item.type === type);
    if (index >= 0) return stageContentPath(stage.id, stage.contents, index);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * ルート（src/app）と 転送（next.config）
 * ------------------------------------------------------------------ */

/** `page.tsx` / `route.ts` の ある フォルダを、URL の 段の 並びで 返す。 */
function routes(dir: string, base: string[] = []): string[][] {
  const out: string[][] = [];
  const names = readdirSync(dir);
  if (names.some((name) => /^(page|route)\.tsx?$/.test(name))) out.push(base);
  for (const name of names) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    // (グループ) は URL に 出ない。_private は ルートに ならない。
    if (name.startsWith("_")) continue;
    out.push(...routes(full, /^\(.*\)$/.test(name) ? base : [...base, name]));
  }
  return out;
}

const ROUTES = routes(APP);
const dynamic = (segment: string) => /^\[.*\]$/.test(segment);
const catchAll = (segment: string) => /^\[\[?\.\.\./.test(segment);

/** next.config の 転送（source → destination）。`:id` は 1段ぶんの なんでも。 */
const REDIRECTS: { from: string[]; to: string }[] = [
  ...readFileSync(join(ROOT, "next.config.ts"), "utf8").matchAll(
    /source:\s*"([^"]+)",\s*destination:\s*"([^"]+)"/g,
  ),
].map((match) => ({ from: (match[1] ?? "").split("/").filter(Boolean), to: match[2] ?? "" }));

/** 1段目が 決まった 名前の ルート（`[stage]` 以外）に 当たるか。 */
function staticRoute(segments: string[]): boolean {
  return ROUTES.some((route) => {
    if (route.length === 0) return segments.length === 0;
    if (dynamic(route[0] ?? "")) return false;
    if (route.some(catchAll)) {
      const head = route.findIndex(catchAll);
      return (
        segments.length >= head &&
        route.slice(0, head).every((part, i) => dynamic(part) || part === segments[i])
      );
    }
    return (
      route.length === segments.length &&
      route.every((part, i) => dynamic(part) || part === segments[i] || segments[i] === "*")
    );
  });
}

/**
 * その URL を 開いたら ページが 出るか。出なければ 理由、出れば null。
 *
 * `*` の 段は 部品の 中で `${...}` に なって いて、ここでは 中身が 分からない 段。
 */
function brokenReason(path: string, depth = 0): string | null {
  const clean = path.split(/[?#]/)[0] ?? "";
  const segments = clean.split("/").filter(Boolean);

  // public/ の ファイル（絵・音・静的ページ）
  if (segments.length > 0 && !segments.includes("*")) {
    const file = join(PUBLIC, ...segments.map(decodeURIComponent));
    if (existsSync(file) && statSync(file).isFile()) return null;
    if (existsSync(join(file, "index.html"))) return null;
  }

  for (const redirect of REDIRECTS) {
    const hit =
      redirect.from.length === segments.length &&
      redirect.from.every((part, i) => part.startsWith(":") || part === segments[i]);
    if (hit && depth < 3) {
      const to = redirect.to.replace(/:(\w+)/g, (_, name) => {
        const i = redirect.from.indexOf(`:${name}`);
        return segments[i] ?? "";
      });
      return brokenReason(to, depth + 1);
    }
  }

  if (staticRoute(segments)) return null;
  // src/app 直下の 絵（favicon.ico・icon.png・apple-icon.png）は Next が その名前で 配る
  if (segments.length === 1 && existsSync(join(APP, segments[0] ?? ""))) return null;

  // ここから先は `[stage]` / `[stage]/[content]` が 受ける
  const [first = "", second = ""] = segments;
  if (first === "*") return null; // 1段目が 実行時に 決まる（`/${stage.id}`）。ここでは 引けない
  if (segments.length > 2) return "ルートが ありません";
  const stage = STAGES.find((one) => one.id === first);
  if (stage) {
    if (segments.length === 1) return null;
    if (second === "*") return null;
    if (resolveStageContent(stage.contents, second)) return null;
  }
  if (segments.length === 2 && second !== "*") {
    const moved =
      standaloneContent(first, second) ??
      replacedContent(first, second) ??
      splitContentSegment(second);
    if (moved && canonical(moved.type, moved.ref)) return null;
  }
  return stage
    ? "ステージの 中に その 教材が ありません"
    : "その URL を 受ける ページが ありません";
}

/* ------------------------------------------------------------------ *
 * 1. 教材データの 中の リンク
 * ------------------------------------------------------------------ */

function collectLinkBlocks(value: unknown, out: { type: ContentRefType; ref: string }[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectLinkBlocks(item, out);
  } else if (value && typeof value === "object") {
    const object = value as Json;
    if (
      object.kind === "link" &&
      typeof object.type === "string" &&
      typeof object.ref === "string" &&
      (CONTENT_REF_TYPES as readonly string[]).includes(object.type)
    ) {
      out.push({ type: object.type as ContentRefType, ref: object.ref });
    }
    for (const [key, child] of Object.entries(object)) {
      if (key !== "__file") collectLinkBlocks(child, out);
    }
  }
  return out;
}

describe("教材データの 中の リンク", () => {
  it("どの 種別の 行き先にも、受ける ページが ある（単独の ページが 無い 種別は ステージの URL へ 送る）", () => {
    const homeless = CONTENT_REF_TYPES.filter((type) => {
      const segments = contentHref(type, "x").split("/").filter(Boolean);
      const owned = staticRoute(segments);
      const forwarded = standaloneContent(segments[0] ?? "", segments[1] ?? "")?.type === type;
      return !owned && !forwarded;
    });
    expect(homeless).toEqual([]);
  });

  it("単独の ページが 無い 種別は、ほんとうに 単独の ページを 持って いない（持ったら 一覧から 外す）", () => {
    for (const type of NO_STANDALONE_PAGE) {
      const segments = contentHref(type, "x").split("/").filter(Boolean);
      expect(staticRoute(segments)).toBe(false);
    }
  });

  it("記事などの「つぎは これ」カードは、ある 教材を 指し、押すと ページが 出る", () => {
    const broken: string[] = [];
    for (const item of CONTENT) {
      for (const link of collectLinkBlocks(item)) {
        const href = contentHref(link.type, link.ref);
        if (!exists(link.type, link.ref)) {
          broken.push(`${String(item.__file)}: ${href}（${link.type} ${link.ref} が ありません）`);
          continue;
        }
        const reason = brokenReason(href);
        if (reason) broken.push(`${String(item.__file)}: ${href}（${reason}）`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("朝礼・夕礼の 前ばなしの カードは、その ステージの ミーティングへ 送られる", () => {
    expect(standaloneContent("meeting", "asakai_kantan")).toEqual({
      type: "meeting",
      ref: "asakai_kantan",
    });
    expect(canonical("meeting", "asakai_kantan")).toBe("/asakai/meeting-asakai_kantan");
    expect(canonical("meeting", "asakai_muzukashii")).toBe("/asakai/meeting-asakai_muzukashii");
    expect(brokenReason(contentHref("meeting", "asakai_kantan"))).toBeNull();
    expect(brokenReason(contentHref("meeting", "asakai_muzukashii"))).toBeNull();
    // ステージに 入って いない ミーティングは 送り先が 無い（直す 前と 同じ 404 に なる）
    expect(brokenReason("/meeting/no_such_meeting")).not.toBeNull();
  });

  it("教材データに 書いた 同じ サイトの 道（リンク教材の url・外への カード・絵・音・動画）は、ファイルか ページが ある", () => {
    const broken: string[] = [];
    const walk = (value: unknown, file: string) => {
      if (typeof value === "string") {
        if (/^\/[A-Za-z0-9_-][^\s]*$/.test(value) && value.length < 300) {
          const reason = brokenReason(value);
          if (reason) broken.push(`${file}: ${value}（${reason}）`);
        }
      } else if (Array.isArray(value)) {
        for (const item of value) walk(item, file);
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) if (key !== "__file") walk(child, file);
      }
    };
    for (const item of CONTENT) walk(item, String(item.__file));
    expect(broken).toEqual([]);
  });

  it("ステージの 並びと 単語セットは、ある 教材だけを 指す", () => {
    const broken: string[] = [];
    for (const stage of STAGES) {
      for (const item of stage.contents) {
        if (!exists(item.type, item.ref)) broken.push(`${stage.__file}: ${item.type} ${item.ref}`);
      }
      for (const id of stage.wordStageIds ?? []) {
        if (!exists("wordstage", id)) broken.push(`${stage.__file}: wordstage ${id}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 2. 画面の 部品に 直に 書いた 行き先
 * ------------------------------------------------------------------ */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
  return out;
}

/** 部品の 中の 行き先の 書きかた（href・転送・画面の 移動）。 */
const PATTERNS = [
  /href=\{?"(\/[^"]*)"/g,
  /href=\{`(\/[^`]*)`\}/g,
  /href:\s*"(\/[^"]*)"/g,
  /href:\s*`(\/[^`]*)`/g,
  /_HREF\s*=\s*"(\/[^"]*)"/g,
  /\bredirect\(\s*"(\/[^"]*)"/g,
  /\bredirect\(\s*`(\/[^`]*)`/g,
  /router\.(?:push|replace)\(\s*"(\/[^"]*)"/g,
  /router\.(?:push|replace)\(\s*`(\/[^`]*)`/g,
];

/** `${...}` を `*` に 置きかえる（中身は 実行時に 決まる）。 */
function templated(path: string): string {
  return path.replace(/\$\{[^}]*\}/g, "*").replace(/\*[^/?#]*|[^/?#]*\*/g, "*");
}

describe("画面の 部品に 書いた 行き先", () => {
  const files = sourceFiles(join(ROOT, "src"));
  const found: { file: string; href: string }[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        found.push({ file: relative(ROOT, file), href: templated(match[1] ?? "") });
      }
    }
  }

  it("行き先を 拾えて いる（拾えない 書き方に 変わったら この 検査が 空回りする）", () => {
    const hrefs = new Set(found.map((item) => item.href));
    for (const known of ["/map", "/map/settings", "/wordtest", "/welcome", "/admin/stages"]) {
      expect(hrefs).toContain(known);
    }
    expect(found.length).toBeGreaterThan(40);
  });

  it("どの 行き先も ページが 出る", () => {
    const broken = found
      .map((item) => ({ ...item, reason: brokenReason(item.href) }))
      .filter((item) => item.reason !== null)
      .map((item) => `${item.file}: ${item.href}（${item.reason}）`);
    expect(broken).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 3. public/ の 静的ページ
 * ------------------------------------------------------------------ */

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith(".html")) out.push(full);
  }
  return out;
}

describe("public/ の 静的ページの 中の リンクと 画像", () => {
  it("同じ サイトの 中を 指す href / src は、ファイルか ページが ある", () => {
    const broken: string[] = [];
    for (const file of htmlFiles(PUBLIC)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/g)) {
        const raw = (match[1] ?? "").trim();
        if (!raw || raw.startsWith("#") || raw.includes("${") || raw.includes("{{")) continue;
        if (/^(?:[a-z]+:|\/\/)/i.test(raw)) continue; // http(s)・mailto・data・javascript
        const path = raw.split(/[?#]/)[0];
        if (!path) continue;
        if (path.startsWith("/")) {
          const reason = brokenReason(path);
          if (reason) broken.push(`${relative(ROOT, file)}: ${raw}（${reason}）`);
        } else {
          const target = resolve(dirname(file), decodeURIComponent(path));
          if (!existsSync(target))
            broken.push(`${relative(ROOT, file)}: ${raw}（ファイルが ありません）`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
