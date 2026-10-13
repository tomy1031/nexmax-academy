import { describe, expect, it } from "vitest";
import { GROUPS, isActive } from "../src/components/admin/admin-sidebar";

/*
 * 管理画面の左メニューの「いまここ」（紺の地・aria-current="page"）。
 * 接頭辞だけで比べていたため、`/admin/ai-time`（クラスの 設定）を開くと
 * `/admin/ai`（AI設定）も光り、2つが同時に選ばれて見えていた。
 */
const ITEMS = GROUPS.flatMap((group) => group.items);
const byHref = (href: string) => {
  const item = ITEMS.find((candidate) => candidate.href === href);
  if (!item) throw new Error(`メニューに ${href} が無い`);
  return item;
};
const activeLabels = (pathname: string) =>
  ITEMS.filter((item) => isActive(pathname, item)).map((item) => item.label);

describe("isActive（管理画面の左メニュー）", () => {
  const ai = byHref("/admin/ai");
  const aiTime = byHref("/admin/ai-time");

  it("クラスの設定（/admin/ai-time）では AI設定 が光らない", () => {
    expect(isActive("/admin/ai-time", ai)).toBe(false);
    expect(isActive("/admin/ai-time", aiTime)).toBe(true);
    expect(activeLabels("/admin/ai-time")).toEqual([aiTime.label]);
  });

  it("AI設定 は自分のページと、その下の子ページで光る", () => {
    expect(isActive("/admin/ai", ai)).toBe(true);
    expect(isActive("/admin/ai/keys", ai)).toBe(true);
    expect(isActive("/admin/ai/", ai)).toBe(true);
  });

  it("接頭辞が文字の途中で終わるだけでは光らない", () => {
    expect(isActive("/admin/aix", ai)).toBe(false);
    expect(isActive("/admin/stagesx", byHref("/admin/stages"))).toBe(false);
  });

  it("クラスの設定 の子ページでも クラスの設定 だけが光る", () => {
    expect(activeLabels("/admin/ai-time/edit")).toEqual([aiTime.label]);
  });

  it("match の無い項目（ダッシュボード）は完全一致のときだけ光る", () => {
    const dashboard = byHref("/admin");
    expect(isActive("/admin", dashboard)).toBe(true);
    expect(isActive("/admin/users", dashboard)).toBe(false);
  });

  it("どの項目も、自分のページを開いたときに光るのは自分1つだけ", () => {
    for (const item of ITEMS) {
      expect(activeLabels(item.href), item.href).toEqual([item.label]);
    }
  });
});
