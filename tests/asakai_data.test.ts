import { describe, expect, it } from "vitest";

import kantan from "../content/meetings/asakai_kantan.json";
import muzukashii from "../content/meetings/asakai_muzukashii.json";
import { meetingSchema } from "@/content/schema";
import {
  applyUtterance,
  hasNumber,
  initialPanelStates,
  type PanelState,
} from "@/lib/meeting/panels";
import { findVoice } from "@/lib/audio/voices";
import fujiki from "../content/characters/fujiki.json";
import hendy from "../content/characters/hendy.json";
import nyam from "../content/characters/nyam.json";
import okuda from "../content/characters/okuda.json";
import tomita from "../content/characters/tomita.json";

/** 人物カード（こえの 正）。`scripts/make_meeting_audio.ts` が 読むのと 同じ もの。 */
const CHARACTERS: Record<string, { voice?: string }> = { fujiki, hendy, nyam, okuda, tomita };

/**
 * 朝礼・夕礼の **実データ**を そのまま 見る（台帳 #366）。
 *
 * `tests/meeting_panels.test.ts` は 手で 写した 4枚で 数え方だけを 見る。
 * それだけだと、**教材の 側を 直した ときに 気づけない**——パネルを 1枚 足す・
 * `openAt` を 変えるだけで 合格の 線が 届かなく なっても、あちらは 20件 緑の まま。
 * ここは 教材の JSON を 読んで、**分母と 合格の 線が 合って いるか**を 見る。
 */

const MEETINGS = [
  { name: "かんたん（朝礼）", raw: kantan },
  { name: "むずかしい（夕礼）", raw: muzukashii },
] as const;

describe("スキーマを 通る", () => {
  for (const { name, raw } of MEETINGS) {
    it(`${name} は meetingSchema に 合う`, () => {
      expect(meetingSchema.safeParse(raw).success).toBe(true);
    });
  }
});

