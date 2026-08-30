#!/usr/bin/env node
/**
 * 報連相（報告・連絡・相談）の3ステージを 組み立てる — 旧アプリからの 移植
 *
 * 中身の 出どころは 旧アプリ（tomy1031/nextmake_onbording）の
 *   lecture/houkoku・lecture/renraku・lecture/soudan
 *   listening/houkoku・listening/renraku・listening/soudan
 * で、**レクチャーと リスニングを 1つの ステージに 統合**して ある
 *（2026-08-29 の 指定「レクチャーとリスニングを統合させて3つのコンテンツに」）。
 *
 * ## なぜ 手書きの JSON では なく 生成するのか
 * 読み辞書（ふりがな）は **3ステージ 14ファイルで 同じ 語が 何度も 出る**。
 * ファイルごとに 書くと、1か所 直した ときに 残りが 古いまま 残り、
 * 「同じ 語なのに ページに よって ふりがなが 違う」が 起きる。
 * ここに 1つ 持ち、書き出す ときに **その ファイルで 実際に 使う ぶんだけ**配る。
 *
 * 実行: node scripts/gen_hourensou_content.mjs
 * そのあと `npm run gen:content` で バンドルへ 焼き込む。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/* ------------------------------------------------------------------ *
 * 読み辞書（この3ステージ ぜんぶで 共有）
 *
 * 単位（時・分・日）は **1文字で** 持つ。数字で 始まる 見出しは ルビの 索引に
 * 当たらない ため（下の 覚書）。読みが 分かれる 使い方は 本文に 書かない。
 * ------------------------------------------------------------------ */
const FURIGANA = {
  // ほうれんそう の 芯
  報連相: "ほうれんそう",
  報告: "ほうこく",
  連絡: "れんらく",
  相談: "そうだん",
  // 会社・人
  会社: "かいしゃ",
  上司: "じょうし",
  取締役: "とりしまりやく",
  先輩: "せんぱい",
  社員: "しゃいん",
  同僚: "どうりょう",
  部署: "ぶしょ",
  社外: "しゃがい",
  階級: "かいきゅう",
  目上: "めうえ",
  自分: "じぶん",
  相手: "あいて",
  一人: "ひとり",
  全体: "ぜんたい",
  人: "ひと",
  藤木: "ふじき",
  富田: "とみた",
  奥田: "おくだ",
  日本: "にほん",
  // しごと
  仕事: "しごと",
  作業: "さぎょう",
  予定: "よてい",
  指示: "しじ",
  確認: "かくにん",
  完了: "かんりょう",
  結果: "けっか",
  様子: "ようす",
  進: "すす",
  無事: "ぶじ",
  現場: "げんば",
  開発: "かいはつ",
  設計書: "せっけいしょ",
  調査: "ちょうさ",
  // つたえかた
  事実: "じじつ",
  情報: "じょうほう",
  意見: "いけん",
  結論: "けつろん",
  具体的: "ぐたいてき",
  数字: "すうじ",
  件名: "けんめい",
  本文: "ほんぶん",
  見出: "みだ",
  期限: "きげん",
  対策: "たいさく",
  重要: "じゅうよう",
  共有: "きょうゆう",
  優先順位: "ゆうせんじゅんい",
  返信: "へんしん",
  合図: "あいず",
  同意: "どうい",
  感謝: "かんしゃ",
  了解: "りょうかい",
  反応: "はんのう",
  工夫: "くふう",
  無視: "むし",
  不安: "ふあん",
  許可: "きょか",
  正直: "しょうじき",
  気持: "きも",
  一生懸命: "いっしょうけんめい",
  無難: "ぶなん",
  活用: "かつよう",
  // トラブル
  問題: "もんだい",
  原因: "げんいん",
  設定: "せってい",
  解決: "かいけつ",
  発生: "はっせい",
  修正: "しゅうせい",
  復旧: "ふっきゅう",
  障害: "しょうがい",
  見込: "みこ",
  途中: "とちゅう",
  // IT
  機能: "きのう",
  画面: "がめん",
  入力: "にゅうりょく",
  文字: "もじ",
  検証環境: "けんしょうかんきょう",
  環境: "かんきょう",
  環境構築: "かんきょうこうちく",
  /*
   * **半分だけの 読みも 持つ。** 画面は 辞書に ある ことば（環境）を
   * 先に ふきだしへ 切り出す（`DictionaryText`）ので、そのあとに ルビを 合成する
   * ときには「環境構築」という かたまりが もう 無い。長い ほうだけ 持つと、
   * 残った「構築」が 裸の 漢字で 出る（e2e の 実画面検査が 見つけた）。
   */
  構築: "こうちく",
  保存: "ほぞん",
  管理: "かんり",
  処理: "しょり",
  検索: "けんさく",
  変数: "へんすう",
  技術: "ぎじゅつ",
  方法: "ほうほう",
  表示: "ひょうじ",
  // 気もち・うごき
  大切: "たいせつ",
  一番: "いちばん",
  必要: "ひつよう",
  必: "かなら",
  心配: "しんぱい",
  簡単: "かんたん",
  大変: "たいへん",
  一緒: "いっしょ",
  最初: "さいしょ",
  面白: "おもしろ",
  失礼: "しつれい",
  練習: "れんしゅう",
  場面: "ばめん",
  用意: "ようい",
  // 時
  今日: "きょう",
  明日: "あした",
  来週: "らいしゅう",
  時間: "じかん",
  現在: "げんざい",
  最後: "さいご",
  今: "いま",
  後: "あと",
  前: "まえ",
  /*
   * 数の あとの 単位。
   *
   * **「18時」のような かたまりでは 持てない。** ルビの 索引は
   * **漢字の 位置からしか 当てに 行かない**（`annotateRuby` の走査は
   * 漢字でない 文字を 読み飛ばす）ので、数字で 始まる 見出しは 一生 当たらない。
   * だから 単位は 1文字で 持ち、**読みの 分かれる 使い方を 本文に 書かない**
   *（「分」は ふん だけに する——「使い分ける」は「えらぶ」と 書く）。
   */
  時: "じ",
  分: "ふん",
  日: "にち",
  週間: "しゅうかん",
  月: "げつ",
  行: "ぎょう",
  件: "けん",
  // 一字の 動詞・形容詞（送りがなの 幹）
  言: "い",
  聞: "き",
  見: "み",
  書: "か",
  使: "つか",
  思: "おも",
  作: "つく",
  直: "なお",
  止: "と",
  遅: "おく",
  早: "はや",
  悪: "わる",
  良: "よ",
  終: "お",
  始: "はじ",
  教: "おし",
  伝: "つた",
  困: "こま",
  隠: "かく",
  怒: "おこ",
  調: "しら",
  変: "か",
  知: "し",
  持: "も",
  考: "かんが",
  決: "き",
  選: "えら",
  迷: "まよ",
  悩: "なや",
  答: "こた",
  短: "みじか",
  長: "なが",
  届: "とど",
  深: "ふか",
  親: "した",
  顔: "かお",
  焦: "あせ",
  辛: "つら",
  慰: "なぐさ",
  奪: "うば",
  疲: "つか",
  願: "ねが",
  送: "おく",
  読: "よ",
  動: "うご",
  出: "で",
  入: "い",
  次: "つぎ",
  他: "ほか",
  何: "なに",
  話: "はな",
  大: "おお",
  小: "ちい",
  少: "すこ",
  多: "おお",
  上手: "じょうず",
  中: "なか",
  // 追加分（lint:content の 覆い検査が 名ざした 漢字）
  有名: "ゆうめい",
  報: "ほう",
  連: "れん",
  相: "そう",
  学習: "がくしゅう",
  学: "まな",
  忙: "いそが",
  声: "こえ",
  先: "さき",
  気: "き",
  同: "おな",
  上: "うえ",
  客様: "きゃくさま",
  直接: "ちょくせつ",
  新: "あたら",
  開: "ひら",
  注目: "ちゅうもく",
  会話: "かいわ",
  間: "ま",
  合: "あ",
  休: "やす",
  名前: "なまえ",
  名: "な",
  会議: "かいぎ",
  壊: "こわ",
  計算: "けいさん",
  説明: "せつめい",
  理由: "りゆう",
  安心: "あんしん",
  無理: "むり",
  助: "たす",
  急: "いそ",
  全: "ぜん",
  社内: "しゃない",
  午前: "ごぜん",
  午後: "ごご",
  朝: "あさ",
  今回: "こんかい",
  商品検索: "しょうひんけんさく",
  検索結果: "けんさくけっか",
  商品: "しょうひん",
  怪: "あや",
  型: "かた",
  実: "じつ",
  点: "てん",
  様: "さま",
  真: "ま",
  自信: "じしん",
  提案: "ていあん",
  資料: "しりょう",
  遅刻: "ちこく",
  出社: "しゅっしゃ",
  体調: "たいちょう",
  会場: "かいじょう",
  時刻: "じこく",
  内容: "ないよう",
  状態: "じょうたい",
  対応: "たいおう",
  担当: "たんとう",
  以降: "いこう",
  絶対: "ぜったい",
  今作: "いまつく",
  買: "か",
  順: "じゅん",
  藤木取締役: "ふじきとりしまりやく",
  目的: "もくてき",
  心: "こころ",
  昨日: "きのう",
  田中: "たなか",
  調査中: "ちょうさちゅう",
  作業中: "さぎょうちゅう",
  確認作業: "かくにんさぎょう",
  検証: "けんしょう",
  正: "ただ",
  難: "むずか",
  通: "とお",
  友: "とも",
  起: "お",
  付: "つ",
  文: "ぶん",
  返: "かえ",
  便利: "べんり",
  頼: "たの",
  申: "もう",
  整: "ととの",
  番号: "ばんごう",
  回: "かい",
  全部: "ぜんぶ",
  半分: "はんぶん",
  風: "ふう",
  通知: "つうち",
  順番: "じゅんばん",
  連絡文: "れんらくぶん",
  動画: "どうが",
  手本: "てほん",
  組: "くみ",
  金: "かね",
  数: "かず",
  切: "き",
  力: "ちから",
  私: "わたし",
  日本語: "にほんご",
  語: "ご",
  覚: "おぼ",
  勝: "か",
  奥田先輩: "おくだせんぱい",
  // 追加分（「もっと 楽しく」企画・2026-08-29）
  役: "やく",
  質問: "しつもん",
  学生: "がくせい",
  否定: "ひてい",
  一度: "いちど",
  疑問形: "ぎもんけい",
  出身: "しゅっしん",
  毎日: "まいにち",
  文法: "ぶんぽう",
  専攻: "せんこう",
  新人: "しんじん",
  目: "め",
  礼: "れい",
  会議室: "かいぎしつ",
  手伝: "てつだ",
  笑: "わら",
  来: "き",
  電話: "でんわ",
  気配: "けはい",
  集中: "しゅうちゅう",
  順調: "じゅんちょう",
  楽: "たの",
  机: "つくえ",
  肩: "かた",
  茶: "ちゃ",
  待: "ま",
  立: "た",
  飲: "の",
  置: "お",
  予約: "よやく",
  時計: "とけい",
  歩: "ある",
  夜: "よる",
  瞬間: "しゅんかん",
  近: "ちか",
  打: "う",
  渡: "わた",
  夕方: "ゆうがた",
  金曜日: "きんようび",
  金曜: "きんよう",
  月曜日: "げつようび",
  家: "いえ",
  消: "き",
  昼: "ひる",
  二人: "ふたり",
  一手: "いって",
  済: "すみ",
  要素: "ようそ",
  音声: "おんせい",
  押: "お",
  投稿: "とうこう",
  育: "そだ",
  流: "なが",
  一日: "いちにち",
  遊: "あそ",
  完成: "かんせい",
  同期: "どうき",
  絵: "え",
  方: "かた",
  月目: "げつめ",
  検索機能: "けんさくきのう",
};

