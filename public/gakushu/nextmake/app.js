/**
 * 学習用サイト（株式会社ネクストメイク） — 画面のうごき
 *
 * ## この1枚が やる こと
 * 1. **ページの 切りかえ**（`#/vietnam` の ハッシュ）。8枚の html に しない。
 * 2. **やさしい日本語 ⇄ 日本語 の 切りかえ**。本文を 組み直し、**読んで いた 場所へ
 *    戻す**（上から 読み直しに ならない）。
 * 3. **ふりがな ON/OFF**。CSS だけで 消す——組み直すと スクロールが 飛ぶ。
 * 4. **ルビの 合成**。文は プレーンテキストで 持ち、ここで 読み辞書から 組む（規律2）。
 * 5. **語の 意味**（辞典）。本文に 出た 語を、辞典の ページで 引ける ように する。
 *
 * ## 英語（en）は 出さない
 * 本文には 英語も 持って いるが、**切りかえの ボタンは 描かない**（2026-08-23 の 指定）。
 * `?lang=en` を 付けた ときだけ 3つめの ボタンが 出る。管理画面から 出せる ように
 * するのは 別の 仕事。
 *
 * ## 保存
 * `localStorage["nexmax:gakushu:v1"]`。アプリ本体の `nexmax:v1:*` とは 混ぜない
 *（同じ オリジンで 動くので、名前が ぶつかると 学習の 記録を こわす）。
 */

import { PAGES } from "./data/pages/index.js";
import { UI } from "./data/ui.js";
import { FURIGANA } from "./data/furigana.generated.js";
import { GLOSSARY } from "./data/glossary.generated.js";

/* ------------------------------------------------------------------ *
 * ふりがなの合成（src/lib/text/furigana.ts と同じ規則）
 * ------------------------------------------------------------------ */

const KANJI = /[㐀-鿿々]/;

/**
 * 長い表記から当てる（「日本語」を「日本」「語」に割らない）。
 * 漢字を 含まない 見出し語は 落とす——`annotateRuby` は **漢字の 位置でしか
 * 辞書を 引かない**ので、当たる ことが 無い。
 */
const DICT = [...FURIGANA]
  .filter(([surface, reading]) => surface && reading && KANJI.test(surface))
  .sort((a, b) => b[0].length - a[0].length);

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

/* ------------------------------------------------------------------ *
 * 保存と 状態
 * ------------------------------------------------------------------ */

const STORE_KEY = "nexmax:gakushu:v1";
const LEVELS = ["n4", "n3", "en"];

const state = {
  level: "n4",
  furigana: true,
  page: "home",
  /** 英語の ボタンを 出すか（`?lang=en` か、前に 出した ことが ある とき）。 */
  english: false,
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return;
    if (LEVELS.includes(saved.level)) state.level = saved.level;
    if (typeof saved.furigana === "boolean") state.furigana = saved.furigana;
    if (saved.english === true) state.english = true;
  } catch {
    /* こわれた保存は 黙って 捨てる（読むのは 続けられる） */
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* プライベートモード等。保存できなくても 読むのは 続く */
  }
}

/* ------------------------------------------------------------------ *
 * ことばの 取り出し
 * ------------------------------------------------------------------ */

/**
 * `{n4, n3, en}` の 組か、素の 文字列。
 * 素の 文字列は **どの レベルでも 同じ**（固有名詞・日付・技術の 名前）。
 * en が 空の ときは 日本語に 落とす——英語だけ 抜けて 白くなる のを 防ぐ。
 */
function t(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[state.level] || value.n3 || value.n4 || "";
}

/* ------------------------------------------------------------------ *
 * 小さな DOM の 道具
 * ------------------------------------------------------------------ */

function el(tag, className, textValue) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textValue != null) node.append(ruby(t(textValue)));
  return node;
}

function pageById(id) {
  return PAGES.find((page) => page.id === id) ?? PAGES[0];
}

/* ------------------------------------------------------------------ *
 * ブロックを 描く
 * ------------------------------------------------------------------ */