describe("合格の 線が 届く ところに ある", () => {
  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;

    it(`${name} は 5日ぶん ある`, () => {
      expect(asakai.scenes).toHaveLength(5);
    });

    it(`${name} の 合格の 線は 満点を 超えない`, () => {
      const hard = asakai.level === "hard";
      /* かんたん＝開いた カードの 数、むずかしい＝こまりごと以外で 言えた 行の 数。 */
      const unitTotal = asakai.scenes.reduce((sum, scene) => {
        if (!hard) return sum + scene.panels.length;
        return (
          sum +
          scene.panels
            .filter((panel) => panel.id !== "komari")
            .reduce((n, panel) => n + panel.facts.length, 0)
        );
      }, 0);
      expect(asakai.pass.units).toBeLessThanOrEqual(unitTotal);
      /* 5日 まじめに やれば 届く 線か（満点の 6割は 超えて いない ことも 見る）。 */
      expect(asakai.pass.units / unitTotal).toBeGreaterThan(0.5);

      const komariTotal = asakai.scenes.reduce(
        (sum, scene) =>
          sum + (scene.panels.find((panel) => panel.id === "komari")?.facts.length ?? 0),
        0,
      );
      if (asakai.pass.komariBoxes !== undefined) {
        expect(asakai.pass.komariBoxes).toBeLessThanOrEqual(komariTotal);
      }
      if (asakai.pass.komariDays !== undefined) {
        expect(asakai.pass.komariDays).toBeLessThanOrEqual(asakai.scenes.length);
      }
    });

    it(`${name} の 当たりの ことばは すべて 2字 以上`, () => {
      /* `matchAllLocally` は 1字の 語を 当てない（誤爆が 多すぎる）。
         1字を 書くと **その 行は 永久に 立たない**——黙って 難しくなる。 */
      const short: string[] = [];
      for (const scene of asakai.scenes) {
        for (const panel of scene.panels) {
          for (const fact of panel.facts) {
            for (const word of fact.keywords) {
              if (word.length < 2) short.push(`${scene.day}/${panel.id}/${fact.id}: ${word}`);
            }
          }
        }
      }
      expect(short).toEqual([]);
    });

    it(`${name} は どの日も 司会の れいで カードが ぜんぶ 開く`, () => {
      /* れいは「2回 聞いても 開かない とき」の 最後の 足場。
       **それを そのまま 言っても 開かない** なら、足場に なって いない。 */
      for (const scene of asakai.scenes) {
        const panels = scene.panels.map((panel) => ({
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
        let states: readonly PanelState[] = initialPanelStates(panels);
        for (const panel of scene.panels) {
          states = applyUtterance({ utterance: panel.example.text, panels, states }).states;
        }
        const shut = panels
          .filter((panel) => !states.find((s) => s.id === panel.id)?.full)
          .map((panel) => `${scene.day}/${panel.id}`);
        expect(shut).toEqual([]);
      }
    });
  }
});

/** おわびの ことばか どうか。 */
const isOwabi = (word: string) => word.includes("すみません") || word.includes("申し訳");

/**
 * **悪い しらせほど 早く 言う**（2026-09-11 の 指定）。
 *
 * ページで 教えて いても、**練習に 無ければ 身に つかない**——この 検査を 入れる
 * 前は、おわびの ことばが 教材の どこにも 無く、`persona`（学習者に 見えない AIへの
 * 言い渡し）にだけ「すみません」が 書いて あった。消えても だれも 気づかない 形。
 *
 * ## 数えるのは **ステージ 全体**（2026-09-14 に 教材ごと → ステージ単位へ）
 * 上級（夕礼・Next Talent 編）は、**おわびでは なく タイミング**で 悪い しらせを
 * 教える 作りに なった——水曜に 17:05 に 見つけて 17:10 に 報告し、17:50 の 夕礼を
 * 待たない。ユーザーの 判断（2026-09-14「ゆうれいはお詫び不要。ただし悪いニュース
 * ほど早くがタイムラインに反映されているのでよし」）。
 *
 * **守る ものは 変えて いない**——「おわびの 言い方が ステージの どこかに 練習として
 * ある」。教材ごとに 求めると、初級と 上級で 教え方を 変えられなく なる。
 */
describe("悪い しらせと おわび", () => {
  it("ステージの どこかに おわびを 求める 箱が ある", () => {
    const owabi = MEETINGS.flatMap(({ name, raw }) => {
      const asakai = meetingSchema.parse(raw).asakai!;
      return asakai.scenes.flatMap((scene) =>
        scene.panels.flatMap((panel) =>
          panel.facts
            .filter((fact) => fact.allOf?.some((group) => group.some(isOwabi)))
            .map(() => `${name}/${scene.day}/${panel.id}`),
        ),
      );
    });
    /* おわびの ことばと 中身の **両方**を 求める 行が、ステージに 1つ 以上 ある。 */
    expect(owabi.length, "おわびを 練習する 箱が ステージから 消えた").toBeGreaterThan(0);
  });

  it("ステージの どこかで おわびの 言い方を 見本か れいで 見せて いる", () => {
    const shown = MEETINGS.some(({ raw }) => {
      const asakai = meetingSchema.parse(raw).asakai!;
      return asakai.scenes.some((scene) =>
        [
          scene.sample.text,
          ...scene.panels.map((panel) => panel.example.text),
          ...scene.hintLines,
        ].some(isOwabi),
      );
    });
    expect(shown, "求めるだけで 見せて いない（R10）").toBe(true);
  });

  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;

    it(`${name} の おわびは 中身と セットでしか 立たない`, () => {
      /* 「すみません」だけで 開くと、**あやまれば 通る** 練習に なる。 */
      const owabi = asakai.scenes
        .flatMap((scene) => scene.panels.flatMap((panel) => panel.facts))
        .filter((fact) =>
          fact.allOf?.some((group) =>
            group.some((word) => word.includes("すみません") || word.includes("申し訳")),
          ),
        );
      for (const fact of owabi) {
        expect(fact.allOf!.length).toBeGreaterThanOrEqual(2);
      }
    });
  }

  /*
   * 「ページが おわびの 言い方を 先に 教えて いる」は 2026-09-14 に 外した。
   * 朝礼ページを ユーザー指定の 本文に 差し替え、おわびの 言い方と 土日の 飛ばし方は
   * 授業で 口頭で 伝える ことに なった（ユーザーの 判断・テスト削除も 承認ずみ）。
   */
});

describe("数字の 見かた", () => {
  it("「十分」は 数では ない（足りて いる の 意味）", () => {
    expect(hasNumber("まだ 十分 できて いません。")).toBe(false);
  });
  it("漢数字の 数え方は 数える", () => {
    expect(hasNumber("三回 ためしました。")).toBe(true);
    expect(hasNumber("五個 のこって います。")).toBe(true);
  });
  it("「一覧」は 数では ない", () => {
    expect(hasNumber("一覧を 書きました。")).toBe(false);
  });
});

/**
 * こえの 割り当て（台帳 #387 の 17）
 *
 * `scripts/make_meeting_audio.ts` は 話す 人ごとに 人物カードの `voice` を 引く。
 * **カードに `voice` が 無いと 黙って `"Puck"` に 落ちる**ので、5人が 同じ 声で
 * 鳴る——耳では だれが 話して いるか 分からなく なるのに、検査は 緑の まま。
 * 実際に 奥田・藤木・富田の 3人が その 状態だった（2026-09-11）。
 */
describe("話す 人の こえ", () => {
  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;

    it(`${name} は 出る 人 ぜんぶに こえが 決まって いる`, () => {
      const missing = asakai.people
        .filter((person) => !(CHARACTERS[person.id]?.voice ?? ""))
        .map((person) => person.id);
      expect(missing).toEqual([]);
    });

    it(`${name} は 同じ こえが 2人に 当たって いない`, () => {
      const voices = asakai.people.map((person) => CHARACTERS[person.id]?.voice ?? "");
      expect(new Set(voices).size).toBe(voices.length);
    });

    it(`${name} の こえは 一覧に ある 名前`, () => {
      const unknown = asakai.people
        .map((person) => CHARACTERS[person.id]?.voice ?? "")
        .filter((voice) => voice !== "" && !findVoice(voice));
      expect(unknown).toEqual([]);
    });
  }
});

