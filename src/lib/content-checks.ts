/**
 * コンテンツ機械検査のロジック（検収パイプライン第1段）
 *
 * scripts/lint_content.ts（CI）と、将来のスタジオ側検査（下書きの保存前検査）が
 * 同じ関数を共用する。「誰が作ったか」でなく「検査を通ったか」で公開可否を決める
 * ため、検査ロジックはここ1か所に閉じる（設計07 §2）。
 *
 * 検査項目:
 *  - 禁止語（学習者向け文言に「不正解」等を使わない — 理解設計ガイド P8）
 *  - 秘匿情報の漏れ（シナリオ: 質問で引き出すべき事実を調査用模擬ページに書かない）
 *  - kind別ID重複（ファイル横断。重複すると進捗保存が壊れる）
 *  - 参照整合（stage.contents / wordStageIds の参照先が存在するか — 設計07 §3）
 *  - 出題できる語か（単語ステージの参照先に 対訳と誤答3つ が そろっているか）
 *  - 導線の一致（article の「つぎは これ」がステージの学習順の直後を指しているか）
 *  - ふりがなの覆い漏れ（学習者が読む文の漢字が読み辞書で全部覆えているか）
 *  - 参照切れの気づき（スタジオの保存経路だけ。止めずに warn で知らせる）
 */

import {
  FORBIDDEN_LEARNER_WORDS,
  type Content,
  type Scenario,
  type Stage,
} from "../content/schema";
// areas.ts は純粋なデータ（node:fs も React も持たない）ので、
// スタジオのAPIルートから読まれるこのファイルからでも安全に import できる。
// furigana.ts も純粋な関数だけ（node:fs も React も無い）。スタジオのクライアントから
// この検査を呼べることが「保存前に足りない漢字を出す」画面の前提になっている。
import {
  annotateRuby,
  buildFuriganaIndex,
  uncoveredKanji,
  type FuriganaEntry,
} from "./text/furigana";
// furigana-checks.ts も純関数だけ。エントリそのものの壊れ（死にエントリ・送りがな落ち・
// 同表記異読）は、覆い検査より前の段で見る——保存した時点で壊れているものを通さない。
import { checkFuriganaEntries } from "./text/furigana-checks";
// stage-routes.ts も純関数と定数だけ（node:fs も React も持たない）。
import { INTRO_STAGE_ID } from "./stage-routes";
// vocabulary.ts も純関数だけ。単語ゲームに出せる語かの判定（isPlayable）は
// アプリと同じ1か所から引く——ここで作り直すと、片方だけが古くなる。
import { isPlayable } from "./vocabulary";

export interface Finding {
  file: string;
  level: "error" | "warn";
  message: string;
}

/** スキーマ検証を通ったコンテンツ1件（横断検査の入力）。 */
export interface ContentEntry {
  file: string;
  content: Content;
}

function collectStrings(value: unknown, path: string, out: [string, string][]) {
  if (typeof value === "string") {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

/**
 * 見つけた語の前後を添えて引用する（先生が直す場所を探せるように）。
 * `at` は**実際に判定が当たった位置**を渡す。別の出現箇所（「タイトル」の
 * 「タイ」など）を引用すると、既知の誤検出に見えて指摘が握りつぶされる。
 */
function near(text: string, at: number, length: number): string {
  return text.slice(Math.max(0, at - 12), at + length + 12);
}

/** 禁止語検査。データ内の全文字列を走査する。 */
export function checkForbiddenWords(file: string, data: unknown): Finding[] {
  const findings: Finding[] = [];
  const strings: [string, string][] = [];
  collectStrings(data, "", strings);
  for (const [path, text] of strings) {
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      if (text.includes(word)) {
        findings.push({
          file,
          level: "error",
          message: `禁止語「${word}」が ${path} にある — フィードバックは励まし＋次の行動に（P8）`,
        });
      }
    }
  }
  return findings;
}

/**
 * 秘匿漏れ検査。reqs のキーワードが調査用模擬ページに書かれていたら落とす。
 *
 * **level は error。** 以前は warn だったが、warn は `lint_content.ts` の終了コードにも
 * 保存APIの可否にも効かないので、実質「何も止めていない」状態だった。
 * 漏れたシナリオは、学習者が**質問しなくても答えが手に入る**ため、
 * 「質問で引き出す」という産出練習そのものが成立しなくなる（規律6・P4）。
 * 教材が壊れているのに動いてしまう類なので、止める側に倒す。
 */
export function checkSecretLeaks(file: string, scenario: Scenario): Finding[] {
  const findings: Finding[] = [];
  const pagesHtml = scenario.research.pages.map((p) => p.html).join("\n");
  for (const req of scenario.interview.reqs) {
    const leaked = req.keywords.filter((kw) => kw.length >= 2 && pagesHtml.includes(kw));
    if (leaked.length > 0) {
      findings.push({
        file,
        level: "error",
        message: `${req.id}（${req.label}）のキーワード [${leaked.join(", ")}] が調査ページ内にある — 質問で引き出す情報なら模擬ページから削除する（規律6・P4）`,
      });
    }
  }
  return findings;
}

/**
 * 使ってはいけない国名（規律9が名指しで禁じているもの）。
 *
 * AGENTS.md 規律9 が禁じているのは**「タイ」だけ**である。国際情勢を踏まえた運用判断で、
 * 文言・画像・画像生成プロンプトのいずれでも使わない。
 *
 * **ほかの国名は、教材の本文に自由に書いてよい。** ここには以前
 * 「合意ずみの国名（AGREED）」と「出したら確認する国名（CONFIRM）」の一覧が並んでいたが、
 * あれは指示の読み違いだった（2026-08-23 に本人が是正）。もとの指示は
 * ①タイは出さない ②**まなびマップ**では国名でなく景色の名前で呼ぶ、の2つだけで、
 * ②は地図の見せかたの話（`src/content/areas.ts`）。それを本文の検査にまで広げたせいで、
 * **会社の海外拠点を説明できない**ところまで来ていた。
 */
const BANNED_PLACE_NAMES: readonly string[] = ["タイ"];

/**
 * 「タイ」だけは、ふつうの日本語の語の一部として頻繁に現れる（タイトル・タイプ・
 * だいたい・タイミング…）。カタカナ語の途中で拾うと、誤検出が多すぎて
 * 検査そのものが無視されるようになる。
 *
 * そこで**前後がカタカナでないときだけ**国名とみなす。
 * 「タイに行く」は拾い、「タイトル」「タイプ」は拾わない。
 */
const KATAKANA = /[ァ-ヶーヴ]/u;

/**
 * 国名として当たった位置を返す（無ければ -1）。位置まで返すのは、エラーの引用が
 * **当たった出現箇所**を指すため（1つ目の「タイトル」を引用すると誤検出に見える）。
 */
function indexOfPlace(text: string, name: string): number {
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) return -1;
    const before = text[at - 1] ?? "";
    const after = text[at + name.length] ?? "";
    const glued = KATAKANA.test(name[0] ?? "")
      ? KATAKANA.test(before) || KATAKANA.test(after)
      : false;
    if (!glued) return at;
    from = at + 1;
  }
}

