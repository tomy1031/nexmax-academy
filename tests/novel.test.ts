import { describe, expect, it } from "vitest";

import novelMeeting from "../content/meetings/soudan_novel.json";
import soudanStage from "../content/stages/soudan.json";
import vocabulary from "../content/vocab/vocabulary.json";
import { meetingSchema, type Novel } from "@/content/schema";
import { pinnedShortContent, replacedContent } from "@/lib/stage-routes";
import { annotateRuby, buildFuriganaIndex, mergeFuriganaEntries } from "@/lib/text/furigana";
import { NOVEL_UI_FURIGANA } from "@/components/novel/ui-furigana";
import {
  buildNovelJudgePrompt,
  parseNovelJudgment,
  readsExample,
  retryLevel,
  settleJudgment,
  starsForFails,
} from "@/lib/novel/judge";
import {
  DESK_FEEDBACK,
  addFailure,
  allConsults,
  cardView,
  deskCycle,
  logUpTo,
  mostCommonFailure,
  normalizeSave,
  noticeBefore,
  reactionFor,
  showsTiming,
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

  it("短い URL（/soudan/meeting）は 前と 同じ ミーティングへ 送る", () => {
    expect(pinnedShortContent("soudan", "meeting")).toEqual({
      type: "meeting",
      ref: "soudan_meeting",
    });
    expect(pinnedShortContent("soudan", "meeting-soudan_novel")).toBeNull();
  });

  it("お手本の 前半（①②）だけ 読んでも 合格に しない（③が いちばん 大事）", () => {
    for (const consult of allConsults(novel)) {
      const sentences = consult.example.split("。").filter(Boolean);
      const firstTwo = `${sentences.slice(0, -1).join("。")}。`;
      expect(readsExample(firstTwo, consult.example), consult.id).toBe(false);
    }
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

  it("お客様の 松本さんは 金曜の 納品で 立ち絵（うれしい）で 出る。木曜は メッセージ（立ち絵を 出さない）", () => {
    const fri = novel.days[4];
    const at = fri?.scenes.findIndex((scene) => scene.id === "f23") ?? -1;
    const view = viewAt(novel, 4, at);
    expect(view.figure).toBe("matsumoto");
    expect(view.face).toBe("happy");
    const thu = novel.days[3];
    const msg = thu?.scenes.findIndex((scene) => scene.id === "h04") ?? -1;
    expect(viewAt(novel, 3, msg).figure).not.toBe("matsumoto");
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
      "今は、出す 商品の 話を しましょう。",
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

describe("画面の 字の 読み（UI の 辞書だけでも、教材と 混ぜても 正しい）", () => {
  const reading = (text: string, entries: readonly (readonly [string, string])[]) =>
    annotateRuby(text, buildFuriganaIndex(entries as [string, string][]))
      .map((segment) => segment.reading ?? segment.text)
      .join("");
  const merged = mergeFuriganaEntries(NOVEL_UI_FURIGANA, meeting.furigana ?? []);
  const cases: [string, string][] = [
    ["話す ▶", "はなす ▶"],
    ["もう 一度 話す", "もう いちど はなす"],
    [
      "お手本（Model）— 声に 出して 読みましょう",
      "お[てほん]（Model）— こえに だして よみましょう",
    ],
    ["後", "あと"],
    ["これは やり直しの 回数に 入りません。", "これは やりなおしの かいすうに はいりません。"],
    ["5日間の まとめ", "5かかんの まとめ"],
    ["今日の 目的", "きょうの もくてき"],
    /* マイク（要望 #730）・くらべる 台（要望 #729）・全画面（要望 #732） */
    ["押すと マイクが 入ります。", "おすと マイクが はいります。"],
    ["聞いて います…", "きいて います…"],
    [
      "あと 10秒。話し終わったら、もう 一度 押します。",
      "あと 10びょう。はなしおわったら、もう いちど おします。",
    ],
    ["不正解です。もう 一度、①から 選びます。", "ふせいかいです。もう いちど、①から えらびます。"],
    ["合わない 行を 1行 押します。", "あわない ぎょうを 1ぎょう おします。"],
    [
      "待つ：電話中・とても 忙しそう・ほかの 人と 話して いる",
      "まつ：でんわちゅう・とても いそがしそう・ほかの ひとと はなして いる",
    ],
    [
      "押す：大丈夫そう（仕事は して いても いい）",
      "おす：だいじょうぶそう（しごとは して いても いい）",
    ],
    ["全画面で あそぶ", "ぜんがめんで あそぶ"],
    ["全画面を やめる", "ぜんがめんを やめる"],
    ["設定（音の 大きさ）", "せってい（おとの おおきさ）"],
    /* 相談の 型の ことば（要望 #725）と まとめの 札 */
    [
      "①調べた こと ②わからない こと ③お願い を 話しましょう。",
      "①しらべた こと ②わからない こと ③おねがい を はなしましょう。",
    ],
    ["お願いが ない", "おねがいが ない"],
    /* 話しかける タイミング（要望 #723） */
    [
      "今は 電話中です。大丈夫そうに なるまで 待ちましょう。",
      "いまは でんわちゅうです。だいじょうぶそうに なるまで まちましょう。",
    ],
    [
      "今は とても 忙しそうです。大丈夫そうに なるまで 待ちましょう。",
      "いまは とても いそがしそうです。だいじょうぶそうに なるまで まちましょう。",
    ],
    ["絵を 読みこんで います…", "えを よみこんで います…"],
    [
      "今は ほかの 人と 話して います。大丈夫そうに なるまで 待ちましょう。",
      "いまは ほかの ひとと はなして います。だいじょうぶそうに なるまで まちましょう。",
    ],
    [
      "いい タイミングです。仕事中でも、急いで いない ときは 話しかけて いいです。",
      "いい タイミングです。しごとちゅうでも、いそいで いない ときは はなしかけて いいです。",
    ],
    [
      "今 ヘンディさんに 話しかけて いいですか？ よく 見て、いいと 思ったら「ヘンディさんに 話しかける」を 押します。",
      "いま ヘンディさんに はなしかけて いいですか？ よく みて、いいと おもったら「ヘンディさんに はなしかける」を おします。",
    ],
  ];
  it.each(cases)("%s", (text, expected) => {
    const want = expected.replace("[てほん]", "てほん");
    expect(reading(text, NOVEL_UI_FURIGANA)).toBe(want);
    expect(reading(text, merged)).toBe(want);
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

  it("失敗の 記録・星が 崩れて いても まとめの 画面が 落ちない", () => {
    const save = normalizeSave(
      {
        attempts: { c_mon: 5, c_tue1: { fails: 1 }, c_wed: { fails: 2, types: ["vague", "x"] } },
        stars: { c_mon: -1, c_tue1: 9, c_wed: "a" },
      },
      novel,
    );
    expect(save.attempts.c_mon).toBeUndefined();
    expect(save.attempts.c_tue1).toEqual({ fails: 1, types: [] });
    expect(save.attempts.c_wed).toEqual({ fails: 2, types: ["vague"] });
    expect(save.stars).toEqual({ c_mon: 0, c_tue1: 3 });
    expect(() => mostCommonFailure(save.attempts)).not.toThrow();
    expect(addFailure(save.attempts, "c_tue1", "no_ask").c_tue1?.fails).toBe(2);
  });
});

describe("話しかける タイミング（要望 #723）", () => {
  const timed = allConsults(novel).filter((consult) => showsTiming(novel, consult));

  it("はじめは かならず 話しかけては いけない 状態で、15秒 以内に 大丈夫そうに なる", () => {
    for (const consult of allConsults(novel)) {
      const cycle = deskCycle(consult.id);
      expect(cycle[0]).not.toBe("ok");
      const firstOk = cycle.indexOf("ok");
      expect(firstOk).toBeGreaterThanOrEqual(1);
      expect(firstOk).toBeLessThanOrEqual(3);
      /* だめな 3つ（電話・忙しそう・話して いる）が 1回ずつ 出る */
      const waits = cycle.filter((state) => state !== "ok");
      expect(waits.slice().sort()).toEqual(["busy", "phone", "talking"]);
      /* となり同士（さいごと はじめも）は 別の 状態（切りかわりが 目で 分かる） */
      cycle.forEach((state, i) => expect(cycle[(i + 1) % cycle.length]).not.toBe(state));
      expect(deskCycle(consult.id)).toEqual(cycle);
    }
  });

  it("場面ごとに はじめの 状態も 大丈夫そうに なる 時刻も 変わる（時間だけで 押せない）", () => {
    const firsts = new Set(timed.map((consult) => deskCycle(consult.id)[0]));
    const okAt = new Set(timed.map((consult) => deskCycle(consult.id).indexOf("ok")));
    expect(firsts.size).toBeGreaterThan(1);
    expect(okAt.size).toBeGreaterThan(1);
  });

  it("悪い 知らせの 相談（金曜）では 出さない——その 日は「早く 言う」を 教える", () => {
    expect(timed.map((consult) => consult.id)).toEqual([
      "c_mon",
      "c_tue1",
      "c_tue2",
      "c_wed",
      "c_thu",
    ]);
  });

  it("相談の 相手は みんな 席の 絵（4枚）を 持つ", () => {
    for (const consult of allConsults(novel)) {
      const desk = novel.cast.find((one) => one.id === consult.to)?.desk;
      expect(desk, consult.id).toBeTruthy();
    }
    expect(Object.keys(DESK_FEEDBACK).sort()).toEqual(["busy", "ok", "phone", "talking"]);
  });
});
