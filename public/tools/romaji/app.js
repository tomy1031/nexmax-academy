/**
 * ローマ字入力れんしゅう — 画面のうごき
 *
 * ## 直したこと（もとの1枚もののページから）
 * 1. **進み ぐあいを 覚える**（localStorage）。前は 画面を 閉じると 最初に 戻り、
 *    名前も 消えていた。20課の 練習で それは 続かない。
 * 2. **名前を 最初に 聞かない**。修了証を もらう ときだけ 聞く。入口で 個人情報を
 *    求めると、そこで 止まる 学習者が いる。
 * 3. **IME の 合図**。ローマ字が そのまま 残っている ときは
 *    「キーボードが 日本語に なって いますか」と 出す。いちばん 多い つまずきは
 *    ローマ字の 打ち方ではなく、**日本語入力に なっていない**ことだった。
 * 4. **漢字の 課で かなが 合っていたら そう言う**。「ちがいます」で 突き放さず、
 *    「かなは 合っています。空白の キーで 漢字に します」と 次の 一手を 出す
 *    （AGENTS.md 規律1）。
 * 5. **ヒントを 消せる**。ローマ字が いつも 見えていると、写すだけに なる。
 * 6. **ふりがなの 合成**。文は プレーンテキストで 持ち、ここで ルビを 組む（規律2）。
 * 7. もくじ・進み ぐあいの 帯・章立てで、**あと どれだけかが いつも 見える**。
 */

import { CHAPTERS, FURIGANA, GLOSSARY, LESSONS, MESSAGES, SCREEN_TEXT } from "./lessons.js";
import { MANUAL } from "./manual.js";

/* ------------------------------------------------------------------ *
 * ふりがなの合成（src/lib/text/furigana.ts と同じ規則）
 * ------------------------------------------------------------------ */

const KANJI = /[㐀-鿿々]/;

/** 長い表記から当てる（「日本語」を「日本」「語」に割らない）。 */
const DICT = [...FURIGANA]
  .filter(([surface, reading]) => surface && reading && KANJI.test(surface))
  .sort((a, b) => b[0].length - a[0].length);

const GLOSS = new Map(GLOSSARY);

/** プレーンテキスト → ルビつきの断片。HTML 文字列は組み立てない（DOM で作る）。 */
function ruby(text) {
  const fragment = document.createDocumentFragment();
  let plain = "";
  let i = 0;

  const flush = () => {
    if (plain) fragment.append(document.createTextNode(plain));
    plain = "";
  };

  while (i < text.length) {
    const hit = KANJI.test(text[i]) ? DICT.find(([surface]) => text.startsWith(surface, i)) : null;
    if (!hit) {
      plain += text[i];
      i += 1;
      continue;
    }
    flush();
    const element = document.createElement("ruby");
    element.append(document.createTextNode(hit[0]));
    const rt = document.createElement("rt");
    rt.textContent = hit[1];
    element.append(rt);
    fragment.append(element);
    i += hit[0].length;
  }
  flush();
  return fragment;
}

/** その文に出てくる「意味を添える語」を、出た順に重複なく返す。 */
function glossesIn(texts) {
  const found = [];
  for (const text of texts) {
    for (const [term, meaning] of GLOSS) {
      if (text.includes(term) && !found.some(([t]) => t === term)) found.push([term, meaning]);
    }
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * 保存（進み ぐあい）
 * ------------------------------------------------------------------ */

const STORE_KEY = "nexmax:romaji:v1";

const state = {
  lesson: 0,
  /** おえたレッスンの id。 */
  done: [],
  /** レッスンごとの「どこまで打てたか」（id → 番号）。 */
  at: {},
  hint: true,
  furigana: true,
  name: "",
  /** マニュアルで えらんでいる 端末（次に 来たときも 同じ ものを 出す）。 */
  platform: "windows",
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return;
    Object.assign(state, {
      lesson: clampLesson(saved.lesson),
      done: Array.isArray(saved.done) ? saved.done.filter((id) => typeof id === "string") : [],
      at: saved.at && typeof saved.at === "object" ? saved.at : {},
      hint: saved.hint !== false,
      furigana: saved.furigana !== false,
      name: typeof saved.name === "string" ? saved.name : "",
      platform: MANUAL.some((item) => item.id === saved.platform) ? saved.platform : "windows",
    });
  } catch {
    /* こわれた保存は 黙って 捨てる（練習は 続けられる） */
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* プライベートモード等。保存できなくても 練習は 続く */
  }
}

function clampLesson(value) {
  const n = Number.isInteger(value) ? value : 0;
  return Math.max(0, Math.min(LESSONS.length - 1, n));
}

const isDone = (lesson) => state.done.includes(lesson.id);

function markDone(lesson) {
  if (!isDone(lesson)) {
    state.done.push(lesson.id);
    save();
  }
  if (state.done.length === LESSONS.length) tellParentFinished();
}

/**
 * ぜんぶ おえたことを、この ページを 埋めている アプリへ 伝える。
 *
 * 受け手は `src/components/link/link-view.tsx`。同じ置き場（origin）からの
 * 合図だけを 受けるので、宛先も 自分の origin に しぼって 投げる。
 * 単体で 開いた ときは `parent === window` なので 何も 起きない。
 */
function tellParentFinished() {
  try {
    window.parent?.postMessage({ type: "nexmax:link-done" }, window.location.origin);
  } catch {
    /* 埋め込みでなければ 何も しない */
  }
}

/* ------------------------------------------------------------------ *
 * 打った文字のくらべ方
 * ------------------------------------------------------------------ */

/**
 * くらべる前に そろえる。
 * - 全角の 英数 → 半角（NFKC）
 * - 空白は 落とす（文の あいだの スペースは 打ち方の ちがい）
 * - カタカナ → ひらがな（カタカナ入力の ままでも 先へ 進める）
 */
function normalize(text) {
  return text
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

/** ローマ字が そのまま 残っているか（＝日本語入力に なっていない）。 */
function looksLatin(text) {
  return /[a-zA-Z]/.test(text.normalize("NFKC"));
}

/**
 * 日本語でも 英語でも ない 文字か。
 *
 * 学習者の パソコンには クメール語の キーボードも 入っている。そのままだと
 * ラテン文字でも 日本語でも ない 字が 出て、「おしい！」という **できない助言**に
 * 落ちる。文字を 見て、キーボードの 話だと 分かるように する。
 */
function looksOtherScript(text) {
  return /[\u1780-\u17FF\u0E00-\u0E7F\u0400-\u04FF\uAC00-\uD7AF]/u.test(text);
}

/** 文の 入れかえ（MESSAGES の `{n}` などを うめる）。 */
function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );
}

