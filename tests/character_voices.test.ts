import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { characterSchema, scenarioSchema } from "@/content/schema";
import { findVoice, LIVE_VOICES } from "@/lib/audio/voices";

/**
 * 教材が 名ざす 声が、こちらの 一覧に ある か
 *
 * ## なぜ 要るか（2026-08-31）
 * 声の 名前は **Google の 一覧の 綴りで しか 通らない**。1文字ちがえば
 * Live は その 声を 見つけられず、接続が 切れて 学習者の 画面には
 *「音声が つくれません」としか 出ない——**キーを 疑う ところから 始まる**ので、
 * 原因に たどりつくまでが 遠い。
 *
 * 実際、松井社長の 声は 指定が「Shedar」で、Google の 綴りは `Schedar` だった。
 * 見た目が 近い ぶん、次に 見た 人が「打ちまちがい」と 思って 戻しかねない。
 * 綴りの ずれは **文章では 守れない**ので、ここで 名前を 突き合わせる。
 *
 * これは「一覧に ある か」の 検査で、**Live から 音が 返る かは 見て いない**
 *（鍵が 要る）。声を 足す ときは、これに 加えて 実機で 音を 聞く
 *（`src/lib/audio/voices.ts` の 覚書）。
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const filesIn = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((name) => name.endsWith(".json"))
    .map((name) => `${dir}/${name}`);

describe("キャラクターの 声", () => {
  it("一覧に ある 名前だけを 使って いる", () => {
    const wrong: string[] = [];
    for (const path of filesIn("content/characters")) {
      const character = characterSchema.parse(read(path));
      if (character.voice && !findVoice(character.voice)) {
        wrong.push(`${path}: ${character.voice}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("たいわの 相手の 声も 一覧に ある", () => {
    const wrong: string[] = [];
    for (const path of filesIn("content/scenarios")) {
      const scenario = scenarioSchema.parse(read(path));
      const voice = scenario.client.voice;
      if (voice && !findVoice(voice)) wrong.push(`${path}: ${voice}`);
    }
    expect(wrong).toEqual([]);
  });

  it("同じ 名前を 2回 書いて いない", () => {
    const names = LIVE_VOICES.map((one) => one.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("松井社長は Schedar（Google の 綴り。Shedar では 通らない）", () => {
    const matsui = characterSchema.parse(read("content/characters/matsui.json"));
    expect(matsui.voice).toBe("Schedar");
  });
});