/** その文字列に 出てくる 語だけの 読み辞書（長い語を 先に）。 */
function furiganaFor(...texts) {
  const blob = texts.flat(Infinity).filter(Boolean).join(" ");
  return Object.entries(FURIGANA)
    .filter(([term]) => blob.includes(term))
    .sort((a, b) => b[0].length - a[0].length);
}

/* ------------------------------------------------------------------ *
 * 絵の スロット — プロンプトは **台帳（scripts/images/）が 正**
 *
 * 移植した ときの 絵は `{ src, refs: [], status: "done" }` だけを 持って いて、
 * **どう 描いた 絵なのかが どこにも 無かった**。だから 作り直そうと すると、
 * 45枚ぶんの プロンプトを ゼロから 書き起こす ことに なる。
 *
 * かと いって プロンプトを ここに 直書きすると、**同じ 文が 台帳と ここの 2か所**に
 * できる。片方を 直した 日に もう片方が 古いまま 残り、先生が 管理画面で
 * 「少し 直して 作り直す」を 押した ときに **古い 指示で 再生成される**——
 * いちばん 気づけない 壊れ方に なる。
 *
 * そこで **台帳を 読んで、置き場（dest）で 引く**。教材データに 焼かれる プロンプトは
 * 台帳が 実際に 画像生成へ 渡すのと 同じ 組み立て（style ＋ scene ＋ noText ＋ negative）
 * なので、管理画面から 押しても ローカルで 流しても 同じ 絵に なる。
 * ------------------------------------------------------------------ */

/** 台帳を ぜんぶ 読み、`/img/...` → { prompt, refs } の 索引に する。 */
function loadImageLedgers() {
  const dir = join(ROOT, "scripts", "images");
  const index = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    let ledger;
    try {
      ledger = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      continue; // 台帳では ない JSON は 飛ばす
    }
    if (!Array.isArray(ledger.scenes)) continue;
    for (const scene of ledger.scenes) {
      if (!scene.dest || !scene.scene) continue;
      // `public/img/...` は 配信では `/img/...`
      const url = scene.dest.replace(/^public/, "");
      const parts = [ledger.style, scene.scene];
      if (Array.isArray(scene.text) && scene.text.length > 0) {
        parts.push(`The Japanese words in this picture are exactly: ${scene.text.join(" / ")}.`);
      }
      parts.push(ledger.noText, ledger.negative);
      index.set(url, {
        prompt: parts.filter(Boolean).join(" "),
        refs: (ledger.refs ?? []).map((r) => r.replace(/^public/, "")),
      });
    }
  }
  return index;
}

const IMAGE_LEDGER = loadImageLedgers();

/** 作り直しの 台帳に まだ 載って いない 絵（見つけたら 台帳に 足す）。 */
const imgWithoutPrompt = new Set();

/**
 * 絵の スロット（もう ある 絵）。台帳に あれば プロンプトと 参照画像も 付ける。
 *
 * `status` は `"done"` の まま に する。**同じ パスに 新しい 絵を 上書きすれば
 * 画面が 変わる**ので、絵が 届いた ときに JSON を 書き換えなくて よい。
 */
/**
 * まだ 絵の 無い スロット（画面は 点線わくを 出す）。プロンプトと 参照は **台帳が 正**。
 *
 * ここに プロンプトを 直書きして いた ころ、まんがの 9コマは ヘンディの 見た目を
 * 「light blue shirt, ID lanyard」と 書いて いて、人物カードの「紺の スーツ・ネクタイ・
 * ストラップ無し」と **食い違った まま 9コマ ぜんぶに 焼かれて いた**。
 * 台帳から 引けば、カードを 直した 日に ここも そろう。
 */
const emptySlot = (url) => {
  const found = IMAGE_LEDGER.get(url);
  if (!found) {
    imgWithoutPrompt.add(url);
    return { refs: [], status: "empty" };
  }
  return { prompt: found.prompt, refs: found.refs, status: "empty" };
};

const img = (src) => {
  const found = IMAGE_LEDGER.get(src);
  if (!found) {
    imgWithoutPrompt.add(src);
    return { src, refs: [], status: "done" };
  }
  return { src, prompt: found.prompt, refs: found.refs, status: "done" };
};

const write = (dir, id, data) => {
  const target = join(ROOT, "content", dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, `${id}.json`), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`content/${dir}/${id}.json`);
};

/**
 * スキットの 行に 音の 置き場を 配る。
 *
 * 置き場を **データの ほうで 決める**のは、音を 作り直した ときに
 * 教材の JSON を 書き換えなくて 済ませる ため（書き換える 作りだと、
 * この 生成を もう一度 走らせた 瞬間に audioUrl が 消える）。
 * ファイルそのものは `scripts/make_skit_audio.py` が この 置き場へ 作る。
 */
function withSkitAudio(skit) {
  return {
    ...skit,
    lines: skit.lines.map((line, i) => ({
      ...line,
      audioUrl: `/audio/skits/${skit.id}/l${String(i + 1).padStart(2, "0")}.mp3`,
    })),
  };
}

/** 教材1本ぶんの 文字を 集めて 読み辞書を 作る（配り忘れを 防ぐ）。 */
function withFurigana(content) {
  const texts = [];
  const walk = (node) => {
    if (typeof node === "string") texts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        // 絵・音の 置き場と id は 学習者が 読む 字では ない
        if (["src", "refs", "status", "id", "url", "audioUrl", "kind", "type", "ref"].includes(key))
          continue;
        walk(value);
      }
    }
  };
  walk(content);
  return { ...content, furigana: furiganaFor(texts) };
}

export { FURIGANA, furiganaFor, img, write, withFurigana, withSkitAudio };

/* ================================================================== *
 * 1. 報連相：報告
 * ================================================================== */

const HOUKOKU_IMG = "/img/hourensou/houkoku";

write(
  "articles",
  "houkoku_lecture",
  withFurigana({
    kind: "article",
    id: "houkoku_lecture",
    title: "報告の しかた",
    description: "日本の 会社の「報連相」を 知り、上司への 報告の しかたを 学びます。",
    blocks: [
      {
        kind: "hero",
        eyebrow: "🗣 報連相 1",
        title: "報告（ほうこく）",
        lead: "日本の 会社で 一番 大切なのは チームワークです。",
        note: "仕事が 終わった とき、問題が あった とき、必ず 上司に 言います。",
        image: img(`${HOUKOKU_IMG}/top.webp`),
      },
      {
        kind: "paragraph",
        text: "日本の 会社には、有名な ルールが あります。「報・連・相（ほう・れん・そう）」です。",
      },
      {
        kind: "cards",
        columns: 3,
        items: [
          {
            icon: "📣",
            label: "報",
            title: "報告 / Report",
            text: "上司の 指示の とおりに 動いたか、事実を 伝えます。",
          },
          {
            icon: "📨",
            label: "連",
            title: "連絡 / Contact",
            text: "予定や 情報を 伝えます。",
          },
          {
            icon: "🤝",
            label: "相",
            title: "相談 / Consult",
            text: "困った ときに、意見を 聞きます。",
          },
        ],
      },
      { kind: "image", ...img(`${HOUKOKU_IMG}/hourenso.webp`), caption: "報連相の 3つ" },
      { kind: "heading", level: 2, text: "なぜ 報告を するの？" },
      { kind: "image", ...img(`${HOUKOKU_IMG}/teamwork.webp`), caption: "チームワーク" },
      {
        kind: "paragraph",
        text: "答えは「チームワーク」です。仕事が 終わった とき、問題が ある とき、必ず 上司に 言います。これを「報告」と 言います。",
      },
      {
        kind: "callout",
        tone: "point",
        text: "上司は、あなたの 仕事が 進んで いるか、とても 心配して います。だから 報告は 大切です。",
      },
      { kind: "image", ...img(`${HOUKOKU_IMG}/houkoku.webp`), caption: "報告する 場面" },
      { kind: "heading", level: 2, text: "やって みよう：富田さんに 報告する" },
      {
        kind: "banner",
        tone: "goal",
        icon: "🎯",
        title: "場面",
        text: "上司（PM）の 富田さんは パソコンを 見て、忙しそうに 仕事を して います。あなたは PGで、「ログイン機能の テスト」が 終わりました。",
        badges: ["PM＝プロジェクトマネージャー", "PG＝プログラマー"],
      },
      {
        kind: "cards",
        columns: 3,
        items: [
          {
            label: "Q1",
            title: "最初に かける ことば",
            text: "あなたは 最初に どんな ことばを かけますか。",
            image: img(`${HOUKOKU_IMG}/q1.webp`),
          },
          {
            label: "Q2",
            title: "報告の しかた",
            text: "どんな ふうに 報告しますか。ことばを 考えて ください。",
            image: img(`${HOUKOKU_IMG}/q2.webp`),
          },
          {
            label: "Q3",
            title: "ほかの 報告",
            text: "ITの 仕事では ほかに どんな 報告が 必要だと 思いますか。",
            image: img(`${HOUKOKU_IMG}/q3.webp`),
          },
        ],
      },
      { kind: "heading", level: 2, text: "報告の コツ" },
      {
        kind: "steps",
        items: [
          "最初に 声を かける。忙しい 人に 話しかける ときは、「今、お時間 よろしいですか」と 許可を もらいます。",
          "結論から 伝える。何の 件か、どう なったかを 先に 言います。",
          "3つの パターンを 使い分ける。終わった 報告・困って いる 報告・気づいた ことの 報告です。",
        ],
        images: [
          img(`${HOUKOKU_IMG}/ask_time.webp`),
          img(`${HOUKOKU_IMG}/keypoint.webp`),
          img(`${HOUKOKU_IMG}/petterns.webp`),
        ],
      },
      { kind: "heading", level: 2, text: "会社の ポジション（階級）" },
      {
        kind: "image",
        ...img("/img/hourensou/listening/houkoku_hierarchy.webp"),
        caption: "会社の 階級",
      },
      {
        kind: "paragraph",
        text: "会社という チームには、いろいろな ポジション（階級）が あります。日本も カンボジアと 同じで、目上の 人を 大切に して、ていねいに 話します。",
      },
      {
        kind: "callout",
        tone: "care",
        text: "次の リスニングに 出て くる 藤木さんは「取締役」です。とても 上の ポジションで、お客様と 直接 話して います。",
      },
    ],
  }),
);

write(
  "skits",
  "houkoku_skit",
  withFurigana(
    withSkitAudio({
      kind: "skit",
      id: "houkoku_skit",
      title: "スキット：仕事が 終わった ときの 報告",
      description: "テストが 終わった ことを、上司の 富田さんに 報告します。",
      focus: "「今、お時間 よろしいですか」から 始める ところに 注目して、まねして みましょう。",
      cover: img(`${HOUKOKU_IMG}/skit.webp`),
      roles: [
        { id: "pg", name: "あなた", role: "PG（プログラマー）", accent: "leaf", side: "right" },
        { id: "pm", name: "富田さん", role: "PM（上司）", accent: "sky", side: "left" },
      ],
      lines: [
        {
          speaker: "pg",
          text: "富田さん、お疲れさまです。今、お時間 よろしいですか。",
          note: "いきなり 話を 始めないで、まず 許可を もらいます。",
        },
        { speaker: "pm", text: "はい、いいですよ。どう しましたか。" },
        {
          speaker: "pg",
          text: "ログイン機能の 件ですが、無事 テストが 終わりました。確認を お願いします。",
          note: "「何の 件か」→「どう なったか」の 順に 言います。",
        },
        { speaker: "pm", text: "わかりました。後で 見て おきますね。ありがとう ございます。" },
        { speaker: "pg", text: "よろしく お願いします。失礼します。" },
      ],
    }),
  ),
);