/* ------------------------------------------------------------------ *
 * 画面の部品
 * ------------------------------------------------------------------ */

const el = (id) => document.getElementById(id);

const screens = {
  title: el("screen-title"),
  manual: el("screen-manual"),
  lesson: el("screen-lesson"),
};

const ui = {
  titleLead: el("title-lead"),
  titleWhy: el("title-why"),
  road: el("road"),
  goalText: el("goal-text"),
  goal: el("goal"),
  doneTitle: el("done-title"),
  doneSub: el("done-sub"),
  listen: el("listen"),
  checkQ: el("check-q"),
  checkInput: el("check-input"),
  checkResult: el("check-result"),
  start: el("start"),
  resume: el("resume"),
  reset: el("reset"),
  manualTitle: el("manual-title"),
  manualLead: el("manual-lead"),
  manualTabs: el("manual-tabs"),
  manualSteps: el("manual-steps"),
  progressFill: el("progress-fill"),
  progressText: el("progress-text"),
  tocList: el("toc-list"),
  tocBody: el("toc-body"),
  tocToggle: el("toc-toggle"),
  tocToggleMark: el("toc-toggle-mark"),
  chip: el("lesson-chip"),
  title: el("lesson-title"),
  lead: el("lesson-lead"),
  blocks: el("lesson-blocks"),
  practice: el("practice"),
  dots: el("dots"),
  target: el("target"),
  targetReading: el("target-reading"),
  targetEn: el("target-en"),
  hint: el("hint"),
  hintToggle: el("hint-toggle"),
  answer: el("answer"),
  check: el("check"),
  skip: el("skip"),
  feedback: el("feedback"),
  lessonDone: el("lesson-done"),
  cert: el("cert"),
  certLead: el("cert-lead"),
  certName: el("cert-name"),
  certDownload: el("cert-download"),
  certCanvas: el("cert-canvas"),
  prev: el("prev"),
  next: el("next"),
  furiganaToggle: el("furigana-toggle"),
  dict: el("dict"),
  dictBody: el("dict-body"),
};

/** いま見ているレッスンの、いま打つ問題の番号。 */
function itemIndex(lesson) {
  const saved = state.at[lesson.id];
  const n = Number.isInteger(saved) ? saved : 0;
  return Math.max(0, Math.min(lesson.items.length, n));
}

function setItemIndex(lesson, index) {
  state.at[lesson.id] = index;
  save();
}

/* ------------------------------------------------------------------ *
 * 画面の きりかえ（タイトル → じゅんび → れんしゅう）
 * ------------------------------------------------------------------ */

/**
 * いきなり レッスンを 出さない。
 *
 * この教材で いちばん 多い つまずきは ローマ字ではなく、**キーボードが
 * 日本語に なっていない**ことである（学習者の キーボードは 英字で、
 * パソコンに 日本語入力が 入っていない ことも ある）。だから タイトルで
 * まず 1文字 打たせて、だめなら じゅんびの マニュアルへ 送る。
 */
function showScreen(name) {
  for (const [key, node] of Object.entries(screens)) node.hidden = key !== name;
  window.scrollTo({ top: 0 });
  if (name === "title") renderTitle();
  if (name === "manual") renderManual();
  if (name === "lesson") render();
}

/**
 * みちのり — 章を 4つの 停留所に して 横に 並べる。
 * 「あと どれだけ あるか」と「いま どこか」が、押す前から 見えるように する。
 */
