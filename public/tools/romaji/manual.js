/**
 * キーボードの じゅんび — 図つきの マニュアル
 *
 * ## なぜ 要るか
 * 学習者（カンボジアのITの学生）が 使うのは **英字（US配列）の キーボード**で、
 * パソコンの 言語設定に 日本語が 入っていない ことが ある。つまり
 * 「ローマ字の 打ち方」より 手前で 止まる——キーが 見つからない のではなく、
 * **日本語入力が そもそも 入っていない**。文字の 説明だけでは ここを 越えられない。
 *
 * ## 図は 絵ではなく「画面の 写し」
 * 図の 中の ことばは **英語のまま**にする。学生の パソコンは たいてい 英語表示で、
 * 画面に 出るのは "Language & region" であって「言語と地域」ではない。
 * 図を 日本語に すると、画面と 見くらべられない——**探す ことばが ちがう**からである。
 * 日本語の 説明は 図の そとに 置く（手順の 文）。
 *
 * ## 手で 描いた 図に する理由
 * 本物の スクリーンショットは Windows・Mac・Chromebook の 実機が 要り、
 * OSの 版が 変わるたびに 撮り直しに なる。ここでは **どこを 押すか**だけが
 * 分かれば よいので、要る ところだけを 描いた 図にする（絵の 中の 字も 選べる）。
 * 実機の 写真が 手に入ったら、この 図と 差し替えてよい。
 *
 * ※ここで 作るのは 画面の 部品（SVG）で、キャラクターの 絵ではない
 *   （AGENTS.md 規律7 は キャラクター画像の 話）。
 */

/* ------------------------------------------------------------------ *
 * 図の 部品
 * ------------------------------------------------------------------ */

const C = {
  ink: "#1f3a56",
  soft: "#5a7089",
  line: "#dcebf5",
  navy: "#004f8d",
  sky: "#0288d1",
  skySoft: "#e1f2fb",
  leaf: "#58c273",
  sun: "#ffc93c",
  coral: "#ff8a70",
  white: "#ffffff",
  panel: "#f7fbfe",
  dark: "#22303c",
};

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** 図の 外わく。`title` は 読み上げ用（画面には 出さない）。 */
function figure(title, width, height, body) {
  return `<svg class="art" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function text(x, y, value, { size = 13, fill = C.ink, weight = 700, anchor = "start" } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="system-ui, sans-serif">${esc(value)}</text>`;
}