write(
  "listening",
  "houkoku_listening",
  withFurigana({
    kind: "listening",
    id: "houkoku_listening",
    title: "リスニング：悪い ニュースの 報告",
    description: "ヘンディさんが 藤木取締役に バグを 報告します。",
    focus: "ヘンディさんが 悪い ニュースを どう 伝えるかに 注目して 聞いて みましょう。",
    audioUrl: "/audio/hourensou/houkoku.wav",
    mode: "player",
    participants: [
      { id: "hendy", name: "ヘンディ", role: "プログラマー", accent: "leaf" },
      { id: "fujiki", name: "藤木", role: "取締役", accent: "sky" },
    ],
    script: [
      { speaker: "narration", text: "はじめに「報告」に ついて 話します。" },
      {
        speaker: "narration",
        text: "プログラミングで スケジュールに 遅れそうな とき、どう しますか。",
      },
      {
        speaker: "narration",
        text: "「怒られるかも しれない」と 思って、隠す ことは いけません。",
      },
      { speaker: "narration", text: "悪い ニュースほど、早く 言わなければ なりません。" },
      { speaker: "narration", text: "これは とても 大切です。では、会話を 聞いて みましょう。" },
      {
        speaker: "hendy",
        text: "藤木さん、お伝えしたい ことが あるんですが、今 少し お時間 よろしいでしょうか。",
      },
      { speaker: "fujiki", text: "はい、何ですか。" },
      {
        speaker: "hendy",
        text: "今 作って いる システムに 問題が あります。文字を 入力すると システムが 止まって しまうという バグが 見つかりました。おそらく 設定の ミスだと 思います。",
      },
      {
        speaker: "fujiki",
        text: "そうですか。直すのに、どのくらい 時間が かかりますか。来週の テストに 間に合いますか。",
      },
      {
        speaker: "hendy",
        text: "調べて みましたが、1日くらい かかりそうです。ですから、来週の テストを 1日 遅らせて いただけませんでしょうか。",
      },
      {
        speaker: "fujiki",
        text: "わかりました。テストが 遅れるのは 困りますが、テストの 途中で 止まるより いいです。正直に、早く 教えて くれて ありがとう ございます。予定を 変えますから、すぐに 直して ください。",
      },
      { speaker: "hendy", text: "ありがとう ございます。すぐに 始めます。" },
    ],
    keywords: ["報告", "問題", "バグ", "設定", "正直", "予定"],
    revealGoal: 30,
    check: { minLength: 2, maxMiss: 5, showScript: false, showTyping: true },
  }),
);

write(
  "quizsets",
  "houkoku_quiz",
  withFurigana({
    kind: "quizset",
    id: "houkoku_quiz",
    title: "報告の もんだい",
    description: "聞いた 会話を 思い出して、ことばを 入れたり えらんだり します。",
    nekumax: "listen",
    phase: "research",
    answerMode: "submit",
    passRate: 60,
    questions: [
      {
        id: "h_blank1",
        type: "wordbank",
        q: "はじめの 話を うめて ください。",
        lines: [
          "はじめに「___」に ついて 話します。",
          "プログラミングで ___ に 遅れそうな とき、どう しますか。",
          "「怒られるかも しれない」と 思って、___ ことは いけません。",
          "___ ほど、___ 言わなければ なりません。",
        ],
        blanks: ["報告", "スケジュール", "隠す", "悪い ニュース", "早く"],
        bank: [
          "報告",
          "スケジュール",
          "隠す",
          "悪い ニュース",
          "早く",
          "連絡",
          "メール",
          "休む",
          "良い ニュース",
          "ゆっくり",
        ],
        explain: "悪い ニュースほど 早く 言います。隠すと、あとで もっと 大きな 問題に なります。",
      },
      {
        id: "h_blank2",
        type: "wordbank",
        q: "ヘンディさんと 藤木さんの 会話を うめて ください。",
        lines: [
          "ヘンディ：藤木さん、今 少し ___ よろしいでしょうか。",
          "ヘンディ：今 作って いる システムに ___ が あります。",
          "ヘンディ：文字を 入力すると システムが 止まって しまうという ___ が 見つかりました。",
          "ヘンディ：おそらく ___ の ミスだと 思います。",
          "藤木：___ に、早く 教えて くれて ありがとう ございます。___ を 変えますから、すぐに 直して ください。",
        ],
        blanks: ["お時間", "問題", "バグ", "設定", "正直", "予定"],
        bank: [
          "お時間",
          "問題",
          "バグ",
          "設定",
          "正直",
          "予定",
          "お名前",
          "答え",
          "テスト",
          "会議",
        ],
        explain:
          "「今 少し お時間 よろしいでしょうか」は、忙しい 人に 話しかける ときの ことばです。",
      },
      {
        id: "h_q1",
        type: "choose",
        q: "システムには、どんな 問題（バグ）が ありますか。",
        options: [
          "文字を 入れると、パソコンが 壊れる",
          "文字を 入れると、システムが 止まる",
          "計算の 結果を まちがえる",
          "インターネットに つながらない",
        ],
        answer: 1,
        explain: "「文字を 入力すると システムが 止まって しまう」と 言って いました。",
      },
      {
        id: "h_q2",
        type: "choose",
        q: "ヘンディさんは、直すのに どのくらい 時間が かかると 言いましたか。",
        options: ["1時間くらい", "1日くらい", "1週間くらい", "1か月くらい"],
        answer: 1,
        explain: "「1日くらい かかりそうです」と 答えて いました。",
      },
      {
        id: "h_q3",
        type: "choose",
        q: "ヘンディさんは、藤木さんに 何を お願いしましたか。",
        options: [
          "一緒に バグを 直して ください",
          "テストを やめて ください",
          "テストを 1日 遅らせて ください",
          "新しい パソコンを 買って ください",
        ],
        answer: 2,
        explain:
          "直す 時間を 先に 調べてから、「テストを 1日 遅らせて いただけませんでしょうか」と お願いして います。",
      },
      {
        id: "h_q4",
        type: "choose",
        q: "どうして 藤木さんは「わかりました」と 言いましたか。",
        options: [
          "藤木さんは 時間が たくさん あるから",
          "テストは あまり 大切じゃ ないから",
          "自分で 直す ことが できるから",
          "テストの 途中で 止まるより いいから",
        ],
        answer: 3,
        explain:
          "早く 言えば、まわりが 予定を 変えられます。だから 悪い ニュースほど 早く 伝えます。",
      },
      {
        id: "h_q5",
        type: "multi",
        q: "はじめに、報告に ついて 何が 大切だと 言って いましたか。2つ えらんで ください。",
        options: [
          "悪い ニュースは 隠す こと",
          "悪い ニュースほど、早く 言う こと",
          "怒られると 思ったら、言わない こと",
          "隠しては いけない こと",
        ],
        answers: [1, 3],
        explain: "早く 言う ことと、隠さない こと。この 2つが 報告で 一番 大切な ことです。",
      },
    ],
  }),
);

write(
  "links",
  "houkoku_search",
  withFurigana({
    kind: "link",
    id: "houkoku_search",
    title: "調べ学習：日本の 階級",
    description: "日本と カンボジアの 会社の 階級を くらべて 調べます。",
    url: "/tools/hourensou/houkoku_search.html",
    view: "fullscreen",
    newTab: true,
    note: "答えを 書く シートは 新しい タブで 開きます。だから この ページも 新しい タブで 開きます。",
  }),
);

write("stages", "houkoku", {
  kind: "stage",
  id: "houkoku",
  order: 4,
  title: "報連相：報告",
  reading: "ほうれんそう ほうこく",
  description:
    "日本の 会社の「報連相」を 学びます。報告の しかたを 読んで、聞いて、声に 出して 練習して、最後は 報告クエストで 一日を 遊びます。",
  color: "sky",
  status: "published",
  area: {
    name: "きりの みね",
    reading: "きりの みね",
    image: "/img/scenes/area_misty_peaks.webp",
    note: "たかい いわやまと たきの あいだに、まちが あります。",
  },
  contents: [
    { ref: "houkoku_lecture", type: "article" },
    { ref: "houkoku_skit", type: "skit" },
    { ref: "houkoku_listening", type: "listening" },
    { ref: "houkoku_stamp", type: "link" },
    { ref: "houkoku_quiz", type: "quizset" },
    { ref: "houkoku_meeting", type: "meeting" },
    { ref: "houkoku_quest", type: "link" },
    { ref: "houkoku_search", type: "link" },
  ],
  wordStageIds: ["hourensou_houkoku"],
  furigana: furiganaFor([
    "報連相：報告",
    "日本の 会社の「報連相」を 学びます。報告の しかたを 読んで、聞いて、声に 出して 練習して、最後は 報告クエストで 一日を 遊びます。",
  ]),
});

/* ================================================================== *
 * 2. 報連相：連絡
 * ================================================================== */

const RENRAKU_IMG = "/img/hourensou/renraku";

