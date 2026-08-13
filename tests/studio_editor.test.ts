import { describe, expect, it } from "vitest";
import { contentSchema, FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import {
  emptyArticleBlock,
  emptyManga,
  emptyMangaPanel,
  emptyMeeting,
  emptyStage,
} from "@/components/studio/drafts";
import { describePath, messageForReason, toWarningMessages } from "@/components/studio/issue-text";
import { appendItem, moveItem, removeAt, replaceAt } from "@/components/studio/list-ops";

/**
 * スタジオのエディタが依存する純粋ロジックの検査。
 * 並べ替えは学習順そのもの（設計07 §3）なので、端での操作で壊れないことを確かめる。
 */

describe("list-ops", () => {
  const items = ["a", "b", "c"];

  it("上へ・下へで隣と入れ替わる", () => {
    expect(moveItem(items, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("端をこえる指定では何も動かない", () => {
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 2, 1)).toEqual(items);
    expect(moveItem(items, 9, -1)).toEqual(items);
  });

  it("元の配列を書き換えない", () => {
    moveItem(items, 0, 1);
    removeAt(items, 0);
    replaceAt(items, 0, "z");
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("消す・差し替える・足す", () => {
    expect(removeAt(items, 1)).toEqual(["a", "c"]);
    expect(replaceAt(items, 1, "z")).toEqual(["a", "z", "c"]);
    expect(appendItem(items, "d")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("issue-text", () => {
  it("zodのパスを先生に読める場所名にする", () => {
    expect(describePath("pages.0.panels.1.lines.0.text")).toBe(
      "ページ 1番目 › コマ 2番目 › セリフ 1番目 › 本文",
    );
    expect(describePath("contents.2.ref")).toBe("コンテンツ 3番目 › 参照先のID");
    expect(describePath("")).toBe("ぜんたい");
  });

  it("もんだい・リスニングの場所も日本語で出す（データのキーをそのまま出さない）", () => {
    expect(describePath("questions.1.q")).toBe("もんだい 2番目 › とい");
    expect(describePath("questions.2.accept.0")).toBe("もんだい 3番目 › べつの 言い方 1番目");
    expect(describePath("questions.0.options.1")).toBe("もんだい 1番目 › えらぶもの 2番目");
    expect(describePath("keywords.0")).toBe("さがす ことば 1番目");
    expect(describePath("participants.0.accent")).toBe("参加者 1番目 › タイルの色");
    expect(describePath("script.2.at")).toBe("台本 3番目 › はじまる 秒");
    expect(describePath("revealGoal")).toBe("原稿を ひらく 目標");
    expect(describePath("focus")).toBe("聞く まえに 配る 見かた");
  });

  it("教材の種類で欄の呼び名が変わる（同じ questions でも もんだい／しつもん）", () => {
    // 画面の見出しと同じ言葉でないと、先生は指摘された欄を探せない
    expect(describePath("questions.0.q", "quizset")).toBe("もんだい 1番目 › とい");
    expect(describePath("questions.0.ask", "meeting")).toBe(
      "しつもん 1番目 › しつもん（あいてが 言う ことば）",
    );
    expect(describePath("focus", "meeting")).toBe("きょう やること");
    expect(describePath("focus", "listening")).toBe("聞く まえに 配る 見かた");
    expect(describePath("judgePrompt", "meeting")).toBe("日本語の 見かた");
    // 種類を渡さないときは今までどおり
    expect(describePath("focus")).toBe("聞く まえに 配る 見かた");
  });

  it("同じ lines でも 漫画は「セリフ」、語群の穴埋めは「文」と呼ぶ", () => {
    // 先生の画面に出ている見出しと同じ名前にする（違う名前だと欄を探せない）
    expect(describePath("pages.0.panels.0.lines.0.text")).toBe(
      "ページ 1番目 › コマ 1番目 › セリフ 1番目 › 本文",
    );
    expect(describePath("questions.0.lines.0")).toBe("もんだい 1番目 › 文 1番目");
  });

  it("保存できたあとの気づきは message だけを取り出す", () => {
    expect(
      toWarningMessages([
        { file: "stage:m8", level: "warn", message: "まだ無いIDを指しています: m8-manga" },
        // 形の違う行が混ざっても、読める気づきは出す（一覧ごと消さない）
        { file: "stage:m8", level: "warn" },
        "こわれた行",
      ]),
    ).toEqual(["まだ無いIDを指しています: m8-manga"]);
    expect(toWarningMessages(undefined)).toEqual([]);
    expect(toWarningMessages([])).toEqual([]);
  });

  it("APIのreasonを日本語の説明にする", () => {
    expect(messageForReason("forbidden")).toContain("先生");
    expect(messageForReason("notConfigured")).toContain("データベース");
    expect(messageForReason("なぞ")).toContain("もう一度");
  });
});

describe("drafts", () => {
  it("空のステージは kind と既定値がそろっている（中身は先生が埋める）", () => {
    const stage = emptyStage();
    expect(stage.kind).toBe("stage");
    expect(stage.status).toBe("draft");
    expect(stage.contents).toEqual([]);
    // 空のままでは保存の検査で止まる = 意図どおり
    expect(contentSchema.safeParse(stage).success).toBe(false);
  });

  it("空の漫画は1ページ1コマから始まる", () => {
    const manga = emptyManga();
    expect(manga.pages).toHaveLength(1);
    expect(manga.pages[0]?.panels).toHaveLength(1);
    expect(emptyMangaPanel().image.status).toBe("empty");
  });

  it("記事のブロックはどの種類でもスキーマに通る形で生まれる", () => {
    const kinds = ["heading", "paragraph", "image", "callout", "list", "steps", "vocab"] as const;
    for (const kind of kinds) {
      const article = {
        kind: "article",
        id: "draft-check",
        title: "たしかめ",
        description: "エディタの初期値の検査",
        blocks: [emptyArticleBlock(kind)],
      };
      const parsed = contentSchema.safeParse(article);
      expect(parsed.success, `${kind} が通らない`).toBe(true);
    }
  });

  /**
   * ミーティングだけ、空欄で始めないところがある。
   *
   * persona（相手の話し方）が空の Live は、ふつうのAIとして長い日本語で話し出す。
   * N5の学習者は1問目で置いていかれるので、進め方のひな型を入れて生まれる。
   * judgePrompt も同じ理由で、空にしない。
   */
  it("空のミーティングは 話し方と 見かたが 入った 状態で 生まれる", () => {
    const meeting = emptyMeeting();
    expect(meeting.kind).toBe("meeting");
    expect(meeting.persona.length).toBeGreaterThan(0);
    expect(meeting.judgePrompt.length).toBeGreaterThan(0);
    // 人格と判定は別物。同じ文を両方に入れると、話し方を直すたびに基準が動く
    expect(meeting.persona).not.toBe(meeting.judgePrompt);
    // スキーマの下限ぶんの枠を先に出す（保存を押すまで「3つ要る」と知らせないのは遅い）
    expect(meeting.questions).toHaveLength(3);
    // 中身（ID・質問文）は空なので、このままでは保存の検査で止まる = 意図どおり
    expect(contentSchema.safeParse(meeting).success).toBe(false);
  });

  it("ミーティングの ひな型に 禁止語が 入っていない", () => {
    // 先生がそのまま公開できる文で生まれる（保存で止まる初期値を配らない）
    const meeting = emptyMeeting();
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      expect(meeting.persona).not.toContain(word);
      expect(meeting.judgePrompt).not.toContain(word);
    }
  });
});