function renderRoad() {
  ui.road.replaceChildren();
  const here = LESSONS[state.lesson]?.chapter;

  for (const chapter of CHAPTERS) {
    const lessons = LESSONS.filter((lesson) => lesson.chapter === chapter.id);
    const done = lessons.filter((lesson) => isDone(lesson)).length;
    const li = document.createElement("li");
    li.className = `road-stop${done === lessons.length ? " done" : ""}${
      chapter.id === here ? " here" : ""
    }`;
    const icon = document.createElement("span");
    icon.className = "road-icon";
    icon.textContent = done === lessons.length ? "✅" : chapter.icon;
    const name = document.createElement("span");
    name.className = "road-name";
    name.append(ruby(chapter.title));
    const count = document.createElement("span");
    count.className = "road-count";
    count.textContent = `${done}/${lessons.length}`;
    li.append(icon, name, count);
    ui.road.append(li);
  }
}

/** ひらがな・カタカナが 1文字でも あるか（＝日本語入力に なっている）。 */
const HAS_KANA = /[ぁ-んァ-ヶー]/;

function renderTitle() {
  ui.titleLead.replaceChildren(ruby(SCREEN_TEXT.titleLead));
  ui.titleWhy.replaceChildren(ruby(SCREEN_TEXT.titleWhy));
  ui.checkQ.replaceChildren(ruby(SCREEN_TEXT.checkQuestion));
  checkKeyboard();
  renderRoad();

  const allDone = state.done.length === LESSONS.length;
  ui.goal.classList.toggle("goal-open", allDone);
  ui.goalText.replaceChildren(ruby(allDone ? SCREEN_TEXT.goalDone : SCREEN_TEXT.goal));

  const started = state.done.length > 0 || state.lesson > 0;
  ui.resume.hidden = !started;
  ui.reset.hidden = !started;
  if (started) {
    ui.resume.textContent = `つづきから（${state.done.length} / ${LESSONS.length}）`;
  }
}

/** タイトルの キーボードチェック。打った文字を 見て、その場で こたえる。 */
function checkKeyboard() {
  const typed = ui.checkInput.value.trim();
  const result = ui.checkResult;
  result.className = "check-result";
  if (!typed) {
    result.replaceChildren(ruby(SCREEN_TEXT.checkWait));
    return;
  }
  if (HAS_KANA.test(typed)) {
    result.classList.add("ok");
    result.replaceChildren(ruby(SCREEN_TEXT.checkOk));
    return;
  }
  result.classList.add("ng");
  result.replaceChildren(ruby(SCREEN_TEXT.checkLatin));
}

/* ------------------------------------------------------------------ *
 * じゅんびの マニュアル
 * ------------------------------------------------------------------ */

function renderManual() {
  ui.manualTitle.replaceChildren(ruby(SCREEN_TEXT.manualTitle));
  ui.manualLead.replaceChildren(ruby(SCREEN_TEXT.manualLead));

  ui.manualTabs.replaceChildren();
  for (const platform of MANUAL) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(platform.id === state.platform));
    tab.textContent = `${platform.icon} ${platform.name}`;
    tab.addEventListener("click", () => {
      state.platform = platform.id;
      save();
      renderManual();
    });
    ui.manualTabs.append(tab);
  }

  const current = MANUAL.find((item) => item.id === state.platform) ?? MANUAL[0];
  ui.manualSteps.replaceChildren();

  current.steps.forEach((step, index) => {
    const section = document.createElement("section");
    section.className = "manual-step";

    const head = document.createElement("p");
    head.className = "manual-step-title";
    const num = document.createElement("span");
    num.className = "manual-step-num";
    num.textContent = String(index + 1);
    /*
     * 見出しの 文は かならず 1つの span に 入れる。flex の 中に 地の文と
     * ruby を そのまま 置くと、**1語ずつ ばらばらの 部品に なって 横に 並ぶ**——
     * 「「あ」が 無い ときは、日本語を たす」が すきまだらけで 割れる
     *（ユーザー報告 2026-08-18。手順の li でも 同じことが 起きた）。
     */
    const label = document.createElement("span");
    label.className = "manual-step-label";
    label.append(ruby(step.title));
    head.append(num, label);
    section.append(head);

    const body = document.createElement("p");
    body.className = "manual-step-text";
    body.append(ruby(step.text));
    section.append(body);

    if (step.art) {
      const art = document.createElement("div");
      art.className = "art-wrap";
      /*
       * 図は この リポジトリの 中で 書いた SVG の 文字列（manual.js）。
       * 外から 来た 文字は 1つも 混ざらないので innerHTML で 置く。
       */
      art.innerHTML = step.art;
      section.append(art);
    }

    ui.manualSteps.append(section);
  });
}

/* ------------------------------------------------------------------ *
 * もくじ・帯
 * ------------------------------------------------------------------ */

function renderToc() {
  ui.tocList.replaceChildren();
  let number = 0;

  for (const chapter of CHAPTERS) {
    const lessons = LESSONS.filter((lesson) => lesson.chapter === chapter.id);
    if (lessons.length === 0) continue;

    const heading = document.createElement("p");
    heading.className = "toc-chapter";
    heading.textContent = `${chapter.icon} ${chapter.title}`;
    ui.tocList.append(heading);

    const list = document.createElement("ol");
    for (const lesson of lessons) {
      number += 1;
      const index = LESSONS.indexOf(lesson);
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      if (index === state.lesson) button.setAttribute("aria-current", "true");

      const num = document.createElement("span");
      num.className = "toc-num";
      num.textContent = String(number);

      const name = document.createElement("span");
      name.className = "toc-name";
      name.append(ruby(lesson.title));

      const mark = document.createElement("span");
      mark.className = "toc-mark";
      mark.textContent = isDone(lesson) ? "✅" : index === state.lesson ? "▶" : "○";

      button.append(num, name, mark);
      button.addEventListener("click", () => {
        go(index);
        if (window.matchMedia("(max-width: 899px)").matches) toggleToc(false);
      });
      li.append(button);
      list.append(li);
    }
    ui.tocList.append(list);
  }
}

