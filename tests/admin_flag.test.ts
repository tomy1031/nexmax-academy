import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_FLAG_FRESH_MS,
  ADMIN_FLAG_KEY,
  adminFlagSnapshot,
  isAdminFlagFresh,
  parseAdminFlag,
  readIsAdmin,
  rememberAdminFlag,
  subscribeAdminFlag,
} from "@/lib/admin-flag";

/**
 * 「いま見ている人は 先生か」の 覚え書き（`src/lib/admin-flag.ts`）
 *
 * 教材の画面は ISR で 配られるので、鍵を 素通りさせてよいかを ブラウザ側でしか
 * 決められない。ここが 静かに 壊れると、**先生には 気づけない**——鍵は これまでどおり
 * 見えるままで、いつも どおり「それでも 見る」を 押してしまうからである。
 */

/** localStorage の 代わり。**書けない端末**（プライベートモード）も 真似できるようにする。 */
function fakeStorage(options: { readonly locked?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => {
      if (options.locked) throw new Error("blocked");
      return map.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.locked) throw new Error("blocked");
      map.set(key, value);
    },
  };
}

function useWindow(options: { readonly locked?: boolean } = {}) {
  vi.stubGlobal("window", { localStorage: fakeStorage(options) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseAdminFlag", () => {
  it("そろっている覚え書きだけを読む", () => {
    expect(parseAdminFlag(JSON.stringify({ admin: true, id: "u1", at: 5 }))).toEqual({
      admin: true,
      id: "u1",
      at: 5,
    });
  });

  it("壊れた保存値は「無い」とみなす（画面は落とさない）", () => {
    expect(parseAdminFlag(null)).toBeNull();
    expect(parseAdminFlag("")).toBeNull();
    expect(parseAdminFlag("{")).toBeNull();
    expect(parseAdminFlag(JSON.stringify({ admin: "yes", id: "u1", at: 5 }))).toBeNull();
    expect(parseAdminFlag(JSON.stringify({ admin: true, id: "", at: 5 }))).toBeNull();
    expect(parseAdminFlag(JSON.stringify({ admin: true, id: "u1" }))).toBeNull();
  });
});

describe("isAdminFlagFresh", () => {
  const flag = { admin: true, id: "u1", at: 1_000_000 };

  it("賞味期限のうちは 聞き直さない", () => {
    expect(isAdminFlagFresh(flag, flag.at)).toBe(true);
    expect(isAdminFlagFresh(flag, flag.at + ADMIN_FLAG_FRESH_MS - 1)).toBe(true);
  });

  it("期限を過ぎたら 聞き直す", () => {
    expect(isAdminFlagFresh(flag, flag.at + ADMIN_FLAG_FRESH_MS)).toBe(false);
  });

  it("覚え書きが無ければ 聞きに行く", () => {
    expect(isAdminFlagFresh(null, 0)).toBe(false);
  });
});

describe("rememberAdminFlag / readIsAdmin", () => {
  it("控えた値をそのまま読み出す", () => {
    useWindow();
    rememberAdminFlag("u1", true, 42);
    expect(parseAdminFlag(adminFlagSnapshot())).toEqual({ admin: true, id: "u1", at: 42 });
    expect(readIsAdmin()).toBe(true);
  });

  it("人が変われば 上書きする", () => {
    useWindow();
    rememberAdminFlag("teacher", true, 1);
    rememberAdminFlag("student", false, 2);
    expect(readIsAdmin()).toBe(false);
  });

  it("ログアウトで 道連れに消えるよう `nexmax.` で始める", () => {
    // clearNexmaxCache() は `nexmax.` で始まる鍵だけを消す（src/lib/profile.ts）
    expect(ADMIN_FLAG_KEY.startsWith("nexmax.")).toBe(true);
  });

  it("書けない端末でも 落ちない（先生の便利さが1つ消えるだけ）", () => {
    useWindow({ locked: true });
    expect(() => rememberAdminFlag("u1", true, 1)).not.toThrow();
    expect(readIsAdmin()).toBe(false);
  });

  it("サーバ側（window が無い）では 先生あつかいしない", () => {
    expect(readIsAdmin()).toBe(false);
    expect(adminFlagSnapshot()).toBe("");
  });

  it("値が変わったときだけ 画面に知らせる", () => {
    useWindow();
    const changes = vi.fn();
    const unsubscribe = subscribeAdminFlag(changes);

    rememberAdminFlag("u1", true, 1);
    expect(changes).toHaveBeenCalledTimes(1);
    // 同じ内容の書き直しでは 描き直させない
    rememberAdminFlag("u1", true, 1);
    expect(changes).toHaveBeenCalledTimes(1);

    unsubscribe();
    rememberAdminFlag("u1", false, 2);
    expect(changes).toHaveBeenCalledTimes(1);
  });
});