/**
 * 禁じた国名（タイ）が画面に出ていないか（AGENTS.md 規律9）。
 *
 * 規律9は文書にはあったが**検査コードが1行も無かった**。人が読んで気づく前提の
 * 規律は、AIに教材を作らせ始めた瞬間に破れる（生成量が人の目を超えるため）。
 *
 * 学習者に見える文字列だけを見る。先生向けの覚書（登場人物の `looks` など）は
 * 画面に出ないので対象にしない——ここを分けないと、キャラクター設定に
 * 「Southeast Asian」と書けなくなって生成の質が落ちる。
 */
export function checkCountryNames(file: string, content: Content): Finding[] {
  return checkCountryNamesInTexts(file, collectLearnerTexts(content));
}

/**
 * 国名検査の本体。文字列の列を直接受ける形。
 *
 * 教材データ（Content）は checkCountryNames から入るが、スライドの組版原稿
 * （scripts/slides/<教材ID>/index.html — 学習者が読む字の大半は PDF 側にある）は
 * Content ではないので、抽出済みの文をこちらへ渡す（scripts/slides/manuscript_checks.ts）。
 * 判定と文言はこの1か所に閉じる——原稿側が国名リストを別に持つと、
 * 一覧を直したときに片方だけ古いままになる。
 */
export function checkCountryNamesInTexts(file: string, texts: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const text of texts) {
    for (const name of BANNED_PLACE_NAMES) {
      const at = indexOfPlace(text, name);
      if (at < 0) continue;
      findings.push({
        file,
        level: "error",
        message: `国名「${name}」が 学習者に見える文にある: 「…${near(text, at, name.length)}…」 — この名前は使わない（規律9）。まなびマップと同じく景色の名前で呼ぶ`,
      });
    }
  }
  return findings;
}

/**
 * 禁止語検査の、文字列の列を直接受ける形（checkCountryNamesInTexts と対になる入口）。
 *
 * スライドの組版原稿（scripts/slides/<教材ID>/index.html）が使う。checkForbiddenWords
 * （JSON全体を舐めてフィールドの場所で知らせる形）とはメッセージの出し方が違うだけで、
 * 語のリストと判定はここに1本化する——原稿側が別のループを持つと、語に文脈の
 * ガード（「タイ」のカタカナ境界のような）を足したとき片方だけ古いままになる。
 */
export function checkForbiddenWordsInTexts(file: string, texts: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const text of texts) {
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      const at = text.indexOf(word);
      if (at < 0) continue;
      findings.push({
        file,
        level: "error",
        message: `禁止語「${word}」が 学習者に見える文にある: 「…${near(text, at, word.length)}…」 — フィードバックは励まし＋次の行動に（P8）`,
      });
    }
  }
  return findings;
}

/**
 * IDの重複をファイル横断で検出する。
 *
 * **種別をまたいで一意**であることを求める。理由は、IDを鍵にする下位層が
 * どちらも種別を持たないからである:
 *   - 進捗の保存キー（progress/store.ts の `content:<id>`）
 *   - DBの主キー（contents.id は単独主キー）
 * 種別ごとの一意性しか見ないと、別種の同じIDが検査を素通りして、
 * 進捗が混ざり、保存時に既存の教材を黙って上書きする。
 */
export function checkDuplicateIds(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Map<string, { file: string; kind: string }>();
  for (const { file, content } of entries) {
    const dup = seen.get(content.id);
    if (dup) {
      const across = dup.kind === content.kind ? "" : `（${dup.kind} と ${content.kind}）`;
      findings.push({
        file,
        level: "error",
        message: `ID「${content.id}」が ${dup.file} と重複している${across} — IDは種別をまたいで一意にする（進捗キーとDB主キーが種別を持たないため）`,
      });
    } else {
      seen.set(content.id, { file, kind: content.kind });
    }
  }
  return findings;
}

/**
 * マップの停留所の検査（設計07 §3）。
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」（src/content/areas.ts）。並びは
 * `order` の昇順で、地図に出る停留所は公開ステージだけ（既定の土地はもう無い）。
 *
 * - `order` の重複は warn: 止めるほどではない（同点はIDで安定して並ぶ）が、
 *   先生が並び替えたつもりで順番が変わらない、という分かりにくい状態になる。
 * - `area` が無いのは warn: ステージ自体はマップに出る（空色の帯になる）ので消えはしない。
 *   だから止めずに、絵の付け方まで案内する。
 *
 * どちらも「地図に並んだときに困ること」なので、地図に出ないステージ
 *（`listed: false`）は対象外にする。「はじめに」に エリアの絵が無いのは
 * 抜けではなく、そもそも立つ土地が無いという意味である。
 */
export function checkStageOrder(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const byOrder = new Map<number, string>();
  for (const { file, content } of entries) {
    if (content.kind !== "stage" || content.status !== "published" || !content.listed) continue;
    const dup = byOrder.get(content.order);
    if (dup) {
      findings.push({
        file,
        level: "warn",
        message: `ならびの ばんごう ${content.order} が ${dup} と同じ — どちらが先に出るかがIDの順で決まるので、並び替えても動かないように見える`,
      });
    } else {
      byOrder.set(content.order, file);
    }
    if (!content.area) {
      findings.push({
        file,
        level: "warn",
        message: `エリアの絵（area）が無い — マップには出るが、その土地が空色の帯になる。管理画面のステージ編集「エリアの絵」で選ぶ・あげる・つくるのどれかをする`,
      });
    }
  }
  return findings;
}

/**
 * タイトル画面の「はじめに」ボタンの行き先があるか（設計07 §3）。
 *
 * タイトル画面は行き先を実行時に引かない（全員が通る画面で DB への往復を増やさない
 * ため — `INTRO_STAGE_ID` のコメント）。引かないぶん、消されても画面は黙って
 * 404 を出すだけになる。**地図に出ないステージなので、消えても誰も気づかない**——
 * だからここで止める。
 */
