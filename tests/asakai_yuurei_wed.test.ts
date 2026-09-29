import { describe, expect, it } from "vitest";

import muzukashii from "../content/meetings/asakai_muzukashii.json";
import { meetingSchema } from "../src/content/schema";
import { applyUtterance, initialPanelStates, type ReportPanel } from "../src/lib/meeting/panels";

/*
 * 夕礼・水曜の 問題点（記事④: 何が 起きて いるか・解決したか・まだ 残って いるか・2026-09-28）。
 *
 * 通しプレイ（N3挑戦）で、**明日の 予定**（修正された データで 再確認）を 言った だけで
 *「まだ 残って いるか」の 箱が 開いて いた——問題を 1ことも 報告して いないのに 箱が 埋まる。
 * 「残って いる こと」は データの 修正が まだ 終わって いない こと として、明日の 予定と 分ける。
 */
const meeting = meetingSchema.parse(muzukashii);
const wed = meeting.asakai!.scenes.find((scene) => scene.day === "wed")!;
const panels: ReportPanel[] = wed.panels.map((panel) => ({
  id: panel.id,
  label: panel.label,
  openAt: panel.openAt,
  rule: panel.rule,
  facts: panel.facts.map((fact) => ({
    id: fact.id,
    box: fact.box,
    keywords: fact.keywords,
    minHits: fact.minHits,
    allOf: fact.allOf,
  })),
}));
const log = (wed.card.memo ?? []).map((row) => ({ head: row.head, text: row.text }));
const komariOf = (utterance: string) =>
  applyUtterance({
    utterance,
    panels,
    states: initialPanelStates(panels),
    logLines: log,
  }).states.find((one) => one.id === "komari")!;

describe("夕礼・水曜の 問題点の 箱", () => {
  it("明日の 予定を 言った だけでは「まだ 残って いるか」が 開かない", () => {
    const ashita = wed.panels.find((panel) => panel.id === "ashita")!.example.text;
    expect(komariOf(ashita).said).not.toContain("m3");
  });

  it("お手本では 3つの 箱が ぜんぶ 開く", () => {
    const example = wed.panels.find((panel) => panel.id === "komari")!.example.text;
    expect([...komariOf(example).said].sort()).toEqual(["m1", "m2", "m3"]);
  });
});
