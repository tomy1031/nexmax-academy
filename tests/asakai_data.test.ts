import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ASSET_VERSIONS } from "@/content/asset-versions.generated";

import kantan from "../content/meetings/asakai_kantan.json";
import muzukashii from "../content/meetings/asakai_muzukashii.json";
import { meetingSchema } from "@/content/schema";
import {
  applyUtterance,
  hasNumber,
  initialPanelStates,
  type PanelState,
  type ReportPanel,
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

/**
 * **作業記録を そのまま 読み上げただけでは 合格しない**（夕礼・2026-09-14）
 *
 * この 検査を 入れる 前、夕礼は **記録を 1文字も 変えずに 読み上げるだけで
 * 5日 とも 合格**して いた（実測 21こ中 16こ・合格ラインは 11）。
 * 教材の あたま（`focus`）が「作業記録を そのまま 読み上げません」と 書いて
 * いる ことを、判定が 一度も 見て いなかった。
 *
 * ことばの 照合を 締めても 塞がらない——記録は **正しい ことばで 書かれて いる**。
 * 塞ぐのは `readsLog` で、ここが その 見張り。
 */
describe("記録の 丸読みは 合格に ならない", () => {
  const meeting = meetingSchema.parse(muzukashii);
  const asakai = meeting.asakai!;

  type HardScene = (typeof asakai.scenes)[number];

  const logOf = (scene: HardScene) =>
    (scene.card.memo ?? []).map((row) => ({ head: row.head, text: row.text }));

  /** 教材の パネルを 判定の 形へ（画面の `toPanels` と 同じ 写し方）。 */
  const toReportPanels = (scene: HardScene): ReportPanel[] =>
    scene.panels.map((panel) => ({
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

  it("夕礼は 作業記録を 持って いる（この 検査の 前提）", () => {
    for (const scene of asakai.scenes) {
      expect(logOf(scene).length).toBeGreaterThan(5);
    }
  });

  it("どの日も、記録を そのまま 並べたら 1つも 開かない", () => {
    for (const scene of asakai.scenes) {
      const log = logOf(scene);
      const panels = toReportPanels(scene);
      for (const said of [
        log.map((row) => `${row.head} ${row.text}`).join("。"), // 時刻ごと
        log.map((row) => row.text).join("。"), // 時刻を 省いて
      ]) {
        const step = applyUtterance({
          utterance: said,
          panels,
          states: initialPanelStates(panels),
          logLines: log,
        });
        expect(step.readLog).toBe(true);
        expect(step.opened).toEqual([]);
        expect(step.newFacts).toEqual([]);
      }
    }
  });

  it("1週間 丸読みしても 合格の 線に とどかない", () => {
    let units = 0;
    for (const scene of asakai.scenes) {
      const log = logOf(scene);
      const panels = toReportPanels(scene);
      const step = applyUtterance({
        utterance: log.map((row) => `${row.head} ${row.text}`).join("。"),
        panels,
        states: initialPanelStates(panels),
        logLines: log,
      });
      units += step.states
        .filter((one) => one.id !== "komari")
        .reduce((sum, one) => sum + one.said.length, 0);
    }
    expect(units).toBeLessThan(asakai.pass.units);
  });

  it("まとめて 話した ぶんは そのまま 数える", () => {
    /* 差し戻しが **正しい 報告まで 巻き込まない** ことを 見る。
       教材の れいは まとめた 文なので、記録を 持つ 日でも ぜんぶ 開く。 */
    for (const scene of asakai.scenes) {
      const log = logOf(scene);
      const panels = toReportPanels(scene);
      let states: readonly PanelState[] = initialPanelStates(panels);
      for (const panel of scene.panels) {
        const step = applyUtterance({
          utterance: panel.example.text,
          panels,
          states,
          logLines: log,
        });
        expect(step.readLog).toBe(false);
        states = step.states;
      }
      const shut = panels
        .filter((panel) => !states.find((s) => s.id === panel.id)?.full)
        .map((panel) => `${scene.day}/${panel.id}`);
      expect(shut).toEqual([]);
    }
  });
});

/**
 * **曜日ごとの 言い渡しは 継ぎ足しで 持つ**（2026-09-14 の 指定
 *「システムとしては ステージ（曜日）ごとに プロンプトは 変更できると いいと 思います」）
 *
 * 教材ぜんたいの `judgePrompt` は 1本の まま で、場面の `judgeNote` が そこへ 足される。
 * **5日ぶんの 写しに して しまうと 片方だけ 直る**ので、写しに なって いない ことを 見る。
 */
describe("曜日ごとの 見かた", () => {
  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;
    const notes = asakai.scenes.map((scene) => scene.judgeNote ?? "");

    it(`${name} は 5日 とも その日の 見かたを 持つ`, () => {
      expect(notes.filter((note) => note.trim().length > 0)).toHaveLength(5);
    });

    it(`${name} の その日の 見かたは 5日 とも ちがう（写しに なって いない）`, () => {
      expect(new Set(notes).size).toBe(5);
    });

    /**
     * 継ぎ足しの 相手が 無いと、その日の 見かただけが AIに 届く。
     * 教材ぜんたいの 指示（ことばの 高さ・ほめかた・直しかた）は こちらに 残す。
     */
    it(`${name} は 教材ぜんたいの 見かたも 持って いる`, () => {
      expect((meeting.judgePrompt ?? "").length).toBeGreaterThan(200);
    });

    /**
     * **同じ ことを 2か所に 書かない**。教材ぜんたいの 指示に 曜日の 名前が 出て いたら、
     * それは 場面へ 移す もの——2か所に あると、片方を 直した ときに もう片方が
     * 黙って 古い ままに なる。
     */
    it(`${name} の 教材ぜんたいの 見かたに 曜日の 名前が 残って いない`, () => {
      const stray = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"].filter((day) =>
        (meeting.judgePrompt ?? "").includes(day),
      );
      expect(stray).toEqual([]);
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
  /**
   * **おわびは「お願いの 中身」とは 別の 札**（2026-09-17 の 指定）。
   *
   * 前は 1つの 行が おわび＋中身を まとめて 求めて いた ので、
   *「申し訳ありませんが、予定の 確認を お願いします」（1日 のばす と 言って いない）が 通り、
   *「納期を 1日 延ばして いただけますか」（おわびが 無い）が 通らなかった——
   * **中身より ことばが 優先**されて いた。
   * いまは お願いの 札に 2つの 行を 置く: お願いの 中身と おわび。
   * どちらが 足りないかが 画面の 箱で 読めるので、直す ところが はっきりする。
   */
  const owabiFacts = MEETINGS.flatMap(({ name, raw }) => {
    const asakai = meetingSchema.parse(raw).asakai!;
    return asakai.scenes.flatMap((scene) =>
      scene.panels.flatMap((panel) =>
        panel.facts
          .filter(
            (fact) =>
              fact.keywords.some(isOwabi) ||
              (fact.allOf?.some((group) => group.some(isOwabi)) ?? false),
          )
          .map((fact) => ({ where: `${name}/${scene.day}/${panel.id}`, fact, panel })),
      ),
    );
  });

  it("ステージの どこかに おわびを 求める 行が ある", () => {
    expect(owabiFacts.length, "おわびを 練習する 行が ステージから 消えた").toBeGreaterThan(0);
  });

  it("あやまるだけでは ⭕ に ならない（中身が 要る）", () => {
    for (const { where, fact, panel } of owabiFacts) {
      /*
       * 通り道は 2つ。どちらでも「すみません」だけでは 満点に ならない。
       * - 同じ 行が おわびと 中身の 両方を 求める（allOf が 2組 以上）
       * - おわびは 別の 行で、その 札が ⭕ に なるには ほかの 行も 要る
       */
      const pairedInFact = (fact.allOf?.length ?? 0) >= 2;
      const pairedInPanel = panel.facts.length >= 2;
      expect(pairedInFact || pairedInPanel, `${where}: あやまるだけで ⭕ に なる`).toBe(true);
    }
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
/**
 * **目印の 入った セリフに 作り置きの 音を つけない**（2026-09-15）
 *
 * 司会の「では 次に ◯◯さん、お願いします。」は、画面では 学習者の 名前に
 * 置きかわる（`fillCallName`）。ところが 音は **書いた とおりに 焼く**ので、
 * そのまま 音に すると **「まるまるさん」と 読み上げる**——字は「ソピアさん」、
 * こえは「まるまるさん」で 食いちがう。
 *
 * ## 見張るのは **`◯◯さん`（名前）だけ**（2026-09-18）
 * 2026-09-15 に 線を 引いた ときは `◯◯` を ぜんぶ 弾いて いた。作り置きを
 * 実際に 走らせて 気づいた ——止まった 23行の うち **18行は 名前では なく
 * 穴うめの 目印**だった（「「きのうは ◯◯を しました」の 形で お願いします。」）。
 *
 * この 2つは `src/lib/meeting/speech.ts` が すでに 分けて いる:
 * - `◯◯さん` … 端末の 名前に 置きかわる → **人ごとに 変わるので 焼けない**
 * - むきだしの `◯◯` … **画面にも そのまま 出る 空欄** → 声も「まるまる」で 字と そろう
 *
 * 穴うめまで 黙らせると、**通じなかった ときの 言い直しだけ 無音**に なる
 *（いちばん 聞きたい 行）。上の 理由は 名前の ことしか 書いて いないので、
 * 検査を その とおりに 狭める。
 */
describe("名前の 置き場には 音を つけない", () => {
  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;

    it(`${name} は ◯◯さん の ある セリフに audio を 持たない`, () => {
      const baked: string[] = [];
      const walk = (value: unknown, path: string): void => {
        if (value === null || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach((item, i) => walk(item, `${path}[${i}]`));
          return;
        }
        const line = value as { speakerId?: unknown; text?: unknown; audio?: unknown };
        if (
          typeof line.speakerId === "string" &&
          typeof line.text === "string" &&
          typeof line.audio === "string" &&
          line.audio !== "" &&
          line.text.includes("◯◯さん")
        ) {
          baked.push(`${path}: ${line.text}`);
        }
        for (const [key, child] of Object.entries(value)) {
          walk(child, path === "" ? key : `${path}.${key}`);
        }
      };
      walk(asakai, "");
      expect(baked).toEqual([]);
    });
  }
});

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

/**
 * **金曜日までの しごとの 表**（2026-09-16 の 指定）
 *
 * - 並びは **進行順**（実際に 手を つける 順）。曜日が 変わっても 入れ替えない——
 *   入れ替わると「増えたのか 動いたのか」が 読めない
 * - **ACLEDA Pay は はじめ 無い**。社長の 要望（火曜の 午後）を 受けて 水曜から 増え、
 *   **増えた その日だけ**「追加」の 印が つく
 * - つなぐ 先は 名前に 出す。はじめは（ABA）、要望の あとは（ABA/ACLEDA）
 */
describe("どこまで できたかの 表（朝礼）", () => {
  const meeting = meetingSchema.parse(kantan);
  const scenes = meeting.asakai!.scenes;
  const labelsOf = (at: number) => scenes[at]!.card.progress.map((row) => row.label);

  it("並びは 曜日が 変わっても 入れ替わらない（進行順）", () => {
    for (let at = 1; at < scenes.length; at += 1) {
      const before = labelsOf(at - 1).map(baseName);
      const after = labelsOf(at).map(baseName);
      /* 前の 日の 並びが、次の 日の 並びの 中に 同じ 順で 残って いる。 */
      expect(after.filter((name) => before.includes(name))).toEqual(before);
    }
  });

  /*
    **上の しごとほど 早く 手を つける**（2026-09-17 の 指定「タスクが 順番どおりでは
    ないかも しれませんので、それの 修正も」）。前は「支払方法を えらぶ」が
    「決済APIと つなぐ」の 上に あり、月曜・火曜の 表で **【これから】が【いま】の 上**に
    出て いた——表を 上から 読むと 進みが 逆に 見える。
  */
  it("手を つける 順に 並んで いる（上の しごとほど 早く 始まる）", () => {
    /** その しごとに はじめて 手が つく 日（ずっと これから なら 6日目 あつかい）。 */
    const startAt = (name: string) => {
      const at = scenes.findIndex((scene) =>
        scene.card.progress.some((task) => baseName(task.label) === name && task.state !== "later"),
      );
      return at === -1 ? scenes.length : at;
    };
    const names = labelsOf(scenes.length - 1).map(baseName);
    const days = names.map(startAt);
    expect(days, `並びが 手を つける 順で ない: ${names.join(" / ")}`).toEqual(
      [...days].sort((a, b) => a - b),
    );
  });

  /*
    **【これから】は ぜんぶ 下に かたまる。** どの 日も、まだ 始めて いない しごとの
    下に「いま」「おわり」が 来ない。ここが くずれると、表が 進みの 順に 読めない。
  */
  it("どの 日も 【これから】の 下に いま・おわりが 出ない", () => {
    for (const scene of scenes) {
      const states = scene.card.progress.map((task) => task.state);
      const firstLater = states.indexOf("later");
      if (firstLater === -1) continue;
      expect(
        states.slice(firstLater).every((state) => state === "later"),
        `${scene.day}: ${states.join(",")}`,
      ).toBe(true);
    }
  });

  it("ACLEDA Pay は 水曜から 増え、その日だけ 追加の 印が つく", () => {
    const acleda = scenes.map((scene) =>
      /* 「決済APIと つなぐ（ABA/ACLEDA）」に 当たらない ように 頭で 見る。 */
      scene.card.progress.find((row) => row.label.startsWith("ACLEDA Pay")),
    );
    expect(acleda[0], "月曜に ACLEDA が ある").toBeUndefined();
    expect(acleda[1], "火曜に ACLEDA が ある").toBeUndefined();
    expect(acleda[2]?.added, "水曜に 追加の 印が 無い").toBe(true);
    expect(acleda[3]?.added, "木曜にも 追加の 印が 残って いる").toBe(false);
    expect(acleda[4]?.added, "金曜にも 追加の 印が 残って いる").toBe(false);
  });

  it("つなぐ 先が 名前に 出る（はじめは ABA だけ）", () => {
    const api = scenes.map(
      (scene) => scene.card.progress.find((row) => row.label.startsWith("決済APIと つなぐ"))!.label,
    );
    expect(api[0]).toBe("決済APIと つなぐ（ABA）");
    expect(api[1]).toBe("決済APIと つなぐ（ABA）");
    expect(api[2]).toBe("決済APIと つなぐ（ABA/ACLEDA）");
    expect(api[3]).toBe("決済APIと つなぐ（ABA/ACLEDA）");
    /* 金曜は 藤木さんが「ACLEDA Payは 次の 回に します」と 言う ので 戻る。 */
    expect(api[4]).toBe("決済APIと つなぐ（ABA）");
  });

  it("どの しごとにも 絵の 印が ついて いる", () => {
    for (const scene of scenes) {
      for (const row of scene.card.progress) expect(row.icon, row.label).toBeTruthy();
    }
  });

  /*
    清書の 絵（願い #441）。**置いて あるか**まで 見る——`src` を 書いただけで
    ファイルが 無いと、画面は 壊れた 絵の 四角を 10個 並べる。
  */
  it("どの しごとにも 清書の 絵が あり、ファイルが 置いて ある", () => {
    for (const scene of scenes) {
      for (const row of scene.card.progress) {
        const src = row.image?.src;
        expect(src, `${row.label} に 絵が ない`).toBeTruthy();
        expect(row.image?.status, `${row.label} の 絵が done で ない`).toBe("done");
        expect(
          existsSync(join(process.cwd(), "public", src!)),
          `${row.label} の 絵が 置いて ない: ${src}`,
        ).toBe(true);
      }
    }
  });

  /*
    **台帳が 正**（`scripts/images/asakai_tasks.json`）。教材の `src` は その 写しなので、
    台帳に 無い 絵が 教材に 生えて いたら、作り直しかたが 分からない 絵に なる
   （`image` に プロンプトを 焼かない と 決めた ぶん、ここが 唯一の 手がかり）。
  */
  it("絵は ぜんぶ 台帳（asakai_tasks.json / asakai_tasks_moji.json）に 載って いる", () => {
    /* 字を 入れる 5枚は noText が ちがう ので 台帳を 分けて ある（2026-09-16）。 */
    const known = new Set<string>();
    for (const file of ["asakai_tasks.json", "asakai_tasks_moji.json"]) {
      const ledger = JSON.parse(
        readFileSync(join(process.cwd(), "scripts", "images", file), "utf8"),
      ) as { scenes: { dest: string }[] };
      for (const one of ledger.scenes) {
        expect(known, `${one.dest} が 2つの 台帳に ある`).not.toContain(
          one.dest.replace(/^public/u, ""),
        );
        known.add(one.dest.replace(/^public/u, ""));
      }
    }
    for (const scene of scenes) {
      for (const row of scene.card.progress) {
        expect(known, `${row.label} の 絵が 台帳に ない: ${row.image?.src}`).toContain(
          row.image!.src!,
        );
      }
    }
  });

  /*
    **版番号が 無いと 差しかえが 届かない。** `public/_headers` は `/img/*` を
    `immutable` で 配る ので、`ASSET_VERSIONS` に 鍵が 無い 絵は URL が 変わらず、
    作り直しても 古い 絵が 出つづける（2026-09-04 に 音で 実発生した 型）。
    `npm run gen:content` の かけ忘れは これで 止まる。
  */
  it("絵に 版番号が ついて いる（gen:content の かけ忘れを 止める）", () => {
    for (const scene of scenes) {
      for (const row of scene.card.progress) {
        expect(ASSET_VERSIONS, `${row.label} の 版番号が ない: ${row.image?.src}`).toHaveProperty(
          row.image!.src!,
        );
      }
    }
  });

  /*
    **画面は 80px で 出す。** 画素が 足りない 絵を 置くと、3倍の 端末で ぼやけ、
    押して 広げた ときは もっと ぼやける。絵は 見分ける ための ものなので
   （2026-09-16 の 指定）、表示の 3倍を 下まわらない ことを 見る。
  */
  it("絵は 表示（80px）の 3倍 以上 ある", () => {
    const seen = new Set<string>();
    for (const scene of scenes) {
      for (const row of scene.card.progress) {
        const src = row.image!.src!;
        if (seen.has(src)) continue;
        seen.add(src);
        const bytes = readFileSync(join(process.cwd(), "public", src));
        const size = webpSize(bytes);
        expect(size, `${src} の 大きさが 読めない`).toBeTruthy();
        expect(size!.width, `${src} が 小さすぎる`).toBeGreaterThanOrEqual(240);
        expect(size!.height, `${src} が 小さすぎる`).toBeGreaterThanOrEqual(240);
      }
    }
  });

  it("同じ しごとは どの 日も 同じ 絵（日で 絵が 入れ替わらない）", () => {
    const byTask = new Map<string, string>();
    for (const scene of scenes) {
      for (const row of scene.card.progress) {
        const key = baseName(row.label);
        const src = row.image!.src!;
        const first = byTask.get(key);
        if (first === undefined) byTask.set(key, src);
        else expect(src, `${key} の 絵が 日で ちがう`).toBe(first);
      }
    }
    /* 10の しごとに 10枚。使い回しが あると ここで 落ちる。 */
    expect(new Set(byTask.values()).size).toBe(byTask.size);
  });
});

/**
 * **報告の 日には 日付が ある**（2026-09-17 の 指定
 *「9/21(月)〜25(金)を 報告の 日として、日付を いれる ように して ください。
 *  最初の 日は 18(金)の 報告を します」）
 *
 * 「先週の 金曜日」「金曜日までに」だけでは、**どの 日の ことか** 読めなかった。
 * 週は 2026-09-21（月）〜09-25（金）。月曜の「きのう」は 土日を またぐ ので
 * **先週の 金曜日 9/18**。ここが ずれると、報告の 中身と 表の 進みが 合わなく なる。
 */
describe("報告の 日付（朝礼）", () => {
  const scenes = meetingSchema.parse(kantan).asakai!.scenes;
  /** その日 / きのう（月曜だけ 土日を またいで 先週の 金曜）。 */
  const WEEK = [
    /* 月曜だけ「先週の」を 残す——土日を またぐ ことは 日付だけでは 伝わらない。 */
    { today: "9/21 月曜日", yesterday: "先週の 金曜日・9/18" },
    { today: "9/22 火曜日", yesterday: "9/21 月曜日" },
    { today: "9/23 水曜日", yesterday: "9/22 火曜日" },
    { today: "9/24 木曜日", yesterday: "9/23 水曜日" },
    { today: "9/25 金曜日", yesterday: "9/24 木曜日" },
  ];

  it("場面の 札が 日付で 始まる（画面の 曜日は ここから 取る）", () => {
    scenes.forEach((scene, at) => {
      expect(scene.title.startsWith(`${WEEK[at]!.today} `), scene.title).toBe(true);
    });
  });

  it("「きのう したこと」の 札は 前の 日の 日付（月曜は 先週の 金曜）", () => {
    scenes.forEach((scene, at) => {
      const row = scene.card.rows!.find((one) => one.key === "kinou")!;
      expect(row.label).toBe(`きのう したこと（${WEEK[at]!.yesterday}）`);
    });
  });

  it("「きょう すること」の 札は その日の 日付", () => {
    scenes.forEach((scene, at) => {
      const row = scene.card.rows!.find((one) => one.key === "kyou")!;
      expect(row.label).toBe(`きょう すること（${WEEK[at]!.today}）`);
    });
  });

  /* メモの 行と 板の カードは **同じ 札**。ずれると、どの 行の ことか 読めない。 */
  it("板の カードの 札は メモの 行の 札と 同じ", () => {
    for (const scene of scenes) {
      for (const key of ["kinou", "kyou"] as const) {
        const row = scene.card.rows!.find((one) => one.key === key)!;
        const panel = scene.panels.find((one) => one.id === key)!;
        expect(panel.label, `${scene.day} の ${key}`).toBe(row.label);
      }
    }
  });

  it("今週の ゴールは 9/25（5日 とも 同じ）", () => {
    for (const scene of scenes) {
      expect(scene.card.goal.startsWith("9/25 金曜日に、")).toBe(true);
    }
  });
});

/**
 * **その日の 中身を 言えた ときだけ 開く**（2026-09-17 の 指定 ②③④）
 *
 * ユーザーの 指摘:
 * - 問題が ある 水・木でも「問題は ありません」で 札が 開いて いた
 * - 進捗が「数字が 1つ あれば」で 開くので、木曜の「1日 遅れる」や
 *   見本の 50% でも 開いて いた
 * - お願いが「おわび＋予定＋たのみ方」の 3つ揃いなので、
 *   **1日 のばして ほしいと 言って いない**「予定の 確認を お願いします」が 通り、
 *   **おわびの 無い**「納期を 1日 延ばして いただけますか」が 通らなかった
 */
describe("その日の 中身でしか 開かない（朝礼）", () => {
  const scenes = meetingSchema.parse(kantan).asakai!.scenes;
  const sceneOf = (day: string) => scenes.find((scene) => scene.day === day)!;
  const panelsOf = (scene: (typeof scenes)[number]) =>
    scene.panels.map((panel) => ({
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
  /** その 発話で 開いた 札の 状態を 返す。 */
  const say = (day: string, utterance: string, panelId: string) => {
    const scene = sceneOf(day);
    const panels = panelsOf(scene);
    const states = applyUtterance({
      utterance,
      panels,
      states: initialPanelStates(panels),
    }).states;
    return states.find((state) => state.id === panelId)!;
  };

  const NO_PROBLEM = "今の ところ 問題は ありません。";

  it("水・木は「問題は ありません」では 開かない", () => {
    for (const day of ["wed", "thu"]) {
      expect(say(day, NO_PROBLEM, "komari").open, `${day}: ありませんで 開いた`).toBe(false);
    }
  });

  it("月・火・金は これまでどおり「問題は ありません」で 開く", () => {
    for (const day of ["mon", "tue", "fri"]) {
      expect(say(day, NO_PROBLEM, "komari").full, `${day}: 問題なしで 開かない`).toBe(true);
    }
  });

  it("水・木は その日の 中身を 言えば 開く", () => {
    expect(
      say("wed", "1つ 問題が あります。APIと つなぐ ところが むずかしいです。", "komari").full,
    ).toBe(true);
    const thu = say(
      "thu",
      "決済APIと つなぐ ところが うまく いって いません。このままだと 予定より 1日 遅れる かもしれません。",
      "komari",
    );
    expect(thu.full).toBe(true);
  });

  /*
    **ヒントは 足場で あって 答えでは ない**（P8・2026-09-17 の R10 検収）。
    前は 木の ヒントが 穴の 無い 完成文だった ので、**◯◯を 1つも 埋めずに
    読み上げるだけで「お願い」の 札が ⭕**に なって いた。進捗の ヒントも
    その日の %入りで、締めた ばかりの 判定を ヒントが そのまま 満たして いた。
  */
  it("ヒントを そのまま 読み上げても 札は 開かない", () => {
    for (const scene of scenes) {
      const panels = panelsOf(scene);
      let states: readonly PanelState[] = initialPanelStates(panels);
      for (const line of scene.hintLines) {
        states = applyUtterance({ utterance: line, panels, states }).states;
      }
      const full = states.filter((state) => state.full).map((state) => state.id);
      /* 「今の ところ 問題は ありません」の 型文は 問題の 無い 日だけ。そこは 渡して よい。 */
      const allowed = ["mon", "tue", "fri"].includes(scene.day) ? ["komari"] : [];
      expect(full.sort(), `${scene.day}: ヒントだけで 開いた`).toEqual(allowed);
    }
  });

  it("進捗は その日の 数でしか 開かない", () => {
    const value: Record<string, string> = {
      mon: "20",
      tue: "35",
      wed: "45",
      thu: "60",
      fri: "85",
    };
    for (const [day, percent] of Object.entries(value)) {
      expect(say(day, `今、進捗は ${percent}%です。`, "shinchoku").full, `${day} の 数`).toBe(true);
      /* 見本（ヘンディさん）の 数字は 決済バックエンド機能の もの。 */
      expect(say(day, "今、進捗は 50%です。", "shinchoku").open, `${day}: 見本の 数で 開いた`).toBe(
        percent === "50",
      );
    }
  });

  it("「1日 遅れる」は 進捗では ない", () => {
    expect(say("thu", "このままだと、予定より 1日 遅れる かもしれません。", "shinchoku").open).toBe(
      false,
    );
  });

  it("お願いは おわびが 無くても 中身で 立つ", () => {
    const said = say("thu", "納期を 1日 延ばして いただけますか。", "onegai");
    expect(said.said).toContain("onegai1");
    /* おわびは 別の 行なので、ここでは まだ ⭕ に ならない。 */
    expect(said.full).toBe(false);
  });

  it("あやまるだけ・確認を たのむだけでは お願いの 中身は 立たない", () => {
    const only = say("thu", "申し訳ありませんが、予定の 確認を お願いします。", "onegai");
    expect(only.said, "1日 のばすと 言って いないのに 中身が 立った").not.toContain("onegai1");
    expect(only.full).toBe(false);
  });

  it("中身と おわびが そろうと ⭕", () => {
    expect(
      say("thu", "申し訳ありませんが、スケジュールを 1日 のばして いただけませんか。", "onegai")
        .full,
    ).toBe(true);
  });
});

/**
 * **足場（ヒント・返答・決定の 時点）が その日の 中身と 合って いる**
 *（2026-09-17 の 指定 ①③④）
 */
describe("足場が その日と 合って いる（朝礼）", () => {
  const scenes = meetingSchema.parse(kantan).asakai!.scenes;
  const sceneOf = (day: string) => scenes.find((scene) => scene.day === day)!;

  it("問題が ある 日の ヒントは「問題は ありません」を 渡さない", () => {
    for (const day of ["wed", "thu"]) {
      const lines = sceneOf(day).hintLines;
      expect(
        lines.some((line) => line.includes("問題は ありません")),
        `${day}: 言っては いけない 型を 渡して いる`,
      ).toBe(false);
    }
  });

  it("月曜の ヒントは「きのう」では なく「先週の 金曜日」", () => {
    expect(sceneOf("mon").hintLines[0]).toContain("先週の 金曜日");
  });

  it("木曜の お願いへの 返答が 結論を 言う（だれが・予定は どうなる）", () => {
    const arrange = sceneOf("thu").arrange!;
    for (const line of [arrange.done.text, arrange.missing.text]) {
      expect(line, "だれが 引き取るかが 無い").toMatch(/わたしが 対応します/u);
      expect(line, "予定が どうなるかが 無い").toMatch(/予定どおり/u);
    }
  });

  it("ACLEDA の 決定は 木曜に 伝わる（金曜の 表より 前）", () => {
    const thu = sceneOf("thu")
      .closing.map((line) => line.text)
      .join("\n");
    expect(thu, "木曜に 決定が 伝わって いない").toContain("次の 回に します");
    /* 金曜の 表は その 決定の あとなので、つなぐ 先は ABA だけに 戻って いる。 */
    const friApi = sceneOf("fri").card.progress.find((row) =>
      row.label.startsWith("決済APIと つなぐ"),
    )!;
    expect(friApi.label).toBe("決済APIと つなぐ（ABA）");
  });
});

/** 「決済APIと つなぐ（ABA）」→「決済APIと つなぐ」（日で 変わる 添えを 落とす）。 */
function baseName(label: string): string {
  return label.replace(/（[^）]*）$/u, "");
}

/**
 * WebP の 画の 大きさ（VP8/VP8L/VP8X の 3形式）。
 * 画像ライブラリを 足さずに 済ませる ため、ヘッダだけを 読む。
 */
function webpSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF") return undefined;
  if (buf.toString("ascii", 8, 12) !== "WEBP") return undefined;
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (kind === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") {
    const at = 24;
    const width = buf[at]! | (buf[at + 1]! << 8) | (buf[at + 2]! << 16);
    const height = buf[at + 3]! | (buf[at + 4]! << 8) | (buf[at + 5]! << 16);
    return { width: width + 1, height: height + 1 };
  }
  return undefined;
}