export function checkIntroStage(entries: readonly ContentEntry[]): Finding[] {
  const found = entries.some(
    ({ content }) => content.kind === "stage" && content.id === INTRO_STAGE_ID,
  );
  if (found) return [];
  return [
    {
      file: `content/stages/${INTRO_STAGE_ID}.json`,
      level: "error",
      message: `タイトル画面の「はじめに」ボタンの行き先（/${INTRO_STAGE_ID}）が無い — 押すと 404 になる。ステージを戻すか、title-screen.tsx のリンクを外す`,
    },
  ];
}

/**
 * 参照整合検査（全ファイル横断）。
 * stage.contents の各 ref が同じ type のコンテンツとして存在するか、
 * wordStageIds の各IDが wordstage として存在するかを調べ、欠けていたら error。
 */
export function checkReferenceIntegrity(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const idsByKind = new Map<string, Set<string>>();
  for (const { content } of entries) {
    const set = idsByKind.get(content.kind) ?? new Set<string>();
    set.add(content.id);
    idsByKind.set(content.kind, set);
  }

  /*
   * 単語ステージ → ことばの 正（kind: vocab）。参照が 切れると その語が 画面から
   * 黙って 消える——学習者は「出るはずの ことばが 出ない」と 言えないので、機械で 止める。
   */
  const vocabWords = new Map(
    entries.flatMap(({ content }) =>
      content.kind === "vocab" ? content.words.map((w) => [w.id, w] as const) : [],
    ),
  );
  const reportMissing = (file: string, ids: readonly string[]) => {
    const missing = ids.filter((id) => !vocabWords.has(id));
    if (missing.length === 0) return;
    findings.push({
      file,
      level: "error",
      message: `ことばの 正に 無い id を 参照して いる: ${missing.join(" ")} — content/vocab/ に 足すか、参照から 外す`,
    });
  };
  for (const { file, content } of entries) {
    if (content.kind === "wordstage" && content.wordIds) reportMissing(file, content.wordIds);
    if (content.kind === "manga" && content.vocabIds) reportMissing(file, content.vocabIds);
    if (content.kind === "article") {
      for (const block of content.blocks) {
        if (block.kind === "vocab" && block.wordIds) reportMissing(file, block.wordIds);
      }
    }
  }

  /*
   * 単語ステージ → **単語ゲームに 出せる 語か**（`isPlayable`）。
   *
   * 4択は「対訳の1語（正解）＋ 誤答3つ」で できて いる ので、その2つが 無い 語は
   * `gameWordsOf` が 黙って 落とす。参照は 生きて いる ので 上の 検査には かからず、
   * **セットだけが 短く なる**——8語の つもりの セットが 7語で 回り 続ける。
   * 落ちた 語も 辞書・ツールチップには 出る ので、先生からは 消えたように 見えない。
   * 参照切れと 同じ 顔の 事故なので、同じ ところで 止める。
   *
   * まんが・記事の ことばカードは これで よい（読む ための 助けなので 対訳は 要らない）。
   * ここで 見るのは **出題する** 単語ステージだけ。
   */
  for (const { file, content } of entries) {
    if (content.kind !== "wordstage" || !content.wordIds) continue;
    const notPlayable = content.wordIds.filter((id) => {
      const word = vocabWords.get(id);
      return word !== undefined && !isPlayable(word);
    });
    if (notPlayable.length === 0) continue;
    findings.push({
      file,
      level: "error",
      message: `単語ゲームに 出せない 語を 出題しようと して いる: ${notPlayable.join(" ")} — 対訳の1語（englishTerm）と 誤答3つ（wrongMeanings）を content/vocab/ に 足すか、この セットから 外す`,
    });
  }

  for (const { file, content } of entries) {
    if (content.kind !== "stage") continue;
    content.contents.forEach((item, i) => {
      if (!idsByKind.get(item.type)?.has(item.ref)) {
        findings.push({
          file,
          level: "error",
          message: `contents[${i}] の参照先「${item.ref}」（${item.type}）が存在しない — ステージの参照切れ（設計07 §3）`,
        });
      }
    });
    content.wordStageIds.forEach((id) => {
      if (!idsByKind.get("wordstage")?.has(id)) {
        findings.push({
          file,
          level: "error",
          message: `wordStageIds の「${id}」が wordstage として存在しない — ステージの参照切れ（設計07 §3）`,
        });
      }
    });
  }

  // 記事の「つぎは これ」カードも参照。存在しない教材を指すとタップ先が404になる
  for (const { file, content } of entries) {
    if (content.kind !== "article") continue;
    content.blocks.forEach((block, i) => {
      if (block.kind === "link") {
        if (!idsByKind.get(block.type)?.has(block.ref)) {
          findings.push({
            file,
            level: "error",
            message: `blocks[${i}] の link 先「${block.ref}」（${block.type}）が存在しない — 「つぎは これ」のタップ先が404になる（設計07 §5）`,
          });
        }
        return;
      }
      /*
       * しょうかいカードも参照。欠けても記事は出る（名前の代わりに id が出る）ので
       * 画面は壊れないが、**学習者には「hendy」という字が見える**。黙って通さない。
       */
      if (block.kind === "characters") {
        block.items.forEach((item, j) => {
          if (!idsByKind.get("character")?.has(item.ref)) {
            findings.push({
              file,
              level: "error",
              message: `blocks[${i}].items[${j}] の しょうかいカード「${item.ref}」が character として存在しない — 絵と名前が出ず、IDがそのまま学習者に見える`,
            });
          }
        });
      }
    });
  }

  /*
   * ミーティングの「じぶんの メモ」も 参照。
   *
   * 切れても 画面は 壊れない（メモが 空で 出るだけ）。だからこそ 機械で 止める——
   * **学習者は「出るはずの メモが 出ない」と 言えない**。ID を 1文字 打ち間違えた
   * だけで、会話の 最中に 見る はずの 自分の こたえが 永久に 出て こない。
   */
  for (const { file, content } of entries) {
    if (content.kind !== "meeting") continue;
    content.notes.forEach((note, i) => {
      if (!idsByKind.get("quizset")?.has(note.ref)) {
        findings.push({
          file,
          level: "error",
          message: `notes[${i}] の メモ元「${note.ref}」が quizset として存在しない — 会話の 最中に 自分の こたえが 出ない`,
        });
      }
    });
  }
  return findings;
}