function renderProgress() {
  const total = LESSONS.length;
  const done = state.done.length;
  ui.progressFill.style.width = `${Math.round((done / total) * 100)}%`;
  ui.progressText.textContent = `${done} / ${total} おわりました`;
  const bar = ui.progressFill.parentElement;
  bar?.setAttribute("aria-valuenow", String(done));
  bar?.setAttribute("aria-valuemin", "0");
  bar?.setAttribute("aria-valuemax", String(total));
}

function toggleToc(open) {
  const next = open ?? ui.tocBody.hidden;
  ui.tocBody.hidden = !next;
  ui.tocToggle.setAttribute("aria-expanded", String(next));
  ui.tocToggleMark.textContent = next ? "▲" : "▼";
}

/* ------------------------------------------------------------------ *
 * レッスンの本文
 * ------------------------------------------------------------------ */

function renderBlocks(lesson) {
  ui.blocks.replaceChildren();

  for (const block of lesson.blocks ?? []) {
    const wrap = document.createElement("div");
    wrap.className = "block";

    if (block.kind === "text") {
      const p = document.createElement("p");
      p.append(ruby(block.text));
      wrap.append(p);
    } else if (block.kind === "note") {
      const p = document.createElement("p");
      p.className = `note${block.tone === "care" ? " care" : ""}`;
      p.append(ruby(block.text));
      wrap.append(p);
      // 詰まっている人を 文だけで 置いていかない。図の ある マニュアルへ 行ける
      if (block.action === "manual") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-sky note-action";
        button.textContent = "⌨️ じゅんびの しかたを 見る";
        button.addEventListener("click", () => showScreen("manual"));
        wrap.append(button);
      }
    } else if (block.kind === "steps") {
      if (block.title) {
        const title = document.createElement("p");
        title.className = "steps-title";
        title.append(ruby(block.title));
        wrap.append(title);
      }
      const list = document.createElement("ol");
      list.className = "steps";
      for (const item of block.items) {
        const li = document.createElement("li");
        /*
         * 文は かならず 1つの span に 入れる。li を そのまま flex に すると、
         * **地の文と ルビ（ruby 要素）が べつべつの 部品に なって 横に 並ぶ**——
         * 「Windows: 画面 の …」が 段組みのように ばらける（実際に そうなった）。
         */
        const text = document.createElement("span");
        text.append(ruby(item));
        li.append(text);
        list.append(li);
      }
      wrap.append(list);
    } else if (block.kind === "keys") {
      const row = document.createElement("div");
      row.className = "keys";
      for (const key of block.items) {
        const card = document.createElement("div");
        card.className = "key-card";

        const kana = document.createElement("span");
        kana.className = "key-kana";
        kana.textContent = key.kana;
        card.append(kana);

        for (const letter of key.keys) {
          const kbd = document.createElement("kbd");
          kbd.textContent = letter;
          card.append(kbd);
        }
        if (key.also) {
          const also = document.createElement("span");
          also.className = "key-also";
          also.textContent = `／ ${key.also} でも OK`;
          card.append(also);
        }
        row.append(card);
      }
      wrap.append(row);
    }

    ui.blocks.append(wrap);
  }

  /*
   * ことばの意味（【日本語】English）。
   * むずかしい語を ひらがなに 開かない かわりに、意味を 英語で 添える
   *（docs/constraints.md）。出てきた語だけ 出す——出てこない語まで 並べると、
   * 覚える語が 埋もれる。
   */
  const texts = [lesson.title, lesson.lead, ...(lesson.blocks ?? []).flatMap(blockTexts)];
  const glosses = glossesIn(texts);
  if (glosses.length > 0) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = glosses.map(([term, meaning]) => `【${term}】${meaning}`).join("　");
    const wrap = document.createElement("div");
    wrap.className = "block";
    wrap.append(note);
    ui.blocks.append(wrap);
  }
}

function blockTexts(block) {
  const out = [];
  if (block.text) out.push(block.text);
  if (block.title) out.push(block.title);
  if (Array.isArray(block.items) && typeof block.items[0] === "string") out.push(...block.items);
  return out;
}

/* ------------------------------------------------------------------ *
 * れんしゅう
 * ------------------------------------------------------------------ */