const RENDER = {
  heading: (block) => el("h2", "b-heading", block.text),

  paragraph: (block) => el("p", "b-paragraph", block.text),

  list: (block) => {
    const ul = el("ul", "b-list");
    for (const item of block.items) ul.append(el("li", null, item));
    return ul;
  },

  steps: (block) => {
    const ol = el("ol", "b-steps");
    block.items.forEach((item, at) => {
      const li = el("li", item.mark ? "is-mark" : null);
      li.append(el("span", "step-no", String(at + 1)));
      li.append(el("span", "step-text", item));
      ol.append(li);
    });
    return ol;
  },

  cards: (block) => {
    const wrap = el("div", "b-cards");
    for (const item of block.items) {
      const card = el("div", item.mark ? "card is-mark" : "card");
      card.append(el("span", "card-icon", item.icon));
      card.append(el("h3", "card-label", item.label));
      card.append(el("p", "card-text", item.text));
      if (item.to) card.append(pageLink(item.to, UI.more));
      wrap.append(card);
    }
    return wrap;
  },

  chips: (block) => {
    const wrap = el("div", "b-chips");
    for (const group of block.groups) {
      const box = el("div", "chip-group");
      box.append(el("h3", "chip-label", group.label));
      const row = el("div", "chip-row");
      for (const item of group.items) row.append(el("span", "chip", item));
      box.append(row);
      wrap.append(box);
    }
    return wrap;
  },

  table: (block) => {
    const wrap = el("div", "b-table");
    const table = document.createElement("table");
    const body = document.createElement("tbody");
    for (const row of block.rows) {
      const tr = document.createElement("tr");
      tr.append(el("th", null, row.th));
      tr.append(el("td", null, row.td));
      body.append(tr);
    }
    table.append(body);
    wrap.append(table);
    return wrap;
  },

  timeline: (block) => {
    const ol = el("ol", "b-timeline");
    for (const item of block.items) {
      const li = el("li", item.mark ? "is-mark" : null);
      li.append(el("span", "when", item.when));
      li.append(el("span", "what", item.what));
      ol.append(li);
    }
    return ol;
  },

  /*
   * 会社の 原文（SLOGAN・MISSION）は **書きかえない**。読める ように するのは
   * 下の `note` の 役目。原文を やさしく 直すと、学習者が サイトで 見つけた 文と
   * 先生が 話す 文が ちがう ものに なる。
   */
  quote: (block) => {
    const box = el("figure", "b-quote");
    if (block.source) box.append(el("figcaption", "quote-source", block.source));
    box.append(el("blockquote", "quote-text", block.text));
    if (block.note) box.append(el("p", "quote-note", block.note));
    return box;
  },

  callout: (block) => {
    const box = el("aside", `b-callout tone-${block.tone}`);
    box.append(el("span", "callout-mark", block.tone === "care" ? "🫱" : "💎"));
    box.append(el("p", "callout-text", block.text));
    return box;
  },

  service: (block) => {
    const box = el("section", "b-service");
    const head = el("div", "service-head");
    head.append(el("span", "service-icon", block.icon));
    const names = el("div", "service-names");
    names.append(el("h3", "service-name", block.name));
    if (block.reading) names.append(el("p", "service-reading", block.reading));
    head.append(names);
    box.append(head);
    box.append(el("p", "service-lead", block.lead));
    box.append(el("p", "service-text", block.text));
    if (block.note) box.append(el("p", "service-note", block.note));
    return box;
  },

  work: (block) => {
    const box = el("section", "b-work");
    const head = el("div", "work-head");
    head.append(el("span", "work-tag", block.tag));
    head.append(el("span", "work-when", block.when));
    box.append(head);
    box.append(el("h3", "work-client", block.client));
    box.append(el("p", "work-what", block.what));
    return box;
  },

  figure: (block) => {
    const box = el("figure", "b-figure");
    const img = document.createElement("img");
    img.src = block.src;
    img.alt = block.alt ?? "";
    img.loading = "lazy";
    box.append(img);
    if (block.caption) box.append(el("figcaption", null, block.caption));
    return box;
  },

  link: (block) => {
    const wrap = el("p", "b-link");
    wrap.append(pageLink(block.to, block.label));
    return wrap;
  },

  glossary: () => renderGlossary(),
};

