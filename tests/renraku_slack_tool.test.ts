import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { KANJI } from "@/lib/text/furigana";

/**
 * Renraku Master（public/tools/hourensou/renraku_slack.html）を 機械で 見る。
 *
 * 1枚の 静的な ページなので、アプリの 検査（`npm run lint:content`）が 中身を 見ない。
 * 2026-10-26 の 直しで 足した ところを ここで 止める:
 *  - ポップアップ辞書の 語が ぜんぶ 辞書（WORDS）に ある・説明に 読めない 漢字が 無い
 *  - 2つめの 連絡と 奥田さんの 返事が tomy さんの 文の まま
 *  - 「元号」だけは 吹き出しでは なく 説明の ページへ
 *  - 入力欄の カーソルが 0文字目から 出る（欄の 中に 空白を 置かない）
 *  - 進み具合を localStorage に 保存し、こわれた 保存は 使わない・「最初から」で 消す
 *  - ボタン・案内・選択肢・フィードバックの 漢字に ぜんぶ ふりがなが ある（規律2。
 *    前は「了解です。対応します。」の ボタンや「箇条書き」などが 裸の まま だった）
 */

const HTML_PATH = join("public", "tools", "hourensou", "renraku_slack.html");
const HTML = readFileSync(HTML_PATH, "utf8");

interface Scenario {
  title: string;
  instruction: { text: string };
  reply?: { text: string };
}
interface Word {
  reading: string;
  ja: string;
  en: string;
}

interface Saved {
  scenarioIndex: number;
  phase: string;
  currentViewId: string;
  stepsDone: number;
  score: number;
  wrongPicks: number[];
  times: Record<string, string>;
}

/** ページの スクリプトを、画面を 描かずに 読む（いちばん 最後の init() を 外す）。 */
function loadGame(storage = new Map<string, string>()): {
  SCENARIOS: Scenario[];
  WORDS: Record<string, Word>;
  USED_TERMS: Set<string>;
  STORE_KEY: string;
  loadSaved: () => Saved | null;
  restartFromScratch: () => void;
  reloads: () => number;
} {
  const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((hit) => hit[1] ?? "");
  const source = scripts.at(-1) ?? "";
  const body = source.replace(/\n\s*init\(\);\s*$/, "\n");
  if (body === source) throw new Error("最後の init() が 見つからない（ページの 作りが 変わった）");
  const element = () => ({
    classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
    style: {},
    dataset: {},
    setAttribute() {},
    getAttribute: () => null,
  });
  const documentStub = {
    getElementById: element,
    createElement: element,
    addEventListener() {},
    querySelectorAll: () => [],
    body: { contains: () => false },
  };
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  const windowStub = {
    addEventListener() {},
    matchMedia: () => ({ matches: false }),
    localStorage,
  };
  let reloads = 0;
  const locationStub = { reload: () => (reloads += 1) };
  const game = new Function(
    "document",
    "window",
    "lucide",
    "location",
    `${body}\nreturn { SCENARIOS, WORDS, USED_TERMS, STORE_KEY, loadSaved, restartFromScratch };`,
  )(documentStub, windowStub, { createIcons() {} }, locationStub);
  return { ...game, reloads: () => reloads };
}

const GAME = loadGame();

/** 画面に 出る 字だけ（ルビの 読みと タグを はずす）。 */
function plain(html: string): string {
  return html.replace(/<rt>[\s\S]*?<\/rt>/g, "").replace(/<[^>]+>/g, "");
}

/** ルビの 付いて いない 漢字（`<ruby>…</ruby>` の 外に ある もの）。 */
function bareKanji(html: string): string[] {
  const outside = html.replace(/<ruby>[\s\S]*?<\/ruby>/g, "").replace(/<[^>]+>/g, "");
  return [...outside].filter((char) => KANJI.test(char));
}

function scenario(title: string): Scenario {
  const found = GAME.SCENARIOS.find((item) => item.title === title);
  if (!found) throw new Error(`ミッション「${title}」が 無い`);
  return found;
}

