import { describe, expect, it } from "vitest";
import { shouldDeploy } from "../scripts/lib/should_deploy.mjs";

/**
 * 授業前の cron が 5本 起きても、本番へ 出るのは 必要な ときだけ 1回。
 *
 * 2026-08-28（金）、唯一の cron（17:05 ICT）が **11時間5分 遅れて** 届き、
 * 手で 出したが 授業（17:30）に 間に合わなかった。ラン自体は 成功して いるので
 * 設定ミスでは なく、GitHub が 時刻に 配らなかった（docs/deploy.md §0.11）。
 *
 * 直しは「cron を 5本に する」だが、**そのままだと 1日 5回 本番へ 出る**。
 * 1回の 本番デプロイは KV へ 約75件 書き、枠は 1000件/日。授業中の ISR で
 * 240〜480件 使う ことも あるので、5回 出すと その日の 夕方に 枠が 尽きて
 * 「出せば 出すほど 壊れる」状態に なる（§0.6・§0.9）。
 *
 * ここが 見張るのは 2つ:
 *   1. **むだに 出さない**（同じ 中身・出した ばかり → 出さない）
 *   2. **迷ったら 出す**（読めない → 出す。黙って 止まる ほうが 害が 大きい）
 */

const NOW = Date.parse("2026-08-28T10:12:00.000Z"); // 17:12 ICT（最後の cron）
const OLD = "9d4b511d4c22e6ffbfa9ff65331cc8e3271139bd";
const NEW = "c77c777c77c777c77c777c77c777c77c777c777c";

describe("出さないほうがよいとき", () => {
  it("本番が すでに その コミットなら 出さない", () => {
    const result = shouldDeploy({
      live: { sha: NEW, builtAt: "2026-08-21T00:00:00.000Z" },
      deploySha: NEW,
      nowMs: NOW,
    });
    expect(result.needed).toBe(false);
    expect(result.reason).toContain("すでに");
  });

  it("中身が 違っても、出した ばかりなら 出さない（次の cron が 拾う）", () => {
    const result = shouldDeploy({
      live: { sha: OLD, builtAt: "2026-08-28T09:55:00.000Z" }, // 17分前
      deploySha: NEW,
      nowMs: NOW,
    });
    expect(result.needed).toBe(false);
    expect(result.reason).toContain("17 分");
  });

  it("間隔の 境目（ちょうど 29分）では まだ 出さない", () => {
    const result = shouldDeploy({
      live: { sha: OLD, builtAt: "2026-08-28T09:43:00.000Z" }, // 29分前
      deploySha: NEW,
      nowMs: NOW,
    });
    expect(result.needed).toBe(false);
  });
});

describe("出すべきとき", () => {
  it("中身が 違い、間隔も あいていれば 出す", () => {
    const result = shouldDeploy({
      live: { sha: OLD, builtAt: "2026-08-27T21:11:00.131Z" },
      deploySha: NEW,
      nowMs: NOW,
    });
    expect(result.needed).toBe(true);
  });

  it("間隔の 境目（ちょうど 30分）では 出す", () => {
    const result = shouldDeploy({
      live: { sha: OLD, builtAt: "2026-08-28T09:42:00.000Z" }, // 30分前
      deploySha: NEW,
      nowMs: NOW,
    });
    expect(result.needed).toBe(true);
  });

  it("授業前の 2回目（1回目から 30分 たって 教材が 増えた）は 出す", () => {
    // 16:12 に 出して、16:51 の cron で 新しい 教材が 入っている ケース。
    const result = shouldDeploy({
      live: { sha: OLD, builtAt: "2026-08-28T09:20:00.000Z" },
      deploySha: NEW,
      nowMs: Date.parse("2026-08-28T09:51:00.000Z"),
    });
    expect(result.needed).toBe(true);
  });
});

describe("迷ったら 出す（fail-open）", () => {
  it("本番が 読めなければ 出す", () => {
    expect(shouldDeploy({ live: null, deploySha: NEW, nowMs: NOW }).needed).toBe(true);
  });

  it("sha が 空なら 出す", () => {
    expect(
      shouldDeploy({ live: { sha: "", builtAt: "" }, deploySha: NEW, nowMs: NOW }).needed,
    ).toBe(true);
  });

  it("builtAt が 壊れて いても 出す", () => {
    // ここが 2026-08-29 に 実際に 踏んだ 穴。シェルの `date -d` は macOS では
    // ISO-8601 を 読めず、黙って 0 に なっていた。0 を「とても 古い」と 読むと
    // たまたま 正しく 見えるが、**逆に 倒れる 書きかたなら 出さなくなる**。
    // 読めない ことを はっきり 扱う。
    expect(
      shouldDeploy({ live: { sha: OLD, builtAt: "こわれた値" }, deploySha: NEW, nowMs: NOW })
        .needed,
    ).toBe(true);
  });

  it("builtAt が 無くても 出す", () => {
    expect(shouldDeploy({ live: { sha: OLD }, deploySha: NEW, nowMs: NOW }).needed).toBe(true);
  });
});

describe("同じ日に 何回 出るか", () => {
  it("5本の cron が ぜんぶ 起きても、教材が 増えなければ 出るのは 1回", () => {
    const crons = [
      "2026-08-28T09:12:00Z",
      "2026-08-28T09:26:00Z",
      "2026-08-28T09:38:00Z",
      "2026-08-28T09:51:00Z",
      "2026-08-28T10:12:00Z",
    ].map((t) => Date.parse(t));

    // 本番は 前日の 版。1本目で 出て、あとは 同じ SHA に なる。
    let live = { sha: OLD, builtAt: "2026-08-27T21:11:00.131Z" };
    let deploys = 0;

    for (const nowMs of crons) {
      const { needed } = shouldDeploy({ live, deploySha: NEW, nowMs });
      if (needed) {
        deploys += 1;
        live = { sha: NEW, builtAt: new Date(nowMs + 8 * 60000).toISOString() };
      }
    }

    expect(deploys).toBe(1);
  });

  it("授業直前まで 教材を 足しつづけても、出るのは 最大 2回（KV 約150件）", () => {
    const crons = [
      "2026-08-28T09:12:00Z",
      "2026-08-28T09:26:00Z",
      "2026-08-28T09:38:00Z",
      "2026-08-28T09:51:00Z",
      "2026-08-28T10:12:00Z",
    ].map((t) => Date.parse(t));

    let live = { sha: OLD, builtAt: "2026-08-27T21:11:00.131Z" };
    let deploys = 0;

    for (const [index, nowMs] of crons.entries()) {
      // 毎回 新しい コミットが 積まれている（8/28 の実際の 動きに 近い）。
      const target = `${index}`.repeat(40);
      const { needed } = shouldDeploy({ live, deploySha: target, nowMs });
      if (needed) {
        deploys += 1;
        live = { sha: target, builtAt: new Date(nowMs + 8 * 60000).toISOString() };
      }
    }

    expect(deploys).toBe(2);
  });
});