/**
 * **画面が 名前で 探す ものは、データに その 名前で ある**（2026-09-13 の 通し検収）
 *
 * `AsakaiSession.finishScene` は 問題の カードを **`id === "komari"`** で 探し、
 * そこから 2つを 決めて いる——采配（`arrange.done` か `missing`）と、
 * 週の 合格条件（`pass.komariDays`）の 数え。
 *
 * 決済開発編へ 差し替えた とき、札を「問題・確認」に 変えた ついでに id も
 * `mondai` に して しまい、**采配の done が 永久に 選ばれず、合格条件も
 * 満たせなく なって いた**。型も lint も 緑の まま——`id` は ただの 文字列で、
 * 名前が 合って いるかは どこも 見て いなかった。
 *
 * 札（`label`）は 教材ごとに 変えて よい。**`id` は 画面との 約束**なので 変えない。
 */
describe("画面との 約束（id）", () => {
  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;

    it(`${name} の どの 場面にも 問題の カード（id: komari）が ある`, () => {
      for (const scene of asakai.scenes) {
        const ids = scene.panels.map((panel) => panel.id);
        expect(ids, `${scene.day} の パネル`).toContain("komari");
      }
    });

    it(`${name} は 週の 合格条件（komariDays）に とどける`, () => {
      /* 問題の カードが ある 日の 数が、求める 日数に 足りて いるか。
         `komariDays` を 置いて いない 教材は この 条件を 使わない。 */
      const need = asakai.pass.komariDays;
      if (need === undefined) return;
      const days = asakai.scenes.filter((scene) =>
        scene.panels.some((panel) => panel.id === "komari"),
      ).length;
      expect(days).toBeGreaterThanOrEqual(need);
    });
  }
});

/**
 * **型文に かぎ括弧を 書かない**（2026-09-13 の 通し検収）
 *
 * `HintModal` が 1行ずつ 「」で 包む ので、データにも 書くと 画面で
 * 「「きのうは ◯◯を しました。」」に なる。旧・旅行アプリ編から 続いて いた 崩れ。
 */
describe("型文の 見た目", () => {
  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;

    it(`${name} の 型文は かぎ括弧で 包まれて いない`, () => {
      const wrapped = asakai.scenes.flatMap((scene) =>
        scene.hintLines.filter((line) => line.startsWith("「") && line.endsWith("」")),
      );
      expect(wrapped).toEqual([]);
    });
  }
});