function renderPractice(lesson) {
  const index = itemIndex(lesson);
  const finished = index >= lesson.items.length;

  ui.practice.hidden = lesson.items.length === 0 || finished;
  ui.lessonDone.hidden = !(lesson.items.length > 0 && finished);

  if (!ui.lessonDone.hidden) {
    /*
     * 章の さいごを おえた ときだけ、大きく 祝う。
     * 毎課 おなじ 大きさで 祝うと、祝いが「進んだ しるし」でなくなる
     *（ビジュアルテーマ §5 — 演出は 学習行為に ひもづける）。
     */
    const chapter = CHAPTERS.find((item) => item.id === lesson.chapter);
    const siblings = LESSONS.filter((item) => item.chapter === lesson.chapter);
    const chapterDone = siblings.every((item) => isDone(item));
    ui.doneTitle.replaceChildren(
      chapterDone && chapter
        ? ruby(`${chapter.icon} ${fill(MESSAGES.chapterClear, { chapter: chapter.title })} 🎉`)
        : ruby("この レッスンは クリア！ 🏆"),
    );
    ui.doneSub.textContent = chapterDone
      ? "つぎの まとまりへ すすみましょう。"
      : "つぎへ すすみましょう。";
    ui.lessonDone.classList.toggle("chapter-clear", chapterDone);
  }

  // 点（いくつ目か）
  ui.dots.replaceChildren();
  lesson.items.forEach((_, i) => {
    const dot = document.createElement("span");
    if (i < index) dot.className = "done";
    else if (i === index && !finished) dot.className = "now";
    ui.dots.append(dot);
  });

  if (finished || lesson.items.length === 0) return;

  const item = lesson.items[index];
  ui.target.textContent = item.show;

  const showReading = item.reading !== item.show;
  ui.targetReading.hidden = !showReading;
  ui.targetReading.textContent = showReading ? `（${item.reading}）` : "";

  ui.targetEn.hidden = !item.en;
  ui.targetEn.textContent = item.en ?? "";

  ui.hint.replaceChildren();
  for (const letter of item.romaji) {
    const kbd = document.createElement("kbd");
    kbd.textContent = letter;
    ui.hint.append(kbd);
  }
  ui.hint.hidden = !state.hint;

  const key = `${lesson.id}:${index}`;
  if (key !== focusedItem) {
    focusedItem = key;
    misses = 0;
    ui.answer.value = "";
    ui.feedback.replaceChildren();
    ui.answer.focus({ preventScroll: true });
  }
}

/** いま 入力欄に フォーカスを 当てた 問題（同じ問題で 何度も 奪わない）。 */
let focusedItem = "";

function say(kind, text) {
  const box = document.createElement("div");
  box.className = kind;
  box.append(ruby(text));
  ui.feedback.replaceChildren(box);
}

let composing = false;

/** 同じ問題を まちがえた 回数。足場を 1段ずつ 足すために 数える。 */
let misses = 0;

/**
 * こたえあわせ。`auto` は 打ちながらの 自動判定。
 *
 * 自動判定は **合っていない ときは 黙る**のが 原則だが、1つだけ 例外がある。
 * 日本語入力に なっていない ときは、`こたえあわせ` を 押すことを 知らない
 * 学習者が 英字を 並べたまま 止まる——ここだけは 待たずに 言う。
 */
function check(auto = false) {
  const lesson = LESSONS[state.lesson];
  const index = itemIndex(lesson);
  if (!lesson || index >= lesson.items.length) return;

  const item = lesson.items[index];
  const raw = ui.answer.value;
  const typed = normalize(raw);
  if (!typed) return;

  if (typed === normalize(item.show)) {
    misses = 0;
    say("ok", MESSAGES.correct);
    setItemIndex(lesson, index + 1);
    if (index + 1 >= lesson.items.length) markDone(lesson);
    setTimeout(() => {
      render();
      if (itemIndex(lesson) >= lesson.items.length) ui.next.focus({ preventScroll: true });
    }, 700);
    return;
  }

  // 打っている とちゅう: キーボードが 日本語で ない ことだけ 先に 知らせる
  if (auto) {
    if (looksOtherScript(raw)) say("ime", MESSAGES.otherScript);
    else if (!composing && raw.trim().length >= 2 && looksLatin(raw)) say("ime", MESSAGES.imeOff);
    return;
  }

  misses += 1;

  if (looksOtherScript(raw)) {
    say("ime", MESSAGES.otherScript);
    shake();
    return;
  }
  if (looksLatin(raw)) {
    say("ime", MESSAGES.imeOff);
    shake();
    return;
  }

  // 漢字の課: どこまで できているかで 言うことを 変える
  if (item.reading !== item.show) {
    if (typed === normalize(item.reading)) {
      say("again", MESSAGES.kanaOnly);
      shake();
      return;
    }
    if (KANJI.test(typed)) {
      say("again", MESSAGES.otherKanji);
      shake();
      return;
    }
  }

  // 2回目: ヒントを こちらから 出す（見ないと 直せない 助言に しない）
  if (misses === 2 && !state.hint) {
    state.hint = true;
    save();
    render();
    say("again", MESSAGES.hintShown);
    return;
  }

  // 3回目から: 止まっている ところの **つぎの 1音だけ** 言う（答えは 言わない）
  if (misses >= 3) {
    const step = nextSound(item, typed);
    if (step) {
      say("again", fill(MESSAGES.nextSound, step));
      shake();
      return;
    }
  }

  const same = commonPrefix(typed, normalize(item.show));
  say("again", same > 0 ? fill(MESSAGES.partial, { n: same }) : MESSAGES.retry);
  shake();
}