function pageLink(to, label) {
  const a = document.createElement("a");
  a.className = "page-link";
  a.href = `#/${to}`;
  a.append(ruby(t(label)));
  return a;
}

/* ------------------------------------------------------------------ *
 * ことばの辞典
 * ------------------------------------------------------------------ */

function renderGlossary() {
  const wrap = el("div", "b-glossary");

  const bar = el("div", "gloss-bar");
  const label = document.createElement("label");
  label.className = "gloss-search";
  label.append(ruby(t(UI.dictionary.search)));
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = UI.dictionary.searchPlaceholder;
  input.autocomplete = "off";
  label.append(input);
  bar.append(label);
  const count = el("p", "gloss-count");
  bar.append(count);
  wrap.append(bar);

  const list = el("dl", "gloss-list");
  wrap.append(list);

  const draw = () => {
    const query = input.value.trim();
    const hits = query
      ? GLOSSARY.filter(
          (item) =>
            item.term.includes(query) ||
            item.reading.includes(query) ||
            item.meaning.includes(query) ||
            (item.en ?? "").toLowerCase().includes(query.toLowerCase()),
        )
      : GLOSSARY;

    list.replaceChildren();
    count.replaceChildren(ruby(`${t(UI.dictionary.countLabel)}: ${hits.length}`));

    if (hits.length === 0) {
      list.append(el("p", "gloss-empty", UI.dictionary.empty));
      return;
    }
    for (const item of hits) {
      const dt = el("dt");
      dt.append(ruby(item.term));
      if (item.en) dt.append(el("span", "gloss-en", item.en));
      const dd = el("dd");
      dd.append(ruby(item.meaning));
      list.append(dt, dd);
    }
  };

  input.addEventListener("input", draw);
  draw();
  return wrap;
}

/* ------------------------------------------------------------------ *
 * ページを 描く
 * ------------------------------------------------------------------ */

const pageNode = document.getElementById("page");
const mainNode = document.getElementById("main");

function renderPage() {
  const page = pageById(state.page);
  pageNode.replaceChildren();

  if (page.hero) {
    const hero = el("div", "page-hero");
    const img = document.createElement("img");
    img.src = page.hero;
    img.alt = page.heroAlt ?? "";
    hero.append(img);
    pageNode.append(hero);
  }

  pageNode.append(el("h1", "page-title", page.title));

  for (const block of page.blocks) {
    const draw = RENDER[block.kind];
    if (draw) pageNode.append(draw(block));
  }

  pageNode.append(renderPager(page));
  document.title = `${t(page.title)} | ${UI.siteName}`;
}

function renderPager(page) {
  const at = PAGES.indexOf(page);
  const nav = el("nav", "pager");
  if (at > 0) {
    const prev = pageLink(PAGES[at - 1].id, `← ${PAGES[at - 1].nav}`);
    prev.classList.add("pager-prev");
    nav.append(prev);
  }
  if (at < PAGES.length - 1) {
    const next = pageLink(PAGES[at + 1].id, `${PAGES[at + 1].nav} →`);
    next.classList.add("pager-next");
    nav.append(next);
  }
  return nav;
}

/* ------------------------------------------------------------------ *
 * 外がわ（帯・ナビ・フッター）
 * ------------------------------------------------------------------ */

const navNode = document.getElementById("nav");
const navToggle = document.getElementById("nav-toggle");
const levelsNode = document.getElementById("helper-levels");
const furiganaToggle = document.getElementById("furigana-toggle");

function renderNav() {
  navNode.replaceChildren();
  for (const page of PAGES) {
    const a = document.createElement("a");
    a.href = `#/${page.id}`;
    a.className = page.id === state.page ? "nav-item is-here" : "nav-item";
    if (page.id === state.page) a.setAttribute("aria-current", "page");
    a.append(ruby(page.nav));
    navNode.append(a);
  }
}

