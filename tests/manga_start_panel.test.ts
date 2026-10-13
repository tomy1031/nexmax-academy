import { describe, expect, it } from "vitest";
import { startPanel } from "../src/components/manga/manga-slides";

/*
 * まんがを開いたときのコマ（しおり）。
 *
 * 途中までなら そのコマから続ける。最後のコマまで読んでいたら 1コマ目から
 * （2026-10-13 の指定。最後のコマから開くと「よみおわり」が出たままで、読み直せなかった）。
 */
describe("まんがを開いたときのコマ", () => {
  it("しおりが無ければ 1コマ目", () => {
    expect(startPanel(undefined, 18)).toBe(0);
  });

  it("途中まで読んでいたら そのコマから続ける", () => {
    expect(startPanel(1, 18)).toBe(1);
    expect(startPanel(16, 18)).toBe(16);
  });

  it("最後のコマまで読んでいたら 1コマ目に戻す", () => {
    expect(startPanel(17, 18)).toBe(0);
  });

  it("まんがのコマが減って しおりが外に出たら 1コマ目", () => {
    expect(startPanel(30, 18)).toBe(0);
  });

  it("壊れたしおりは 1コマ目", () => {
    expect(startPanel(-1, 18)).toBe(0);
    expect(startPanel("3", 18)).toBe(0);
  });

  it("1コマだけのまんがは いつも 1コマ目", () => {
    expect(startPanel(0, 1)).toBe(0);
  });
});
