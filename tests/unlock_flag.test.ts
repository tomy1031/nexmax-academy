import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UNLOCK_FLAG_FRESH_MS,
  UNLOCK_FLAG_KEY,
  isUnlockFlagFresh,
  parseUnlockFlag,
  readGatesUnlocked,
  rememberUnlockFlag,
  subscribeUnlockFlag,
  unlockFlagSnapshot,
} from "@/lib/unlock-flag";

/**
 * 「順路の 鍵は 外れて いるか」の 覚え書き（`src/lib/unlock-flag.ts`）
 *
 * 先生が 管理画面（`/admin/lock`）で 外した スイッチを、教材の画面が 読むための 控え。
 * ここが 静かに 壊れると **鍵が 外れない**——先生は 外したつもりで 授業に 入り、
 * 学習者は 止まったままに なる。だから 既定は かならず false（かかったまま）に 倒す。
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

describe("parseUnlockFlag", () => {
  it("そろっている覚え書きだけを読む", () => {
    expect(parseUnlockFlag(JSON.stringify({ unlocked: true, at: 5 }))).toEqual({
      unlocked: true,
      at: 5,
    });
  });

  it("壊れた保存値は「無い」とみなす（＝鍵は かかったまま）", () => {
    expect(parseUnlockFlag(null)).toBeNull();
    expect(parseUnlockFlag("")).toBeNull();
    expect(parseUnlockFlag("{")).toBeNull();
    expect(parseUnlockFlag(JSON.stringify({ unlocked: "yes", at: 5 }))).toBeNull();
    expect(parseUnlockFlag(JSON.stringify({ unlocked: true }))).toBeNull();
  });
});

describe("isUnlockFlagFresh", () => {
  const flag = { unlocked: true, at: 1_000_000 };

  it("賞味期限のうちは 聞き直さない", () => {
    expect(isUnlockFlagFresh(flag, flag.at)).toBe(true);
    expect(isUnlockFlagFresh(flag, flag.at + UNLOCK_FLAG_FRESH_MS - 1)).toBe(true);
  });

  it("期限を過ぎたら 聞き直す", () => {
    expect(isUnlockFlagFresh(flag, flag.at + UNLOCK_FLAG_FRESH_MS)).toBe(false);
  });

  it("覚え書きが無ければ 聞きに行く", () => {
    expect(isUnlockFlagFresh(null, 0)).toBe(false);
  });

  it("授業中に 動かす スイッチなので 先生バイパス（12時間）より ずっと 短い", () => {
    expect(UNLOCK_FLAG_FRESH_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });
});

describe("rememberUnlockFlag / readGatesUnlocked", () => {
  it("控えた値をそのまま読み出す", () => {
    useWindow();
    rememberUnlockFlag(true, 42);
    expect(parseUnlockFlag(unlockFlagSnapshot())).toEqual({ unlocked: true, at: 42 });
    expect(readGatesUnlocked()).toBe(true);
  });

  it("かけ直したら 閉じる", () => {
    useWindow();
    rememberUnlockFlag(true, 1);
    rememberUnlockFlag(false, 2);
    expect(readGatesUnlocked()).toBe(false);
  });

  it("ログアウトで 道連れに消えるよう `nexmax.` で始める", () => {
    // clearNexmaxCache() は `nexmax.` で始まる鍵だけを消す（src/lib/profile.ts）
    expect(UNLOCK_FLAG_KEY.startsWith("nexmax.")).toBe(true);
  });

  it("書けない端末でも 落ちない（鍵は かかったまま）", () => {
    useWindow({ locked: true });
    expect(() => rememberUnlockFlag(true, 1)).not.toThrow();
    expect(readGatesUnlocked()).toBe(false);
  });

  it("サーバ側（window が無い）では 鍵を 外さない", () => {
    expect(readGatesUnlocked()).toBe(false);
    expect(unlockFlagSnapshot()).toBe("");
  });

  it("値が変わったときだけ 画面に知らせる", () => {
    useWindow();
    const changes = vi.fn();
    const unsubscribe = subscribeUnlockFlag(changes);

    rememberUnlockFlag(true, 1);
    expect(changes).toHaveBeenCalledTimes(1);
    // 同じ内容の書き直しでは 描き直させない
    rememberUnlockFlag(true, 1);
    expect(changes).toHaveBeenCalledTimes(1);

    unsubscribe();
    rememberUnlockFlag(false, 2);
    expect(changes).toHaveBeenCalledTimes(1);
  });
});