write(
  "articles",
  "renraku_lecture",
  withFurigana({
    kind: "article",
    id: "renraku_lecture",
    title: "連絡の しかた",
    description: "チーム全体に 情報を 伝える「連絡」の コツを 学びます。",
    blocks: [
      {
        kind: "hero",
        eyebrow: "📨 報連相 2",
        title: "連絡（れんらく）",
        lead: "チームで はたらく ための 連絡。",
        note: "チャットツールを うまく 使う ことは、プログラミングと 同じくらい 大切です。",
        image: img(`${RENRAKU_IMG}/renraku.webp`),
      },
      {
        kind: "paragraph",
        text: "前の「報告」に つづいて、ここでは チーム全体に かかわる「連絡」を 学びます。日本の IT会社や リモートワークでは、SlackやDiscordなどの チャットツールを うまく 使えるかが 大切です。",
      },
      { kind: "heading", level: 2, text: "1. 連絡は「事実」だけで いい" },
      { kind: "image", ...img(`${RENRAKU_IMG}/s1.webp`), caption: "事実だけを 言う" },
      {
        kind: "paragraph",
        text: "連絡の 目的は、情報を 早く シェアする ことです。ここに 自分の 気持ち（つらい・焦って いる・がんばって いる）は いりません。まず 事実だけを 伝えて ください。",
      },
      {
        kind: "compare",
        before: {
          title: "❌ 気持ちを 伝える",
          lines: [
            "「すみません！ エラーが 出て しまって…すごく 焦って います。一生懸命 やって いるんですが、どう したら いいか わからなくて 困って います」",
            "リーダーの 心の 声：（気持ちは わかったけど、エラーの 内容は 何？ 助けられるの？ 無理なの？）",
          ],
        },
        after: {
          title: "⭕ 事実を 伝える",
          lines: [
            "「現在、ログイン画面で エラー500が 発生して います。原因は 調査中です。解決まで 30分ほど かかる 見込みです」",
            "リーダーの 反応：「OK！ じゃあ 他の メンバーを ヘルプに 入れるね」",
          ],
        },
      },
      {
        kind: "callout",
        tone: "point",
        text: "気持ちを 伝えると、相手は あなたを 慰める ことに 時間を 使って しまいます。事実だけを 伝えれば、相手は すぐに 解決の ために 動けます。",
      },
      { kind: "heading", level: 2, text: "2. 短い 時間で 伝わる コツ" },
      { kind: "image", ...img(`${RENRAKU_IMG}/s3.webp`), caption: "良い 連絡の コツ" },
      {
        kind: "cards",
        columns: 2,
        items: [
          {
            icon: "🔢",
            label: "①",
            title: "具体的な 数字を 使う",
            items: [
              "❌「もうすぐ 終わります」… 5分と 思う 人も、1時間と 思う 人も います。",
              "⭕「あと 15分で 終わります」… 相手は 次の 予定を 用意できます。",
            ],
          },
          {
            icon: "📌",
            label: "②",
            title: "結論から 書く",
            items: [
              "❌「昨日から A機能の テストを して いたんですが、バグが 見つかって、修正に 時間が かかって いて…」",
              "⭕「リリースが 1日 遅れます。（原因は A機能の バグ修正の ためです）」",
            ],
          },
        ],
      },
      {
        kind: "callout",
        tone: "care",
        text: "忙しい エンジニアは、通知の 最初の 1行しか 見て いない ことも あります。",
      },
      { kind: "heading", level: 2, text: "3. メールは【 】で 読みやすく する" },
      { kind: "image", ...img(`${RENRAKU_IMG}/s4.webp`), caption: "メールの 書きかた" },
      {
        kind: "paragraph",
        text: "社外の お客様や、他の 部署への メールなど、少し フォーマルな 連絡には【 】を 使いましょう。",
      },
      {
        kind: "list",
        items: [
          "件名に【重要】【相談】【共有】と 付けると、相手は「何から 読めば いいか」が すぐに わかります（優先順位を 決められます）。",
          "本文でも【原因】【対策】【期限】のように 見出しを 付けると、長い 文も 読んで もらえます。",
          "相手が 読みやすいように 工夫する。これも 大切な ITスキルの ひとつです。",
        ],
      },
      { kind: "heading", level: 2, text: "4. リアクション（スタンプ）は「読みました」の 合図" },
      { kind: "image", ...img(`${RENRAKU_IMG}/reaction.webp`), caption: "スタンプを 返す" },
      {
        kind: "paragraph",
        text: "メッセージを 見た とき、返信を 書く 時間が なくても スタンプ（リアクション）を しましょう。これは「読みました」という 合図です。リモートワークでは 相手の 顔が 見えません。リアクションが ないと、送った 人は「無視されて いるのかな」「届いて いないのかな」と 不安に なります。",
      },
      {
        kind: "cards",
        columns: 2,
        items: [
          {
            icon: "👀",
            title: "見ました",
            text: "一番 よく 使います。「内容は 確認したけど、今すぐ 返信は できない」ときに 便利です。",
          },
          {
            icon: "👍",
            title: "了解・OK",
            text: "内容に 同意した ときや、作業が 完了した ときに 使います。",
          },
          {
            icon: "🙏",
            title: "ありがとう・お願いします",
            text: "感謝を 伝える ときや、何かを 頼まれた ときに 使います。",
          },
          {
            icon: "🙇",
            title: "申しわけ ありません",
            text: "ミスを した ときや、目上の 人に 深く 感謝する ときに 使います。",
          },
        ],
      },
      {
        kind: "callout",
        tone: "care",
        text: "とても 親しい チームなら 面白い スタンプも 使いますが、最初の うちは ベーシックな ものが 無難です。",
      },
      { kind: "image", ...img(`${RENRAKU_IMG}/s2.webp`), caption: "ケーススタディ" },
    ],
  }),
);

write(
  "skits",
  "renraku_skit",
  withFurigana(
    withSkitAudio({
      kind: "skit",
      id: "renraku_skit",
      title: "スキット：トラブルの 連絡",
      description: "エラーが 出た ことを、事実だけで リーダーに 連絡します。",
      focus: "気持ちでは なく 事実と 数字で 言う ところに 注目して、まねして みましょう。",
      cover: img(`${RENRAKU_IMG}/s1.webp`),
      roles: [
        { id: "me", name: "あなた", role: "PG（プログラマー）", accent: "leaf", side: "right" },
        { id: "leader", name: "田中さん", role: "リーダー", accent: "sky", side: "left" },
      ],
      lines: [
        {
          speaker: "me",
          text: "田中さん、お疲れさまです。連絡が あります。",
          note: "はじめに「連絡が あります」と 言うと、相手は 聞く 用意が できます。",
        },
        {
          speaker: "me",
          text: "現在、ログイン画面で エラー500が 発生して います。原因は 調査中です。",
          note: "「焦って います」では なく、起きて いる 事実を 言います。",
        },
        {
          speaker: "me",
          text: "解決まで 30分ほど かかる 見込みです。",
          note: "「もうすぐ」では なく 数字で 言います。",
        },
        { speaker: "leader", text: "OK、ありがとう。他の メンバーを ヘルプに 入れるね。" },
        { speaker: "me", text: "ありがとう ございます。直ったら すぐに 連絡します。" },
      ],
    }),
  ),
);

write(
  "listening",
  "renraku_listening",
  withFurigana({
    kind: "listening",
    id: "renraku_listening",
    title: "リスニング：サーバーメンテナンスの 連絡",
    description: "検証環境が 使えなく なる ことを、チーム全体に 連絡します。",
    focus: "「いつ・何が・どう なるか・何を して ほしいか」の 4つに 注目して 聞いて みましょう。",
    audioUrl: "/audio/hourensou/renraku.wav",
    mode: "player",
    participants: [{ id: "hendy", name: "ヘンディ", role: "プログラマー", accent: "leaf" }],
    script: [
      { speaker: "narration", text: "次は 連絡に ついてです。" },
      {
        speaker: "narration",
        text: "連絡は、みんなに 正しい 情報を、短く 伝える ことです。",
      },
      {
        speaker: "narration",
        text: "今回の ポイントは 4つです。いつ・何が・どう なるか・何を して ほしいかを 言います。",
      },
      {
        speaker: "narration",
        text: "今日は、明日 18時から 19時まで、検証環境が 使えない ことを 連絡します。では、聞いて ください。",
      },
      { speaker: "hendy", text: "検証環境の サーバーメンテナンスの 連絡です。" },
      {
        speaker: "hendy",
        text: "明日の 18時から 19時まで、検証サーバーの アップデート作業を します。",
      },
      {
        speaker: "hendy",
        text: "作業中は 検証環境が 止まるので、画面や APIの 確認は できません。",
      },
      { speaker: "hendy", text: "お願いが 3つ あります。" },
      {
        speaker: "hendy",
        text: "1つめ。今 作って いる データは、18時に なる 前に、絶対に 保存して ください。",
      },
      {
        speaker: "hendy",
        text: "2つめ。検証環境で 動かす バッチ処理が あれば 止めて ください。",
      },
      {
        speaker: "hendy",
        text: "3つめ。18時以降は、検証環境を 使った 確認作業は 入れないで ください。",
      },
      {
        speaker: "hendy",
        text: "終わったら、チャットで 復旧の 連絡を します。よろしく お願いします。",
      },
      { speaker: "narration", text: "いかがでしたか。連絡は まず 知らせる ことです。" },
      {
        speaker: "narration",
        text: "でも、相手が 何を すれば いいかまで わかると、もっと 良い 連絡に なりますね。",
      },
    ],
    keywords: ["連絡", "検証環境", "保存", "作業中", "復旧"],
    revealGoal: 30,
    check: { minLength: 2, maxMiss: 5, showScript: false, showTyping: true },
  }),
);

write(
  "quizsets",
  "renraku_quiz",
  withFurigana({
    kind: "quizset",
    id: "renraku_quiz",
    title: "連絡の もんだい",
    description: "聞いた 連絡を 思い出して、ことばを 入れたり えらんだり します。",
    nekumax: "listen",
    phase: "research",
    answerMode: "submit",
    passRate: 60,
    questions: [
      {
        id: "r_blank1",
        type: "wordbank",
        q: "はじめの 話を うめて ください。",
        lines: [
          "連絡は、みんなに ___ 情報を、___ 伝える ことです。",
          "今回の ポイントは ___ です。",
          "いつ・何が・どう なるか・___ を 言います。",
        ],
        blanks: ["正しい", "短く", "4つ", "何を して ほしいか"],
        bank: [
          "正しい",
          "短く",
          "4つ",
          "何を して ほしいか",
          "新しい",
          "長く",
          "3つ",
          "だれが 悪いか",
        ],
        explain: "連絡は「正しい 情報を 短く」。そして「何を して ほしいか」まで 言います。",
      },
      {
        id: "r_blank2",
        type: "wordbank",
        q: "連絡の 本文を うめて ください。",
        lines: [
          "検証環境の ___ の 連絡です。",
          "明日の ___ から ___ まで、検証サーバーの ___ を します。",
          "___ は 検証環境が 止まるので、画面や APIの 確認は できません。",
        ],
        blanks: ["サーバーメンテナンス", "18時", "19時", "アップデート作業", "作業中"],
        bank: [
          "サーバーメンテナンス",
          "18時",
          "19時",
          "アップデート作業",
          "作業中",
          "テスト",
          "9時",
          "16時",
          "会議",
        ],
        explain: "「いつ・何が・どう なるか」が この 3行に そろって います。",
      },
      {
        id: "r_q1",
        type: "choose",
        q: "連絡とは、どのような ことですか。",
        options: [
          "みんなに 自分の 気持ちを 伝える こと",
          "みんなに 正しい 情報を 短く 伝える こと",
          "上司だけに 報告する こと",
          "長い メールを 書く こと",
        ],
        answer: 1,
        explain: "連絡の 目的は、情報を 早く シェアする ことです。気持ちは 入れません。",
      },
      {
        id: "r_q2",
        type: "choose",
        q: "検証環境が 使えなく なる 時間は いつですか。",
        options: [
          "明日の 17時から 18時",
          "明日の 18時から 19時",
          "今日の 18時から 19時",
          "明日の 19時から 20時",
        ],
        answer: 1,
        explain: "「明日の 18時から 19時まで」と 2回 言って います。",
      },
      {
        id: "r_q3",
        type: "choose",
        q: "作業中に できない ことは 何ですか。",
        options: [
          "チャットで 連絡する こと",
          "画面や APIの 確認",
          "コードを 書く こと",
          "メールを 送る こと",
        ],
        answer: 1,
        explain: "止まるのは 検証環境だけです。だから 画面や APIの 確認が できません。",
      },
      {
        id: "r_q4",
        type: "choose",
        q: "お願いは 全部で いくつ ありますか。",
        options: ["2つ", "3つ", "4つ", "5つ"],
        answer: 1,
        explain: "「お願いが 3つ あります」と 言ってから、1つずつ 番号を 付けて います。",
      },
      {
        id: "r_q5",
        type: "choose",
        q: "もっと 良い 連絡に する には、何が 大切ですか。",
        options: [
          "長く くわしく 説明する こと",
          "自分の 気持ちを 伝える こと",
          "相手が 何を すれば いいか わかるように する こと",
          "上司にだけ 報告する こと",
        ],
        answer: 2,
        explain: "知らせるだけでは 半分です。相手が 動ける ところまで 書くと 良い 連絡です。",
      },
    ],
  }),
);

write(
  "links",
  "renraku_slack",
  withFurigana({
    kind: "link",
    id: "renraku_slack",
    title: "Renraku Master（Slackの 練習）",
    description: "Slackのような 画面で、先輩からの 指示に 連絡を 返す 練習です。",
    url: "/tools/hourensou/renraku_slack.html",
    view: "fullscreen",
    note: "画面いっぱいで 開きます。メッセージを 書いて 送ると 点が 入ります。",
  }),
);

