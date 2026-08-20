/**
 * build_vocabulary — 5か所に 散っていた ことばを 1つの 正に 集める
 *
 * 実行: node scripts/build_vocabulary.mjs
 * 出力: content/vocab/vocabulary.json
 *
 * 集める先（この順で 先に 出たほうが 勝つ）:
 *  1. content/wordstages/*.json の words   … いちばん 中身が 濃い（説明・例文・誤答つき）
 *  2. src/content/glossary.ts の GLOSSARY  … 対訳1語と 英語の 意味を 持つ
 *  3. content/articles/*.json の vocab ブロック
 *  4. content/manga/*.json の vocab
 *  5. content/slides/*.json の notes（`【語】English`）… 対訳だけ。説明は 後で 足す
 *
 * **先に 出たほうが 勝つ**のは `src/lib/dictionary.ts` と 同じ規則である。
 * 単語ステージの 語IDは そのまま 引き継ぐ——`mastery`（学習履歴）の 保存キーなので、
 * 付け直すと 学習者の 積み上げが 切れる。
 *
 * このスクリプトは **1回きりの 引っ越し道具では ない**。教材から 語を 拾い直したい
 * ときに 何度でも 回せるように、出どころを 語ごとに 残す（`from`）。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");
const OUT_DIR = join(CONTENT, "vocab");
const OUT = join(OUT_DIR, "vocabulary.json");

const read = (dir) =>
  existsSync(join(CONTENT, dir))
    ? readdirSync(join(CONTENT, dir))
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({
          file: `${dir}/${f}`,
          json: JSON.parse(readFileSync(join(CONTENT, dir, f), "utf8")),
        }))
    : [];

/** ひらがなの よみ から ローマ字の id を 作る（単語ステージの 付け方に そろえる）。 */
const ROMAJI = [
  ["きゃ", "kya"],
  ["きゅ", "kyu"],
  ["きょ", "kyo"],
  ["しゃ", "sha"],
  ["しゅ", "shu"],
  ["しょ", "sho"],
  ["ちゃ", "cha"],
  ["ちゅ", "chu"],
  ["ちょ", "cho"],
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
  ["じゃ", "ja"],
  ["じゅ", "ju"],
  ["じょ", "jo"],
  ["びゃ", "bya"],
  ["びゅ", "byu"],
  ["びょ", "byo"],
  ["ぴゃ", "pya"],
  ["ぴゅ", "pyu"],
  ["ぴょ", "pyo"],
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
  ["し", "shi"],
  ["す", "su"],
  ["せ", "se"],
  ["そ", "so"],
  ["た", "ta"],
  ["ち", "chi"],
  ["つ", "tsu"],
  ["て", "te"],
  ["と", "to"],
  ["な", "na"],
  ["に", "ni"],
  ["ぬ", "nu"],
  ["ね", "ne"],
  ["の", "no"],
  ["は", "ha"],
  ["ひ", "hi"],
  ["ふ", "fu"],
  ["へ", "he"],
  ["ほ", "ho"],
  ["ま", "ma"],
  ["み", "mi"],
  ["む", "mu"],
  ["め", "me"],
  ["も", "mo"],
  ["や", "ya"],
  ["ゆ", "yu"],
  ["よ", "yo"],
  ["ら", "ra"],
  ["り", "ri"],
  ["る", "ru"],
  ["れ", "re"],
  ["ろ", "ro"],
  ["わ", "wa"],
  ["を", "o"],
  ["ん", "n"],
  ["が", "ga"],
  ["ぎ", "gi"],
  ["ぐ", "gu"],
  ["げ", "ge"],
  ["ご", "go"],
  ["ざ", "za"],
  ["じ", "ji"],
  ["ず", "zu"],
  ["ぜ", "ze"],
  ["ぞ", "zo"],
  ["だ", "da"],
  ["ぢ", "ji"],
  ["づ", "zu"],
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
  ["ー", "-"],
  ["っ", "tsu"],
  ["ぁ", "a"],
  ["ぃ", "i"],
  ["ぅ", "u"],
  ["ぇ", "e"],
  ["ぉ", "o"],
];