function box(x, y, w, h, { r = 8, fill = C.white, stroke = C.line, sw = 2 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
}

/**
 * 押す ところを かこむ 赤い わく（点線）と 番号。
 * 番号の 丸は わくの 左上に 出るので、**図の ふちに 近い ところでは 空にする**
 *（丸が 切れて 半分だけ 見える）。手順の 番号は 図の そとにも 出ている。
 */
function marker(x, y, w, h, label) {
  return `
    <rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="10"
      fill="none" stroke="${C.coral}" stroke-width="3" stroke-dasharray="7 5" />
    ${
      label
        ? `<circle cx="${x - 4}" cy="${y - 4}" r="12" fill="${C.coral}" />
           ${text(x - 4, y, label, { size: 14, fill: C.white, weight: 800, anchor: "middle" })}`
        : ""
    }`;
}

/** キーの 絵（キーボードの 1つぶん）。 */
function key(x, y, w, label, { active = false, small = false } = {}) {
  return `
    ${box(x, y, w, 34, { r: 7, fill: active ? C.sun : C.white, stroke: active ? "#e0a400" : "#cdd9e3", sw: 2 })}
    ${text(x + w / 2, y + 22, label, { size: small ? 10 : 13, fill: C.ink, weight: 800, anchor: "middle" })}`;
}

/**
 * OSの 設定画面（Windows / Mac / Chromebook で 形が 似ているので 1つに する）。
 * `rows` の うち `pick` 番目を 赤い わくで かこむ。
 */
function settingsWindow({ title, crumbs, rows, pick, cta }) {
  const W = 420;
  const H = 250;
  const rowY = (i) => 92 + i * 34;
  return figure(
    `${title} の 設定画面`,
    W,
    H,
    `
    ${box(0, 0, W, H, { r: 12, fill: C.panel, stroke: C.line, sw: 2 })}
    ${box(0, 0, W, 34, { r: 12, fill: C.dark, stroke: C.dark, sw: 0 })}
    <rect x="0" y="24" width="${W}" height="10" fill="${C.dark}" />
    <circle cx="18" cy="17" r="5" fill="#ff6159" /><circle cx="34" cy="17" r="5" fill="#ffbd2e" /><circle cx="50" cy="17" r="5" fill="#28c840" />
    ${text(W / 2, 22, title, { size: 13, fill: C.white, weight: 700, anchor: "middle" })}
    ${text(18, 62, crumbs, { size: 12, fill: C.soft, weight: 700 })}
    ${rows
      .map(
        (row, i) => `
        ${box(18, rowY(i) - 20, W - 36, 28, { r: 7, fill: i === pick ? C.skySoft : C.white })}
        ${text(30, rowY(i), row, { size: 12.5, fill: i === pick ? C.navy : C.ink })}
        ${text(W - 30, rowY(i), "›", { size: 14, fill: C.soft, anchor: "end" })}`,
      )
      .join("")}
    ${pick != null ? marker(18, rowY(pick) - 20, W - 36, 28, "") : ""}
    ${
      cta
        ? `${box(18, H - 48, 190, 32, { r: 16, fill: C.sky, stroke: C.sky })}
           ${text(113, H - 27, cta, { size: 12.5, fill: C.white, weight: 800, anchor: "middle" })}
           ${marker(18, H - 48, 190, 32, "")}`
        : ""
    }`,
  );
}

/* ------------------------------------------------------------------ *
 * それぞれの 図
 * ------------------------------------------------------------------ */

/** Windows の タスクバー右下（A / あ）。 */
const artWinTaskbar = figure(
  "Windows のタスクバー右下にある A と あ の切りかえ",
  420,
  120,
  `
  ${box(0, 0, 420, 120, { r: 12, fill: "#eaf1f7", stroke: C.line })}
  ${box(0, 62, 420, 58, { r: 0, fill: C.dark, stroke: C.dark })}
  ${text(20, 96, "🔍   📁   🌐", { size: 16, fill: "#c9d8e2" })}
  ${text(250, 96, "ENG", { size: 12, fill: "#c9d8e2", weight: 700 })}
  ${box(290, 74, 34, 34, { r: 8, fill: "#3a4a58", stroke: "#3a4a58" })}
  ${text(307, 98, "A", { size: 17, fill: C.white, weight: 800, anchor: "middle" })}
  ${text(334, 98, "→", { size: 16, fill: "#c9d8e2", weight: 800 })}
  ${box(356, 74, 34, 34, { r: 8, fill: C.leaf, stroke: C.leaf })}
  ${text(373, 99, "あ", { size: 17, fill: C.white, weight: 800, anchor: "middle" })}
  ${marker(290, 74, 34, 34, "1")}
  ${text(20, 34, "click here  →  「あ」", { size: 13, fill: C.navy, weight: 800 })}
  ${text(20, 52, "taskbar (bottom-right)", { size: 11, fill: C.soft })}`,
);

/** Windows: 言語を たす 画面。 */
const artWinAddLanguage = settingsWindow({
  title: "Settings",
  crumbs: "Time & language  ›  Language & region",
  rows: ["English (United States)", "Add a language", "Windows display language"],
  pick: 1,
  cta: "Add a language",
});

/** Windows: 日本語を えらぶ。 */
const artWinPickJapanese = settingsWindow({
  title: "Choose a language to install",
  crumbs: "Type “Japanese” in the search box",
  rows: ["Italiano  (Italian)", "日本語  (Japanese)", "한국어  (Korean)"],
  pick: 1,
  cta: "Next  ›  Install",
});

/** Mac の メニューバー。 */
const artMacMenubar = figure(
  "Mac のメニューバー右上にある A と あ の切りかえ",
  420,
  120,
  `
  ${box(0, 0, 420, 120, { r: 12, fill: "#eaf1f7", stroke: C.line })}
  ${box(0, 0, 420, 34, { r: 12, fill: "#f3f6f9", stroke: "#f3f6f9" })}
  <rect x="0" y="22" width="420" height="12" fill="#f3f6f9" />
  ${text(16, 22, "  Finder   File   Edit", { size: 12, fill: C.ink, weight: 700 })}
  ${box(300, 4, 30, 26, { r: 7, fill: C.white, stroke: "#cdd9e3" })}
  ${text(315, 23, "A", { size: 15, fill: C.ink, weight: 800, anchor: "middle" })}
  ${text(338, 23, "→", { size: 14, fill: C.soft, weight: 800 })}
  ${box(358, 4, 30, 26, { r: 7, fill: C.leaf, stroke: C.leaf })}
  ${text(373, 24, "あ", { size: 15, fill: C.white, weight: 800, anchor: "middle" })}
  ${marker(300, 4, 30, 26, "")}
  ${text(20, 72, "click here  →  「あ」", { size: 13, fill: C.navy, weight: 800 })}
  ${text(20, 92, "menu bar (top-right)", { size: 11, fill: C.soft })}`,
);

/** Mac: 入力ソースを たす。 */
const artMacInputSource = settingsWindow({
  title: "System Settings",
  crumbs: "Keyboard  ›  Text Input  ›  Input Sources  ›  Edit…",
  rows: ["U.S.", "＋  Add input source", "Japanese  —  Romaji"],
  pick: 1,
  cta: "＋   Japanese › Romaji",
});

/** Chromebook: 入力方法を たす。 */
const artChromeInput = settingsWindow({
  title: "Settings",
  crumbs: "Languages and inputs  ›  Inputs  ›  Add input methods",
  rows: ["US keyboard", "Japanese with US keyboard", "Japanese"],
  pick: 1,
  cta: "Add",
});

/** スマホ: キーボードを たす。 */
const artPhoneKeyboard = figure(
  "スマホの設定でキーボードに日本語をたす",
  420,
  200,
  `
  ${box(140, 6, 140, 188, { r: 18, fill: C.white, stroke: "#b9c9d6", sw: 3 })}
  ${box(152, 24, 116, 30, { r: 8, fill: C.skySoft, stroke: C.skySoft })}
  ${text(210, 44, "Keyboards", { size: 12, fill: C.navy, weight: 800, anchor: "middle" })}
  ${box(152, 64, 116, 26, { r: 7, fill: C.white })}
  ${text(162, 82, "English (US)", { size: 11, fill: C.ink })}
  ${box(152, 96, 116, 26, { r: 7, fill: C.white })}
  ${text(162, 114, "日本語 - ローマ字", { size: 11, fill: C.ink })}
  ${marker(152, 96, 116, 26, "1")}
  ${box(152, 132, 116, 30, { r: 15, fill: C.sky, stroke: C.sky })}
  ${text(210, 152, "Add Keyboard", { size: 11, fill: C.white, weight: 800, anchor: "middle" })}
  ${text(20, 60, "Settings", { size: 13, fill: C.navy, weight: 800 })}
  ${text(20, 80, "→ General / System", { size: 11, fill: C.soft })}
  ${text(20, 98, "→ Keyboard", { size: 11, fill: C.soft })}
  ${text(20, 116, "→ Add Keyboard", { size: 11, fill: C.soft })}`,
);

/**
 * 英字（US配列）キーボードの 図。
 * 学習者の 手元に あるのは この キーボードなので、
 * 「日本語の キーボードに ある キー」を 説明しない（そのキーは 無い）。
 */
function usKeyboard() {
  const rows = [
    {
      y: 46,
      keys: [
        ["`", 34],
        ["1", 34],
        ["2", 34],
        ["3", 34],
        ["4", 34],
        ["5", 34],
        ["6", 34],
        ["7", 34],
        ["8", 34],
        ["9", 34],
        ["0", 34],
        ["-", 34],
        ["=", 34],
      ],
    },
    {
      y: 86,
      keys: [
        ["Q", 34],
        ["W", 34],
        ["E", 34],
        ["R", 34],
        ["T", 34],
        ["Y", 34],
        ["U", 34],
        ["I", 34],
        ["O", 34],
        ["P", 34],
      ],
    },
    {
      y: 126,
      keys: [
        ["A", 34],
        ["S", 34],
        ["D", 34],
        ["F", 34],
        ["G", 34],
        ["H", 34],
        ["J", 34],
        ["K", 34],
        ["L", 34],
      ],
    },
    {
      y: 166,
      keys: [
        ["Z", 34],
        ["X", 34],
        ["C", 34],
        ["V", 34],
        ["B", 34],
        ["N", 34],
        ["M", 34],
      ],
    },
  ];
  const highlight = new Set(["-", "`"]);
  let body = box(0, 0, 560, 260, { r: 14, fill: "#eef3f7", stroke: C.line });

  for (const row of rows) {
    let x = 16;
    for (const [label, w] of row.keys) {
      body += key(x, row.y, w, label, { active: highlight.has(label) });
      x += w + 6;
    }
  }
  // Alt（左）・スペース・Enter
  body += key(16, 206, 60, "Alt", { active: true, small: true });
  body += key(82, 206, 300, "space", { active: true, small: true });
  body += key(388, 206, 90, "Enter", { active: true, small: true });

  /*
   * 「ー」は `-` の キー。位置を 言葉で 説明しても 見つからないので、
   * **その キーの 真上に** 札を 出す（列は 16 + 11*40 = 456 の ところ）。
   */
  const dashX = 16 + 11 * 40;
  body += text(dashX + 17, 26, "ー のばす音", {
    size: 11,
    fill: C.navy,
    weight: 800,
    anchor: "middle",
  });
  body += `<path d="M${dashX + 17} 32 L${dashX + 17} 44" stroke="${C.coral}" stroke-width="3" />`;
  body += `<path d="M${dashX + 12} 38 L${dashX + 17} 46 L${dashX + 22} 38" fill="none" stroke="${C.coral}" stroke-width="3" />`;

  body += text(16, 262, "Alt + ` = ひらがな ⇄ 英語（Windows）", {
    size: 11.5,
    fill: C.navy,
    weight: 800,
  });
  body += text(16, 282, "space = かんじに かえる　／　Enter = きめる", {
    size: 11.5,
    fill: C.soft,
    weight: 700,
  });

  return figure("英字キーボードで つかう キー", 560, 296, body);
}

const artUsKeyboard = usKeyboard();

/* ------------------------------------------------------------------ *
 * マニュアルの 中身
 * ------------------------------------------------------------------ */

/**
 * 端末ごとの てじゅん。
 *
 * 並びは **「入っているか 確かめる」→「入れる」→「切りかえる」**。
 * いきなり 設定を 入れさせない——すでに 入っている 学習者は、
 * 押す ところが 1つ 分かれば その場で 打てるようになる。
 */
export const MANUAL = [
  {
    id: "windows",
    name: "Windows",
    icon: "🪟",
    steps: [
      {
        title: "画面の 右下を 見る",
        text: "「A」か 「あ」が ありますか。あれば、日本語入力は もう 入って います。「A」を クリックすると 「あ」に なります。",
        art: artWinTaskbar,
      },
      {
        title: "キーボードでも 切りかえられる",
        text: "英字キーボードでは、Alt キーと ` キー（1 の 左）を いっしょに 押すと、「A」と 「あ」が 入れかわります。",
        art: artUsKeyboard,
      },
      {
        title: "「A」も 「あ」も 無い ときは、日本語を たす",
        text: "Settings を ひらいて、Time & language → Language & region → Add a language を 押します。",
        art: artWinAddLanguage,
      },
      {
        title: "日本語を えらんで 入れる",
        text: "さがす ところに Japanese と 打って、日本語 を えらび、Next → Install を 押します。おわると 右下に 「A」が 出ます。",
        art: artWinPickJapanese,
      },
    ],
  },
  {
    id: "mac",
    name: "Mac",
    icon: "🍎",
    steps: [
      {
        title: "画面の 右上を 見る",
        text: "「A」か 「あ」が ありますか。あれば、クリックして 「あ」を えらびます。",
        art: artMacMenubar,
      },
      {
        title: "キーボードでも 切りかえられる",
        text: "Control キーと space キーを いっしょに 押すと、入力が 入れかわります。（🌐 の キーが ある Mac は そのキーでも かわります）",
        art: artUsKeyboard,
      },
      {
        title: "「あ」が 無い ときは、日本語を たす",
        text: "System Settings → Keyboard → Text Input の Edit… を ひらき、＋ から Japanese の Romaji を たします。",
        art: artMacInputSource,
      },
    ],
  },
  {
    id: "chromebook",
    name: "Chromebook",
    icon: "💻",
    steps: [
      {
        title: "日本語の 入力方法を たす",
        text: "Settings → Languages and inputs → Inputs → Add input methods で、Japanese with US keyboard を えらんで Add を 押します。",
        art: artChromeInput,
      },
      {
        title: "切りかえは Control と space",
        text: "Control キーと space キーを いっしょに 押すと、英語と 日本語が 入れかわります。画面の 右下でも えらべます。",
        art: artUsKeyboard,
      },
    ],
  },
  {
    id: "phone",
    name: "スマホ",
    icon: "📱",
    steps: [
      {
        title: "キーボードに 日本語を たす",
        text: "Settings → Keyboard → Add Keyboard で、日本語 の ローマ字 を たします。",
        art: artPhoneKeyboard,
      },
      {
        title: "打つ ときに 切りかえる",
        text: "キーボードの 🌐 を 押すと、英語と 日本語が 入れかわります。",
        art: null,
      },
    ],
  },
];
