import { describe, expect, it } from "vitest";

import novelMeeting from "../content/meetings/soudan_novel.json";
import soudanStage from "../content/stages/soudan.json";
import vocabulary from "../content/vocab/vocabulary.json";
import { meetingSchema, type Novel } from "@/content/schema";
import { replacedContent } from "@/lib/stage-routes";
import {
  buildNovelJudgePrompt,
  parseNovelJudgment,
  readsExample,
  retryLevel,
  settleJudgment,
  starsForFails,
} from "@/lib/novel/judge";
import {
  addFailure,
  allConsults,
  cardView,
  logUpTo,
  mostCommonFailure,
  normalizeSave,
  noticeBefore,
  reactionFor,
  viewAt,
} from "@/lib/novel/state";

/**
 * 相談の 練習（サウンドノベル・仕様書 v4）の **実データ**と 決まりを 見る。
 */
const meeting = meetingSchema.parse(novelMeeting);
const novel = meeting.novel as Novel;

describe("相談の 練習の データ（仕様書 v4 §8）", () => {
  it("5日間で 相談は 7件（火曜と 金曜は 2件）", () => {
    expect(novel.days.map((day) => day.id)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    const perDay = novel.days.map(
      (day) => day.scenes.filter((scene) => scene.type === "consult").length,
    );
    expect(perDay).toEqual([1, 2, 1, 1, 2]);
    expect(allConsults(novel)).toHaveLength(7);
  });

  it("相談の 前には かならず 気づき（資料を 比べる）と 相手えらびが ある", () => {
    for (const day of novel.days) {
      day.scenes.forEach((scene, at) => {
        if (scene.type !== "consult") return;
        const before = day.scenes.slice(0, at);
        const lastChoose = [...before].reverse().find((one) => one.type === "choose_person");
        expect(lastChoose, `${scene.id} の 前に 相手えらびが ない`).toBeDefined();
        if (lastChoose?.type === "choose_person") expect(lastChoose.answer).toBe(scene.to);
        expect(noticeBefore(day, at), `${scene.id} の 前に 気づきが ない`).not.toBeNull();
      });
    }
  });

  it("相談の 相手は 仕様書の 役割どおり（月・木・金2＝PM、火1・水＝デザイナー、火2・金1＝バックエンド）", () => {
    expect(allConsults(novel).map((consult) => consult.to)).toEqual([
      "hendy",
      "shirai",
      "nyam",
      "shirai",
      "hendy",
      "nyam",
      "hendy",
    ]);
  });

  it("支えは 日ごとに 減る（文の 型 → 文 → キーワード → 閉じた カード）", () => {
    expect(allConsults(novel).map((consult) => consult.support)).toEqual([
      "form",
      "sentence",
      "sentence",
      "keyword",
      "keyword",
      "closed",
      "closed",
    ]);
  });

  it("毎日 さいごに 今日の ポイントを 1文 出す", () => {
    for (const day of novel.days) {
      expect(day.scenes.some((scene) => scene.type === "point")).toBe(true);
    }
  });

  it("新しい ことばは 1日 7語まで・全部で 22語、どれも 辞書に ある", () => {
    const terms = new Set(vocabulary.words.map((word) => word.term));
    let total = 0;
    for (const day of novel.days) {
      expect(day.words.length).toBeLessThanOrEqual(7);
      total += day.words.length;
      for (const word of day.words) expect(terms.has(word), `${word} が 辞書に ない`).toBe(true);
    }
    expect(total).toBe(22);
  });

  it("「勝手に 決める」「問題を 隠す」の「もしも」の 場面は 木曜と 金曜に ある", () => {
    const byId = new Map(allConsults(novel).map((consult) => [consult.id, consult]));
    expect(byId.get("c_thu")?.whatIf?.decided_alone?.length).toBeGreaterThan(0);
    expect(byId.get("c_fri1")?.whatIf?.hiding?.length).toBeGreaterThan(0);
  });

  it("相談の 練習は 報連相：相談 ステージで「いま 話しかけて いい？」の 位置に 入る", () => {
    const refs = soudanStage.contents.map((item) => item.ref);
    expect(refs).toContain("soudan_novel");
    expect(refs).not.toContain("soudan_kehai");
    expect(refs.indexOf("soudan_novel")).toBe(refs.indexOf("soudan_quiz") + 1);
  });

  it("古い URL（いま 話しかけて いい？）は 相談の 練習へ 送る", () => {
    expect(replacedContent("soudan", "quiz-soudan_kehai")).toEqual({
      type: "meeting",
      ref: "soudan_novel",
    });
  });

  it("お手本の 文は 自分の 判定（読めば 合格）でも 合格に なる", () => {
    for (const consult of allConsults(novel)) {
      expect(readsExample(consult.example, consult.example)).toBe(true);
    }
  });
});

describe("表示は その日の 最初から 計算し直す（戻っても ずれない）", () => {
  it("月曜の はじめは 朝の オフィス・目的カード なし・開発中の 画面は まだ ない", () => {
    const view = viewAt(novel, 0, 0);
    expect(view.bg).toBe(novel.backgrounds.morning);
    expect(view.goal).toBeNull();
    expect(view.screen.note).toBe("まだ 作って いません。");
    expect(view.figure).toBeNull();
  });

  it("目的を 通ると 目的カードが 残り、話した 人が 立つ", () => {
    const mon = novel.days[0];
    const goalAt = mon?.scenes.findIndex((scene) => scene.type === "goal") ?? -1;
    const view = viewAt(novel, 0, goalAt + 1);
    expect(view.goal).toContain("今日の 目的");
    expect(view.figure).toBe("hendy");
  });

  it("開発中の 画面は screen の 場面を 通った あとに 変わる（その 場面の 上では まだ 前）", () => {
    const mon = novel.days[0];
    const at = mon?.scenes.findIndex((scene) => scene.type === "screen") ?? -1;
    expect(viewAt(novel, 0, at).screen.rows).toHaveLength(0);
    expect(viewAt(novel, 0, at + 1).screen.rows.length).toBeGreaterThan(0);
  });

  it("金曜の テストから 午後の 背景に なり、戻れば 朝に もどる", () => {
    const fri = novel.days[4];
    const at = fri?.scenes.findIndex((scene) => scene.type === "line" && scene.bg) ?? -1;
    expect(viewAt(novel, 4, at).bg).toBe(novel.backgrounds.afternoon);
    expect(viewAt(novel, 4, at - 1).bg).toBe(novel.backgrounds.morning);
  });

  it("ログは その 場面までの 文だけ", () => {
    const mon = novel.days[0];
    if (!mon) throw new Error("月曜が ない");
    const rows = logUpTo(mon, 3);
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
  });
});

describe("判定の 決まり（仕様書 v4 §5・§6）", () => {
  it("3つ 全部 あって 型が 無ければ 合格。AI が pass と 言っても 1つ 欠ければ やり直し", () => {
    expect(
      parseNovelJudgment(
        {
          result: "pass",
          has_context: true,
          has_problem: true,
          has_ask: true,
          failure_type: "none",
          heard: "x",
        },
        "x",
      )?.result,
    ).toBe("pass");
    const missingAsk = parseNovelJudgment(
      {
        result: "pass",
        has_context: true,
        has_problem: true,
        has_ask: false,
        failure_type: "none",
        heard: "x",
      },
      "x",
    );
    expect(missingAsk?.result).toBe("retry");
    expect(missingAsk?.failureType).toBe("no_ask");
  });

  it("①か ②が 無ければ あいまい（vague）", () => {
    const judged = settleJudgment({
      hasContext: false,
      hasProblem: true,
      hasAsk: true,
      failureType: "none",
      heard: "",
    });
    expect(judged.failureType).toBe("vague");
  });

  it("型が 付けば 要素が そろって いても やり直し（勝手に 決める など）", () => {
    const judged = settleJudgment({
      hasContext: true,
      hasProblem: true,
      hasAsk: true,
      failureType: "decided_alone",
      heard: "",
    });
    expect(judged.result).toBe("retry");
  });

  it("崩れた 返事は null（画面は もう一度 送る を 出す）", () => {
    expect(parseNovelJudgment(null, "x")).toBeNull();
  });

  it("星: 1回で 合格 3つ・ヒントを 見て 2つ・お手本を 読んで 1つ", () => {
    expect([0, 1, 2, 3, 5].map(starsForFails)).toEqual([3, 2, 2, 1, 1]);
    expect([0, 1, 2, 3, 4].map(retryLevel)).toEqual([0, 1, 2, 3, 3]);
  });

  it("聞き取れない は やり直しの 回数に 数えない", () => {
    const once = addFailure({}, "c_mon", "unclear_audio");
    expect(once.c_mon).toBeUndefined();
    const twice = addFailure(addFailure({}, "c_mon", "vague"), "c_mon", "no_ask");
    expect(twice.c_mon?.fails).toBe(2);
  });

  it("まとめの 画面は いちばん 多かった 失敗の 型を 1つ 出す", () => {
    const attempts = {
      c_mon: { fails: 2, types: ["vague", "no_ask"] as const },
      c_tue1: { fails: 1, types: ["no_ask"] as const },
    };
    expect(mostCommonFailure(attempts)).toBe("no_ask");
    expect(mostCommonFailure({})).toBeNull();
  });

  it("話が ちがう ときの 反応は ◯◯を 相談の 話題に 置きかえる", () => {
    const consult = allConsults(novel)[0];
    if (!consult) throw new Error("相談が ない");
    expect(reactionFor(novel, consult, "off_topic").text).toBe(
      "今は、在庫の 数の 話を しましょう。",
    );
  });

  it("判定の 頼みには その 相談の 基準と 学生の ことばが 入る（画面の 文は 作らせない）", () => {
    const consult = allConsults(novel)[0];
    if (!consult) throw new Error("相談が ない");
    const prompt = buildNovelJudgePrompt(consult, "ヘンディ", "在庫が 2個です");
    expect(prompt).toContain(consult.criteria.problem);
    expect(prompt).toContain("在庫が 2個です");
    expect(prompt).toContain("report_judgment");
  });

  it("気づきカードは 支えの 段で 出し方が 変わる", () => {
    const card = { seen: "文1", diff: "文2", seenKey: "鍵1", diffKey: "鍵2" };
    expect(cardView(card, "form", true)?.seen).toBe("文1");
    expect(cardView(card, "keyword", true)?.seen).toBe("鍵1");
    expect(cardView(card, "closed", false)).toBeNull();
    expect(cardView(card, "closed", true)?.mode).toBe("keyword");
  });
});

describe("保存（ブラウザに 1行ごと）", () => {
  it("壊れた 保存は 空に し、教材に 無い 日や 場面は 丸める", () => {
    expect(normalizeSave("broken", novel).day).toBe(0);
    const save = normalizeSave({ day: 99, index: 999, maxDay: 2, cleared: ["x", 3] }, novel);
    expect(save.day).toBe(4);
    expect(save.index).toBe((novel.days[4]?.scenes.length ?? 1) - 1);
    expect(save.maxDay).toBe(4);
    expect(save.cleared).toEqual(["x"]);
    expect(save.settings.furigana).toBe(true);
    expect(save.settings.translation).toBe(false);
  });
});
