/**
 * 相手の ことばに 差し込む — `◯◯` を 何で 埋めるか（純粋な文字列づくり）
 *
 * ## 同じ `◯◯` でも 役が ちがう（`src/content/schema.ts`）
 * - `ask`（相手の質問）・`closing`・`reward` … **学習者の呼び名**に置きかわる
 * - `echo`（受け答え）… **学習者の答え**に置きかわる（おうむ返し＋共感）
 * - `hint`（型文）… **どちらでもない**。学習者が自分のことばを入れる穴なので
 *   穴のまま見せる（差し込みは `src/lib/meeting/hint.ts` の担当）
 *
 * ## なぜ ここに 切り出したか（実際に 壊れていた）
 * 画面には呼び名を差し込む `withName()` が1つだけあり、受け答えを作るときも
 * まず それを 通していた:
 *
 * ```ts
 * echo: withName(question.echo).replaceAll(NAME_MARK, coreOf(utterance))
 * ```
 *
 * `withName()` が先に `◯◯` を**全部**呼び名へ変えてしまうので、後ろの置換は
 * 当たる先が残っていない。AI判定が使えない教室（キー未登録＝標準）では、
 * 「そうです、**ソピア**ですね。サービスの ページを 見たんですね。」と、
 * 相手が学習者の名前を答えとして復唱していた。
 *
 * 役ごとに関数を分けて、テストで固定する。画面側に置くと、レイアウトを直すたびに
 * 順番が入れかわり、同じ壊れ方が黙って戻ってくる。
 */

/** 相手の ことばの 中で、置きかわる ところの 目印。 */
export const NAME_MARK = "◯◯";

/** 呼び名が まだ 決まっていない ときの 呼び方（`◯◯` を 画面に 残さない）。 */
export const NO_NAME = "あなた";

/* ------------------------------------------------------------------ *
 * 呼び名（ask / closing / reward）
 * ------------------------------------------------------------------ */

/**
 * 文の あたまの 呼びかけ（「◯◯さんは、」「◯◯さん、」）。
 *
 * 名前が まだ 無い 端末では、ここを「あなた」で 埋めると **「あなたさん」**に なる
 *（実機で 出ていた）。日本語では 呼びかけは 落としても 文が 立つので、
 * 呼びかけごと 消す。文の 途中の「◯◯さんの」等は 落とすと 意味が 変わるので、
 * そちらは「あなた」に 置きかえる（下の `fillName`）。
 */
const VOCATIVE = /(^|[。！？!?\n])[ 　]*◯◯さん[はがも]?[、，,]?[ 　]*/gu;

/**
 * 呼び名を 差し込む（`ask` / `closing` / `reward` 用）。
 * 名前が まだ 無い 学習者には、呼びかけを 落として 文だけを 見せる。
 */
export function fillName(text: string, learnerName: string): string {
  const name = learnerName.trim();
  if (name !== "") return text.replaceAll(NAME_MARK, name);
  return text
    .replace(VOCATIVE, "$1")
    .replaceAll(`${NAME_MARK}さん`, NO_NAME)
    .replaceAll(NAME_MARK, NO_NAME)
    .trim();
}

/* ------------------------------------------------------------------ *
 * 答え（echo）
 * ------------------------------------------------------------------ */

/** 文の 終わり。 */
const SENTENCE_BREAK = /[。．！？!?]/u;
/** それだけでは 答えの 中身に ならない あいづち（「はい。ほうこくします。」の「はい」）。 */
const FILLER =
  /^(?:はい|いいえ|ええ|うん|あの|あのう|えっと|えーと|そうですね|すみません)[、，,]?$/u;
/** 文の あたまの 自分（「わたしは」）。相手が おうむ返しする 中身では ない。 */
const SELF_HEAD = /^(?:わたし|私|ぼく|僕|わたくし)(?:は|が)[ 　]*/u;
/** 名詞に つく 丁寧の コピュラ（「ソピアです」）。ここだけ 落とすと 名詞が 残る。 */
const COPULA_TAIL = /(?:ですか|でしたか|でしょう|でした|です)$/u;
/** 丁寧形の 動詞で 終わる 文節（「来ました」「おねがいします」「います」）。 */
const POLITE_VERB = /(?:ます|ました|ません|ませんでした)[、，,]?$/u;
/** て形の 文節（「勉強して」「読んで」）。うしろの 動詞と ひとつづきなので 一緒に 落とす。 */
const TE_FORM = /(?:.て|んで|いで)[、，,]?$/u;
/** 名詞に つく 助詞。述語を 落とした あとに 残ると、文が つながらない。 */
const CASE_PARTICLE = /(?:から|まで|より|[をにへとでがは])[、，,]?$/u;
/** 分かち書きで ない 答え（声・IMEの くせ）を、さいごの 助詞で 切るための 形。 */
const BEFORE_PARTICLE =
  /^(.*)(?:から|まで|より|[をにへとが])[^\s]*(?:ます|ました|ません|ませんでした)$/u;

