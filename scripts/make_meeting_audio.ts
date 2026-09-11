/**
 * ミーティングの「決まっている ことば」を 音に する（CI から 走らせる）
 *
 * ## なぜ CI で 作るのか
 * 音づくりには Gemini の 鍵が 要る。この プロジェクトの 鍵は **BYOK**（学習者・先生が
 * 自分の キーを 画面から 登録する）方式で、サーバにも `.env` にも 置かない
 *（`docs/deploy.md` の 表・`scripts/check_build_env.mjs` の 検査）。
 * 唯一 置いて ある のは **GitHub の Environment Secrets（`Preview`）**なので、
 * 「鍵の 要る 作業は GitHub Actions の 中で やる」——ユーザーに コマンドを
 * 叩かせない ため（docs/constraints.md 運用の制約）。
 *
 * ## 何を するか
 * 教材の しつもんと おわりの ひとことを 1文ずつ 読み上げ、
 * `public/audio/meetings/<教材ID>/<キー>.wav` に 置いて、
 * 教材データ（`content/meetings/<教材ID>.json`）に `audioUrl` を 書き足す。
 *
 * 1文ずつ 別の ファイルに するのは、会話が 行ったり 来たり する ため
 *（言い直し）。1本に つなぐと、その 質問の ところから 鳴らすのに 秒数を
 * 測って 持たなければ ならない（studio の 音声づくりと 同じ 考え方）。
 *
 * ## 声は 人物カードの もの
 * まんが・たいわ・ミーティングで 同じ 人の 声に する ため、`content/characters/<id>.json`
 * の `voice` を 使う（ここで 別の 声を 当てない）。
 *
 * ## 読み上げたか どうかを **その場で 確かめる**（2026-08-28）
 * Live は 会話の モデルなので、台本が しつもんの 形だと **答えて しまう**ことが ある。
 * 実際に ヘンディさんの 音声で 起きた（「…仕事を 1つ 教えて ください」に 18秒 かけて
 * 三好市の 話を 答えて いた）。長さも 中身も 台本と ちがうのに、
 * ファイルは できて いる ので **だれも 気づけなかった**——聞くまで 分からない。
 *
 * そこで `outputAudioTranscription`（モデル自身の 発話の 文字起こし）を 一緒に もらい、
 * 台本と 見くらべる。合わなければ 作り直し、それでも 合わなければ **書かない**
 *（書かなければ もう一度 走らせた ときに 作り直される）。
 *
 * 使い方: `GEMINI_API_KEY=… node --import tsx scripts/make_meeting_audio.ts <教材ID> [--force]`
 * `--force` は すでに ある ものも 作り直す。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { OUT_RATE, synthesizeWithFallback, toWav } from "./lib/live_tts";

const meetingId: string = process.argv[2] ?? "";
/** すでに ある ものも 作り直すか。 */
const force: boolean = process.argv.includes("--force");
if (!meetingId) {
  console.error("使い方: node --import tsx scripts/make_meeting_audio.ts <教材ID>");
  process.exit(1);
}
/** 何を 読み上げる つもりか **だけ** 出して 終わる（鍵が 要らない・目で 確かめる ため）。 */
const listOnly: boolean = process.argv.includes("--list");
const apiKey: string = process.env.GEMINI_API_KEY ?? "";
if (!apiKey && !listOnly) {
  console.error("GEMINI_API_KEY が ありません（GitHub の Environment「Preview」に あります）");
  process.exit(1);
}

const meetingPath = join("content", "meetings", `${meetingId}.json`);
const meeting = JSON.parse(readFileSync(meetingPath, "utf8"));