function renderHelper() {
  levelsNode.replaceChildren();
  const shown = state.english ? LEVELS : ["n4", "n3"];
  const labels = {
    n4: UI.helper.levelN4,
    n3: UI.helper.levelN3,
    en: UI.helper.levelEn,
  };
  for (const level of shown) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = level === state.level ? "level-btn is-on" : "level-btn";
    button.dataset.level = level;
    button.setAttribute("aria-pressed", String(level === state.level));
    // 英語の ボタンだけ ルビを 組まない（漢字が 無い）
    button.append(level === "en" ? document.createTextNode(labels[level]) : ruby(labels[level]));
    levelsNode.append(button);
  }

  furiganaToggle.replaceChildren(
    ruby(state.furigana ? UI.helper.furiganaOn : UI.helper.furiganaOff),
  );
  furiganaToggle.setAttribute("aria-pressed", String(state.furigana));
  document.body.classList.toggle("furigana-off", !state.furigana);
}

function renderChrome() {
  document.getElementById("helper-label").replaceChildren(ruby(UI.helper.label));
  document.getElementById("brand-name").replaceChildren(ruby(UI.siteName));
  document.getElementById("brand-tagline").replaceChildren(ruby(UI.tagline));
  navToggle.replaceChildren(ruby(UI.nav.open));
  document
    .getElementById("foot-mission")
    .replaceChildren(ruby("人、文化、技術をつなぎ、まだ見ぬ価値を社会へ届ける。"));
  document.getElementById("foot-note").replaceChildren(ruby(UI.footer.note));
  const real = document.getElementById("foot-real");
  real.href = UI.footer.realUrl;
  real.target = "_blank";
  real.replaceChildren(ruby(UI.footer.real));
}

/* ------------------------------------------------------------------ *
 * レベルを 変える — 読んで いた 場所へ 戻す
 * ------------------------------------------------------------------ */

/**
 * いま 画面の いちばん 上に ある ブロックの 番号と、その ブロックの 上端からの
 * ずれを 覚える。文の 長さは レベルで 変わるので、**画素の 位置では 戻せない**。
 */
function anchorNow() {
  const blocks = [...pageNode.children];
  for (let at = 0; at < blocks.length; at += 1) {
    const box = blocks[at].getBoundingClientRect();
    if (box.bottom > 0) return { at, offset: box.top };
  }
  return { at: 0, offset: 0 };
}

function restoreAnchor(anchor) {
  const target = pageNode.children[anchor.at];
  if (!target) return;
  const box = target.getBoundingClientRect();
  window.scrollBy({ top: box.top - anchor.offset, behavior: "instant" });
}

function setLevel(level) {
  if (!LEVELS.includes(level) || level === state.level) return;
  const anchor = anchorNow();
  state.level = level;
  save();
  renderHelper();
  renderNav();
  renderChrome();
  renderPage();
  restoreAnchor(anchor);
}

/* ------------------------------------------------------------------ *
 * ルート
 * ------------------------------------------------------------------ */

function readHash() {
  const id = window.location.hash.replace(/^#\/?/, "").trim();
  return PAGES.some((page) => page.id === id) ? id : "home";
}

function go() {
  const next = readHash();
  const changed = next !== state.page;
  state.page = next;
  save();
  renderNav();
  renderPage();
  closeNav();
  if (changed) {
    window.scrollTo({ top: 0, behavior: "instant" });
    mainNode.focus({ preventScroll: true });
  }
}

function closeNav() {
  document.body.classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.replaceChildren(ruby(UI.nav.open));
}

/* ------------------------------------------------------------------ *
 * 立ち上げ
 * ------------------------------------------------------------------ */

load();
if (new URLSearchParams(window.location.search).get("lang") === "en") {
  state.english = true;
  save();
}
if (!state.english && state.level === "en") state.level = "n4";

renderChrome();
renderHelper();
go();

window.addEventListener("hashchange", go);

levelsNode.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-level]");
  if (button) setLevel(button.dataset.level);
});

furiganaToggle.addEventListener("click", () => {
  state.furigana = !state.furigana;
  save();
  renderHelper();
});

navToggle.addEventListener("click", () => {
  const open = document.body.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.replaceChildren(ruby(open ? UI.nav.close : UI.nav.open));
});

/* 上に もどる — 長い ページで 迷子に ならない ように */
const toTop = document.getElementById("to-top");
toTop.replaceChildren(ruby(UI.backToTop));
window.addEventListener(
  "scroll",
  () => {
    toTop.hidden = window.scrollY < 600;
  },
  { passive: true },
);
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