/**
 * 止まっている 位置の つぎの 1音と、その キー。
 * 読みかたが 表に 無い 音（っ・ー など）は null を 返す——
 * そこは「2回 打つ」のような 説明が 要るので、1音の 案内には 向かない。
 */
function nextSound(item, typed) {
  const target = normalize(item.reading);
  const at = commonPrefix(typed, target);
  for (const size of [2, 1]) {
    const kana = target.slice(at, at + size);
    const keys = KANA_KEYS.get(kana);
    if (keys) return { kana, keys };
  }
  return null;
}

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

function shake() {
  ui.answer.classList.remove("shake");
  // 連続で まちがえた ときにも もう一度 ゆれるよう、いったん 外してから 付ける
  void ui.answer.offsetWidth;
  ui.answer.classList.add("shake");
  ui.answer.focus({ preventScroll: true });
  ui.answer.select();
}

/* ------------------------------------------------------------------ *
 * 修了証
 * ------------------------------------------------------------------ */

function renderCert(lesson) {
  const last = state.lesson === LESSONS.length - 1;
  const allDone = state.done.length === LESSONS.length;
  ui.cert.hidden = !(last && lesson.items.length === 0);
  if (ui.cert.hidden) return;

  ui.certName.value = state.name;
  ui.certDownload.disabled = state.name.trim().length === 0;
  ui.certLead.textContent = allDone
    ? "なまえを 書くと、修了証を もらえます。"
    : "まだ おわって いない レッスンが あります。もくじから 見に いけます。";
}

