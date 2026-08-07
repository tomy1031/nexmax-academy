import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CODEX_URL,
  codexHttpUrl,
  codexSocketUrl,
  hasCodex,
  readCodexSettings,
  saveCodexSettings,
} from "@/lib/codex-settings";

/**
 * Codex への つなぎ先
 *
 * 合言葉が付いていない接続先を組み立てると、ブリッジに 401 で弾かれて
 * 「なぜか つながらない」になる。ここは全部の生成の入口なので、
 * 組み立てのほうを検査で固定する。
 */

/** localStorage は node 環境には無いので、最小のものを置く。 */
class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
    writable: true,
  });
});

describe("保存と読み出し", () => {
  it("入れていないときは 既定のつなぎ先で、合言葉は空", () => {
    expect(readCodexSettings()).toEqual({ url: DEFAULT_CODEX_URL, token: "" });
  });

  it("入れたものが そのまま戻る", () => {
    saveCodexSettings({ url: "ws://127.0.0.1:9000/codex", token: "abc" });
    expect(readCodexSettings()).toEqual({ url: "ws://127.0.0.1:9000/codex", token: "abc" });
  });
});

describe("使えるかどうかの判定", () => {
  it("合言葉が無ければ 使えない（Gemini に回す）", () => {
    expect(hasCodex({ url: DEFAULT_CODEX_URL, token: "" })).toBe(false);
    expect(hasCodex({ url: DEFAULT_CODEX_URL, token: "   " })).toBe(false);
  });

  it("合言葉が あれば 使える", () => {
    expect(hasCodex({ url: DEFAULT_CODEX_URL, token: "abc" })).toBe(true);
  });
});

describe("接続先の組み立て", () => {
  const settings = { url: "ws://127.0.0.1:8790/codex", token: "s3cret" };

  it("WebSocket には 合言葉が付く（ブラウザは独自ヘッダを付けられないため）", () => {
    expect(codexSocketUrl(settings)).toBe("ws://127.0.0.1:8790/codex?token=s3cret");
  });

  it("HTTP 側は 同じホストの http:// になり、合言葉が付く", () => {
    const url = codexHttpUrl(settings, "/api/codex/hello");
    expect(url.origin).toBe("http://127.0.0.1:8790");
    expect(url.pathname).toBe("/api/codex/hello");
    expect(url.searchParams.get("token")).toBe("s3cret");
  });

  it("wss:// のときは https:// になる（トンネル越しでも同じ組み立てで済む）", () => {
    const url = codexHttpUrl(
      { url: "wss://codex.example.com/codex", token: "t" },
      "/api/codex/hello",
    );
    expect(url.origin).toBe("https://codex.example.com");
  });

  it("合言葉に記号が入っても URL が壊れない", () => {
    const url = codexSocketUrl({ url: "ws://127.0.0.1:8790/codex", token: "a b&c=d" });
    expect(new URL(url).searchParams.get("token")).toBe("a b&c=d");
  });
});
