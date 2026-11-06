import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LINK_ANSWER_PROMPTS } from "@/content/link-answers";
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
  id: number;
  title: string;
  instruction: { text: string };
  reply?: { text: string };
  steps: {
    question: string;
    options: { text: string; isCorrect: boolean; feedback: string; post?: string }[];
  }[];
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
  openRestartConfirm: () => void;
  feedbackReason: (html: string) => string;
  markUrls: (html: string) => string;
  allQuestionIds: () => string[];
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
    focus() {},
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
    `${body}\nreturn { SCENARIOS, WORDS, USED_TERMS, STORE_KEY, loadSaved, restartFromScratch, openRestartConfirm, feedbackReason, markUrls, allQuestionIds };`,
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
    expect(HTML).toMatch(
      /whitespace-pre-wrap break-words">\$\{markUrls\(sc\.instruction\.text\)\}<\/div>/,
    );
  });

  it("選択肢の 文も 改行を 残す（前は 改行が 消えて 1行に つながって いた）", () => {
    expect(HTML).toMatch(/whitespace-pre-wrap break-words">\$\{markUrls\(opt\.text\)\}<\/span>/);
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

/**
 * 選んだ 選択肢には ⭕ 正解／❌ 不正解 の しるしを 出し、わけの 文の 頭の「正解！」「不正解。」は 外す（2026-10-30）。
 * しるしは isCorrect で 決まるので、わけの 文が それと 食い違うと 画面で 矛盾する。
 * 押した ときの 動き（「次へ」まで 進まない・少し 押せない）は tests/e2e/renraku_slack.spec.ts。
 */
describe("Renraku Master の 正誤の しるしと わけ", () => {
  const options = GAME.SCENARIOS.flatMap((item) =>
    item.steps.flatMap((step, at) =>
      step.options.map((option) => ({ where: `${item.title} の 問い${at + 1}`, ...option })),
    ),
  );

  it("どの 問いにも 正解が 1つだけ ある", () => {
    for (const item of GAME.SCENARIOS) {
      item.steps.forEach((step, at) => {
        expect(
          step.options.filter((option) => option.isCorrect).length,
          `${item.title} の 問い${at + 1}`,
        ).toBe(1);
      });
    }
  });

  it("わけの 文が しるしと 食い違わない（正解は「正解！」、不正解は「不正解」か「惜しい」で 始まる）", () => {
    for (const option of options) {
      const head = plain(option.feedback);
      if (option.isCorrect) expect(head, option.where).toMatch(/^正解！/);
      else expect(head, option.where).toMatch(/^(不正解。|惜しい[！。])/);
    }
  });

  it("正解の 位置が 偏らない（前は 1番めが 12問で 0回で、読まずに 消せた）", () => {
    const counts = [0, 0, 0];
    for (const item of GAME.SCENARIOS) {
      for (const step of item.steps) {
        counts[step.options.findIndex((option) => option.isCorrect)]! += 1;
      }
    }
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("画面の わけは 頭の「正解！」「不正解。」を 外す。「惜しい」は 残す", () => {
    for (const option of options) {
      const reason = plain(GAME.feedbackReason(option.feedback));
      expect(reason, option.where).not.toMatch(/^(不正解|正解)/);
      expect(reason.length, option.where).toBeGreaterThan(5);
      if (plain(option.feedback).startsWith("惜しい"))
        expect(reason, option.where).toMatch(/^惜しい/);
    }
  });
});

/**
 * 送る 文の 形（2026-11-06 の 検査）。「メンションは 必須」と 教えて いるのに、
 * ミッション4の 文に メンションが 無く、ミッション1の 文には 札の 説明まで 入って いた。
 */
describe("Renraku Master の 送る 文", () => {
  const sent = (item: Scenario) =>
    item.steps
      .map((step) => step.options.find((option) => option.isCorrect))
      .map((option) => plain(option?.post ?? option?.text ?? ""));

  it("どの ミッションの 文も メンションで 始まる", () => {
    for (const item of GAME.SCENARIOS) {
      expect(sent(item)[0], item.title).toMatch(/^@/);
    }
  });

  it("札の 説明は 送らない", () => {
    expect(sent(scenario("Doc Update"))[0]).toBe("@here");
  });

  it("全員に して もらう ミッションは @channel（@here は オンラインの 人にしか 届かない）", () => {
    for (const title of ["Client MTG Change", "Common Logic Update", "DB Reset Notice"]) {
      expect(sent(scenario(title))[0], title).toMatch(/^@channel\n/);
    }
  });

  it("件名が あると 言う 問いの 正解には、件名が ある", () => {
    expect(sent(scenario("Doc Update"))[1]).toMatch(/^【共有】/);
  });
});

/**
 * 指示に 無い ことを 正解だけが 言わない（2026-11-06 の 指定
 *「依頼にはコードの確認と書いてないので、そちらも修正」）。
 * 前は 指示が「確認を 頼んで」だけで、正解の 選択肢だけが「コードの 確認」と 言って いた。
 */
describe("Renraku Master の 指示と 正解の 文", () => {
  const cases = [
    ["Doc Update", "https://file-server/docs/user-reg-spec"],
    ["Common Logic Update", "pullしないと、この機能は使えません"],
    ["DB Reset Notice", "初期化"],
    ["DB Reset Notice", "DBに接続できません"],
    ["Task Request", "コードの確認"],
    ["Task Request", "本日17:00"],
  ] as const;

  it("正解の 文の 言葉と 事実が 指示に 書いて ある", () => {
    for (const [title, words] of cases) {
      const mission = scenario(title);
      const answers = mission.steps
        .map((step) => step.options.find((option) => option.isCorrect))
        .map((option) => plain(option?.text ?? ""))
        .join("\n");
      expect(answers, `${title} の 正解に「${words}」が 無い`).toContain(words);
      expect(plain(mission.instruction.text), `${title} の 指示に「${words}」が 無い`).toContain(
        words,
      );
    }
  });
});

/**
 * 講義の ケーススタディ 4つの うち、バグ（ケース3）と 遅刻・欠席・早退（ケース4）の 練習（2026-11-06）。
 * バグの 文は まんがの「開発環境の ログイン画面で エラー500」の 型に そろえる。
 */
describe("Renraku Master の バグと 遅刻の 連絡", () => {
  const sent = (title: string) =>
    scenario(title)
      .steps.map((step) => step.options.find((option) => option.isCorrect))
      .map((option) => plain(option?.post ?? option?.text ?? ""));

  it("バグの 文は、結論 → 【発生状況】の 箇条書き → 次の 連絡の 時間 の 順", () => {
    const [head, list, last] = sent("Bug Notice");
    expect(head).toBe("@奥田さん\n開発環境のユーザー登録画面でエラー500が発生しました。");
    expect(list).toMatch(/^【発生状況】\n・発生時刻：本日 10:10\n/);
    expect(last).toMatch(/昨日 17:00/);
    expect(last).toMatch(/次は 11:10に連絡します。$/);
  });

  it("遅刻の 文は、結論（遅刻すると 着く 時間）が 先で、理由と 影響は 箇条書き", () => {
    const [mention, head, list] = sent("Late Arrival Notice");
    // 変わるのは 自分の 予定だけなので @channel では ない（講義の「@channel の 使いどころ」）
    expect(mention).toBe("@here");
    expect(head).toBe("【連絡】本日は遅刻します。9:30に会社に着きます。");
    expect(list).toBe("・理由：電車の遅れ\n・影響：9:00の朝礼に出られません");
  });

  it("結論の 問いは 遅刻・欠席・早退を 見分ける（ほかの 字は 同じで、語だけが ちがう）", () => {
    const options = scenario("Late Arrival Notice").steps[1]?.options ?? [];
    const texts = options.map((option) => plain(option.text));
    for (const word of ["遅刻", "欠席", "早退"]) {
      expect(texts.filter((text) => text.includes(word))).toHaveLength(1);
    }
    expect(new Set(texts.map((text) => text.replace(/遅刻|欠席|早退/, ""))).size).toBe(1);
  });

  it("指示の 文に 答えの 語（遅刻・欠席・早退）を 書かない", () => {
    expect(plain(scenario("Late Arrival Notice").instruction.text)).not.toMatch(/遅刻|欠席|早退/);
  });

  it("問いの 文に 答えの 部品（メンション・【発生状況】）を 書かない", () => {
    const questions = scenario("Bug Notice").steps.map((step) => plain(step.question));
    expect(questions[0]).not.toContain("メンション");
    expect(questions[1]).not.toContain("【");
  });
});

describe("Renraku Master の URL は 青い 字（2026-10-30）", () => {
  it("URL だけを 青い 字に する。リンクには しない", () => {
    const url = "https://file-server/docs/user-reg-spec";
    const marked = GAME.markUrls(`ファイルのURLはこちらです。\n${url}`);
    expect(marked).toBe(`ファイルのURLはこちらです。\n<span class="url-text">${url}</span>`);
    expect(marked).not.toContain("<a ");
  });

  it("ファイルサーバーの パスは 青く しない——「クリックできない」と 教える 選択肢だから", () => {
    const path = "パスは \\\\192.168.1.10\\docs です。";
    expect(GAME.markUrls(path)).toBe(path);
  });

  it("ルビや 辞書の 印の 属性は こわさない", () => {
    const html = '<ruby>共有<rt>きょうゆう</rt></ruby><span data-meaning="https://x">x</span>';
    expect(GAME.markUrls(html)).toBe(html);
  });

  it("教材の URL は 選択肢に 1つ ある（なくなったら この 見張りを 見直す）", () => {
    const urls = GAME.SCENARIOS.flatMap((item) =>
      item.steps.flatMap((step) =>
        step.options.filter((option) => /https?:\/\//.test(option.text)),
      ),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const option of urls) expect(GAME.markUrls(option.text)).toContain('class="url-text"');
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

  it("まちがえた 番号が 正解を 指す 保存は 読まない（赤く なると 押せず、先へ 進めない）", () => {
    // 選択肢の 並びを 変える 前の 保存（ミッション2の 問い1の 正解は 0番め）
    const saved = read({ ...good, scenarioIndex: 1, stepsDone: 0, wrongPicks: [0, 2] });
    expect(saved?.wrongPicks).toEqual([2]);
  });

  it("「最初から」は 保存を 消して 開き直す", () => {
    const storage = new Map([[KEY, JSON.stringify(good)]]);
    const game = loadGame(storage);
    game.restartFromScratch();
    expect(storage.has(KEY)).toBe(false);
    expect(game.reloads()).toBe(1);
  });

  it("左の 欄の 一番下に「最初から やり直す」が ある（途中でも 押せる）", () => {
    const button = HTML.indexOf('id="restart-open"');
    expect(button).toBeGreaterThan(HTML.indexOf('id="dm-list"'));
    expect(button).toBeLessThan(HTML.indexOf('id="messages-container"'));
    expect(HTML).toMatch(/id="restart-open"[^>]*onclick="openRestartConfirm\(\)"/);
  });

  it("左下の ボタンは 押しただけでは 消さない（確かめの 画面を 出すだけ）", () => {
    const storage = new Map([[KEY, JSON.stringify(good)]]);
    const game = loadGame(storage);
    game.openRestartConfirm();
    expect(storage.has(KEY)).toBe(true);
    expect(game.reloads()).toBe(0);
  });

  it("確かめの 画面は「やめる」と、保存を 消す ボタンの 2つ", () => {
    const dialog = HTML.slice(HTML.indexOf('id="restart-confirm"'));
    const box = dialog.slice(0, dialog.indexOf('id="completion-screen"'));
    expect(box).toContain('onclick="closeRestartConfirm()"');
    expect(box).toContain('onclick="restartFromScratch()"');
  });

  it("クリアの 画面の ボタンが「最初から」", () => {
    expect(HTML).toMatch(/<button onclick="restartFromScratch\(\)" aria-label="最初から"/);
    expect(HTML).toContain(
      '<span id="restart-label"><ruby>最初<rt>さいしょ</rt></ruby>から</span>',
    );
    expect(HTML).not.toContain('onclick="location.reload()"');
  });
});

/*
 * 答えの 記録と、まちがえた 問いの やり直し（2026-11-02 の 指定
 *「間違えた問題をやり直す」「回答データも後で分析できるように」）。
 * 画面の 動きは tests/e2e/renraku_slack.spec.ts が 見る。ここでは 台帳と 保存を 見る。
 */
describe("Renraku Master の 記録と やり直し（2026-11-02）", () => {
  const KEY = "nexmax:renraku_slack:v1";
  const ATTEMPT = "0b0c7a1e-3f7d-4c5a-9d2e-1a2b3c4d5e6f";
  const base = {
    scenarioIndex: 4,
    phase: "completed",
    currentViewId: "dev-team",
    stepsDone: 0,
    score: 90,
    wrongPicks: [],
    times: {},
  };
  const read = (value: unknown) =>
    loadGame(new Map([[KEY, JSON.stringify(value)]])).loadSaved() as Record<string, unknown> | null;

  it("先生の 画面の 台帳に、ページの 問いが ぜんぶ 同じ 順・同じ 文で ある", () => {
    const prompts = LINK_ANSWER_PROMPTS.renraku_slack ?? {};
    expect(Object.keys(prompts)).toEqual(GAME.allQuestionIds());
    for (const item of GAME.SCENARIOS) {
      item.steps.forEach((step, at) => {
        const id = `m${item.id}-q${at + 1}`;
        expect(prompts[id], id).toBe(`${plain(item.title)} — ${plain(step.question)}`);
      });
    }
  });

  it("回の 鍵・まちがえた 問い・やり直しの 途中を 保存から 読む", () => {
    const saved = read({
      ...base,
      phase: "retry",
      scenarioIndex: 0,
      currentViewId: "project-a",
      stepsDone: 2,
      attemptId: ATTEMPT,
      misses: ["m1-q3", "m4-q2"],
      retry: { attemptId: ATTEMPT, queue: ["m1-q3", "m4-q2"], pos: 1, misses: ["m1-q3"] },
      lastRetry: { total: 3, correct: 1 },
    });
    expect(saved?.attemptId).toBe(ATTEMPT);
    expect(saved?.misses).toEqual(["m1-q3", "m4-q2"]);
    expect(saved?.retry).toEqual({
      attemptId: ATTEMPT,
      queue: ["m1-q3", "m4-q2"],
      pos: 1,
      misses: ["m1-q3"],
    });
    expect(saved?.lastRetry).toEqual({ total: 3, correct: 1 });
  });

  it("おかしな 記録の 値は 使わない（知らない 問い・uuid で ない 鍵・はみ出した 位置）", () => {
    const saved = read({
      ...base,
      attemptId: "not-a-uuid",
      misses: ["m9-q9"],
      retry: { attemptId: ATTEMPT, queue: ["m1-q3"], pos: 5, misses: [] },
      lastRetry: { total: 1, correct: 3 },
    });
    expect(saved).not.toBeNull();
    expect(saved?.attemptId).toBeUndefined();
    expect(saved?.misses).toBeUndefined();
    expect(saved?.retry).toBeUndefined();
    expect(saved?.lastRetry).toBeUndefined();
  });

  it("まちがえた 問いを 数える 前の 保存も、これまでどおり 読める", () => {
    const saved = read(base);
    expect(saved?.score).toBe(90);
    expect(saved?.misses).toBeUndefined();
  });

  it("記録は アプリの 受け口と 同じ 合図で、アプリの 外では 送らない", () => {
    const body = HTML.slice(HTML.indexOf("function reportAnswer"));
    const block = body.slice(0, body.indexOf("\n        }\n"));
    expect(block).toContain("type: 'nexmax:link-answers'");
    expect(block).toContain("id: LINK_ID");
    expect(block).toContain("window.parent === window");
    expect(HTML).toContain("const LINK_ID = 'renraku_slack';");
  });
});

describe("Renraku Master の 問いは 講義で 答えられる（2026-11-06）", () => {
  const lecture = readFileSync(join("content", "articles", "renraku_lecture.json"), "utf8");
  /** ページの 文は `r("依頼", "いらい")` の 形なので、読みを ほどいて 比べる。 */
  const plain = HTML.replace(/\$\{r\("([^"]+)", "[^"]+"\)\}/g, "$1");

  it("問いで 使う メンションと 札を、講義が 説明して いる", () => {
    for (const word of ["@here", "@channel", "【依頼】", "【連絡】"]) {
      expect(plain, `${word} が 問いから 消えた`).toContain(word);
      expect(lecture, `${word} の 説明が 講義に ない`).toContain(`"title": "${word}"`);
    }
  });
});