function drawCertificate(name) {
  const canvas = ui.certCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const font = getComputedStyle(document.body).fontFamily;

  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#004f8d";
  ctx.lineWidth = 14;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.strokeStyle = "#0288d1";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.textAlign = "center";
  ctx.fillStyle = "#5a7089";
  ctx.font = `700 26px ${font}`;
  ctx.fillText("Nexmax Academy", W / 2, 110);

  ctx.fillStyle = "#004f8d";
  ctx.font = `800 52px ${font}`;
  ctx.fillText("ローマ字入力れんしゅう 修了証", W / 2, 190);

  ctx.fillStyle = "#1f3a56";
  ctx.font = `700 26px ${font}`;
  ctx.fillText("この 人は、キーボードで 日本語を 打つ れんしゅうを", W / 2, 270);
  ctx.fillText("さいごまで やりとげました。", W / 2, 310);

  // なまえ（長いときは 小さくする）
  let size = 66;
  ctx.font = `800 ${size}px ${font}`;
  while (ctx.measureText(name).width > W - 220 && size > 24) {
    size -= 4;
    ctx.font = `800 ${size}px ${font}`;
  }
  ctx.fillStyle = "#0288d1";
  ctx.fillText(name, W / 2, 430);

  ctx.strokeStyle = "#dcebf5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(180, 460);
  ctx.lineTo(W - 180, 460);
  ctx.stroke();

  const today = new Date();
  const date = `${today.getFullYear()}年 ${today.getMonth() + 1}月 ${today.getDate()}日`;
  ctx.fillStyle = "#5a7089";
  ctx.font = `700 24px ${font}`;
  ctx.fillText(date, W / 2, 520);

  // はんこ
  const x = W - 150;
  const y = H - 150;
  ctx.beginPath();
  ctx.arc(x, y, 62, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(88, 194, 115, 0.14)";
  ctx.fill();
  ctx.strokeStyle = "#3aa458";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#3aa458";
  ctx.font = `800 26px ${font}`;
  ctx.fillText("よく", x, y - 8);
  ctx.fillText("できた", x, y + 26);

  return canvas.toDataURL("image/png");
}

/* ------------------------------------------------------------------ *
 * ローマ字じてん
 * ------------------------------------------------------------------ */

const DICT_SECTIONS = [
  {
    title: "きほんの 音",
    columns: 5,
    cells: [
      ["あ", "a"],
      ["い", "i"],
      ["う", "u"],
      ["え", "e"],
      ["お", "o"],
      ["か", "ka"],
      ["き", "ki"],
      ["く", "ku"],
      ["け", "ke"],
      ["こ", "ko"],
      ["さ", "sa"],
      ["し", "si / shi"],
      ["す", "su"],
      ["せ", "se"],
      ["そ", "so"],
      ["た", "ta"],
      ["ち", "ti / chi"],
      ["つ", "tu / tsu"],
      ["て", "te"],
      ["と", "to"],
      ["な", "na"],
      ["に", "ni"],
      ["ぬ", "nu"],
      ["ね", "ne"],
      ["の", "no"],
      ["は", "ha"],
      ["ひ", "hi"],
      ["ふ", "hu / fu"],
      ["へ", "he"],
      ["ほ", "ho"],
      ["ま", "ma"],
      ["み", "mi"],
      ["む", "mu"],
      ["め", "me"],
      ["も", "mo"],
      ["や", "ya"],
      null,
      ["ゆ", "yu"],
      null,
      ["よ", "yo"],
      ["ら", "ra"],
      ["り", "ri"],
      ["る", "ru"],
      ["れ", "re"],
      ["ろ", "ro"],
      ["わ", "wa"],
      null,
      ["ん", "nn"],
      null,
      ["を", "wo"],
    ],
  },
  {
    title: "てんてん・まるの 音",
    columns: 5,
    cells: [
      ["が", "ga"],
      ["ぎ", "gi"],
      ["ぐ", "gu"],
      ["げ", "ge"],
      ["ご", "go"],
      ["ざ", "za"],
      ["じ", "zi / ji"],
      ["ず", "zu"],
      ["ぜ", "ze"],
      ["ぞ", "zo"],
      ["だ", "da"],
      ["ぢ", "di"],
      ["づ", "du"],
      ["で", "de"],
      ["ど", "do"],
      ["ば", "ba"],
      ["び", "bi"],
      ["ぶ", "bu"],
      ["べ", "be"],
      ["ぼ", "bo"],
      ["ぱ", "pa"],
      ["ぴ", "pi"],
      ["ぷ", "pu"],
      ["ぺ", "pe"],
      ["ぽ", "po"],
    ],
  },
  {
    title: "小さい ゃ ゅ ょ",
    columns: 3,
    cells: [
      ["きゃ", "kya"],
      ["きゅ", "kyu"],
      ["きょ", "kyo"],
      ["しゃ", "sya / sha"],
      ["しゅ", "syu / shu"],
      ["しょ", "syo / sho"],
      ["ちゃ", "tya / cha"],
      ["ちゅ", "tyu / chu"],
      ["ちょ", "tyo / cho"],
      ["にゃ", "nya"],
      ["にゅ", "nyu"],
      ["にょ", "nyo"],
      ["ひゃ", "hya"],
      ["ひゅ", "hyu"],
      ["ひょ", "hyo"],
      ["みゃ", "mya"],
      ["みゅ", "myu"],
      ["みょ", "myo"],
      ["りゃ", "rya"],
      ["りゅ", "ryu"],
      ["りょ", "ryo"],
      ["ぎゃ", "gya"],
      ["ぎゅ", "gyu"],
      ["ぎょ", "gyo"],
      ["じゃ", "zya / ja"],
      ["じゅ", "zyu / ju"],
      ["じょ", "zyo / jo"],
      ["びゃ", "bya"],
      ["びゅ", "byu"],
      ["びょ", "byo"],
      ["ぴゃ", "pya"],
      ["ぴゅ", "pyu"],
      ["ぴょ", "pyo"],
    ],
  },
  {
    title: "その ほか",
    columns: 3,
    cells: [
      ["っ", "つぎの 子音を 2回"],
      ["ー", "- （0 の 右）"],
      ["ん", "nn"],
      ["ふぁ", "fa"],
      ["てぃ", "thi"],
      ["でぃ", "dhi"],
      ["ぁ", "la / xa"],
      ["ぃ", "li / xi"],
      ["ぅ", "lu / xu"],
    ],
  },
];

/**
 * かな → キーの 並び（ローマ字じてんの 表から 作る）。
 * 「つぎは 「く」です。ku と 打ちます」の 案内に 使う。表に 無い 音
 *（っ・ー など、説明が 要る もの）は 入れない。
 */
const KANA_KEYS = new Map(
  DICT_SECTIONS.flatMap((section) =>
    section.cells.flatMap((cell) => {
      if (!cell) return [];
      const first = String(cell[1]).split("/")[0].trim();
      return /^[a-z-]+$/.test(first) ? [[cell[0], first]] : [];
    }),
  ),
);

function renderDictionary() {
  if (ui.dictBody.childElementCount > 0) return;

  for (const section of DICT_SECTIONS) {
    const wrap = document.createElement("section");
    wrap.className = "kana-section";

    const title = document.createElement("h3");
    title.append(ruby(section.title));
    wrap.append(title);

    const grid = document.createElement("div");
    grid.className = `kana-grid${section.columns === 3 ? " three" : ""}`;
    for (const cell of section.cells) {
      if (!cell) {
        const empty = document.createElement("div");
        empty.className = "kana-card empty";
        grid.append(empty);
        continue;
      }
      const card = document.createElement("button");
      card.type = "button";
      card.className = "kana-card";
      const kana = document.createElement("span");
      kana.className = "k";
      kana.textContent = cell[0];
      const romaji = document.createElement("span");
      romaji.className = "r";
      romaji.textContent = cell[1];
      card.append(kana, romaji);
      card.addEventListener("click", () => speak(cell[0]));
      grid.append(card);
    }
    wrap.append(grid);
    ui.dictBody.append(wrap);
  }
}

/** 音で 確かめる（読み上げが 無い 端末では 何も 起きない）。 */
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  window.speechSynthesis.speak(utterance);
}

/* ------------------------------------------------------------------ *
 * 画面を組み直す
 * ------------------------------------------------------------------ */

function render() {
  const lesson = LESSONS[state.lesson];
  const number = state.lesson + 1;
  const chapter = CHAPTERS.find((c) => c.id === lesson.chapter);

  ui.chip.textContent = `${chapter ? `${chapter.icon} ${chapter.title}` : ""}　${number} / ${LESSONS.length}`;
  ui.title.replaceChildren(ruby(lesson.title));
  ui.lead.replaceChildren(ruby(lesson.lead));

  // さいごの レッスンには「つぎへ」が 無い。開いた時点で おえたことに しないと、
  // 修了証が いつまでも 開かない（読むだけの ページなので、読んだら おわり）。
  if (state.lesson === LESSONS.length - 1 && lesson.items.length === 0) markDone(lesson);

  renderBlocks(lesson);
  renderPractice(lesson);
  renderCert(lesson);
  renderToc();
  renderProgress();

  ui.prev.disabled = state.lesson === 0;
  ui.next.disabled = state.lesson === LESSONS.length - 1;
  ui.hintToggle.setAttribute("aria-pressed", String(state.hint));
  ui.hintToggle.textContent = state.hint ? "ヒント ON" : "ヒント OFF";
}