/**
 * 学習者の 答えから、相手が おうむ返しする「中身」だけを 取り出す。
 *
 * ## 1文だけ 見る（実際に 壊れていた）
 * 型文どおり「ソピアです。よろしく おねがいします。」と 答えると、末尾の
 * 「します。」だけを 削る 作りでは「ソピアです。よろしく おねがいし」が 残り、
 * 「◯◯さんですね。」に 差し込まれて **「ソピアです。よろしく おねがいしさんですね。」**
 * に なっていた。答えは 1文とは かぎらないので、**はじめの 1文**だけを 見る。
 *
 * ## 落とし方は 2とおり
 * - 「◯◯です」… コピュラだけ 落とす（「ホームページです」→「ホームページ」）
 * - 「◯◯から 来ました」… 述語の 文節を 丸ごと 落とす（→「カンボジア」）。
 *   「ました」だけを 削ると「来」という 語幹が 残り、日本語で なくなる。
 *
 * 規則で 分かる ぶんだけを 見る（意味の 判定は `judge-api.ts` の 役）。
 * ここは AI判定に 通せなかった ときの 受け答えなので、正しさより **壊れない こと**を 取る。
 */
export function answerCore(raw: string): string {
  const sentence = firstMeaningfulSentence(raw);
  if (sentence === "") return "";
  const body = sentence.replace(SELF_HEAD, "").trim();
  const withoutCopula = body.replace(COPULA_TAIL, "").trim();
  if (withoutCopula !== body) return tidy(withoutCopula);
  return tidy(dropPredicate(body));
}

/** はじめの 1文。あいづちだけの 文は 読みとばす（中身は そのつぎに ある）。 */
function firstMeaningfulSentence(raw: string): string {
  const list = raw
    .split(SENTENCE_BREAK)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return list.find((part) => !FILLER.test(part)) ?? list[0] ?? "";
}

/**
 * 述語（丁寧形の 動詞と、その 手前の て形）を 文節ごと 落とす。
 * 述語が 見つからない ときは 何も しない——名詞の 並び（「大阪と 東京」）を 削らない。
 */
function dropPredicate(text: string): string {
  const chunks = text.split(/[ 　]+/u).filter((chunk) => chunk !== "");
  // 分かち書きで ない ときは 文節に 割れないので、さいごの 助詞で 切る
  if (chunks.length <= 1) return BEFORE_PARTICLE.exec(text)?.[1]?.trim() || text;

  let cut = chunks.length;
  while (cut > 1) {
    const last = chunks[cut - 1]!;
    // て形を 落とすのは、うしろの 動詞を すでに 落とした ときだけ
    const predicate = POLITE_VERB.test(last) || (cut < chunks.length && TE_FORM.test(last));
    if (!predicate) break;
    cut -= 1;
  }
  if (cut === chunks.length) return text;
  return chunks.slice(0, cut).join(" ").replace(CASE_PARTICLE, "");
}

/** 前後の 空白と 読点を そろえる（差し込んだ 先で 点が 二重に ならない ように）。 */
function tidy(text: string): string {
  return text.replace(/^[\s、，,]+/u, "").replace(/[\s、，,]+$/u, "");
}

/**
 * 学習者の 答えを 差し込む（`echo` 用）。
 *
 * 中身の 取り出し（`answerCore`）を **この中で** する。呼び出し側で 別の 関数を
 * 通す 形に して いた ころ、末尾だけを 削る 関数が 使われて 文が 壊れていた。
 *
 * 答えが 空の ときは **空文字**を返す。おうむ返しは「聞こえたことを もう一度」
 * なので、聞こえていない ときに 出す 文は 無い（画面は 空なら 何も 出さない）。
 * ここで `◯◯` の ままにすると、目印が そのまま 学習者の 目に 入る。
 */
export function fillAnswer(echo: string, answer: string): string {
  const core = answerCore(answer);
  if (core === "") return "";
  return echo.replaceAll(NAME_MARK, core);
}

/**
 * 「もう いちど」を 押した とき、しつもんを 鳴らし直すか。
 *
 * ## なぜ 鳴らし直すか
 * 言い直しを 頼まれた 学習者は、**何を 聞かれて いたか**を もう一度 確かめたい
 *（2026-08-21 の 指定）。字は 画面に 残って いるが、聞き取りの 練習なので 音で 要る。
 *
 * ## なぜ 相手が 話して いる 間は 鳴らさないか
 * 受け止めの こえと 重なる。声が 2つに なるのは、この 教材で 何度も 起きた 事故。
 *
 * 純関数に して あるのは、**鍵の 無い 通し検証では ここを 通れない**ため
 *（鍵が 無いと 規則ベースの 見かたに なり、「もう いちど」が 出ない）。
 * 画面で 確かめられない ぶん、条件だけは テストで 固定する。
 */
export function shouldReplayAsk(state: { hasAudio: boolean; hostSpeaking: boolean }): boolean {
  return state.hasAudio && !state.hostSpeaking;
}

/**
 * ト書き（かっこの 中の 説明）を 取りのぞく。
 *
 * 人格には「学生の ことばを 受け止めて、みじかく 返す」の ような **やり方の 指示**が
 * 書いて ある。相手役は それを **そのまま 声に 出す ことが ある**——学習者には
 *「そうですか、よかったです。（学生の言葉を受け止めて、共感する）」と 届いた
 *（2026-08-21 の 指摘。2026-08-20 にも 別の 文で 起きて いる）。
 *
 * 指示文で 止めるだけでは 取りこぼす ので、**画面に 出す ところで 落とす**。
 * こえは 止められないが、少なくとも 字には 残さない。
 *
 * 落とすのは **説明として 長い かっこ**だけに する（「すみません（ありがとう）」の
 * ような 短い 言いかえまで 消すと、教材の ことばが 欠ける）。
 */
export function stripDirections(text: string): string {
  return text
    .replace(/[（(][^）)]{6,}[）)]/g, "")
    .replace(/[ \u3000]{2,}/g, " ")
    .trim();
}
