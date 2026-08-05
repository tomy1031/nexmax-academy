import { describe, expect, it } from "vitest";
import { toAlias } from "../scripts/preview_alias.mjs";

/** wrangler.jsonc の Worker 名が "academy"（7文字）なので 63 - 7 - 1。 */
const MAX = 55;

describe("ブランチ名 → Cloudflare のエイリアス", () => {
  it("Cloudflare が受け付ける文字だけになる（英小文字・数字・ダッシュ）", () => {
    // 実際のブランチ名。`/` を含むのでそのままでは使えない。
    expect(toAlias("claude/character-personality-design-2328fd", MAX)).toBe(
      "claude-character-personality-design-2328fd",
    );
    expect(toAlias("feature/Map_UI", MAX)).toBe("feature-map-ui");
  });

  it("先頭は必ず英小文字（数字・ダッシュ始まりは拒否される）", () => {
    expect(toAlias("2328fd-design", MAX)).toBe("fd-design");
    expect(toAlias("-leading-dash", MAX)).toBe("leading-dash");
    expect(toAlias("123/main", MAX)).toBe("main");
  });

  it("ダッシュが連続せず、末尾にも残らない", () => {
    expect(toAlias("a//b__c", MAX)).toBe("a-b-c");
    expect(toAlias("trailing///", MAX)).toBe("trailing");
  });

  it("DNSラベルの63文字に収まるよう切り詰める（末尾のダッシュも残さない）", () => {
    const long = `claude/${"x".repeat(80)}`;
    const alias = toAlias(long, MAX);
    expect(alias.length).toBe(MAX);
    expect(alias.endsWith("-")).toBe(false);
    // 切り詰めた位置がダッシュでも末尾に残さない
    expect(toAlias(`${"a".repeat(MAX)}-tail`, MAX)).toBe("a".repeat(MAX));
    expect(toAlias(`${"a".repeat(MAX - 1)}-tail`, MAX)).toBe("a".repeat(MAX - 1));
  });

  it("main はそのまま staging にはならない（呼び出し側で staging を渡す）", () => {
    // main-only ガードは alias === "staging" で判定するので、
    // ブランチ名 main が勝手に staging に化けると素通りしてしまう。
    expect(toAlias("main", MAX)).toBe("main");
  });

  it("英小文字が残らない名前は、黙って変な名前にせずエラーにする", () => {
    expect(() => toAlias("2328", MAX)).toThrow(/エイリアスを作れません/);
    expect(() => toAlias("日本語", MAX)).toThrow(/エイリアスを作れません/);
  });
});