function go(index) {
  state.lesson = clampLesson(index);
  save();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------------------------------------------ *
 * つなぎこみ
 * ------------------------------------------------------------------ */

ui.check.addEventListener("click", () => check());

/*
 * 音で 確かめる。読めない字が 打てない いちばんの 理由なので、
 * 目（かな）・耳（音）・手（キー）を そろえて 出す。
 */
ui.listen.addEventListener("click", () => {
  const lesson = LESSONS[state.lesson];
  const item = lesson?.items[itemIndex(lesson)];
  if (item) speak(item.reading);
});

el("replay").addEventListener("click", () => {
  // おえた しるし（done）は 消さない。位置だけ 先頭に 戻す
  const lesson = LESSONS[state.lesson];
  setItemIndex(lesson, 0);
  focusedItem = "";
  misses = 0;
  render();
});

ui.skip.addEventListener("click", () => {
  const lesson = LESSONS[state.lesson];
  const index = itemIndex(lesson);
  // 後ろへ 回す。消さずに 回すので、あとで もう一度 出会える
  const items = lesson.items;
  if (index < items.length - 1) {
    const [item] = items.splice(index, 1);
    items.push(item);
    render();
  } else {
    say("again", "これが さいごの もんだいです。ヒントを 見て、もう一回。");
  }
});

ui.answer.addEventListener("compositionstart", () => {
  composing = true;
});
ui.answer.addEventListener("compositionend", () => {
  composing = false;
  check(true);
});
ui.answer.addEventListener("input", () => {
  if (!composing) check(true);
});
ui.answer.addEventListener("keydown", (event) => {
  // 変換中の Enter は「漢字を きめる」ための Enter なので、こたえあわせに しない
  if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  check();
});

ui.prev.addEventListener("click", () => go(state.lesson - 1));
ui.next.addEventListener("click", () => {
  const lesson = LESSONS[state.lesson];
  // 読むだけの レッスンは、つぎへ 進んだ ときに おえたことに する
  if (lesson.items.length === 0) markDone(lesson);
  go(state.lesson + 1);
});

ui.hintToggle.addEventListener("click", () => {
  state.hint = !state.hint;
  save();
  render();
});

ui.furiganaToggle.addEventListener("click", () => {
  state.furigana = !state.furigana;
  save();
  applyFurigana();
});

function applyFurigana() {
  document.body.classList.toggle("no-furigana", !state.furigana);
  ui.furiganaToggle.setAttribute("aria-pressed", String(state.furigana));
  ui.furiganaToggle.textContent = `ふりがな ${state.furigana ? "ON" : "OFF"}`;
}

ui.tocToggle.addEventListener("click", () => toggleToc());

el("dict-open").addEventListener("click", () => {
  renderDictionary();
  ui.dict.showModal();
});
el("dict-close").addEventListener("click", () => ui.dict.close());

ui.certName.addEventListener("input", () => {
  state.name = ui.certName.value;
  save();
  ui.certDownload.disabled = state.name.trim().length === 0;
});

ui.certDownload.addEventListener("click", () => {
  const name = state.name.trim();
  if (!name) return;
  const url = drawCertificate(name);
  const link = document.createElement("a");
  link.download = `romaji-certificate-${name}.png`;
  link.href = url;
  link.click();
});

/* ---- タイトル画面 ---- */

ui.checkInput.addEventListener("input", checkKeyboard);
ui.checkInput.addEventListener("compositionend", checkKeyboard);

ui.start.addEventListener("click", () => {
  // 「はじめる」は いつも 1課目から（つづきは となりの ボタン）
  state.lesson = 0;
  save();
  showScreen("lesson");
});

ui.resume.addEventListener("click", () => showScreen("lesson"));

ui.reset.addEventListener("click", () => {
  // 消す前に 一度 聞く。ここを 押しまちがえると 20課ぶんの 進みが 消える
  if (!window.confirm("はじめから やりなおしますか？ いままでの 進みは 消えます。")) return;
  state.lesson = 0;
  state.done = [];
  state.at = {};
  state.name = "";
  focusedItem = "";
  save();
  renderTitle();
});

el("open-manual").addEventListener("click", () => showScreen("manual"));
el("open-dict-title").addEventListener("click", () => {
  renderDictionary();
  ui.dict.showModal();
});

/* ---- マニュアル ---- */

el("manual-back").addEventListener("click", () => showScreen("title"));
el("manual-back2").addEventListener("click", () => showScreen("title"));
el("manual-start").addEventListener("click", () => showScreen("lesson"));

/* ---- れんしゅう画面から タイトルへ ---- */

el("to-title").addEventListener("click", () => showScreen("title"));

load();
applyFurigana();
toggleToc(false);
showScreen("title");