/** 人物カードの 声（まんが・たいわ・ミーティングで 同じ 人は 同じ 声）。 */
function voiceOf(id: string): string {
  const path = join("content", "characters", `${id}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")).voice ?? "Puck") : "Puck";
}
const voice: string = voiceOf(meeting.host.id);

/**
 * 読み上げる 文。並びは 画面に 出る 順。
 *
 * ## 対話ゲーム（`talkGame`）も 音に する（2026-08-31 の 指定
 * 「松井社長の 用意された セリフは 全て 音声化して ください」）
 *
 * 教材が **先に 持って いる ことば**は ぜんぶ 対象に する——第一声・出だしの しつもん・
 * 深掘りの 予備・聞く ばんの さそい・とっておきの 話・おわりの ひとこと。
 *
 * **その場で AIが 作る しつもんと 返事は 作り置きに できない**（毎回 ちがう ことば）。
 * そこは これまでどおり Live の 声が 読む。鍵の 無い 学習者には 字だけ 出る。
 */
const talkGame = meeting.talkGame as
  | {
      opening?: string;
      openers?: { ask?: string }[];
      probes?: string[];
      listenInvite?: string;
      reward?: string;
    }
  | undefined;

/**
 * 朝礼・夕礼（`asakai`）の 読み上げる 行
 *
 * ## しつもんが 無い 教材
 * 朝礼は 学習者が **1本の 報告を して、足りない ところだけ 聞き返される** 形なので
 * `questions` を 持たない（`src/content/schema.ts` の superRefine が そう 決めて いる）。
 * 代わりに 5つの 場面が それぞれ **開き → 見本 → ふり → 受け止め → 采配 →
 * メンバー → 閉じ**を 持つ。ここを 上から 音に する。
 *
 * ## 声は **話す 人ごと**
 * 司会・ニャム・奥田・藤木が 1つの 場面で 順に 話す。ミーティングの ように
 * ホスト 1人の 声で 通すと、だれが 話して いるか 耳では 分からない。
 *
 * ## `◯◯` の 行は 作らない
 * この 教材の `◯◯` は **穴うめの 目印**でも ある（「きのうは ◯◯を しました」の 形で）。
 * 名前として 埋めると 意味が 壊れる 行が あるので、`◯◯` を 含む 行は そのまま
 * 字で 読む（読み上げの 照合も「まるまる」で 落ちる）。
 */
interface AsakaiLine {
  speakerId: string;
  text: string;
  audio?: string;
}
interface Job {
  key: string;
  text: string;
  voice: string;
  /** 音が できた ときに 教材へ 書き戻す。 */
  apply: (url: string) => void;
}

function asakaiJobs(): Job[] {
  const jobs: Job[] = [];
  const add = (key: string, line: AsakaiLine | undefined): void => {
    if (!line?.text?.trim() || line.text.includes("◯")) return;
    jobs.push({
      key,
      text: line.text,
      voice: voiceOf(line.speakerId),
      apply: (url) => {
        line.audio = url;
      },
    });
  };
  const scenes = meeting.asakai.scenes as {
    opening: AsakaiLine[];
    sample: AsakaiLine;
    prompt: AsakaiLine;
    ack: AsakaiLine;
    members: AsakaiLine[];
    arrange?: { done: AsakaiLine; missing: AsakaiLine };
    closing: AsakaiLine[];
  }[];
  for (const [at, scene] of scenes.entries()) {
    scene.opening.forEach((line, n) => add(`s${at}-opening-${n}`, line));
    add(`s${at}-sample`, scene.sample);
    add(`s${at}-prompt`, scene.prompt);
    add(`s${at}-ack`, scene.ack);
    scene.members.forEach((line, n) => add(`s${at}-member-${n}`, line));
    add(`s${at}-arrange-done`, scene.arrange?.done);
    add(`s${at}-arrange-missing`, scene.arrange?.missing);
    scene.closing.forEach((line, n) => add(`s${at}-closing-${n}`, line));
  }
  return jobs;
}

/** しつもん・対話ゲーム・おわりの ひとこと（これまでの 教材）。声は ホスト 1人。 */
function classicJobs(urls: Record<string, string>): Job[] {
  return [
    ...meeting.questions.map((q: { id: string; ask: string }) => ({ key: q.id, text: q.ask })),
    ...(talkGame
      ? [
          { key: "opening", text: talkGame.opening ?? "" },
          ...(talkGame.openers ?? []).map((one, at) => ({
            key: `opener-${at}`,
            text: one?.ask ?? "",
          })),
          ...(talkGame.probes ?? []).map((text, at) => ({ key: `probe-${at}`, text })),
          { key: "listenInvite", text: talkGame.listenInvite ?? "" },
          { key: "reward", text: talkGame.reward ?? "" },
        ]
      : []),
    { key: "closing", text: meeting.closing },
  ]
    .filter((line) => line.text?.trim())
    .map((line) => ({
      ...line,
      voice,
      /* 書き戻しは これまでどおり **まとめて** する（下の `writeClassic`）。 */
      apply: (url: string) => {
        urls[line.key] = url;
      },
    }));
}

/** 作れた ものの 一覧（これまでの 教材の 書き戻しに 使う）。 */
const urls: Record<string, string> = {};
const lines: Job[] = meeting.asakai ? asakaiJobs() : classicJobs(urls);

/**
 * 本体。**トップレベルの await を 使わない**——このリポジトリの `.ts` は
 * CJS として 読まれる ので（package.json に type: module が 無い）、
 * トップレベルで await すると 変換の 時点で 落ちる（2026-08-18 に 実発生）。
 */
async function main(): Promise<void> {
  if (listOnly) {
    for (const [at, line] of lines.entries()) {
      console.log(`${at + 1}\t${line.key}\t${line.voice}\t${line.text}`);
    }
    console.log(`合計 ${lines.length}本`);
    return;
  }
  const outDir = join("public", "audio", "meetings", meetingId);
  mkdirSync(outDir, { recursive: true });

  const failed: string[] = [];
  let made = 0;
  /** 同じ 文・同じ 声は **1回だけ** 作って 中身を 写す（5日ぶんの 同じ ふりなど）。 */
  const already = new Map<string, string>();

  for (const [index, line] of lines.entries()) {
    const file = join(outDir, `${line.key}.wav`);
    const url = `/audio/meetings/${meetingId}/${line.key}.wav`;
    /*
     * すでに ある ものは 作り直さない。
     * 1回目で 6つ 作れて 7つ目で 落ちた ことが ある（2026-08-18）。
     * 作り直しに すると、もう一度 走らせる たびに 全部 作る ことに なり、
     * 上限に ぶつかる 回数も 増える。
     */
    if (existsSync(file) && !force) {
      console.log(`(${index + 1}/${lines.length}) ${line.key} … すでに あります`);
      line.apply(url);
      made += 1;
      already.set(`${line.voice}|${line.text}`, file);
      continue;
    }

    /*
     * 同じ 文を もう一度 Gemini に 読ませない。5日ぶんの「では 次に …」の ように
     * **文は 同じでも URL は 別**に する 決まり（`asakaiLineSchema` の 説明）なので、
     * ファイルは 5つ 要るが、作るのは 1回で よい。枠も 時間も 5分の1に なる。
     */
    const twin = already.get(`${line.voice}|${line.text}`);
    if (twin) {
      writeFileSync(file, readFileSync(twin));
      line.apply(url);
      made += 1;
      console.log(`(${index + 1}/${lines.length}) ${line.key} … 同じ 文を 写しました`);
      continue;
    }

    process.stdout.write(`(${index + 1}/${lines.length}) ${line.key} … `);
    try {
      const spoken = await synthesizeWithFallback(line.text, { apiKey, voice: line.voice });
      writeFileSync(file, toWav(spoken.pcm));
      line.apply(url);
      made += 1;
      already.set(`${line.voice}|${line.text}`, file);
      const seconds = (spoken.pcm.byteLength / OUT_RATE / 2).toFixed(1);
      // **読み上げた 中身を 残す**。あとから ログだけで 台本と 見くらべられる
      console.log(`${seconds}秒 「${spoken.transcript.trim()}」`);
    } catch (error) {
      /*
       * 1つ 作れなくても **そこで 全部を 捨てない**。
       * 前は ここで 投げて いた ので、6つ 作れて いたのに 何も 残らなかった。
       * 作れた ぶんは 教材に 書き、作れなかった ものだけを 報告する
       *（もう一度 走らせれば、足りない ものだけを 作る）。
       */
      console.log("できませんでした");
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      failed.push(line.key);
    }
  }

  /*
   * 朝礼・夕礼は `apply` が **その行に 直接** 書いて いる（`asakai.scenes[].*.audio`）。
   * 下の 書き戻しは これまでの 教材（しつもん・対話ゲーム）の ためだけの もの。
   */
  if (!meeting.asakai) {
    meeting.questions = meeting.questions.map((q: { id: string }) =>
      urls[q.id] ? { ...q, audioUrl: urls[q.id] } : q,
    );
    if (urls.closing) meeting.closingAudioUrl = urls.closing;
  }
  /*
   * 対話ゲームの ぶんは **1つの 台帳（`talkGame.audio`）**に まとめる。
   * `probes` は ただの 文字列の 並びで、`opening` / `listenInvite` / `reward` は
   * 1つずつ 別の 欄——欄ごとに `…AudioUrl` を 足すと 5種類 増える うえ、
   * `probes` は 形ごと 変える ことに なる。鍵 → 音の URL の 対応表 1枚で 足りる。
   */
  if (meeting.talkGame && !meeting.asakai) {
    const keys = Object.keys(urls).filter(
      (key) =>
        key === "opening" ||
        key === "listenInvite" ||
        key === "reward" ||
        key.startsWith("opener-") ||
        key.startsWith("probe-"),
    );
    if (keys.length > 0) {
      meeting.talkGame.audio = {
        ...(meeting.talkGame.audio ?? {}),
        ...Object.fromEntries(keys.map((key) => [key, urls[key]])),
      };
    }
  }
  writeFileSync(meetingPath, `${JSON.stringify(meeting, null, 2)}\n`);
  console.log(`${meetingPath} に 音の 場所を 書きました（${made}/${lines.length}）`);

  if (failed.length > 0) {
    console.warn(
      `⚠ 作れなかった もの: ${failed.join(" ")}（もう一度 走らせると 足りない ぶんだけ 作ります）`,
    );
  }
  if (made === 0) {
    console.error("1つも 作れませんでした");
    process.exit(1);
  }
}

/*
 * **作り終えたら 自分で 終わる**（2026-08-31）。
 *
 * Live の つなぎ（WebSocket）は 閉じても すぐには 片づかない ので、`main()` が
 * 終わっても node は 待ち続ける。GitHub Actions では これが **30分の 上限まで 居座り**、
 * そのあと ジョブごと 落ちる——**音は もう 出来て いるのに、コミットの 手前で 消える**。
 *
 * 実際に そうなった: 14本 ぜんぶ 12:52 に 出来て いたのに、19分 止まった まま
 * 打ち切られ、`opener-1.wav` は runner ごと 捨てられた（run 33393730779）。
 * 書き終えた ところで はっきり 0 を 返す。
 */
void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