describe("Renraku Master の ポップアップ辞書", () => {
  it("本文で 引く 語が ぜんぶ 辞書に ある（無いと 英語だけの 吹き出しに なる）", () => {
    const missing = [...GAME.USED_TERMS].filter((term) => !GAME.WORDS[term]);
    expect(missing).toEqual([]);
  });

  it("辞書に 使って いない 語が 無い", () => {
    const unused = Object.keys(GAME.WORDS).filter((term) => !GAME.USED_TERMS.has(term));
    expect(unused).toEqual([]);
  });

  it("どの 語にも 読み・やさしい 説明・英語が ある", () => {
    for (const [term, word] of Object.entries(GAME.WORDS)) {
      expect(word.reading, term).toMatch(/^[ぁ-ゖー]+$/);
      expect(plain(word.ja).length, term).toBeGreaterThan(3);
      expect(word.en.trim(), term).not.toBe("");
    }
  });

  it("説明の 漢字に ぜんぶ ふりがなが ある（規律2）", () => {
    const bare = Object.entries(GAME.WORDS)
      .map(([term, word]) => [term, bareKanji(word.ja).join("")] as const)
      .filter(([, missing]) => missing);
    expect(bare).toEqual([]);
  });

  it("「空いていなかった」は 言い切りの 形「空く」で 引く", () => {
    const text = scenario("Client MTG Change").instruction.text;
    expect(text).toMatch(/data-term="空く"[^>]*>(<ruby>空<rt>あ<\/rt><\/ruby>)いていなかった</);
  });

  it("「元号」だけは 吹き出しでは なく 説明の ページを 開く", () => {
    const text = scenario("Common Logic Update").instruction.text;
    expect(text.match(/class="gengou-link"/g)?.length).toBe(2);
    expect(GAME.USED_TERMS.has("元号")).toBe(false);
    expect(HTML).toContain("'/tools/hourensou/gengou.html'");
    expect(existsSync(join("public", "tools", "hourensou", "gengou.html"))).toBe(true);
  });
});

describe("Renraku Master の 2つめの 連絡（2026-10-26 に 差し替え）", () => {
  const mission = scenario("Client MTG Change");

  it("ヘンディ先輩の 文が tomy さんの 文の まま", () => {
    expect(plain(mission.instruction.text)).toBe(
      [
        "A社(Company A)とのミーティングの時間と場所が変わりました。",
        "",
        "時間は14:00から15:00に変更しました。",
        "場所は会議室Aが空いていなかったので会議室Bに変更しました。",
        "",
        "#project-a で、チームのみんなに連絡してください。",
        "「【変更点】」としてリストにまとめ、カレンダーの更新もお願いしましょう。",
      ].join("\n"),
    );
  });

  it("奥田さんの 返事が tomy さんの 文の まま", () => {
    expect(plain(mission.reply?.text ?? "")).toBe(
      "了解です。project-aグループのカレンダーを直しておきます。",
    );
  });

  it("連絡と 返事の 漢字に ぜんぶ ふりがなが ある（規律2）", () => {
    expect(bareKanji(mission.instruction.text)).toEqual([]);
    expect(bareKanji(mission.reply?.text ?? "")).toEqual([]);
  });
});

describe("Renraku Master の 画面", () => {
  it("会社名は Nextmake・アイコンは Nextmake の 印", () => {
    expect(HTML).toContain("<span>Nextmake</span>");
    expect(HTML).not.toContain("Renraku Corp");
    expect(HTML).toContain('src="/img/hourensou/renraku/nextmake_icon.png"');
    expect(existsSync(join("public", "img", "hourensou", "renraku", "nextmake_icon.png"))).toBe(
      true,
    );
  });

  it("入力欄の 中に 空白を 置かない（カーソルが 0文字目から 出る）", () => {
    expect(HTML).toMatch(/<div id="draft-text"[^>]*><\/div>/);
  });

  it("右の 欄の 指示は 改行を 残す（前後に 空白を 入れない）", () => {
    expect(HTML).toMatch(/whitespace-pre-wrap break-words">\$\{sc\.instruction\.text\}<\/div>/);
  });

  it("新しく 書いた 文に 禁止語と 使わない 国名が 無い（規律1・規律9）", () => {
    const texts = [
      ...Object.values(GAME.WORDS).map((word) => plain(word.ja)),
      plain(scenario("Client MTG Change").instruction.text),
      plain(scenario("Client MTG Change").reply?.text ?? ""),
    ];
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      expect(texts.join("\n"), `禁止語「${word}」が ある`).not.toContain(word);
    }
    expect(checkCountryNamesInTexts(HTML_PATH, texts).map((finding) => finding.message)).toEqual(
      [],
    );
  });
});

/**
 * ページの ソースで、ふりがなの 外に ある 漢字（行ごと）。
 * 画面に 出ない ところ（コメント・alt・title・aria-label）と、辞書の 見出し
 *（吹き出しでは 読みと 並べて 出す。アプリの 辞書と 同じ）は 数えない。
 */
