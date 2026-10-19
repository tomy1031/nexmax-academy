import { describe, expect, it } from "vitest";

import kantan from "../content/meetings/asakai_kantan.json";
import { meetingSchema } from "@/content/schema";

/*
 * 行の `tasks`（しごとの 絵の 名前）は **同じ カードの 表（progress）に ある 名前**だけ
 *（2026-10-09）。絵の ファイルは 表の 行が 持つ ので、名前が 合わないと その 絵は
 * 黙って 出なく なる——書いた 時点で 落とす。
 */

/** 月曜の カードの 1行目に `tasks` を 書いた 教材を 作る。 */
function withTasks(tasks: unknown) {
  const draft = structuredClone(kantan) as unknown as {
    asakai: { scenes: { card: { progress: { label: string }[]; rows: { tasks?: unknown }[] } }[] };
  };
  const card = draft.asakai.scenes[0]!.card;
  card.rows[0]!.tasks = tasks;
  return { draft, labels: card.progress.map((one) => one.label) };
}

describe("rows の tasks", () => {
  it("表に ある 名前なら 通る", () => {
    const { draft, labels } = withTasks(undefined);
    draft.asakai.scenes[0]!.card.rows[0]!.tasks = [labels[0]!, labels[1]!];
    expect(meetingSchema.safeParse(draft).success).toBe(true);
  });

  it("表に 無い 名前を 書くと 落ちる（どの 名前かを 言う）", () => {
    const { draft } = withTasks(["表に 無い しごと"]);
    const result = meetingSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((one) => one.message.includes("rows の tasks"));
    expect(issue?.message).toContain("表に 無い しごと");
    expect(issue?.message).toContain("表（progress）の しごとの 名前に ありません");
    expect(issue?.path).toContain("tasks");
  });

  it("1つでも 表に 無い 名前が まざると 落ちる", () => {
    const { draft, labels } = withTasks(undefined);
    draft.asakai.scenes[0]!.card.rows[0]!.tasks = [labels[0]!, "表に 無い しごと"];
    expect(meetingSchema.safeParse(draft).success).toBe(false);
  });

  it("空の 配列と 5つ 以上は 落ちる（1〜4つ）", () => {
    expect(meetingSchema.safeParse(withTasks([]).draft).success).toBe(false);
    const { draft, labels } = withTasks(undefined);
    draft.asakai.scenes[0]!.card.rows[0]!.tasks = labels.slice(0, 5);
    expect(meetingSchema.safeParse(draft).success).toBe(false);
  });

  it("tasks を 書かなくても 通る（前からの 教材）", () => {
    expect(meetingSchema.safeParse(kantan).success).toBe(true);
  });
});