write(
  "links",
  "renraku_contact",
  withFurigana({
    kind: "link",
    id: "renraku_contact",
    title: "連絡文の 練習（メール・Slack）",
    description: "同僚の チャットを 読んで、正しい ビジネスメールに 整えます。",
    url: "/tools/hourensou/renraku_contact.html",
    view: "fullscreen",
    note: "メモの 文は 順番が バラバラです。必要な 情報だけを さがして 書きましょう。",
  }),
);

write("stages", "renraku", {
  kind: "stage",
  id: "renraku",
  order: 5,
  title: "報連相：連絡",
  reading: "ほうれんそう れんらく",
  description:
    "チーム全体に 情報を 伝える「連絡」を 学びます。まんがで 始めて、事実だけを 短く 伝える 練習を、スキットと Slack風の 画面で します。",
  color: "leaf",
  status: "published",
  area: {
    name: "ふねの うみ",
    reading: "ふねの うみ",
    image: "/img/scenes/area3_vietnam.webp",
    note: "ちいさな しまが たくさん。ふねが しらせを はこびます。",
  },
  contents: [
    { ref: "renraku_manga", type: "manga" },
    { ref: "renraku_lecture", type: "article" },
    { ref: "renraku_skit", type: "skit" },
    { ref: "renraku_listening", type: "listening" },
    { ref: "renraku_quiz", type: "quizset" },
    { ref: "renraku_builder", type: "link" },
    { ref: "renraku_slack", type: "link" },
    { ref: "renraku_contact", type: "link" },
  ],
  wordStageIds: ["hourensou_renraku_kihon", "hourensou_renraku_ouyou"],
  furigana: furiganaFor([
    "報連相：連絡",
    "チーム全体に 情報を 伝える「連絡」を 学びます。まんがで 始めて、事実だけを 短く 伝える 練習を、スキットと Slack風の 画面で します。",
  ]),
});

/* ================================================================== *
 * 3. 報連相：相談
 * ================================================================== */

const SOUDAN_IMG = "/img/hourensou/soudan";
const SOUDAN_VIDEO = "/video/hourensou";

write(
  "articles",
  "soudan_lecture",
  withFurigana({
    kind: "article",
    id: "soudan_lecture",
    title: "相談の しかた",
    description: "一人で 悩まないで、上手に 相談する 3つの ポイントを 学びます。",
    blocks: [
      {
        kind: "hero",
        eyebrow: "🤝 報連相 3",
        title: "相談（そうだん）",
        lead: "一人で 悩まないで、チームで 答えを 見つけます。",
        note: "相談は 報連相の 中で 一番 難しいところです。",
        image: img(`${SOUDAN_IMG}/slide1.webp`),
      },
      {
        kind: "paragraph",
        text: "みなさんは、プログラムを 書いて いて エラーが 出た とき、どう しますか。",
      },
      {
        kind: "list",
        items: [
          "一人で ずっと 考えますか。",
          "友だちに 聞きますか。",
          "インターネットで 調べますか。",
        ],
      },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide2.webp`) },
      {
        kind: "paragraph",
        text: "日本の IT会社では、自分だけで わからない ことは、上司や 同僚に「相談」します。",
      },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide3.webp`) },
      {
        kind: "callout",
        tone: "point",
        text: "ITの 仕事は チームで します。一人で ずっと 悩んで いると、チーム全体の 仕事が 遅れて しまいます。人と 一緒に 考えると、もっと 良い 答えが 見つかります。",
      },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide4.webp`) },
      { kind: "heading", level: 2, text: "ITで 相談する ばめん" },
      {
        kind: "cards",
        columns: 2,
        items: [
          {
            icon: "🐞",
            title: "エラーの 原因が わからない",
            text: "自分の パソコンでは 動くのに、テスト環境に 上げると エラーに なる とき。",
          },
          {
            icon: "🛠",
            title: "使う 技術に 迷った",
            text: "AとBの ライブラリ、どちらを 使うか 自分だけで 決められない とき。",
          },
          {
            icon: "📄",
            title: "設計書に 書いて いない ことを 見つけた",
            text: "お金の 計算で、小さい 数を 切るか 上げるか ルールが ない とき。",
          },
          {
            icon: "🐢",
            title: "コードの 書きかたに 悩んだ",
            text: "動いたけれど 処理が とても 遅いので、もっと 良い 書きかたを 聞きたい とき。",
          },
          {
            icon: "🌿",
            title: "Gitで トラブルが 起きた",
            text: "他の 人の コードと コンフリクトして、正しく 直せるか 不安な とき。",
          },
          {
            icon: "⚙️",
            title: "環境構築が うまく いかない",
            text: "開発ツールや Dockerの 設定で エラーが 出て、説明の とおりでも 進まない とき。",
          },
          {
            icon: "🎨",
            title: "デザインが 決まって いない",
            text: "パソコンの デザインしか なくて、スマホで 見ると 使いにくい とき。",
          },
          {
            icon: "🧪",
            title: "テストの やりかたが わからない",
            text: "どんな データを 作って テストすれば いいか、アイデアが ほしい とき。",
          },
        ],
      },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide5-1.webp`) },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide5-2.webp`) },
      { kind: "heading", level: 2, text: "相談の テクニック" },
      { kind: "heading", level: 3, text: "ポイント①：30分ルール" },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide6.webp`) },
      {
        kind: "cards",
        columns: 3,
        items: [
          {
            icon: "❌",
            label: "A",
            title: "一人で ずっと 悩んで、3日 あとに 相談する",
            text: "仕事が 予定より 遅れて しまいます。",
          },
          {
            icon: "⭕",
            label: "B",
            title: "30分（または 15分）考えて、それでも わからなければ 相談する",
            text: "一番 いい タイミングです。自分で 考える 力が つくし、仕事も 遅れません。",
          },
          {
            icon: "❌",
            label: "C",
            title: "何も 考えないで、すぐに 相談する",
            text: "自分で 考える ことも 大切です。先輩の 時間も 少なく なって しまいます。",
          },
        ],
      },
      /*
       * 3つの えらび方を **動画で 見せる**（旧アプリの a/b/c.mp4）。
       * カードの 字は 要点で、動画は その 場面そのもの。1本 10〜15秒。
       */
      {
        kind: "video",
        src: `${SOUDAN_VIDEO}/soudan_30min_a.mp4`,
        poster: `${SOUDAN_IMG}/poster_30min_a.webp`,
        caption: "一人で ずっと 悩んで、3日 あとに 相談する 場面",
        note: "A：一人で ずっと 悩んで、3日 あとに 相談する。仕事が 予定より 遅れて しまいます。",
      },
      {
        kind: "video",
        src: `${SOUDAN_VIDEO}/soudan_30min_b.mp4`,
        poster: `${SOUDAN_IMG}/poster_30min_b.webp`,
        caption: "30分 考えてから 相談する 場面",
        note: "B：30分（または 15分）考えて、それでも わからなければ 相談する。一番 いい タイミングです。",
      },
      {
        kind: "video",
        src: `${SOUDAN_VIDEO}/soudan_30min_c.mp4`,
        poster: `${SOUDAN_IMG}/poster_30min_c.webp`,
        caption: "何も 考えないで すぐに 相談する 場面",
        note: "C：何も 考えないで、すぐに 相談する。先輩の 時間も 少なく なって しまいます。",
      },
      {
        kind: "banner",
        tone: "message",
        icon: "⏱",
        title: "まとめ",
        text: "まずは 自分で 調べます。でも 30分（または 15分）調べて わからなかったら、一人で 悩まないで 相談しましょう。",
        badges: ["自分で 調べる", "時間を 決める", "相談する"],
      },
      { kind: "heading", level: 3, text: "ポイント②：相談する 前に「何を したか」を 伝える" },
      {
        kind: "paragraph",
        text: "ただ「わかりません」と 言うのでは、相手も 助けにくいです。「◯◯を 調べました。でも わかりません」と、自分が した ことを 具体的に 説明しましょう。",
      },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide7.webp`) },
      { kind: "heading", level: 3, text: "ポイント③：自分なりの アイデアを 持つ" },
      {
        kind: "paragraph",
        text: "「どう 作るか」を 決める ばめん（ライブラリを えらぶ とき、デザインに 迷った とき）では、ただ 聞くだけで なく 自分の 意見も 伝えます。「私は ◯◯だと 思うのですが、どうでしょうか」と 聞くと、とても 良い 相談に なります。",
      },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide8.webp`) },
      {
        kind: "banner",
        tone: "quote",
        icon: "🌟",
        title: "相談で よく 使う 日本語",
        text: "この 4つを 覚えると、相談を 始められます。",
        badges: [
          "◯◯さん、今、お時間 よろしいでしょうか。",
          "◯◯に ついて、相談が あります。",
          "自分で ◯◯を 調べましたが、わかりませんでした。教えて いただけませんか。",
          "私は ◯◯が いいと 思うのですが、いかがでしょうか。",
        ],
      },
      { kind: "image", ...img(`${SOUDAN_IMG}/slide9.webp`) },
      { kind: "heading", level: 2, text: "やって みよう（ロールプレイ）" },
      {
        kind: "paragraph",
        text: "学んだ ことばを 使って、2人1組で 相談の 練習を しましょう。まず お手本の 動画を 見ます。",
      },
      {
        kind: "video",
        src: `${SOUDAN_VIDEO}/soudan_skit.mp4`,
        poster: `${SOUDAN_IMG}/slide10.webp`,
        caption: "ソクさんが 奥田先輩に 相談する お手本",
        note: "この あとの スキットで、同じ 会話を 1行ずつ 聞いて まねします。",
      },
    ],
  }),
);

write(
  "skits",
  "soudan_skit",
  withFurigana(
    withSkitAudio({
      kind: "skit",
      id: "soudan_skit",
      title: "スキット：先輩に 相談する",
      description: "検索の バグに ついて、奥田先輩に 相談します。",
      focus: "「自分が 何を 調べたか」を 先に 言う ところに 注目して、まねして みましょう。",
      cover: img(`${SOUDAN_IMG}/slide10.webp`),
      roles: [
        { id: "sok", name: "ソクさん", role: "PG（プログラマー）", accent: "leaf", side: "right" },
        { id: "okuda", name: "奥田先輩", role: "先輩", accent: "sky", side: "left" },
      ],
      lines: [
        {
          speaker: "sok",
          text: "奥田さん、今 少し よろしいですか。商品検索の 処理で 相談です。",
          note: "まず 許可を もらい、何の 話かを 先に 言います。",
        },
        { speaker: "okuda", text: "はい、どう しました。" },
        {
          speaker: "sok",
          text: "検索結果が 0件に なります。SQLが 正しい ことは 確認しました。他の 原因が わからないので、コードを 見て いただけませんか。",
          note: "「調べた こと」→「わからない こと」→「お願い」の 順です。",
        },
        {
          speaker: "okuda",
          text: "なるほど。SQLが OKなら、検索ワードの データ型が 怪しいですね。変数を 見て みましょう。",
        },
        { speaker: "sok", text: "ありがとう ございます。よろしく お願いします。" },
      ],
    }),
  ),
);