function sourceBareKanji(): string[] {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  const source = HTML.replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:"'`])\/\/[^\n]*/g,
      (hit, before: string) => before + blank(hit.slice(before.length)),
    );
  const found: string[] = [];
  source.split("\n").forEach((line, at) => {
    const rest = line
      .replace(/r\("[^"]*",\s*"[^"]*"\)/g, "")
      .replace(/<ruby>.*?<\/ruby>/g, "")
      .replace(/\s(alt|title|aria-label)="[^"]*"/g, "")
      // 辞書の 見出し（WORDS の 鍵）と、v() で 渡す 見出し（活用した 語の 言い切りの 形）
      .replace(/^\s*"[^"]+": \{ reading:/, "")
      .replace(/,\s*"[A-Za-z][^"]*",\s*"[^"]+"\)/g, ")");
    const kanji = [...rest].filter((char) => KANJI.test(char)).join("");
    if (kanji) found.push(`${at + 1}行目: ${kanji}`);
  });
  return found;
}

/** ミッションの データの 文を ぜんぶ 集める（問い・選択肢・フィードバック・返事・単語）。 */
function scenarioTexts(): string[] {
  const texts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(GAME.SCENARIOS);
  return texts;
}

describe("Renraku Master の ふりがな（ボタン・案内・選択肢も）", () => {
  it("ミッションの 文（問い・選択肢・フィードバック・返事）に 裸の 漢字が 無い", () => {
    const bare = scenarioTexts()
      .map((text) => [bareKanji(text).join(""), plain(text)] as const)
      .filter(([missing]) => missing)
      .map(([missing, text]) => `${missing} ← 「${text.slice(0, 40)}」`);
    expect(bare).toEqual([]);
  });

  it("ボタン・案内・修了証の 文にも 裸の 漢字が 無い（ページの ソースを 行ごとに 見る）", () => {
    expect(sourceBareKanji()).toEqual([]);
  });

  it("「了解です。対応します。」は ボタンと 送った メッセージで 同じ ふりがな付きの 文", () => {
    expect(HTML).toContain(
      'const ACK_REPLY = `${r("了解", "りょうかい")}です。${r("対応", "たいおう")}します。`;',
    );
    expect(HTML).toContain("<span>${ACK_REPLY}</span>");
    expect(HTML).toContain("text: ACK_REPLY");
  });
});

describe("Renraku Master の 保存（2026-10-26）", () => {
  const KEY = "nexmax:renraku_slack:v1";
  const good: Saved = {
    scenarioIndex: 1,
    phase: "drafting",
    currentViewId: "project-a",
    stepsDone: 1,
    score: 95,
    wrongPicks: [0],
    times: { "dm-0-in": "10:24" },
  };
  const read = (value: unknown) => {
    const storage = new Map([[KEY, typeof value === "string" ? value : JSON.stringify(value)]]);
    return loadGame(storage).loadSaved();
  };

  it("保存の 名前は ほかの 練習ページと 同じ 形", () => {
    expect(GAME.STORE_KEY).toBe(KEY);
  });

  it("正しい 保存は その まま 読む", () => {
    expect(read(good)).toEqual(good);
  });

  it("保存が 無い・こわれて いる ときは 使わない（最初から 始める）", () => {
    expect(loadGame().loadSaved()).toBeNull();
    expect(read("{こわれた")).toBeNull();
    expect(read({ ...good, scenarioIndex: 99 })).toBeNull();
    expect(read({ ...good, phase: "unknown" })).toBeNull();
    expect(read({ ...good, stepsDone: 9 })).toBeNull();
    expect(read({ ...good, score: 120 })).toBeNull();
  });

  it("おかしな 値は 落として 読む（画面に そのまま 出さない）", () => {
    const saved = read({
      ...good,
      currentViewId: "nowhere",
      wrongPicks: [0, 7, -1, "x"],
      times: { ok: "10:24", bad: "<img src=x onerror=alert(1)>" },
    });
    expect(saved?.currentViewId).toBe("dm-tanaka");
    expect(saved?.wrongPicks).toEqual([0]);
    expect(saved?.times).toEqual({ ok: "10:24" });
  });

  it("「最初から」は 保存を 消して 開き直す", () => {
    const storage = new Map([[KEY, JSON.stringify(good)]]);
    const game = loadGame(storage);
    game.restartFromScratch();
    expect(storage.has(KEY)).toBe(false);
    expect(game.reloads()).toBe(1);
  });

  it("クリアの 画面の ボタンが「最初から」", () => {
    expect(HTML).toMatch(/<button onclick="restartFromScratch\(\)" aria-label="最初から"/);
    expect(HTML).toContain(
      '<span id="restart-label"><ruby>最初<rt>さいしょ</rt></ruby>から</span>',
    );
    expect(HTML).not.toContain('onclick="location.reload()"');
  });
});