/**
 * ステージ1件ぶんの参照切れ検査（スタジオの保存経路 — 設計07 §3）。
 *
 * checkReferenceIntegrity（CI・全件そろっている前提・error）とは役目が違う。
 * スタジオでは「先にステージの枠を作って、中身をあとから足す」順番で作れることを
 * 優先するので、ここは **必ず warn** にして保存を止めない。error にすると、
 * 先生は作りかけのステージを保存できず、教材を作る順番のほうを強いられる。
 * それでも黙って通すと、公開したステージの途中で学習者がタップした先が404になる。
 * だから「止めないが、必ず気づかせる」という位置づけにしている。
 *
 * knownIds は「いま存在するIDの集合」（git ∪ DB。下書きも含む）。種別まで見ないのは、
 * 下書きの段階では種別の付け替えがよく起きて、種別違いを error 相当に扱うと
 * 作りかけを警告で埋めてしまうため。種別の取り違えは公開前に CI の
 * checkReferenceIntegrity が error として拾う。
 */
export function checkDanglingRefs(stage: Stage, knownIds: ReadonlySet<string>): Finding[] {
  const file = `${stage.kind}:${stage.id}`;
  const findings: Finding[] = [];

  stage.contents.forEach((item, i) => {
    if (knownIds.has(item.ref)) return;
    findings.push({
      file,
      level: "warn",
      message: `まだ無いIDを指しています: ${item.ref}（コンテンツ ${i + 1}番目・${item.type}）— この教材を作るまで、学習者はここで先に進めません`,
    });
  });

  stage.wordStageIds.forEach((id) => {
    if (knownIds.has(id)) return;
    findings.push({
      file,
      level: "warn",
      message: `まだ無いIDを指しています: ${id}（単語ステージ）— この単語ステージを作るまで、ことばの練習は出てきません`,
    });
  });

  return findings;
}

/**
 * 導線の一致検査（設計07 §3・§5）。
 *
 * article 末尾の link ブロックは「つぎは これ」と断定して見せるので、ステージの
 * contents[] で自分の直後にある教材と食い違うと、学習者が教材を飛ばしてしまう。
 *
 * 1つの教材は複数ステージから使い回せる（コンテンツ側はステージを知らない）ため、
 * 「いずれかのステージで直後と一致すれば OK」で判定する。どのステージからも
 * 参照されていない教材は判断材料がないので検査しない。
 */