write(
  "listening",
  "soudan_listening",
  withFurigana({
    kind: "listening",
    id: "soudan_listening",
    title: "リスニング：技術を えらぶ 相談",
    description: "ヘンディさんが ログイン機能の 作りかたを 藤木取締役に 相談します。",
    focus: "ヘンディさんが 自分の 意見を 先に 言う ところに 注目して 聞いて みましょう。",
    audioUrl: "/audio/hourensou/soudan.wav",
    mode: "player",
    participants: [
      { id: "hendy", name: "ヘンディ", role: "プログラマー", accent: "leaf" },
      { id: "fujiki", name: "藤木", role: "取締役", accent: "sky" },
    ],
    script: [
      { speaker: "narration", text: "最後は 相談です。ここが 一番 難しいです。" },
      {
        speaker: "narration",
        text: "ただ「どう すれば いいですか」と 聞くだけでは いけません。",
      },
      {
        speaker: "narration",
        text: "自分は こう したい、という 自分の 意見を 持ってから 聞くのが ポイントです。",
      },
      {
        speaker: "narration",
        text: "ログインの 作りかたに ついて 相談する ばめんを 聞いて みましょう。",
      },
      {
        speaker: "hendy",
        text: "藤木さん、今 少し 相談しても いいですか。新しく 作る ログインの 機能に ついてです。私は Firebaseを 使いたいと 思って います。",
      },
      { speaker: "fujiki", text: "Firebaseですか。どうしてですか。" },
      {
        speaker: "hendy",
        text: "今回は フロントエンドに Reactを 使います。Firebaseは Reactと 一緒に 使うのが とても 簡単です。Googleログインの 機能も すぐに 作れますから、開発が 早く 終わると 思います。",
      },
      {
        speaker: "fujiki",
        text: "なるほど。でも、今回は バックエンドに Laravelを 使いますね。データベースも 使いますから、ユーザーの データは Laravelで 他の データと 一緒に 管理した ほうが いいです。",
      },
      {
        speaker: "hendy",
        text: "Firebaseの ほうが 早く 作れると 思いましたが、データの 管理が 大変に なりますか。",
      },
      {
        speaker: "fujiki",
        text: "そうですね。データの 管理を 考えるなら、Laravel Breezeが 一番 いいです。Googleログインを 使いたいなら、Laravel Socialiteという ツールを 使う 方法も ありますよ。",
      },
      {
        speaker: "hendy",
        text: "わかりました。データの 管理を 考えて、Laravel Breezeと Socialiteを 使います。相談して よかったです。ありがとう ございます。",
      },
      {
        speaker: "narration",
        text: "いかがでしたか。自分の 意見が 通らない ことも あります。",
      },
      {
        speaker: "narration",
        text: "でも、相談する ことで、一人で 考えるより もっと 良い 答えを 見つける ことが できます。これが ITの 現場で 大切な 相談ですよ。",
      },
    ],
    keywords: ["相談", "意見", "簡単", "管理", "方法"],
    revealGoal: 30,
    check: { minLength: 2, maxMiss: 5, showScript: false, showTyping: true },
  }),
);

write(
  "quizsets",
  "soudan_quiz",
  withFurigana({
    kind: "quizset",
    id: "soudan_quiz",
    title: "相談の もんだい",
    description: "聞いた 相談を 思い出して、ことばを 入れたり えらんだり します。",
    nekumax: "listen",
    phase: "research",
    answerMode: "submit",
    passRate: 60,
    questions: [
      {
        id: "s_blank1",
        type: "wordbank",
        q: "はじめの 話を うめて ください。",
        lines: [
          "最後は 相談です。ここが 一番 ___ です。",
          "ただ「___ いいですか」と 聞くだけでは いけません。",
          "___ を 持ってから 聞くのが ポイントです。",
        ],
        blanks: ["難しい", "どう すれば", "自分の 意見"],
        bank: ["難しい", "どう すれば", "自分の 意見", "簡単", "いつ すれば", "上司の 意見"],
        explain: "相談は「わかりません」で 終わらせないで、自分の 意見を 持ってから 聞きます。",
      },
      {
        id: "s_blank2",
        type: "wordbank",
        q: "ヘンディさんと 藤木さんの 相談を うめて ください。",
        lines: [
          "ヘンディ：私は ___ を 使いたいと 思って います。",
          "ヘンディ：今回は フロントエンドに ___ を 使います。",
          "藤木：でも、今回は バックエンドに ___ を 使いますね。",
          "藤木：ユーザーの データは Laravelで 他の データと 一緒に ___ した ほうが いいです。",
        ],
        blanks: ["Firebase", "React", "Laravel", "管理"],
        bank: ["Firebase", "React", "Laravel", "管理", "Docker", "Vue", "保存"],
        explain: "ヘンディさんは Firebase、藤木さんは Laravel。理由を 出しあって 決めて います。",
      },
      {
        id: "s_q1",
        type: "choose",
        q: "相談を する ときに 大切な ことは 何ですか。",
        options: [
          "ただ「どう すれば いいですか」と 聞く こと",
          "上司の 意見だけに したがう こと",
          "自分の 意見を 持ってから 聞く こと",
          "一人で 全部 決める こと",
        ],
        answer: 2,
        explain: "自分の 意見が あると、相手は 理由を 話せます。だから 話が 前に 進みます。",
      },
      {
        id: "s_q2",
        type: "choose",
        q: "ヘンディさんが 最初に 使いたいと 思ったのは 何ですか。",
        options: ["Laravel", "Firebase", "Breeze", "Socialite"],
        answer: 1,
        explain: "Reactと 一緒に 使うのが 簡単だから、と 理由も 言って いました。",
      },
      {
        id: "s_q3",
        type: "choose",
        q: "藤木さんが Firebaseでは なく Laravelを すすめた 理由は 何ですか。",
        options: [
          "Firebaseは 難しいから",
          "開発が 早いから",
          "データを 一緒に Laravelで 管理した ほうが いいから",
          "Reactは Laravelと 合わないから",
        ],
        answer: 2,
        explain: "早く 作れるかより、あとで データを 管理しやすいかを 見て います。",
      },
      {
        id: "s_q4",
        type: "choose",
        q: "ヘンディさんが 最後に えらんだのは 何ですか。",
        options: [
          "Firebase と React",
          "Laravel と Breeze と Socialite",
          "Firebase と Socialite",
          "React と Breeze",
        ],
        answer: 1,
        explain: "自分の 意見は 通りませんでしたが、相談して もっと 良い 答えに なりました。",
      },
      {
        id: "s_q5",
        type: "choose",
        q: "相談する ことで 何が できますか。",
        options: [
          "自分の 意見を 必ず 通す こと",
          "上司に 全部 決めて もらう こと",
          "一人で 考えるより もっと 良い 答えを 見つける こと",
          "仕事を 早く 終わらせる こと",
        ],
        answer: 2,
        explain: "相談の 目的は、勝つ ことでは なく もっと 良い 答えを 見つける ことです。",
      },
      {
        id: "s_k1",
        type: "keyword",
        q: "ヘンディさんが Firebaseを 使いたい 理由の ひとつは、Reactと 一緒に 使うのが とても ◯◯だから です。◯◯に 入る ことばを 書いて ください。",
        answer: "簡単",
        accept: ["かんたん"],
        placeholder: "ひらがなでも かけます",
        explain: "「Reactと 一緒に 使うのが とても 簡単です」と 言って いました。",
      },
      {
        id: "s_k2",
        type: "keyword",
        q: "Googleログインを 使いたい とき、藤木さんが 教えて くれた ツールの 名前は 何ですか。",
        answer: "Socialite",
        accept: ["socialite", "ソーシャライト", "そーしゃらいと"],
        placeholder: "ツールの 名前",
        explain: "「Laravel Socialiteという ツールを 使う 方法も ありますよ」と 言って いました。",
      },
      {
        id: "s_k3",
        type: "keyword",
        q: "ヘンディさんが Firebaseを 使いたかった 理由は、開発が ◯◯ 終わるから です。◯◯に 入る ことばを 書いて ください。",
        answer: "早く",
        accept: ["はやく", "早い", "はやい"],
        placeholder: "ひらがなでも かけます",
        explain: "「開発が 早く 終わると 思います」と 言って いました。",
      },
    ],
  }),
);

write("stages", "soudan", {
  kind: "stage",
  id: "soudan",
  order: 6,
  title: "報連相：相談",
  reading: "ほうれんそう そうだん",
  description:
    "一人で 悩まないで 相談する しかたを 学びます。30分ルールと、自分の 意見を 持ってから 聞く 練習を、クイズと ミーティングで します。",
  color: "coral",
  status: "published",
  area: {
    name: "さかみちの まち",
    reading: "さかみちの まち",
    image: "/img/scenes/area5_taiwan.webp",
    note: "さかの うえまで いえが つづく まちです。",
  },
  contents: [
    { ref: "soudan_lecture", type: "article" },
    { ref: "soudan_skit", type: "skit" },
    { ref: "soudan_listening", type: "listening" },
    { ref: "soudan_quiz", type: "quizset" },
    { ref: "soudan_kehai", type: "quizset" },
    { ref: "soudan_meeting", type: "meeting" },
  ],
  wordStageIds: ["hourensou_soudan"],
  furigana: furiganaFor([
    "報連相：相談",
    "一人で 悩まないで 相談する しかたを 学びます。30分ルールと、自分の 意見を 持ってから 聞く 練習を、クイズと ミーティングで します。",
  ]),
});

/* ================================================================== *
 * 4. 追加教材 —「もっと 楽しく」企画（2026-08-29）
 *
 * 選定は ユーザー確認済み: A1 報告クエスト・A2 報告ミーティング・
 * A3 済スタンプ・B1 まんが・B2 れんらくビルダー・C1 相談ミーティング・
 * C2 場面クイズ・D1 ことば移植（B3 スタンプクイズは 見送り）。
 *
 * 絵（まんがの コマ・場面クイズの 絵）は この コンテナでは 生成できない。
 * **プロンプトを スロットに 保存して 空のまま 置き**（画面は 点線わくで 成立する）、
 * ローカルの 生成セッションへ 引き継ぐ（docs/teaching/hourensou_要る絵の一覧.md）。
 * ミーティングの 作り置き音声も 同じく 後追い（質問の audioUrl は 空に して おく）。
 * ================================================================== */

/* ------------------------------------------------------------------ *
 * A2. 報告ミーティング — スキットの 会話を 自分の 声で
 * ------------------------------------------------------------------ */

