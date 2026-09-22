import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * いらいの れんらく（`public/tools/hourensou/renraku_irai.html`）の データの 検査
 *
 * ## なぜ 要るのか
 * この 教材は **送る 前に 機械が 3つ 見る**（だれに／何を して ほしいか／いつまで）。
 * そこで こわい のは **お手本 じたいが その 検査に 落ちる** ことである——
 * 学習者は お手本の とおりに 書いたのに スタンプが 来ない。
 *
 * 2026-09-22 の 作成中に **実際に 起きた**: 場面②（チーム全員への お願い）の
 * お手本に 宛先が 無く、「だれに 頼むか」で 落ちて いた。通しで 遊んで 気づいたが、
 * 文言を 直すたびに 同じ ことが 起きる。**機械で 見張る**。
 */

const DIR = join("public", "tools", "hourensou");

type Check = { id: string; label: string; any: string[]; digits?: boolean; miss: string };
type Person = { name: string; face?: string; icon?: string; text?: string };
type Scenario = {
  id: string;
  title: string;
  channel: string;
  situation: string[];
  hint: string;
  model: string;
  reactions: string[];
  reply: Person;
  askBack: Person;
  after: string;
};
type Data = {
  id: string;
  score: { start: number; penalty: number };
  checks: Check[];
  scenarios: Scenario[];
  certificate: Record<string, string>;
  retry: Record<string, string>;
};

/** データファイルは ブラウザ用の `window.IRAI_DATA = {...}`。窓を 貸して 読む。 */
function loadData(): Data {
  const source = readFileSync(join(DIR, "renraku_irai.data.js"), "utf8");
  const win: { IRAI_DATA?: Data } = {};
  new Function("window", source)(win);
  if (!win.IRAI_DATA) throw new Error("IRAI_DATA が 読めない");
  return win.IRAI_DATA;
}

/** ルビ記法を はずす（エンジンの `plain()` と 同じ）。 */
function plain(text: string): string {
  return text.replace(/\{([^{}|]+)\|[^{}|]+\}/g, "$1");
}

/** エンジンの `missingOf()` と 同じ 判定。**ここを 直したら あちらも 直す**。 */
function missingOf(text: string, checks: Check[]): Check[] {
  const body = plain(text);
  return checks.filter((check) => {
    if (check.any.some((word) => body.includes(word))) return false;
    if (check.digits && /[0-9０-９]/u.test(body)) return false;
    return true;
  });
}

const DATA = loadData();

describe("いらいの れんらく", () => {
  it("お手本は ぜんぶ 自分の 検査を 通る（通らない お手本は 学習者を 裏切る）", () => {
    const bad = DATA.scenarios
      .map((sc) => ({ id: sc.id, missing: missingOf(sc.model, DATA.checks).map((c) => c.id) }))
      .filter((one) => one.missing.length > 0);
    expect(bad).toEqual([]);
  });

  it("足りない 文は ちゃんと 落ちる（検査が 空回りして いない）", () => {
    // 宛先も お願いも 期限も 無い 文
    expect(missingOf("エラーが でました", DATA.checks).map((c) => c.id)).toEqual([
      "who",
      "what",
      "when",
    ]);
    // 宛先と お願いは ある が 期限が 無い 文
    expect(missingOf("@{奥田|おくだ}さん レビューを お願いできますか。", DATA.checks)).toHaveLength(
      1,
    );
  });

  it("出て くる 人の 顔は 本当に 置いて ある", () => {
    const faces = DATA.scenarios.flatMap((sc) =>
      [sc.reply.face, sc.askBack.face].filter((one): one is string => Boolean(one)),
    );
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(existsSync(join("public", face.replace(/^\//, ""))), `${face} が 無い`).toBe(true);
    }
  });

  it("どの 場面にも スタンプと 2つの 返事が ある", () => {
    for (const sc of DATA.scenarios) {
      expect(sc.reactions.length, `${sc.id} の スタンプ`).toBeGreaterThan(0);
      // そろった とき / 足りない とき、返事は 別の 文
      expect(plain(sc.reply.text ?? ""), `${sc.id} の 返事`).not.toBe("");
      expect(plain(sc.askBack.text ?? ""), `${sc.id} の 聞き返し`).not.toBe("");
      expect(sc.reply.text).not.toBe(sc.askBack.text);
    }
  });

  it("100点から はじまり、減る 幅は 1回 10点", () => {
    expect(DATA.score.start).toBe(100);
    expect(DATA.score.penalty).toBe(10);
    // 3場面 ぜんぶ 1回で 送れたら 100点の まま
    expect(DATA.score.start - 0 * DATA.score.penalty).toBe(100);
  });

  it("エンジンは この データファイルだけを 読む（文言が 2か所に 散らない）", () => {
    const engine = readFileSync(join(DIR, "renraku_irai.html"), "utf8");
    expect(engine).toContain("renraku_irai.data.js");
    // 場面の 文が エンジン側に 書き写されて いない
    for (const sc of DATA.scenarios) {
      expect(engine.includes(sc.model), `${sc.id} の お手本が エンジンに ある`).toBe(false);
    }
  });

  it("ステージに つながって いる（教材データと ツールの URL が 合う）", () => {
    const link = JSON.parse(readFileSync(join("content", "links", "renraku_irai.json"), "utf8"));
    expect(link.id).toBe(DATA.id);
    expect(link.url).toBe("/tools/hourensou/renraku_irai.html");
    const stage = JSON.parse(readFileSync(join("content", "stages", "renraku.json"), "utf8"));
    expect(stage.contents.some((one: { ref: string }) => one.ref === "renraku_irai")).toBe(true);
  });
});