/** カタカナの よみを ひらがなに 直す（単語ステージの 付け方に そろえる）。 */
function toHiragana(reading) {
  return reading.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function toRomaji(reading) {
  let out = "";
  let i = 0;
  while (i < reading.length) {
    const two = reading.slice(i, i + 2);
    const hit2 = ROMAJI.find(([k]) => k === two);
    if (hit2) {
      out += hit2[1];
      i += 2;
      continue;
    }
    const one = reading[i];
    const hit1 = ROMAJI.find(([k]) => k === one);
    out += hit1 ? hit1[1] : "";
    i += 1;
  }
  return out.replace(/[^a-z0-9_-]/g, "") || "kotoba";
}

const words = [];
const byTerm = new Map();
const furigana = new Map();

function add(word, from) {
  if (word.reading) word.reading = toHiragana(word.reading);
  if (word.englishTerm === "") delete word.englishTerm;
  const existing = byTerm.get(word.term);
  if (existing) {
    // 先に 出たほうが 勝つ。ただし **空いている 欄だけは 埋める**
    //（単語ステージには 対訳が 無く、glossary には 例文が 無い、など）。
    for (const key of ["romaji", "englishMeaning", "example", "wrongMeanings"]) {
      if (existing[key] === undefined && word[key] !== undefined) existing[key] = word[key];
    }
    existing.from = [...new Set([...existing.from, from])];
    return;
  }
  const entry = { ...word, from: [from] };
  byTerm.set(word.term, entry);
  words.push(entry);
}

function uniqueId(base) {
  let id = base;
  let n = 2;
  while (words.some((w) => w.id === id)) {
    id = `${base}${n}`;
    n += 1;
  }
  return id;
}

/* 0. いまの 正 — すでに 集めた ぶんが いちばん 強い（先生の 直しを 踏まない） */
if (existsSync(OUT)) {
  const current = JSON.parse(readFileSync(OUT, "utf8"));
  for (const [surface, reading] of current.furigana ?? []) furigana.set(surface, reading);
  for (const w of current.words) add({ ...w }, "content/vocab/vocabulary.json");
}

/* 1. 単語ステージ — 語を 直に 持って いた ころの かたち（`wordIds` に 移ったら 素通り） */
for (const { file, json } of read("wordstages")) {
  for (const [surface, reading] of json.furigana ?? []) furigana.set(surface, reading);
  for (const w of json.words ?? []) {
    add(
      {
        id: w.id,
        term: w.term,
        reading: w.reading,
        romaji: w.romaji,
        meaningJa: w.explanationJa,
        englishTerm: w.meaningEn,
        example: w.example,
        wrongMeanings: w.wrongMeanings,
      },
      file,
    );
  }
}

/* 2. 語彙メモ（glossary.ts）— 対訳1語と 英語の 意味 */
const glossarySrc = readFileSync(join(ROOT, "src/content/glossary.ts"), "utf8");
for (const block of glossarySrc.matchAll(
  /\{\s*term:\s*"([^"]+)",[\s\S]*?reading:\s*"([^"]+)",\s*meaning:\s*"([^"]+)",\s*englishTerm:\s*"([^"]+)",\s*englishMeaning:\s*"([^"]+)",\s*\}/g,
)) {
  const [, term, reading, meaning, englishTerm, englishMeaning] = block;
  add(
    {
      id: uniqueId(toRomaji(reading)),
      term,
      reading,
      meaningJa: meaning,
      englishTerm,
      englishMeaning,
    },
    "src/content/glossary.ts",
  );
}

/* 3. 記事の vocab ブロック / 4. まんがの vocab */
const fromBlocks = [
  ...read("articles").flatMap(({ file, json }) =>
    (json.blocks ?? [])
      .filter((b) => b.kind === "vocab")
      .flatMap((b) => b.items.map((i) => ({ file, item: i }))),
  ),
  ...read("manga").flatMap(({ file, json }) => (json.vocab ?? []).map((i) => ({ file, item: i }))),
];
for (const { file, item } of fromBlocks) {
  add(
    {
      id: uniqueId(toRomaji(item.reading)),
      term: item.term,
      reading: item.reading,
      meaningJa: item.meaning,
      englishTerm: item.en ?? "",
    },
    file,
  );
}

/* 5. スライドの ノート（`【語】English`）— 対訳だけ。説明は 空で 置き、先生が 足す */
for (const { file, json } of read("slides")) {
  for (const note of json.notes ?? []) {
    for (const hit of note.text.matchAll(/【([^】]+)】([^　】]+)/g)) {
      const term = hit[1].trim();
      const en = hit[2].trim();
      if (byTerm.has(term)) {
        add({ term, englishTerm: en }, file);
        continue;
      }
      const reading = (json.furigana ?? []).find(([s]) => s === term)?.[1];
      if (!reading) continue; // よみが 分からない 語は 入れない（思いつきの よみを 置かない）
      add(
        {
          id: uniqueId(toRomaji(reading)),
          term,
          reading,
          meaningJa: `${en} の ことばです。`,
          englishTerm: en,
        },
        file,
      );
    }
  }
}

/*
 * 読み辞書は **リポジトリ中の 読み辞書を ぜんぶ 集めて**、使う ぶんだけ 残す。
 *
 * 語彙メモ（glossary.ts）の 説明文は これまで 読み辞書を 持って いなかったので、
 * 集めると 漢字が 裸で 残る（規律2 で 止まる）。教材の 側には 同じ 語の よみが
 * すでに あるので、そこから 借りる。
 */
/*
 * 教材の どこにも 無い よみは、ここで 手で 足す。
 * 「楽」は 前後で よみが 変わる（楽しく＝たのしく／楽に＝らくに）ので、
 * **漢字で 始まる 語の かたち**で 入れる（読み辞書は 漢字の 位置でしか 引かない）。
 */
const EXTRA_READINGS = [
  ["楽しく", "たのしく"],
  ["楽に", "らくに"],
  ["友", "とも"],
  ["体", "からだ"],
];
for (const [surface, reading] of EXTRA_READINGS) furigana.set(surface, reading);

for (const dir of [
  "wordstages",
  "articles",
  "manga",
  "slides",
  "quizsets",
  "listening",
  "meetings",
  "scenarios",
  "stages",
  "links",
]) {
  for (const { json } of read(dir)) {
    for (const [surface, reading] of json.furigana ?? []) {
      if (!furigana.has(surface)) furigana.set(surface, reading);
    }
  }
}

const texts = words.map((w) => `${w.meaningJa ?? ""}\n${w.example ?? ""}`).join("\n");
const merged = [...furigana.entries()]
  .filter(([surface]) => texts.includes(surface))
  .sort((a, b) => b[0].length - a[0].length);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      kind: "vocab",
      id: "vocabulary",
      title: "ことば",
      furigana: merged,
      // `from`（出どころ）は 数える ためだけの もの。書き出す ファイルには 入れない
      words: words.map(({ from: _from, ...w }) => w),
    },
    null,
    2,
  ) + "\n",
);

console.log(`content/vocab/vocabulary.json … ${words.length}語`);
const bySource = new Map();
for (const w of words) for (const f of w.from) bySource.set(f, (bySource.get(f) ?? 0) + 1);
for (const [f, n] of [...bySource].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(3)} ${f}`);