write(
  "meetings",
  "houkoku_meeting",
  withFurigana({
    kind: "meeting",
    mode: "ask",
    id: "houkoku_meeting",
    title: "ミーティング：報告の 練習",
    description:
      "ヘンディさんが 上司の 役に なります。完了の 報告と、悪い ニュースの 報告を、自分の ことばで 言って みます。",
    focus:
      "スキットと リスニングで 見た 報告を、こんどは 自分の 声で 出します。ヘンディさんが 上司の 役です。結論から 言えたら、きょうの ゴールです。",
    host: { id: "hendy", name: "ヘンディ", role: "先輩", accent: "sky" },
    persona: [
      "あなたは ネクストメイクの ヘンディです。カンボジアの 学生と、報告の 練習を します。",
      "きょうは あなたが 上司の 役です。学生は、テストが 終わった 報告と、バグが 見つかった 報告を、声に 出して 練習します。",
      "やさしい 日本語で、みじかい 文で、ですます形で 話します。",
      "学生を 否定する 言い方は しません。できた ことを 先に 言います。",
      "学生の 日本語は 直しません。わからなかったら「もう一度 お願いします」と 聞き返します。",
      "結論から 言えたら、そこを 具体的に ほめます。れい:「先に 結論が 聞けたので、すぐ 分かりました。」",
      "数字（30分・1日 など）が 言えたら、そこも ほめます。",
      "あなたから 学生に 新しい 質問を しては いけません。つぎに 何を 聞くかは アプリが 決めます。",
      "",
      "【あなた自身の こと（聞かれたら 答える）】",
      "出身は インドネシアの メダンです。2018年に 日本へ 来ました。",
      "いまは エンジニアとして、お客様の システムを 作って います。",
    ].join("\n"),
    judgePrompt: [
      "学生は カンボジアの IT専攻の 学生（日本語 N5〜N4）です。スキットと リスニングで 報告の 形を 見てから 来ました。",
      "学生の 日本語を 見て、つぎの 3つを 短く 返して ください。",
      "1) できた ところを 1つ ほめる。2) 直すと もっと よく なる ところを 1つだけ 言う。3) その 言い方の れいを 1つ 見せる。",
      "文法の 名前は 使わないで、言い方の れいで 見せて ください。",
      "",
      "## かみ合って いるか の 見かた（onTopic）",
      "聞かれた ことの 中身が 1つでも 入って いれば onTopic に します。ぜんぶ 言えて いなくても かまいません。",
      "- 声かけ … 「お時間」「よろしいですか」の ように、相手の 時間を 聞く ことばが あれば onTopic。",
      "- 完了の 報告 … 何の 件かと、終わった こと。どちらかが 言えたら onTopic。",
      "- お願い … 「確認」「お願いします」の どちらかが あれば onTopic。",
      "- 悪い ニュースの 切り出し … 「お伝えしたい ことが あります」の ような ことばが あれば onTopic。",
      "- 事実 … バグ・エラー・止まる の どれかが 入って いれば onTopic。",
      "- 見込みと お願い … 数字か、「遅らせて ください」の ような お願い。どちらかが あれば onTopic。",
    ].join("\n"),
    questions: [
      {
        id: "q1_koe",
        ask: "きょうは 報告の 練習です。わたしが 上司の 役を します。あなたの「ログイン機能の テスト」が 終わりました。まず、わたしに 声を かけて ください。",
        hint: "「お疲れさまです。今、お時間 よろしいですか。」",
        keywords: ["お時間", "時間", "よろしい", "お疲れ", "おつかれ"],
        echo: "はい、いいですよ。どう しましたか。",
      },
      {
        id: "q2_ken",
        ask: "何の 件か、どう なったか。結論から 教えて ください。",
        hint: "「ログイン機能の 件ですが、無事 テストが 終わりました。」",
        keywords: ["件", "終わり", "おわり", "完了"],
        echo: "◯◯ですね。先に 結論が 聞けたので、すぐ 分かりました。",
      },
      {
        id: "q3_onegai",
        ask: "報告の あと、わたしに して ほしい ことは ありますか。",
        hint: "「確認を お願いします。」",
        keywords: ["確認", "お願い", "おねがい"],
        echo: "わかりました。あとで 見て おきますね。",
      },
      {
        id: "q4_kiridashi",
        ask: "つぎは むずかしい ほうです。こんどは、あなたの システムに バグが 見つかりました。悪い ニュースを、わたしに 切り出して ください。",
        hint: "「お伝えしたい ことが あります。今 少し お時間 よろしいでしょうか。」",
        keywords: ["お伝え", "おつたえ", "お時間", "あります"],
        echo: "はい、何ですか。",
      },
      {
        id: "q5_jijitsu",
        ask: "何が 起きて いますか。事実を 教えて ください。",
        hint: "「文字を 入力すると、システムが 止まって しまう バグが 見つかりました。」",
        keywords: ["バグ", "エラー", "止ま", "とま", "見つかり"],
        echo: "◯◯、ですね。事実が 先に 分かると、こちらも すぐ 動けます。",
      },
      {
        id: "q6_mikomi",
        ask: "直すのに どのくらい かかりそうですか。見込みと、お願いを どうぞ。",
        hint: "「1日くらい かかりそうです。テストを 1日 遅らせて いただけませんか。」",
        keywords: ["日", "時間", "かかり", "遅らせ", "おくらせ"],
        echo: "わかりました。早く 言って くれたので、予定を 変えられます。ありがとう ございます。",
      },
    ],
    closing:
      "きょうの 報告、どちらも とどきました。良い ニュースは 結論から。悪い ニュースは 早く。この 2つが できれば、現場で もう 使えます。",
    affection: {
      maxHearts: 6,
      threshold: 5,
      reward:
        "わたしの はじめての 報告の 話です。日本へ 来て 1か月目、わたしは バグを 3日 隠しました。自分で 直せると 思って いたからです。でも 直せなくて、テストの 日に システムが 止まりました。あの 日から、わたしは 悪い ニュースを いちばん 先に 言う ことに しました。すると、みんなが わたしを 手伝って くれるように なりました。悪い ニュースを 早く 言う 人は、しんらいされる 人に なりますよ。",
    },
  }),
);

/* ------------------------------------------------------------------ *
 * C1. 相談ミーティング — 相談の 型を 自分の 声で 通す
 * ------------------------------------------------------------------ */

write(
  "meetings",
  "soudan_meeting",
  withFurigana({
    kind: "meeting",
    mode: "ask",
    id: "soudan_meeting",
    title: "ミーティング：相談の 練習",
    description:
      "ヘンディさんが 先輩の 役に なります。困って いる ことを、相談の 型で 話す 練習です。",
    focus:
      "相談の 型（お時間 → 事実 → 調べた こと → 自分の 意見 → お礼）を、自分の 声で 通します。自分の 意見が 言えたら、きょうの ゴールです。",
    host: { id: "hendy", name: "ヘンディ", role: "先輩", accent: "sky" },
    persona: [
      "あなたは ネクストメイクの ヘンディです。カンボジアの 学生と、相談の 練習を します。",
      "きょうは あなたが 先輩の 役です。学生は「検索機能の バグで 30分 悩んで いる」役で、あなたに 相談します。",
      "やさしい 日本語で、みじかい 文で、ですます形で 話します。",
      "学生を 否定する 言い方は しません。できた ことを 先に 言います。",
      "学生の 日本語は 直しません。わからなかったら「もう一度 お願いします」と 聞き返します。",
      "学生が 自分の 意見（「◯◯だと 思います」）を 言えたら、そこを 特に ほめます。",
      "学生が 調べた ことを 言えたら、「先に 調べて くれて 助かります」と 伝えます。",
      "あなたから 学生に 新しい 質問を しては いけません。つぎに 何を 聞くかは アプリが 決めます。",
      "",
      "【あなた自身の こと（聞かれたら 答える）】",
      "出身は インドネシアの メダンです。2018年に 日本へ 来ました。",
      "いまは エンジニアとして、お客様の システムを 作って います。",
    ].join("\n"),
    judgePrompt: [
      "学生は カンボジアの IT専攻の 学生（日本語 N5〜N4）です。相談の 型（お時間 → 事実 → 調べた こと → 意見 → お礼）を 学んでから 来ました。",
      "学生の 日本語を 見て、つぎの 3つを 短く 返して ください。",
      "1) できた ところを 1つ ほめる。2) 直すと もっと よく なる ところを 1つだけ 言う。3) その 言い方の れいを 1つ 見せる。",
      "文法の 名前は 使わないで、言い方の れいで 見せて ください。",
      "",
      "## かみ合って いるか の 見かた（onTopic）",
      "聞かれた ことの 中身が 1つでも 入って いれば onTopic に します。ぜんぶ 言えて いなくても かまいません。",
      "- 声かけ … 「お時間」「相談が あります」の どちらかが あれば onTopic。",
      "- 事実 … 検索・0件・結果 の どれかが 入って いれば onTopic。",
      "- 調べた こと … SQL・確認した・調べた の どれかが あれば onTopic。",
      "- 意見 … 「思います」「思うのですが」の 形が あれば onTopic。この 形が 出たら 特に ほめて ください。",
      "- お礼 … 「ありがとう」「助かりました」の どちらかが あれば onTopic。",
    ].join("\n"),
    questions: [
      {
        id: "q1_koe",
        ask: "きょうは 相談の 練習です。わたしが 先輩の 役を します。あなたは 検索機能の バグで、もう 30分 悩んで います。まず、わたしに 声を かけて ください。",
        hint: "「今、お時間 よろしいですか。検索の 処理で 相談が あります。」",
        keywords: ["お時間", "相談", "よろしい"],
        echo: "はい、どう しました。",
      },
      {
        id: "q2_jijitsu",
        ask: "何が 起きて いますか。",
        hint: "「検索すると、結果が 0件に なります。」",
        keywords: ["検索", "0件", "0", "ゼロ", "結果"],
        echo: "◯◯、ですね。事実から 話せて いますよ。",
      },
      {
        id: "q3_shirabeta",
        ask: "自分で 調べた ことは ありますか。",
        hint: "「SQLが 正しい ことは 確認しました。」",
        keywords: ["SQL", "確認", "調べ", "しらべ"],
        echo: "先に 調べてから 来て くれたんですね。それが いちばん 助かります。",
      },
      {
        id: "q4_iken",
        ask: "あなたは、原因は 何だと 思いますか。自分の 意見を 聞かせて ください。",
        hint: "「私は、データの 型が 原因だと 思うのですが、いかがでしょうか。」",
        keywords: ["思います", "思うのですが", "型", "データ", "原因"],
        echo: "なるほど、◯◯。意見が あると、話が 前に 進みます。では、いっしょに 変数を 見て みましょう。",
      },
      {
        id: "q5_orei",
        ask: "見て みると、データの 型が 原因でした。もう 直せそうです。最後の あいさつを どうぞ。",
        hint: "「ありがとう ございます。助かりました。」",
        keywords: ["ありがとう", "助かり", "たすかり"],
        echo: "どういたしまして。30分 悩んだら、いつでも 来て ください。",
      },
    ],
    closing:
      "相談の 型、ぜんぶ 通せましたね。お時間 → 事実 → 調べた こと → 自分の 意見 → お礼。この 順番は、どの 現場でも 使えます。一人で 悩むのは 30分まで。あとは チームの 時間です。",
    affection: {
      maxHearts: 5,
      threshold: 4,
      reward:
        "わたしの 新人の ころの 話です。Gitで コードを こわして しまった とき、日本語が はずかしくて、3時間 一人で 悩みました。やっと 先輩に 相談したら、直すのに 5分でした。先輩は 笑って、「もっと 早く 来て いいのに」と 言いました。あの 3時間で 覚えた ことです。相談は、よわい 人が する ことでは ありません。チームで はたらく 人が する ことです。だから あなたも、30分 悩んだら、わたしの ところへ 来て ください。",
    },
  }),
);

/* ------------------------------------------------------------------ *
 * C2. 場面クイズ「いま 話しかけて いい？」
 *
 * 顔だけで なく **机の まわりの 様子ごと** 読む（2026-08-29 の 指定
 * 「顔を見るだけじゃなくて、デスクの周囲の状況＋顔だといいですね」）。
 * 「少し 待つ」「チャットで 先に 送る」が 正解に なる 場面も 作り、
 * **答えが 状況で 変わる**のが ゲーム性（露骨な 正解肢を 消す）。
 *
 * 絵は 6枚とも 同じ 人物（奥田先輩）・同じ 机。プロンプトの 人物描写を
 * 逐語で そろえて あるのは、コマ間の 見た目ドリフトを 防ぐ 定石
 *（docs/skills/codex_image_generation.md）。ローカル生成まで 空スロット。
 * ------------------------------------------------------------------ */