export function checkLinkOrder(entries: readonly ContentEntry[]): Finding[] {
  const findings: Finding[] = [];
  const stages = entries.flatMap(({ content }) => (content.kind === "stage" ? [content] : []));

  for (const { file, content } of entries) {
    if (content.kind !== "article") continue;
    const links = content.blocks.flatMap((block) => (block.kind === "link" ? [block] : []));
    if (links.length === 0) continue;

    // このarticleを含むステージそれぞれで「自分の直後」に来る教材
    const successors = stages.flatMap((stage) => {
      const at = stage.contents.findIndex(
        (item) => item.type === "article" && item.ref === content.id,
      );
      const next = at >= 0 ? stage.contents[at + 1] : undefined;
      return next ? [{ stageId: stage.id, next }] : [];
    });
    if (successors.length === 0) continue;

    for (const link of links) {
      const matched = successors.some(
        ({ next }) => next.type === link.type && next.ref === link.ref,
      );
      if (matched) continue;
      const expected = successors
        .map(({ stageId, next }) => `${stageId}→${next.ref}(${next.type})`)
        .join(" / ");
      findings.push({
        file,
        level: "error",
        message: `link ブロックの「${link.ref}」（${link.type}）が、ステージの学習順で直後に来る教材と違う（直後は ${expected}）— 学習者が教材を飛ばす（設計07 §3）`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * ふりがなの覆い漏れ（AGENTS.md 規律2）
 *
 * 学習者はカンボジアのIT専攻学生（N5〜N3）。読めない漢字が1つあると、そこで
 * 学習が止まる。読み辞書は先生が手で書くので「だいたい付いている」状態になりやすく、
 * 抜けた1語は誰にも見えないまま学習者だけにぶつかる。だから機械で全部数える。
 * ------------------------------------------------------------------ */

/** 学習者が読む文と、その置き場所（先生が直しに行く場所）。 */
export interface LabeledText {
  readonly field: string;
  readonly text: string;
}

/**
 * 学習者が読む文を、種別ごとに**対象フィールドを名指しして**集める。
 *
 * **前提: zod（contentSchema）を通った Content を渡すこと。** 生の JSON を渡すと
 * 既定値（default）が埋まっておらず、必須配列の forEach で落ちる。
 *
 * データ全体を舐めて文字列を拾う書き方（checkForbiddenWords の collectStrings）は
 * ここでは採らない。ID・画像パス・英語の選択肢・AI判定用キーワード・Liveへの
 * systemInstruction まで拾ってしまい、先生には直しようのない指摘が大量に出る。
 * 直せない指摘が並ぶ検査は、やがて丸ごと無視される。
 *
 * 「読みを自分で持っているフィールド」（vocab の term など）は、画面でその読みが
 * 隣に出るとは限らない（記事の ことばチップは読みをタップして初めて出す）ので、
 * 原則そのまま対象に含める。例外は wordstage の words[].term だけ（下の
 * coverageEntries を参照）。
 */
export function collectLabeledTexts(content: Content): LabeledText[] {
  const out: LabeledText[] = [];
  const push = (field: string, text: string | undefined) => {
    if (text) out.push({ field, text });
  };

  switch (content.kind) {
    case "stage": {
      push("title", content.title);
      push("description", content.description);
      if (content.area) {
        push("area.name", content.area.name);
        push("area.note", content.area.note);
      }
      break;
    }

    case "listening": {
      push("title", content.title);
      push("description", content.description);
      push("focus", content.focus);
      // 話す人の名前と立場は Zoom風のタイルに出る（call-shell.tsx）。
      // meeting の host.name / host.role と同じ扱いにそろえる。
      content.participants.forEach((person, i) => {
        push(`participants[${i}].name`, person.name);
        push(`participants[${i}].role`, person.role);
      });
      content.script.forEach((line, i) => push(`script[${i}].text`, line.text));
      // keywords はスキーマが「台本に出てくること」を保証しているので script 側で数える
      break;
    }

    case "quizset": {
      push("title", content.title);
      push("description", content.description);
      content.questions.forEach((q, i) => {
        const at = (field: string) => `questions[${i}].${field}`;
        push(at("q"), q.q);
        push(at("explain"), q.explain);
        /*
         * 章の 見出し・出どころの 札・ヒントは **どれも 画面に そのまま 出る**
         *（`quiz-runner.tsx` が RubyText で 描く）。設問文の 中に 埋めて いた
         * ころは `q` の 検査で 一緒に 覆えて いたので、外に 出した ぶん
         * ここで 数え直さないと 覆いに 穴が あく。
         */
        push(at("section"), q.section);
        push(at("sectionNote"), q.sectionNote);
        push(at("source"), q.source);
        (q.hints ?? []).forEach((hint, j) => {
          push(at(`hints[${j}].title`), hint.title);
          push(at(`hints[${j}].text`), hint.text);
        });
        switch (q.type) {
          case "choose":
          case "multi":
            q.options.forEach((option, j) => push(at(`options[${j}]`), option));
            break;
          case "keyword":
            // 答え合わせの画面に出るので、正解・別解も学習者が読む文
            push(at("answer"), q.answer);
            q.accept.forEach((accept, j) => push(at(`accept[${j}]`), accept));
            break;
          case "wordbank":
            q.lines.forEach((line, j) => push(at(`lines[${j}]`), line));
            // blanks はスキーマ上 bank の部分集合なので bank だけ数えれば足りる
            q.bank.forEach((word, j) => push(at(`bank[${j}]`), word));
            break;
          case "emotion":
            q.feelings.forEach((feeling, j) => push(at(`feelings[${j}]`), feeling));
            push(at("replyQ"), q.replyQ);
            q.replies.forEach((reply, j) => push(at(`replies[${j}]`), reply));
            break;
          case "free":
            // 型文は 入力欄の 下に 出しっぱなし＝いちばん よく 読まれる 行。
            // placeholder は 打つと 消えるが、打つ 前には 読むので 同じく 数える。
            push(at("starter"), q.starter);
            push(at("placeholder"), q.placeholder);
            // english.* は 英語の 欄（漢字を 持たない）。ふりがなの 対象外
            break;
        }
      });
      break;
    }

    case "manga": {
      push("title", content.title);
      push("description", content.description);
      content.pages.forEach((page, p) => {
        push(`pages[${p}].title`, page.title);
        page.panels.forEach((panel, q) => {
          const at = (field: string) => `pages[${p}].panels[${q}].${field}`;
          push(at("caption"), panel.caption);
          panel.lines.forEach((line, r) => push(at(`lines[${r}].text`), line.text));
        });
      });
      (content.characters ?? []).forEach((character, i) => {
        push(`characters[${i}].name`, character.name);
        push(`characters[${i}].role`, character.role);
      });
      /*
       * ことばは **持ち主の 側で 検査する**。
       *
       * `vocabIds` で 正から 借りて いる ぶんは、説明文も 読み辞書も 正が 持って いる。
       * それを 借り手（まんが）の 読み辞書で 見ると、当たるはずの ない 漢字が
       * 「ふりがなが 無い」と 出る——先生には 直しようが ない 指摘に なる
       *（2026-08-20 実発生。まんが自身は 0件なのに、読み出したあとだけ 3件 出た）。
       */
      if (!content.vocabIds) {
        (content.vocab ?? []).forEach((item, i) => {
          push(`vocab[${i}].term`, item.term);
          push(`vocab[${i}].meaning`, item.meaning);
        });
      }
      // image の prompt / refs / src は生成の材料であって学習者は読まない
      break;
    }

    case "article": {
      push("title", content.title);
      push("description", content.description);
      content.blocks.forEach((block, i) => {
        const at = (field: string) => `blocks[${i}].${field}`;
        switch (block.kind) {
          case "heading":
          case "paragraph":
          case "callout":
            push(at("text"), block.text);
            break;
          case "image":
            push(at("caption"), block.caption);
            break;
          /*
           * 動画は **`note` が 学習者の 読む 文**（動画の 下に 出る）。
           * 中の 音と 字には ふりがなを 振れない ので、ここが 唯一の 受け皿に なる。
           * `caption` は 読み上げ用（絵と 同じ）、`src`・`poster` は 置き場。
           */
          case "video":
            push(at("caption"), block.caption);
            push(at("note"), block.note);
            break;
          case "list":
          case "steps":
            block.items.forEach((item, j) => push(at(`items[${j}]`), item));
            break;
          case "vocab":
            // 参照で 借りた ぶんは 持ち主（kind: vocab）の 側で 検査される
            if (block.wordIds) break;
            (block.items ?? []).forEach((item, j) => {
              push(at(`items[${j}].term`), item.term);
              push(at(`items[${j}].meaning`), item.meaning);
            });
            break;
          case "link":
            push(at("label"), block.label);
            break;
          case "extlink":
            // 外のサイトへ行くカード。見出しも ひとことも 学習者が読む
            //（article-view.tsx が どちらも RubyText で出す）。
            push(at("label"), block.label);
            push(at("note"), block.note);
            break;
          case "characters":
            // しょうかいカード。立場と ひとことは 記事が持つ＝学習者が読む文。
            // 名前は 人物カード側の (name, reading) で ルビが付くので ここでは見ない。
            block.items.forEach((item, j) => {
              push(at(`items[${j}].role`), item.role);
              push(at(`items[${j}].note`), item.note);
            });
            break;
          /*
           * 配布資料から 移した 5つ。**どれも 学習者が 読む 文しか 持たない**
           *（絵の スロットだけが 例外で、あれは 生成の 材料）。ここに 足し忘れると、
           * 表紙の 大見出しだけ 裸の 漢字に なる——ページを 開いた 最初の 1行なので、
           * 抜けが いちばん 高く つく。
           */
          case "hero":
            push(at("eyebrow"), block.eyebrow);
            push(at("title"), block.title);
            push(at("lead"), block.lead);
            push(at("note"), block.note);
            break;
          case "cards":
            block.items.forEach((item, j) => {
              const card = (field: string) => at(`items[${j}].${field}`);
              // icon は 絵文字だけ（漢字を 入れない 決まりでは ないので 一応 数える）
              push(card("icon"), item.icon);
              push(card("label"), item.label);
              push(card("title"), item.title);
              push(card("text"), item.text);
              (item.items ?? []).forEach((line, k) => push(card(`items[${k}]`), line));
            });
            break;
          case "missions":
            block.items.forEach((item, j) => {
              const mission = (field: string) => at(`items[${j}].${field}`);
              push(mission("badge"), item.badge);
              push(mission("title"), item.title);
              push(mission("where"), item.where);
              item.points.forEach((point, k) => push(mission(`points[${k}]`), point));
              // ヒントは 押すと 開く＝読まれる。閉じて いても 検査は 外さない
              push(mission("hint"), item.hint);
              push(mission("note"), item.note);
            });
            break;
          case "compare":
            push(at("before.title"), block.before.title);
            block.before.lines.forEach((line, j) => push(at(`before.lines[${j}]`), line));
            push(at("after.title"), block.after.title);
            block.after.lines.forEach((line, j) => push(at(`after.lines[${j}]`), line));
            break;
          case "banner":
            push(at("icon"), block.icon);
            push(at("title"), block.title);
            push(at("text"), block.text);
            (block.badges ?? []).forEach((badge, j) => push(at(`badges[${j}]`), badge));
            break;
        }
      });
      break;
    }

    case "slides": {
      push("title", content.title);
      push("description", content.description);
      // PDF の中の字は アプリから触れない（ルビを振れない）。
      // 学習者が読む「アプリの文」は ひとこと だけなので、そこは全部覆う。
      content.notes.forEach((note, i) => push(`notes[${i}].text`, note.text));
      // fileUrl は ファイルの置き場所。学習者は読まない
      break;
    }

    case "vocab": {
      // 語の 正。学習者が 読むのは 見出しと 説明・例文（対訳は 英語なので 対象外）。
      push("title", content.title);
      content.words.forEach((word, i) => {
        push(`words[${i}].meaningJa`, word.meaningJa);
        push(`words[${i}].example`, word.example);
      });
      break;
    }

    case "wordstage": {
      push("title", content.title);
      push("description", content.description);
      // 参照で 持つ ステージの 語は 正の 側（kind: vocab）で 検査される
      (content.words ?? []).forEach((word, i) => {
        // term は reading を自分で持つので対象外。meaningEn / wrongMeanings は英語（スキーマが日本語を弾く）
        push(`words[${i}].explanationJa`, word.explanationJa);
        push(`words[${i}].example`, word.example);
      });
      break;
    }

    case "scenario": {
      push("title", content.title);
      push("subtitle", content.subtitle);
      push("client.name", content.client.name);
      push("client.role", content.client.role);
      push("client.desc", content.client.desc);
      push("client.tip", content.client.tip);
      content.mission.chat.forEach((line, i) => push(`mission.chat[${i}].text`, line.text));
      push("mission.goal", content.mission.goal);
      content.words.forEach((word, i) => {
        push(`words[${i}].w`, word.w);
        push(`words[${i}].m`, word.m);
      });
      push("research.intro", content.research.intro);
      content.research.pages.forEach((page, i) => push(`research.pages[${i}].tab`, page.tab));
      content.research.quiz.forEach((quiz, i) => {
        push(`research.quiz[${i}].q`, quiz.q);
        quiz.options.forEach((option, j) => push(`research.quiz[${i}].options[${j}]`, option));
        push(`research.quiz[${i}].why`, quiz.why);
      });
      content.research.findings.forEach((finding, i) => push(`research.findings[${i}]`, finding));
      content.interview.reqs.forEach((req, i) => {
        // fact と keywords は判定の材料（AI・ローカル照合）で、画面には出ない
        push(`interview.reqs[${i}].label`, req.label);
        push(`interview.reqs[${i}].secret`, req.secret);
        push(`interview.reqs[${i}].hint`, req.hint);
      });
      push("doc.projectName", content.doc.projectName);
      push("doc.clientLine", content.doc.clientLine);
      content.doc.sections.forEach((section, i) => {
        push(`doc.sections[${i}].title`, section.title);
        section.items.forEach((item, j) => push(`doc.sections[${i}].items[${j}].text`, item.text));
      });
      push("lesson.title", content.lesson.title);
      content.lesson.points.forEach((point, i) => push(`lesson.points[${i}]`, point));
      // interview.persona は Live への指示（学習者は読まない）。
      // research.pages[].html は生HTMLでルビ合成の対象外なので、ここでは数えない。
      break;
    }

    case "meeting": {
      push("title", content.title);
      push("description", content.description);
      push("focus", content.focus);
      push("host.name", content.host.name);
      push("host.role", content.host.role);
      content.questions.forEach((question, i) => {
        const at = (field: string) => `questions[${i}].${field}`;
        push(at("ask"), question.ask);
        push(at("hint"), question.hint);
        // echo は答えたあとに画面へ出る（相手の受け答え）ので学習者が読む
        push(at("echo"), question.echo);
        // keywords は当たり判定の材料で、画面には出ない
      });
      push("closing", content.closing);
      /* メモの 見出し（「調査シートの こたえ」）。会話の 最中に 画面へ 出る。 */
      content.notes.forEach((note, i) => push(`notes[${i}].label`, note.label));
      /*
       * 好感度が満タンになったときに相手が話す「とっておきの話」。
       * ここが対象から漏れていると、**いちばん嬉しい場面だけ 規律2 の外**になる。
       * 学習者はハートを貯めきった直後にこれを読むので、読めない漢字が1つでも
       * あると、いちばん効く報酬がその場でしぼむ。
       */
      push("affection.reward", content.affection?.reward);
      /*
       * 聞き出す もの（願い #94）。**見出しも 答えも 学習者が 読む**
       *（自由な おしゃべりで 画面に 出る）ので、ふりがなの 覆いの 対象に する。
       * keywords は 当たり判定の 材料で、画面には 出ない。
       */
      content.discover.forEach((item, i) => {
        push(`discover[${i}].label`, item.label);
        push(`discover[${i}].answer`, item.answer);
      });
      /*
       * 対話ゲームの ことば（願い #177）。**ここは ぜんぶ 学習者が 読む**——
       * 第一声も、出だしの しつもんも、深掘りの 予備も、型文も、さそいも、
       * とっておきの 話も、画面の セリフ枠に そのまま 出る。
       *
       * 漏らすと **教材の いちばん 前（第一声）だけ 裸の 漢字**に なる。
       * 学習者が 最初に 出あう 1文なので、そこで つまずくと 先が 無い。
       * `background` / `figures` は 絵の 置き場で、字では ない。
       */
      if (content.talkGame) {
        const game = content.talkGame;
        push("talkGame.opening", game.opening);
        game.openers.forEach((one, i) => {
          push(`talkGame.openers[${i}].ask`, one.ask);
          // 型文と お手本も **学習者が 読む 字**（ヒントの ポップアップに 出る）
          if (one.hint) push(`talkGame.openers[${i}].hint`, one.hint);
          if (one.example) push(`talkGame.openers[${i}].example`, one.example);
        });
        game.probes.forEach((one, i) => push(`talkGame.probes[${i}]`, one));
        game.talkHints.forEach((one, i) => push(`talkGame.talkHints[${i}]`, one));
        push("talkGame.listenInvite", game.listenInvite);
        game.listenHints.forEach((one, i) => push(`talkGame.listenHints[${i}]`, one));
        if (game.listenExample) push("talkGame.listenExample", game.listenExample);
        push("talkGame.reward", game.reward);
      }
      // persona / judgePrompt は Live への指示（scenario の interview.persona と同じ扱い）
      break;
    }

    case "link": {
      push("title", content.title);
      push("description", content.description);
      // 開く前に出す ひとこと。ここまでが「アプリの文」で、この先（リンクの中）は
      // アプリから触れない——スライドの PDF と同じ立場である。
      push("note", content.note);
      // url は 行き先。学習者は読まない
      break;
    }

    case "skit": {
      /*
       * スキットは **画面に 出る 字が ほぼ すべて 学習者の 読む 文**である。
       * セリフはもちろん、役の 名前と 立場（ふきだしの 上に 出る）も、
       * 言い方の ひとことも 読む。ここに 足し忘れると、**まねる 対象の セリフ
       * そのものが 裸の 漢字**に なる——教材の 中身が まるごと 検査の外に落ちる。
       *
       * `audioUrl` と `image` は 置き場で、字では ない。
       */
      push("title", content.title);
      push("description", content.description);
      push("focus", content.focus);
      content.roles.forEach((role, i) => {
        push(`roles[${i}].name`, role.name);
        push(`roles[${i}].role`, role.role);
      });
      content.lines.forEach((line, i) => {
        push(`lines[${i}].text`, line.text);
        push(`lines[${i}].note`, line.note);
      });
      break;
    }
  }

  return out;
}

/**
 * 学習者が読む文だけを集める（スタジオの「ふりがなを つける」と共用）。
 *
 * 画面側が別の集め方をすると、「検査は通るのにスタジオでは足りないと言われる」
 * （逆もある）ことになり、先生はどちらを信じてよいか分からなくなる。
 */
export function collectLearnerTexts(content: Content): string[] {
  return collectLabeledTexts(content).map((item) => item.text);
}

/**
 * その教材のルビ合成に使える読み辞書。
 *
 * **前提: zod（contentSchema）を通った Content を渡すこと**（collectLabeledTexts と同じ）。
 *
 * 原則は `furigana` フィールドだけ。画面（RubyText）も `furigana` から索引を作るので、
 * ここに他の読みを足すと「検査は通るが画面は裸の漢字」というズレになる。
 * 例外は2つだけで、どちらも「画面が読みを別に見せている」ことが根拠になっている:
 *
 * - stage: `furigana` に加えて、タイトルの読み（reading）と土地の読みも数える。
 *   タイトルは読みを真下に出し、マップの土地も同じく reading を出すためで、
 *   同じ読みを2度書かせない。説明文（description）は **`furigana` で覆う**——
 *   2026-08-18 に ステージへ 読み辞書を 足し、マップのカードと ステージの見出しが
 *   そこから ルビを 合成するようにした（それまでは ひらがなで 書くしかなかった）。
 * - wordstage: 語カードが term と reading を並べて見せるので、term の読みは学習者に
 *   届いている。解説文・例文に同じ語が出たときに先生へ二重登録を強いない。
 */
export function coverageEntries(content: Content): FuriganaEntry[] {
  switch (content.kind) {
    case "stage": {
      const entries: FuriganaEntry[] = [
        ...(content.furigana ?? []),
        [content.title, content.reading],
      ];
      if (content.area) entries.push([content.area.name, content.area.reading]);
      return entries;
    }
    case "vocab":
      // 束の 読み辞書 ＋ **語ごとの 読み辞書** ＋ 語そのものの よみ。
      // 語ごとに 持てるのは、説明文を 直す 人が 同じ 場所で 読みも 足せるように するため。
      return [
        ...(content.furigana ?? []),
        ...content.words.flatMap((word) => word.furigana ?? []),
        ...content.words.map((word): FuriganaEntry => [word.term, word.reading]),
      ];
    case "wordstage":
      return [
        ...(content.furigana ?? []),
        ...(content.words ?? []).map((word): FuriganaEntry => [word.term, word.reading]),
      ];
    case "character":
      // 人物カードは 名前の真下に よみ を出す。それ以外（立場・見た目）は
      // 先生向けの覚書で、学習者の画面には出ない。
      return [[content.name, content.reading]];
    default:
      return [...(content.furigana ?? [])];
  }
}

/* ------------------------------------------------------------------ *
 * 熟語が 読み辞書で 2語に 割れて、まちがった 読みに なっていないか
 *
 * ふりがなの覆い検査は「漢字にルビが付いたか」しか見ない。付いてさえいれば通るので、
 * 「報告書」に「報告」＋「書」が当たって **ほうこくか** と読ませていても素通りする
 *（2026-08-18 に学習者向け画面で実発生）。読めない漢字より始末が悪い——学習者は
 * まちがった読みを正しいものとして覚え、先生も画面を見ただけでは気づけない。
 *
 * そこで **漢字の かたまりが 2語以上に 割れて 組み立てられたとき**に知らせる。
 * 割れること自体は正しいことも多い（「松井社長」＝「松井」＋「社長」）ので、
 * 確かめ終わったものは下の一覧に書いて黙らせる。**一覧に足す＝読みを目で確かめた印**。
 * ------------------------------------------------------------------ */

/** 割れているが読みは正しいと確かめ終わった熟語（2026-08-18 に全件を目で確認）。 */
const VERIFIED_SPLIT_COMPOUNDS: ReadonlySet<string> = new Set([
  "動作確認用",
  "学生自身",
  "松井社長",
  "日本語",
  "日本語教育",
  "日本語学習",
  "全部終",
  "礼儀正",
  "挨拶回",
  "配属初日",
  // 「18時以降」— 時（じ）＋以降（いこう）で じいこう。数の あとの 単位なので 正しい
  "時以降",
  // 「1年間日本語を…」— 年間（ねんかん）＋日本語（にほんご）。2026-09-01 に目で確認
  "年間日本語",
]);

const KANJI_RUN = /[々一-鿿]{2,}/g;

/**
 * 熟語が 2語に 割れて 読まれていないか。
 *
 * **level は warn。** 割れること自体は正しい場合が多く、error にすると
 * 正しい教材まで止めてしまい、やがて検査ごと外される。組み立てた読みを
 * そのまま出すので、先生は1秒で「合っている／いない」を判断できる。
 */
export function checkSplitCompoundReadings(entries: readonly ContentEntry[]): Finding[] {
  return entries.flatMap(({ file, content }) => {
    const dictionary = new Map(coverageEntries(content));
    if (dictionary.size === 0) return [];
    const index = buildFuriganaIndex(coverageEntries(content));
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const { field, text } of collectLabeledTexts(content)) {
      for (const run of text.match(KANJI_RUN) ?? []) {
        if (dictionary.has(run) || VERIFIED_SPLIT_COMPOUNDS.has(run) || seen.has(run)) continue;
        const segments = annotateRuby(run, index);
        // 覆えていない漢字は 覆い検査の 担当。ここは **全部に ルビが 付いた うえで
        // 2つ以上に 割れた** ものだけを見る。
        if (segments.length < 2 || segments.some((segment) => !segment.reading)) continue;
        seen.add(run);
        const assembled = segments.map((segment) => segment.reading).join("");
        const split = segments.map((segment) => segment.text).join("＋");
        findings.push({
          file,
          level: "warn",
          message: `「${run}」（${field}）が ${split} に 割れて「${assembled}」と 読まれる — 読みが 合っているか 確かめ、合っていれば furigana に ["${run}", "…"] を 足すか VERIFIED_SPLIT_COMPOUNDS に 書く`,
        });
      }
    }
    return findings;
  });
}

/**
 * 学習者が読む文の漢字が、読み辞書で全部覆われているか（AGENTS.md 規律2）。
 *
 * **level は error。** 「だいたい付いている」を許すと、抜けた1語で学習者が止まる。
 * 止まった学習者は先生に「ここが読めない」とは言えない（読めないから言葉にできない）ので、
 * 抜けは教室では発見されない。機械で全部数えるしかない。
 *
 * メッセージには「どのフィールドか」と「覆えていない漢字」を必ず入れる。
 * どちらか欠けると、先生は教材のどこに何を足せばよいか分からず直せない。
 */
export function checkFuriganaCoverage(entries: readonly ContentEntry[]): Finding[] {
  return entries.flatMap(({ file, content }) => checkFuriganaCoverageOf(file, content, "error"));
}

/**
 * 1件ぶんのふりがな検査。
 *
 * **保存経路にこれが無かった。** `runContentChecks`（`/api/studio/content`）は
 * 禁止語と秘匿漏れしか見ておらず、規律2（ふりがな全覆い）は CI の `lint:content` に
 * しか無かった。つまり**スタジオで作った教材は、CIを通らないまま公開できていた**。
 * AIに教材を作らせ始めると、この穴を通る量が一気に増える。
 *
 * `level` を呼ぶ側が決めるのは、下書きと公開で扱いを変えたいから:
 *   - 公開 … error（読めない漢字が1つあると、学習者はそこで止まる）
 *   - 下書き … warn（作りかけを保存させないと、先生は途中でやめられない）
 */
export function checkFuriganaCoverageOf(
  file: string,
  content: Content,
  level: Finding["level"],
): Finding[] {
  const findings: Finding[] = [];
  const index = buildFuriganaIndex(coverageEntries(content));
  const hint = "furigana（読み辞書）に [表記, よみ] を足す";
  for (const { field, text } of collectLabeledTexts(content)) {
    const missing = uncoveredKanji(text, index);
    if (missing.length === 0) continue;
    findings.push({
      file,
      level,
      message: `ふりがなの ない漢字が ${field} にある: ${missing.join(" ")} — ${hint}。読めない漢字が1つあると、学習者はそこで止まる（規律2）`,
    });
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * 読み辞書エントリそのものの壊れ（死にエントリ・送りがな落ち・同表記異読）
 *
 * 覆い検査は「漢字にルビが付いたか」しか見ないので、**エントリが壊れていても
 * 別のエントリが同じ漢字を覆っていれば緑になる**。「お時間→おじかん」の 死にエントリは
 * 4件が 覆い検査の 緑の 陰で 生きていた（2026-09-01 の 監査）。
 * 検査の実体は src/lib/text/furigana-checks.ts（コード側の読み台帳とも共用）。
 * ------------------------------------------------------------------ */

/** content の中の furigana 配列（[表記, よみ] の配列）を、置き場所つきで全部集める。 */
function collectFuriganaArrays(
  value: unknown,
  path: string,
  out: { path: string; list: FuriganaEntry[] }[],
) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectFuriganaArrays(v, `${path}[${i}]`, out));
    return;
  }
  for (const [key, v] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key;
    if (
      key === "furigana" &&
      Array.isArray(v) &&
      v.every(
        (item) =>
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === "string" &&
          typeof item[1] === "string",
      )
    ) {
      out.push({ path: at, list: v as unknown as FuriganaEntry[] });
      continue;
    }
    collectFuriganaArrays(v, at, out);
  }
}

/**
 * 読み辞書エントリの構造検査（規律2の前段）。
 *
 * **level は error。** どの型も「書いた人には正しく見えるのに画面では壊れている」
 * 種類のミスで、目視のレビューでは 4件の 死にエントリが 誰にも 見つからなかった。
 *
 * 明示の furigana 配列には 全検査（死にエントリ・送りがな整合・同表記異読）を当て、
 * ファイル全体の索引（coverageEntries: 束＋語ごと＋term/reading）には 同表記異読だけを
 * 当てる——term は 文や かな始まりが 正当なので、死にエントリ検査の 対象にしない。
 */
export function checkFuriganaEntrySoundness(entries: readonly ContentEntry[]): Finding[] {
  return entries.flatMap(({ file, content }) => {
    const findings: Finding[] = [];
    const arrays: { path: string; list: FuriganaEntry[] }[] = [];
    collectFuriganaArrays(content, "", arrays);

    const conflictReported = new Set<string>();
    for (const { path, list } of arrays) {
      for (const problem of checkFuriganaEntries(list)) {
        if (problem.kind === "conflict") conflictReported.add(problem.surface);
        findings.push({ file, level: "error", message: `${path}: ${problem.message}` });
      }
    }

    // ファイル全体の索引プール（画面が実際に引く形）での同表記異読。
    // 並び順の先勝ち／後勝ちで検査と画面が逆になるので、プールの中でも1表記1読みを守る。
    for (const problem of checkFuriganaEntries(coverageEntries(content))) {
      if (problem.kind !== "conflict" || conflictReported.has(problem.surface)) continue;
      conflictReported.add(problem.surface);
      findings.push({
        file,
        level: "error",
        message: `索引プール（furigana＋語ごと＋term/reading を合わせたもの）: ${problem.message}`,
      });
    }
    return findings;
  });
}