write(
  "quizsets",
  "soudan_kehai",
  withFurigana({
    kind: "quizset",
    id: "soudan_kehai",
    title: "👀 いま 話しかけて いい？",
    description: "机の まわりの 様子と 顔を 見て、いつ・どう 話しかけるかを えらびます。",
    phase: "research",
    answerMode: "submit",
    passRate: 60,
    questions: [
      {
        id: "k1_denwa",
        type: "choose",
        q: "奥田先輩に 相談したい ことが あります。先輩は いま、電話で 話して います。どう しますか。",
        image: emptySlot("/img/quiz/soudan_kehai/k1_denwa.webp"),
        options: [
          "🧍 机の 前に 立って、終わるまで じっと 待つ",
          "💬 あとで また 来る。急ぐ ときは チャットで 先に 送って おく",
          "🖐 肩を たたいて、すぐに 話しかける",
        ],
        answer: 1,
        explain:
          "電話の 相手にも、あなたの 声や 気配が とどきます。目の 前で 待たれると、先輩は 電話に 集中できません。チャットなら、電話の あとに 読んで もらえます。",
      },
      {
        id: "k2_shuuchuu",
        type: "emotion",
        q: "奥田先輩は ヘッドホンを して、画面に 顔を 近づけて、キーボードを 打ちつづけて います。いま、先輩は どんな 様子ですか。",
        image: emptySlot("/img/quiz/soudan_kehai/k2_shuuchuu.webp"),
        feelings: [
          "🙂 ひまで、だれかと 話したい",
          "🎧 集中して いて、切られたくない",
          "😣 困って いて、助けて ほしい",
        ],
        answerFeeling: 1,
        replyQ: "では、急がない 相談は どう しますか。",
        replies: [
          "🗣 いま すぐ 声を かける",
          "💬 チャットで「あとで 5分 ください」と 送って おく",
          "😶 相談を やめて、一人で 悩む",
        ],
        answerReply: 1,
        explain:
          "集中の 時間は、チームの 大切な ざいさんです。チャットなら、先輩は きりの いい ところで 読めます。一人で 悩みつづけない ところも ポイントです。",
      },
      {
        id: "k3_hitoiki",
        type: "choose",
        q: "奥田先輩は お茶を 飲んで、のびを して います。いま、どう しますか。",
        image: emptySlot("/img/quiz/soudan_kehai/k3_hitoiki.webp"),
        options: [
          "🗣 「今、お時間 よろしいですか」と 声を かける",
          "🌙 休みが 終わるまで、夜まで 待つ",
          "😶 きょうは 相談しないで、一人で 悩む",
        ],
        answer: 0,
        explain:
          "きりの いい ところが、話しかける チャンスです。さいしょに「お時間 よろしいですか」と 聞けば、休みを こわす ことも ありません。",
      },
      {
        id: "k4_komarigao",
        type: "emotion",
        q: "奥田先輩は 画面を 見ながら、困った 顔で うなって います。いま、先輩は どんな 気持ちだと 思いますか。",
        image: emptySlot("/img/quiz/soudan_kehai/k4_komarigao.webp"),
        feelings: ["😄 仕事が 順調で、楽しい", "😖 何かに 困って いる", "😠 あなたに 怒って いる"],
        answerFeeling: 1,
        replyQ: "こんな とき、いちばん いい 声の かけ方は どれですか。",
        replies: [
          "🙋 「わたしの 相談を 聞いて ください」と 話しかける",
          "🤝 「何か 手伝える ことは ありますか」と 声を かける",
          "🚶 見なかった ことに して、はなれる",
        ],
        answerReply: 1,
        explain:
          "相談は、自分からだけの ものでは ありません。困って いる 人に 気づいて 声を かけるのも、チームの 相談です。あなたの 相談は、その あとで できます。",
      },
      {
        id: "k5_isogu",
        type: "choose",
        q: "奥田先輩は ノートパソコンを かかえて、時計を 見ながら 急いで います。相談は 急ぎません。どう しますか。",
        image: emptySlot("/img/quiz/soudan_kehai/k5_isogu.webp"),
        options: [
          "🏃 歩きながら 相談を 始める",
          "🕒 「会議の あとに 5分 いただけますか」と 短く 伝える",
          "🚪 会議室の 前で ずっと 待つ",
        ],
        answer: 1,
        explain:
          "急いで いる 人には、「いつなら いいか」だけを 短く 渡します。あとの 時間を 予約するのも、上手な 相談です。",
      },
      {
        id: "k6_asa",
        type: "choose",
        q: "朝です。奥田先輩は 出社した ばかりで、かばんを 置いて、パソコンを つけて います。急がない 相談は、いつ 話しかけますか。",
        image: emptySlot("/img/quiz/soudan_kehai/k6_asa.webp"),
        options: [
          "🎒 かばんを 置いた 瞬間に 話しかける",
          "☕ 先輩が メールと 予定を 見おわった ころに 声を かける",
          "📅 あしたまで 待つ",
        ],
        answer: 1,
        explain:
          "朝の さいしょは、きょうの 予定を 整える 時間です。少し 待つと、先輩は ゆっくり 聞けます。急ぎの トラブルだけは、朝でも すぐに 言います。",
      },
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * B1. まんが「連絡が なかった 日」— リスニング（メンテナンス連絡）の 前日譚
 *
 * 連絡を あとまわしに すると 何が 起きるかを、**さきに 物語で** 見せる。
 * 正しい 連絡文（いつ・何が・どう なるか・何を して ほしいか）へ 二人で
 * たどり着く ところまでを 描き、つぎの リスニングへ つなぐ。
 * 人物の 見た目の 記述は m2_asakai_manga と 逐語で そろえて ある。
 * ------------------------------------------------------------------ */

write(
  "manga",
  "renraku_manga",
  withFurigana({
    kind: "manga",
    id: "renraku_manga",
    format: "story",
    title: "まんが：連絡が なかった 日",
    description:
      "連絡を あとまわしに した 日、チームに 何が 起きたでしょうか。リスニングの 前に 読む ものがたりです。",
    characters: [
      { id: "nyam", name: "ニャム", role: "同期" },
      { id: "hendy", name: "ヘンディ", role: "先輩" },
    ],
    pages: [
      {
        title: "金曜日の 夕方 — オフィス",
        panels: [
          {
            size: "normal",
            image: emptySlot("/img/manga/renraku_manga/panel1.webp"),
            lines: [
              {
                speaker: "narration",
                text: "金曜日の 夕方です。ニャムさんは 検証サーバーの アップデートを たのまれました。",
              },
              { speaker: "nyam", text: "きょうの 20時に やろう。すぐ 終わる 仕事だ。" },
            ],
          },
          {
            size: "normal",
            image: emptySlot("/img/manga/renraku_manga/panel2.webp"),
            lines: [
              { speaker: "nyam", text: "連絡は…… あとで いいか。" },
              { speaker: "narration", text: "ニャムさんは 連絡を あとまわしに しました。" },
            ],
          },
          {
            size: "wide",
            image: emptySlot("/img/manga/renraku_manga/panel3.webp"),
            lines: [
              {
                speaker: "narration",
                text: "20時。検証サーバーが 止まりました。だれも 知りません。",
              },
            ],
          },
        ],
      },
      {
        title: "その 夜 と 月曜日の 朝",
        panels: [
          {
            size: "normal",
            image: emptySlot("/img/manga/renraku_manga/panel4.webp"),
            lines: [
              {
                speaker: "narration",
                text: "同じ ころ。ヘンディさんは 家で 確認作業を して いました。",
              },
              { speaker: "hendy", text: "あれ？ 検証環境に つながらない……。" },
            ],
          },
          {
            size: "normal",
            image: emptySlot("/img/manga/renraku_manga/panel5.webp"),
            lines: [
              {
                speaker: "hendy",
                text: "保存する 前に 止まった……。きょうの 作業が 消えて しまった。",
              },
            ],
          },
          {
            size: "wide",
            image: emptySlot("/img/manga/renraku_manga/panel6.webp"),
            lines: [
              {
                speaker: "nyam",
                text: "すみません。金曜の 夜、わたしが サーバーを 止めました。連絡を して いませんでした。",
              },
              { speaker: "hendy", text: "そうだったんですね。では、つぎの 一手を 考えましょう。" },
            ],
          },
        ],
      },
      {
        title: "月曜日の 昼 — 二人で 連絡",
        note: "この 連絡は、つぎの リスニングで ヘンディさんが 読み上げる 連絡に つながります。",
        panels: [
          {
            size: "normal",
            image: emptySlot("/img/manga/renraku_manga/panel7.webp"),
            lines: [
              {
                speaker: "hendy",
                text: "いっしょに 連絡の 文を 作りましょう。いつ・何が・どう なるか・何を して ほしいか、です。",
              },
            ],
          },
          {
            size: "normal",
            image: emptySlot("/img/manga/renraku_manga/panel8.webp"),
            lines: [
              {
                speaker: "nyam",
                text: "あしたの 18時から 19時まで、検証サーバーを 止めます。",
              },
              { speaker: "nyam", text: "その 前に、データを 保存して ください。" },
            ],
          },
          {
            size: "wide",
            image: emptySlot("/img/manga/renraku_manga/panel9.webp"),
            lines: [
              {
                speaker: "narration",
                text: "スタンプが ならびました。「読みました」の 合図です。",
              },
              { speaker: "nyam", text: "連絡は、みんなの 時間を まもるんですね。" },
            ],
          },
        ],
      },
    ],
  }),
);

/* ------------------------------------------------------------------ *
 * A1・A3・B2. ツールページへの リンク教材
 * 中身（データと エンジン）は public/tools/hourensou/ 側に ある。
 * ------------------------------------------------------------------ */

write(
  "links",
  "houkoku_quest",
  withFurigana({
    kind: "link",
    id: "houkoku_quest",
    title: "🎮 報告クエスト：バグの 一日",
    description:
      "あなたは 朝、バグを 見つけました。調べて、報告して、チームの 一日を まもる ゲームです。",
    url: "/tools/hourensou/houkoku_quest.html",
    view: "fullscreen",
    note: "⏰と 🤝の メーターを 見ながら、9時から 17時までの 一日を 進めます。くり返し 遊べます。",
  }),
);

write(
  "links",
  "houkoku_stamp",
  withFurigana({
    kind: "link",
    id: "houkoku_stamp",
    title: "✅ 済スタンプで 聞く：報告の 4つの パーツ",
    description: "報告の 音声を 聞きながら、聞こえた パーツに 済スタンプを 押します。",
    url: "/tools/hourensou/houkoku_stamp.html",
    view: "fullscreen",
    note: "こえかけ・じじつ・みこみ・おねがい。聞こえた 瞬間に 押しましょう。",
  }),
);

write(
  "links",
  "renraku_builder",
  withFurigana({
    kind: "link",
    id: "renraku_builder",
    title: "🧱 れんらくビルダー",
    description:
      "Slack風の 画面で、連絡の 文を 4つずつ えらんで 作ります。えらぶたびに、投稿が 1行ずつ 育ちます。",
    url: "/tools/hourensou/renraku_builder.html",
    view: "fullscreen",
    note: "最後は、自分の 名前で 完成した 連絡が チャンネルに 流れます。",
  }),
);

/*
 * 作り直しの 台帳に まだ 載って いない 絵を 最後に 知らせる。
 * 黙って 通すと「プロンプトの 無い 絵」が また 増えて、次に 作り直す 人が
 * 同じ ところから やり直す ことに なる。
 */
if (imgWithoutPrompt.size > 0) {
  console.log(`\n⚠ 台帳に まだ 無い 絵 ${imgWithoutPrompt.size}枚:`);
  for (const src of [...imgWithoutPrompt].sort()) console.log(`   ${src}`);
  console.log(
    "   → scripts/images/hourensou_*.json に 足す（docs/teaching/hourensou_絵の作り直し台帳.md）",
  );
}
