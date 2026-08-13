<!-- 設計ワークフロー wf_2177709f-d0e の統合結果（2026-08-07）。
     3案を独立に立て、規律・実装・先生の3観点で審査し、勝ち案に他案の良い所を接いだもの。
     この文書は計画であって契約ではない。契約は src/content/schema.ts と content-checks.ts。 -->

# AI教材づくりの段階フロー — 実装計画（そうだんテーブル / craft）

相対表記はすべてリポジトリルート基準（計画作成時は作業worktree `supabase-profiles-inspection-2ce21d` 上で計測した）。実測ベースライン（2026-08-07時点）: `npx vitest run` = 34ファイル / 496テスト green、`npm run lint:content` = エラー0 / 警告0。

---

# そうだんテーブル（craft）実装計画 — 4段の合意 → 生成 → 公開

勝ち案「そうだんテーブル」を軸に、他案の移植価値（planスロットの `speechInImage` かな縛り・shape 一元化、レシピの carryOver・学習者と同じプレビュー・段の骨格）を接いだ。審査で出た致命傷は §0 の対応表で全部つぶすか、§8 で「やらない」と明記した。

## 0. 致命傷の対応表（塞ぐ／やらない）

| # | 指摘 | 対応 |
|---|---|---|
| A1 | 焼き込みで規律1・2が死ぬ（学習者が読むのはピクセル、検査が読むのは `lines`） | 焼く文字を `mangaPanel.bakedText[]` として**教材本体に持つ**。`checkForbiddenWords` は全文字列走査なので自動で効く。`bakedText` は `kanaOf()` の機械変換＝漢字ゼロなので、ふりがな全覆いも自明に通る。**さらに `checkBakedSpeech` を新設**し「焼いた文字 ≠ いまのセリフのかな」を公開時 error にする（古い絵が残ったまま公開される穴を塞ぐ） |
| A2 | `craftDraftSchema` が `contentSchema` の refine を継承せず、規律3・keywords実在・noJapanese が全部落ちる | **craft 側に教材スキーマの写しを持たない**。`craft.draft` は `z.unknown()`。段③の承認は `assemble()` → `contentSchema.safeParse` → `content-checks` を通る（＝本物の契約1つだけ） |
| B1 | `z.toJSONSchema()` は Gemini responseSchema に通らない（tuple→prefixItems・literal→const・union→oneOf） | **z.toJSONSchema を使わない**。既存 `MANGA_SCRIPT_SCHEMA` と同じ手書き shape 定数を1種別1つ持ち、Codex の `outputSchema` と Gemini の `responseSchema` に**同じ定数**を渡す。Gemini-safe な語彙しか使っていないことをテストで固定 |
| B2 | Codex に JSON 強制が無い、は前提が誤り | **実測確認済み**（codex-cli 0.145.0 `app-server generate-json-schema`）: `TurnStartParams.outputSchema` = "Optional JSON Schema used to constrain the final assistant message" が存在。`TurnInterruptParams` = `{threadId, turnId}` も存在。両方使う |
| B3 | 文脈digest を Worker で組むと Error 1102 | ブラウザで組む（`studio-shell` が `merged` / `textsByRef` / `knownTerms` を既に持つ）。Gemini 経路のサーバは受け取った context を検証して**再度切り詰めるだけ** |
| B4 | 「既存への変更は3点だけ」が過少申告 | §7 に触るファイルを全部列挙した（14コミット） |
| B5 | 所要時間に根拠が無い | 未実測なので数字を書かない。コミット6で計測し、段③が90秒を超えたら beats 単位に割る閾値をコードに持つ（§6） |
| B6 | `imageSlot.status="generating"` を書くと消えない嘘が残る | **やらない**（§8）。生成中の実状態は `craft.assets[].state` |
| C1 | 学習者と同じ見え方のプレビューが無い | `/admin/preview/[kind]/[id]`（管理者のみ・ISRなし）を新設。`stage-list` の「見る ↗」は下書きならここへ向ける（404 が ISR に焼き付く問題も同時解消） |
| C2 | 旧 MangaMaker を同画面に残すと1クリックで承認済みが消える | 新経路が入った種別で**旧AIパネルを同時に消す**（共存させない）。呼び手ゼロを確認して `/api/studio/manga`・`/api/studio/vocab` も同コミットで削除 |
| C3 | Codex は先生の端末の localhost 依存 | 「AI設定」に接続状態を常時表示＋**「このPCでは Gemini を既定にする」トグル**。押す前に分かる。黙ってフォールバックしない |
| C4 | 親ステージが保存されず「浮いた教材」になる | 段①で craft を作る時点で**親ステージを先に保存**（`stageSchema.contents` を `min(0)` に緩め、`min(1)` は公開時のみ要求） |
| C5 | 通しが長すぎる／急行レーンが無い | 「おまかせ」（①→②→③を続けて回し、承認をまとめて1回）を用意 |
| C6 | 3案を①に置くのは判断材料が無い比較 | **案の提示を②へ移動**。①は1案＋その場編集、②で **2案**（3枚は読み比べが重い） |
| C7 | 文脈カードが128個のチェックボックスになる | 語彙は**ステージ単位のグループ**でON/OFF。外した内容は各段のヘッダに1行常時表示 |
| C8 | stale が段単位だと1行直して8枚が古くなる | stale は **beat 単位／コマ単位**（`craft.assets[].beatId` と `sourceHash`） |
| C9 | まんが・よみものに FuriganaEditor が無く、誤読ルビを直せない | 段③の画面に `FuriganaEditor` を必ず出す＋ manga-editor / article-editor にも足す。AIが付けた読みには「AIが つけました」の印（先生が触ると消える） |
| C10 | JSONが2回壊れたとき先生の行動が無い | 失敗カードに「Gemini で ためす」「②に もどる」を必ず出す |
| E1 | **`checkFuriganaCoverage` が保存経路で1度も走らない**（＝規律2がAI生成の全経路で不在） | `runContentChecks` に足す。**公開時 error / 下書き warn**（作りかけを守る） |
| E2 | `checkSecretLeaks` が warn で CI も保存も止まらない | **error に昇格**。現状 lint:content が 0/0 なので既存データは落ちない（実測確認済み） |
| E3 | 規律9（国名）に検査コードが1行も無いのに生成量だけ増える | `checkCountryNames` 新設（許可リスト方式・常時 error）。生成プロンプトにも許可リストを逐語同梱 |
| E5 | 産出フェーズの quizset がAI経路から構造的に消える | `craftBrief.phase` を段①で選ばせ、production では shape から choose/multi/emotion を外す（既存 superRefine と二重の担保） |
| E6 | R8-1「日本語が拙い＝能力が低い」等、機械化できない最重要原則にレビュー段が無い | 公開の直前に**「先生の目でみる3つ」**（3項目だけ・記録に残す）。全項目は無理なので3つに絞る |
| — | たいわ（scenario）は reqs×10・秘匿とP4伏線の境界が未定義・エディタも無い | **やらない**（§8） |

---

## 1. 段階フローの決定版（種別ごと）

**5段は全種別で同じ形**。変わるのは各段のカードの中身だけ。先生は1回覚えれば5種類作れる。

| | ① そうだん | ② したじ（案は**ここ**で2つ） | ③ なかみ | ④ かたち | ⑤ こうかい |
|---|---|---|---|---|---|
| **共通** | 先生が1〜3行＋量＋出る人。AIは**1案**を返し、その場で全項目を直せる | AIが **A案/B案** の `beats[]`（id/label/何が起きるか/ここで学ぶこと/使う語）＋ `carryOver`（前の教材から引きつぐこと1文）。行の追加・削除・並べ替え・**1行だけ作り直す** | beats を順に埋めて**教材そのもの**を作る。受け取り直後に `assemble` → `contentSchema` ＋ content-checks を走らせ、**足りない読み・違反だけ**を第2ターンで直させる | 絵・音を**1件ずつ直列**。とめられる／1件ごとに保存／失敗した1件だけやり直す | 学習者と同じ見た目でプレビュー →「先生の目でみる3つ」→ したがき／こうかい |
| **まんが** | 完成形を3択（4コマ／よこ長1枚絵／文字入り1枚絵）＝ `shape` | 場面の流れ | ページ・コマ割り・セリフ・各コマの絵の指示・読み辞書 | コマごとに1枚。文字入りモードは `kanaOf` で焼く文字を機械生成 | 焼き文字とセリフの一致（error）／コマ絵の欠けを表示 |
| **リスニング** | 場面・話者・行数 | 会話の展開 | participants・script・keywords（**台本に実在**をその場で検査）・読み辞書 | Gemini Live TTS で台本ぜんぶ→1本の wav。話者の声は `character.voice` から引く | 音の有無・`script[].at` |
| **もんだい** | **読解確認 / 産出**を選ぶ（＝`phase`） | 出題の並び（何を確かめるか） | questions[]（production では選択式を shape から外す）・読み辞書 | **なし**（段は消さず「絵と音は ありません」と出して自動承認） | 規律3を既存 superRefine が二重に担保 |
| **よみもの** | 見出しの数・ねらい | 見出し構成 | blocks[]（**link ブロックはAIに作らせない**＝導線一致検査で必ず落ちるので先生が付ける）・読み辞書 | 挿絵（任意・1枚ずつ） | 導線の一致は CI の `checkLinkOrder` |
| **ことば** | 元にする教材を選ぶ（既存の抽出プロンプトを流用） | 語のグループ分け | words[]（meaningEn / wrongMeanings×3 は英語・スキーマが日本語を弾く） | **なし** | 出題数 ≤ 語数 |
| **たいわ** | — | — | — | — | **やらない**（§8） |

原則2つ:
1. **承認するまで教材データに1文字も書かない。** AIの出力は必ずプレビューのカードに出る（現行 `manga-maker.tsx:81-85` の `onChange` 直行と `:282-287` の無確認全消しを構造で殺す）。
2. **もどっても消えない。** ②を直すと、その beat から来た③の要素と④の絵にだけ ⚠ が付く。古い絵は**表示され続け**、隣に「作り直す」が出る。捨てるのは先生が押したときだけ。

---

## 2. schema.ts の差分（既存フィールドはすべて残す）

### 2-1. `/Users/tomy/.../src/content/schema.ts`（3か所だけ）

```ts
/* ---- (1) mangaPanelSchema に1フィールド追加 ---- */
const mangaPanelSchema = z.object({
  size: z.enum(["normal", "wide", "tall"]).default("normal"),
  image: imageSlotSchema.default({ refs: [], status: "empty" }),
  lines: z.array(mangaLineSchema).default([]),
  caption: plainText.optional(),
  /**
   * 絵の中に焼いた文字（speechInImage: true のときだけ入る）。
   *
   * lines[i] を読み辞書で かなに直したもの（kanaOf）。i番目の吹き出しに対応する。
   * **AIに書かせない**——機械変換にするのは、絵に焼いた文字とデータのセリフが
   * ずれる余地を無くすため（ずれると、直したのに古い字の絵が公開され続ける）。
   * ここに置く理由: 学習者が実際に読むのはこの文字列なので、禁止語検査
   *（collectStrings＝全文字列走査）の対象に入っていなければならない（規律1）。
   */
  bakedText: z.array(plainText).default([]),
});

/* ---- (2) mangaSchema.superRefine の末尾に足す（既存の話者チェックは残す） ---- */
const KANJI_ANY = /[㐀-鿿々]/u;
const KANA_ONLY = /^[ぁ-ゖァ-ヶーゔ0-9０-９、。！？…「」・\s]+$/u;
/** 絵に描かせる日本語は長いほど崩れる。1吹き出しの上限。 */
const MAX_BAKED_CHARS = 20;

  .superRefine((manga, ctx) => {
    /* …既存の characters 重複・speaker 検査はそのまま… */

    manga.pages.forEach((page, p) => {
      page.panels.forEach((panel, c) => {
        const at = (f: string) => ["pages", p, "panels", c, f];
        if (!manga.speechInImage) {
          // A モードに戻したのに焼き文字が残っていると、絵の字とアプリのセリフが二重に出る
          if (panel.bakedText.length > 0) {
            ctx.addIssue({ code: "custom", path: at("bakedText"),
              message: "「絵だけ」に もどしたら、絵も 作り直す（焼いた 文字が のこっている）" });
          }
          return;
        }
        if (panel.bakedText.length !== panel.lines.length) {
          ctx.addIssue({ code: "custom", path: at("bakedText"),
            message: `焼いた 文字が ${panel.bakedText.length}個、セリフが ${panel.lines.length}個 — 数を そろえる` });
        }
        panel.bakedText.forEach((text, i) => {
          if (KANJI_ANY.test(text)) {
            ctx.addIssue({ code: "custom", path: at(`bakedText[${i}]`),
              message: "絵に 焼く 文字に 漢字は 使えない（ふりがなを 焼けないので 学習者が 読めない・規律2）" });
          } else if (!KANA_ONLY.test(text)) {
            ctx.addIssue({ code: "custom", path: at(`bakedText[${i}]`),
              message: "絵に 焼く 文字は ひらがな・カタカナ・数字・記号だけ" });
          }
          if ([...text].length > MAX_BAKED_CHARS) {
            ctx.addIssue({ code: "custom", path: at(`bakedText[${i}]`),
              message: `絵に 焼く 文字は ${MAX_BAKED_CHARS}文字まで（長いと 字が くずれる）` });
          }
        });
        if (panel.lines.length > 2) {
          ctx.addIssue({ code: "custom", path: at("lines"),
            message: "文字を 絵に 焼くときは 1コマ 2つの 吹き出しまで" });
        }
      });
    });
  });

/* ---- (3) stageSchema.contents を min(0) に緩める ---- */
  /**
   * 学習順そのもの（並びが正）。
   * **min(0)**。中身より先に「枠だけ」を保存できないと、教材を1本作り切るまで
   * 先生は下書きを守れず、子だけ保存して親が消える事故（浮いた教材）が起きる。
   * 中身ゼロで公開させないための min(1) は、公開時だけ content-checks が要求する。
   */
  contents: z.array(stageContentRefSchema).min(0),
```

### 2-2. `/Users/tomy/.../src/content/craft.ts`（新規・`contentSchema` の union には**入れない**）

```ts
import { z } from "zod";
import { plainText } from "./schema";

/**
 * 教材づくりの下相談（craft）。**教材ではない。**
 *
 * contentSchema の union に入れない理由:
 *  - lint:content・ID一意検査・学習者ローダー・きょうざい一覧に混ざる
 *  - craft の存在理由は「まだ contentSchema を通らない作りかけを保存できること」
 * 置き場も studio_contents ではなく studio_crafts（学習者側は一切読まない）。
 */
export const CRAFT_STEPS = ["brief", "plan", "draft", "assets"] as const;

/** ① そうだん */
export const craftBriefSchema = z.object({
  goal: plainText,                                    // できるように なること（1文）
  scene: plainText,                                   // どんな 場面か
  level: z.enum(["N5", "N4", "N3"]).default("N4"),
  size: z.number().int().min(1).max(24).default(4),   // コマ／行／問／段落／語の数
  castIds: z.array(z.string().min(1)).default([]),
  words: z.array(plainText).max(12).default([]),      // ねらう語（設計02「課ごとに8〜12語」）
  /** まんがだけ。①②③は3つとも同じで、④の絵の作り方だけが変わる。 */
  shape: z.enum(["yonkoma", "picture", "picture-text"]).optional(),
  /** もんだいだけ。産出フェーズを選べないと、AI経路の教材が全部 読解確認になる（規律3の空洞化）。 */
  phase: z.enum(["research", "production"]).optional(),
  note: plainText.optional(),                         // 先生の追記（逐語でプロンプトへ）
});

/** ② したじ — 種別をまたいで同じ形 */
export const craftBeatSchema = z.object({
  id: z.string().regex(/^b[0-9]+$/),                  // 以降ずっと追跡キー（③④の stale もこれ）
  label: plainText,                                   // 「① こまる」
  summary: plainText,
  point: plainText,                                   // ここで学ぶこと
  words: z.array(plainText).default([]),
});

export const craftPlanSchema = z.object({
  title: plainText,
  description: plainText,
  /** 前の教材から引きつぐこと。先生が「本当に踏まえたか」を1目で判定する欄（必須）。 */
  carryOver: plainText,
  beats: z.array(craftBeatSchema).min(1).max(24),
});

/** ④ 1枚・1本ごとの作り物 */
export const craftAssetSchema = z.object({
  key: z.string().min(1),                             // "p0c1" / "audio"
  type: z.enum(["image", "audio"]),
  beatId: z.string().min(1).optional(),               // どの したじ から来たか（stale の単位）
  sourceHash: z.string().length(8),                   // もとにした文の指紋。ズレたら stale
  state: z.enum(["todo", "running", "done", "stale", "failed", "skipped"]).default("todo"),
  url: z.string().optional(),
  prompt: z.string().optional(),
  baked: z.array(plainText).default([]),              // 焼いた文字（かな限定）
  /** 文字入りモードの「読めましたか」。機械で判定できない唯一の点なので記録に残す。 */
  checkedByTeacher: z.boolean().default(false),
  message: plainText.optional(),
  tries: z.number().int().min(0).default(0),
});

/** 1段ぶんの記録。捨てた案も残す（もどれるようにする）。 */
const stepEnvelope = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    state: z.enum(["empty", "proposed", "accepted", "stale"]).default("empty"),
    accepted: payload.optional(),
    candidates: z
      .array(
        z.object({
          id: z.string().min(1),
          label: plainText,                            // 「A案：こまった顔から はじめる」
          payload,
          engine: z.enum(["codex", "gemini"]),
          createdAt: z.string(),
        }),
      )
      .max(4)                                          // 古いものから捨てる（jsonb を肥大させない）
      .default([]),
    acceptedAt: z.string().optional(),
    tries: z.number().int().min(0).default(0),
  });

export const craftSchema = z.object({
  kind: z.literal("craft"),
  id: z.string().regex(/^[a-z0-9_-]+$/),               // 作ろうとしている教材の id と同じ
  target: z.enum(["manga", "listening", "quizset", "article", "wordstage"]),
  stageId: z.string().min(1),
  brief: stepEnvelope(craftBriefSchema),
  plan: stepEnvelope(craftPlanSchema),
  /**
   * ③の産物＝教材そのもの。**ここでは形を決めない。**
   *
   * 教材の契約は contentSchema ただ1つ。ここに写しを置くと、schema.ts に規律を
   * 足しても craft 側に反映されない穴ができる（規律3・keywords実在・noJapanese が
   * 静かに抜ける）。AGENTS.md「再実装しない」/ 設計03「守らなくても壊れない構造」。
   * 検査は ③の承認（assemble → contentSchema → content-checks）と
   * /api/studio/content の保存の2か所で、同じ本物のスキーマが行う。
   */
  draft: stepEnvelope(z.unknown()),
  assets: z.array(craftAssetSchema).default([]),
  contextOff: z.array(z.string()).default([]),         // 先生が外した文脈のキー（グループ単位）
  /** 先生の目でみる3つ（公開の条件）。"dignity" | "vocab-kept" | "no-spoiler"。 */
  checks: z.array(z.string()).default([]),
  updatedAt: z.string(),
});
export type Craft = z.infer<typeof craftSchema>;
```

### 2-3. DB（新テーブル1枚。`studio_contents` は触らない）

`/Users/tomy/.../supabase/migrations/20260808090000_studio_crafts.sql`

```sql
create table public.studio_crafts (
  id text primary key,                 -- 教材の id と同じ（nextContentId で先に採番）
  target text not null,
  stage_id text,
  data jsonb not null,                 -- craftSchema
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
alter table public.studio_crafts enable row level security;
create policy studio_crafts_admin on public.studio_crafts
  for all using (public.is_admin()) with check (public.is_admin());
```

`src/lib/content-db.ts` はこのテーブルを一切読まない ⇒ **作りかけが学習者に漏れる経路が構造的に無い**。

### 2-4. 検査側（`/Users/tomy/.../src/lib/content-checks.ts` と保存API）

```ts
/* content-checks.ts に追加 */
/** 絵に焼いた文字が、いまのセリフのかなと一致しているか（規律1・2の焼き込み版）。 */
export function checkBakedSpeech(file: string, manga: Manga): Finding[];
/** 画面に出してよい国名だけになっているか（AGENTS.md 規律9。許可リスト方式）。 */
export function checkCountryNames(file: string, content: Content): Finding[];
/** 公開の条件（中身ゼロのステージを公開しない）。 */
export function checkStageReadyToPublish(file: string, stage: Stage): Finding[];

/* text/furigana.ts に追加 */
/** 読み辞書で漢字を読みに置き換える。漢字が残るなら null（＝焼けない）。 */
export function kanaOf(text: string, index: FuriganaIndex): string | null;
```

```ts
/* src/app/api/studio/content/route.ts の runContentChecks を差し替え */
function runContentChecks(content: Content, publishing: boolean): Finding[] {
  const label = `${content.kind}:${content.id}`;
  const findings = checkForbiddenWords(label, content);   // 常に error（データに入れない）
  findings.push(...checkCountryNames(label, content));    // 常に error（規律9）
  if (content.kind === "scenario") findings.push(...checkSecretLeaks(label, content)); // warn→error

  // 「学習者に出す条件」は公開のときだけ error にする。
  // 下書きまで止めると、作りかけの教材を守れなくなる（先生は保存をあきらめる）。
  const gate = (f: Finding[]): Finding[] =>
    publishing ? f : f.map((x) => ({ ...x, level: "warn" as const }));
  findings.push(...gate(checkFuriganaCoverage([{ file: label, content }]))); // ★規律2をAI経路にも
  if (content.kind === "manga") findings.push(...gate(checkBakedSpeech(label, content)));
  if (content.kind === "stage") findings.push(...gate(checkStageReadyToPublish(label, content)));
  return findings;
}
```

`scripts/lint_content.ts` にも `checkBakedSpeech` / `checkCountryNames` を1件ごとに足す（git 側は常に error のまま）。

---

## 3. Codex で文章を生成する仕組み

### 3-1. 実測でわかったこと（前提の訂正）

`codex app-server generate-json-schema` の v2 出力を確認した（codex-cli 0.145.0）:

- `TurnStartParams.properties.outputSchema` = `"Optional JSON Schema used to constrain the final assistant message for this turn."` → **Codex にも形の強制がある。**「responseSchema 相当が無い」という前提は誤り。
- `TurnInterruptParams` = `{ threadId, turnId }`（必須2つ）→ 「とめる」をプロトコルで実装できる。
- `TurnStartedNotification` = `{ threadId, turn }` → `turnId` はターン開始時に拾える（`turn/start` の応答を待たなくてよい）。

### 3-2. `CodexTransport` の拡張（既存の `runText` / `runImage` は触らない）

手元には未コミットで `runJson({prompt, shape, validate, onProgress})`（プロンプト末尾に形＋`parseJsonReply`＋1回だけ直し依頼）と `src/lib/ai/json-reply.ts` がある。これを土台に足す:

```ts
/** JSON 専用の第3スレッド（read-only・道具なし）。散文用と分ける。 */
private jsonThreadId: string | null = null;
/** いま動いているターンの id（turn/started から拾う）。とめるのに要る。 */
private activeTurnId: string | null = null;

async runJson<T>(args: {
  prompt: string;
  shape: object;                     // ★ Codex の outputSchema と Gemini の responseSchema に同じ物
  validate: (v: unknown) => { ok: true; value: T } | { ok: false; problem: string };
  effort?: "low" | "medium";         // 段②③は medium（low だと beats が薄い）
  timeoutMs?: number;                // 段③だけ 240_000
  onProgress?: (done: number) => void;
  signal?: AbortSignal;              // 「とめる」と直結
}): Promise<T>;

/** turn/interrupt を投げる。応答が無ければ socket を閉じる（1接続1操作なので確実に止まる）。 */
cancel(): void;
```

- `developerInstructions`（JSONスレッド用）: `"Return the JSON object only. No prose, no code fences."` — 散文用（`/admin/ai` の教師向けメモ）と分けるのは、あちらが日本語の散文を返す設定のため。
- **`outputSchema` を渡したうえで**、既存のフェンス剥がし＋`parseJsonReply`＋`validate` 失敗時の同一スレッド再依頼（**1回だけ**）を保険として残す。実測（docs 記載）で素の JSON が返ることは確認済みだが、毎回そうとは限らない。
- 2回目も駄目なら諦めて投げる（3回目を試さない）。画面は失敗カードに **「Gemini で ためす」「② に もどる」** の2つを必ず出す。
- 進捗は `onDelta` のバッファ内の `"id":` の出現数を数えて「4つのうち 3つめ…」と出す。JSON の生文字列を流し見せない。

### 3-3. shape（形）の持ち方 — 定義は1か所、エンジンは2つ

`/Users/tomy/.../src/lib/craft/shapes/{plan,manga,listening,quizset,article,wordstage}.ts` に**手書きの JSON Schema 定数**を置く（既存の `MANGA_SCRIPT_SCHEMA` / `VOCAB_RESPONSE_SCHEMA` と同じ書き方）。

- **`z.toJSONSchema()` は使わない。** zod 4.4.3 は tuple→`prefixItems`、literal→`const`、discriminatedUnion→`oneOf` を吐き、Gemini の `responseSchema` はどれも受けない。既存の `MANGA_SCRIPT_SCHEMA` が `furigana` を `items:{type:"string"}, minItems:2, maxItems:2` と手書きしているのは、まさにこの回避。
- 使ってよい語彙は `type / properties / required / items / enum / minItems / maxItems / description` **だけ**。`tests/craft_shapes.test.ts` が全 shape を再帰的に歩いて、禁止キー（`const` `oneOf` `anyOf` `allOf` `prefixItems` `$ref` `$schema` `additionalProperties` `default`）が1つも無いことを機械で固定する。
- `phase === "production"` のとき、もんだいの shape から `choose/multi/emotion` を**外す**（規律3違反を作らせない側に倒す。既存 `quizSetSchema.superRefine` と二重の担保）。

### 3-4. ブラウザ側の入口と Gemini の位置づけ

`/Users/tomy/.../src/components/studio/craft-api.ts`

```ts
export async function craftGenerate<T>(args: {...}): Promise<
  | { ok: true; value: T; engine: "codex" | "gemini" }
  | { ok: false; reason: "noCodex" | "badJson" | "aborted" | "upstream"; message: string }>;
```

- 既定は **Codex 優先**。ただし `image-api.ts` と違い**黙って Gemini に落とさない**（無料枠が少ないため。理由を関数の頭にコメントで書く）。落ちたら失敗カードで先生に選ばせる。
- 「AI設定」に **「このPCでは Gemini を既定にする」トグル**を置き、ブリッジを立てられない先生は最初から Gemini で同じ段を通れるようにする（C3）。接続状態（Codex つながっています／いません）を常時表示。
- Gemini 経路は新設 `/Users/tomy/.../src/app/api/studio/craft-text/route.ts`（`{ apiKey, step, target, payload, context }` の1本、`requireAdmin()`）。**生のプロンプトは受け取らない**——サーバ側で同じ純関数を呼び直す（教材の質をコードレビューの内側に留める。設計01 P12）。失敗は理由名だけ・上流本文は返さない（規律4）。

---

## 4. 「過去の内容を理解しながら」の実現方法

### 4-1. 場所と作り

`/Users/tomy/.../src/lib/craft/context.ts` の**純関数**（ネットワーク無し・テストから直接読める）。`studio-shell.tsx` が既に持っている `merged`（git ∪ DB）／`textsByRef`（`collectLearnerTexts` 由来）／`knownTerms`／`sortStages` だけを入力に取る。**RAG も埋め込みも新しいDBアクセスも作らない**（カリキュラムが M1〜M12 の一本道なので、順番による近さで十分かつ説明可能）。Worker 側では組まない（`content.ts:36-42` に記録がある Error 1102 の轍を踏まない）。

### 4-2. 何を、どれだけ渡すか（予算8000字＝`vocab/extract.ts` の `MAX_PROMPT_CHARS` を流用）

| # | 中身 | 量の目安 | 削る順 |
|---|---|---|---|
| 1 | **語彙台帳**（最大300語）: 全 wordstage の `term/reading` ＋ manga.vocab ＋ listening.keywords を初出ステージ順に畳み、**「もう習った（使ってよい）／まだ」の2列** | 約3,600字 | 3番目 |
| 2 | **登場人物カード**（castIds ぶん・逐語）: name/role/personality/**looks**/voice。`looks` は画像の正典なので要約しない | 約800字 | **削らない** |
| 3 | **同ステージの既にある教材**: title＋description＋（まんがなら最後のセリフ2行）。各80字で切る | 約1,500字 | 2番目 |
| 4 | **直前2ステージのあらすじ**: title＋description のみ | 約200字 | 1番目（最初に削る） |
| 5 | **固定ブロック（逐語・毎回同梱）**: `FORBIDDEN_LEARNER_WORDS` を配列そのまま／ふりがな全付けと送りがな・熟語の規則（`manga-prompt.ts` の文言を流用）／産出に選択式を置かない（規律3）／**出してよい国名の許可リスト**（禁止語を書くと逆に出やすいので許可制。規律9）／「日本語が拙い＝能力が低い」描写の禁止（P13・最重要） | 約900字 | **削らない** |

合計 **約7,000字 / 上限8,000字**。

### 4-3. トークン量の見積り

日本語は概ね 1文字 ≈ 1.0〜1.3 トークン。

| | 入力 | 出力 | 1ターン合計 |
|---|---|---|---|
| ① そうだん | 文脈7,000字＋指示1,000字 ≈ **9〜11k tok** | 約400字 ≈ 0.5k | 約10〜12k |
| ② したじ（2案） | 同上 ≈ **9〜11k** | beats 8本×2案 ≈ 1,600字 ≈ 2k | 約12〜13k |
| ③ なかみ | 文脈＋承認済み plan ＋ shape ≈ **10〜13k** | 8コマ＋読み辞書 ≈ 2,500字 ≈ 3k | 約13〜16k |
| ③ 直し（自動修復1回） | 同スレッドなので指示だけ ≈ 0.5k | 差分 ≈ 1k | 約1.5k |

**教材1本を通しで作ると、やり直し込みで最大 6ターン ≈ 7〜9万トークン。** 段が進むほど文脈を減らす（③は承認済み plan が文脈を代替、④は参照画像だけ）。

### 4-4. 先生に見せる（＝「一緒に作っている感じ」の実体）

- 段①の上に折りたためるカード **「AIが 見ているもの（ことば 128／人 2／まえの話 3）」**。語彙は**ステージ単位のグループ**でON/OFF（128個のチェックボックスにしない）。外したものは `craft.contextOff[]` に残り、**各段のヘッダに1行で常時表示**（段③で出来が悪いときに原因へたどり着ける）。
- ②の `carryOver`（前の教材から引きつぐこと1文）を**AIに必ず書かせる**。先生はそこを読めば文脈が効いたか一目で判る。効いていなければ「直しの指示」を書いて作り直す。
- 文脈は「作った時点のもの」を `craft` に残す。承認後に前の教材が変わっても、作り直さない限り古い文脈のままなのが正しい（承認した中身が背後で勝手に変わらない）。

---

## 5. まんがの2モードと、ふりがな問題の扱い

### 5-1. 先生に見せるのは「文字入りか」ではなく3つの完成形（段①で選ぶ）

| 見せ方 | 中身 | データ |
|---|---|---|
| **4コマ**（既定・すすめ） | いまと同じ。絵は文字なし、セリフはアプリが重ねる（ふりがな付き） | `format:"yonkoma"` / `speechInImage:false` |
| **よこ長の 1枚絵** | 1ページ＝1コマ（`size:"wide"`）。読み物の挿絵・ステージの顔 | `format:"story"` / `speechInImage:false` |
| **文字入りの 1枚絵** | 絵の中にセリフを焼く。**用途は 告知・表紙・みじかい掛け合い**（語彙学習の本編には使わない、と画面に書く） | `format:"story"` / `speechInImage:true` |

**①②③は3つとも完全に同じ。違うのは段④だけ。** だから後からモードを変えてもセリフと読み辞書は作り直さなくていい（絵だけ作り直す）。

### 5-2. ふりがな問題は「焼かない」で解く — ただし機械で担保する

確定事実（`manga-prompt.ts` 冒頭）: **ふりがな入りの画像生成は成功例が1件も無い**（本文より小さい・位置が厳密・画数の多い漢字の真上の三重苦）。回避せず、制約を設計に変える:

1. **焼くのは かな だけ。** 漢字が無ければ、ふりがなは要らない。
2. **かな化はAIにやらせず、`kanaOf(line.text, furiganaIndex)` の機械変換にする。** AIに「かなで書いて」と頼むと、データのセリフと焼いた文字がずれる。機械変換なら**必ず一致**する。読み辞書に無い漢字があれば `null` が返り、「よみ辞書に 足してください」と段③へ戻す（読み辞書はどのみち必要なので追加の手間はゼロ）。
3. **`bakedText[]` を教材本体に持つ。** 学習者が実際に読む文字列がデータに存在するので、`checkForbiddenWords`（全文字列走査）が**自動で効く**（規律1が死なない）。`bakedText` は漢字ゼロなのでふりがな全覆いも自明に通る。
4. **`lines[]` と `furigana` は消さない。** 画面には出ない（`manga-slides.tsx:138` の `showLines`）が、`collectLabeledTexts` の対象なのでふりがな全覆いが効き続ける（規律2）。辞書・語彙復習・モード切り替えの元でもある。
5. **`checkBakedSpeech` が「焼いた文字 ≠ いまのセリフのかな」を公開時 error にする。** 先生が `lines` を直したのに古い字の絵が公開され続ける、という審査で指摘された最大の穴をここで塞ぐ。ずれたコマは ⚠ が付き、隣に「作り直す」が出る（古い絵は消さない）。
6. **スキーマで縛る**（§2-1）: かな限定・20文字以内・1コマ2吹き出しまで・A モードでは `bakedText` 空。
7. **2回失敗したら自動で「絵だけ」に落とす**（運用規約ではなく**コード**で。`craft.assets[].tries >= 2` でそのコマの `baked` を空にして通常プロンプトへ）。先生が5回10回と回して時間と枠を溶かす事故を仕組みで止める。
8. **ピクセルの正しさは機械では判定できない。** コマごとに「読めない字が ありますか？（はい／いいえ）」の2択を出し、はい＝**部分修正せず まるごと再生成**（docs/skills 規律5）。押した記録は `craft.assets[].checkedByTeacher` に残す。**画質は保証しない**と決めておく（§8）。

### 5-3. プロンプト

`/Users/tomy/.../src/lib/manga-prompt.ts` に `buildBakedPanelPrompt()` を追加（`buildPanelPrompt` は無改造）。差は3つだけ:

- `NO_TEXT` の代わりに専用定数（`no kanji` は残し、`no kana` を外す）。`no watermark, no signature, no logo` は残す。
- 焼く文字を**逐語で1回だけ**書く（`buildImageTurn` が保存先を逐語で書くのと同じ理由）: `Draw exactly this text inside balloon 1, hiragana/katakana only, large, clean rounded gothic: 「…」`
- `Do NOT add small ruby characters above any character. Do not add any other text anywhere.`
- `STYLE` / `NEGATIVE` / 参照画像（設定画）の渡し方は A と共通（画風が割れない）。

---

## 6. 画面の構成

### 6-1. 置き場所 — 新しいページを作らず、いまのエディタの上に貼る帯

別ページにすると「AIで作る道」と「手で直す道」が分岐して、先生はどちらにいるか分からなくなる。エディタは常に下にあり、いつでも手で直せる。

```
/admin/stages → ステージ → ＋ふやす（まんが）→ エディタ画面
┌─────────────────────────────────────────────────┐
│ ← もどる   あさかい まんが            [したがき]  ← 状態のしるし（新設）│
├─────────────────────────────────────────────────┤
│ 🤖 AIと つくる            Codex に つながっています      [閉じる] │
│  ①そうだん ✓ ── ②したじ ✓ ── ③なかみ ● ── ④かたち ─       │
│  ▸ AIが 見ているもの（ことば128／人2／まえの話3）  ※ステージ2の語は外しています│
│  ┌────────── いまの段（③なかみ）───────────┐   │
│  │ 左: したじ（読むだけ）  右: 出てきた なかみ（直せる）  │   │
│  │ よみ辞書: のこり 0字   ← FuriganaEditor（AIが つけました）│   │
│  │ [ここだけ 作り直す] [もう1つ ちがう案] [とめる]        │   │
│  │            [ ← ②に もどる ]  [ これで すすむ → ]     │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  （いつもの まんがエディタ。承認したものだけが ここに入る）        │
├─────────────────────────────────────────────────┤
│        [ したがきを ほぞん ]      [ こうかい ]                 │
└─────────────────────────────────────────────────┘
```

### 6-2. 守る決まり

- **段のしるしは4つの状態だけ**: `─ まだ` / `● 見ています` / `✓ きめた` / `⚠ 作り直しが いる`。丸を押せばその段に戻れる。
- **承認するまで下書きに入らない。もどっても消えない。** ⚠ が付くのは、直した beat から来たコマ・絵だけ（beat 単位）。
- **待ちは必ず数で出す。**「2つのうち 1つめを 書いています…」「3/8まい」。**とめる**を全段に置く（`turn/interrupt`。押した時点までは残る）。
- **やめても残る。** 段を承認するたび・絵が1枚できるたびに craft を自動保存。次に開くと「まえの つづきから（③なかみ）」。離脱時は `beforeunload` で止める（現在ゼロ件の未実装）。
- **急行レーン**: 「おまかせ」で ①→②→③ を続けて回し、承認を最後に1回にまとめられる（丁寧な先生も、今日の授業に1本足したい先生も同じ道を使える）。
- **待ち時間の扱い**: 所要は未実測。コミット6で `effort` と段ごとの実測を取り、**段③が90秒を超えるなら beats 単位に割る**（閾値をコードに持ち、超えた回数が続いたら自動で分割へ切り替える）。絵は最初から1枚ずつなので、1回の待ちが長くならない。
- 種別が変わっても**帯の形は同じ**。変わるのは各段のカードの中身だけ。

### 6-3. 公開の直前（⑤）

1. **学習者と同じ見え方でプレビュー**（`MangaSlides` / `ListeningPlayer` 等を読み取り専用で埋める）。`/admin/preview/[kind]/[id]`（管理者のみ・`revalidate` 無し・noindex）を新設し、`stage-list.tsx` の「見る ↗」は下書きならここへ向ける（404 が ISR に焼き付く問題も同時に消える）。
2. **「先生の目でみる3つ」**（機械で判定できない最重要3項目だけ。`craft.checks` に記録し、3つ揃うまで**「こうかい」だけ**を止める。したがき保存は自由）:
   - だれかを「できない人」として 描いていませんか（R8-1・最重要）
   - しごとの ことばを かんたんな ことばに 置きかえていませんか（「要件定義」→「決めること」にしない）
   - こたえを 先に 言っていませんか（ヒントは 型文まで）
3. 「したがきを ほぞん」／「こうかい」。ヘッダに**いま したがきか こうかい中か**のしるしを出す（現在は出ていない）。

### 6-4. ついでに片付ける既存の迷いどころ

- 「AI設定」「AI指示出し」「はじめの せってい」の3通りを**「AI設定」に統一**し、鍵が無いときのエラーからその画面へリンク（`area-picker.tsx:251` / `audio-maker.tsx:63` / `vocab-extractor.tsx:39` / `manga-maker.tsx:46`）。
- `vocab-extractor.tsx:139` の `saveContent(draft, true)`（押した瞬間に**公開**）を廃止し、ことば版の①〜③に載せ替えて承認→したがきにする。
- `manga-editor.tsx` / `article-editor.tsx` に `FuriganaEditor` を足す（誤読ルビを直せるようにする）。
- 「なおすところ」の英語 zod メッセージを日本語化（`issue-text.ts` の `describePath` に craft/manga のパスを足す）。

---

## 7. 実装の順序（1コミット単位）

各コミットの完了条件は共通で **`npm test` && `npm run typecheck` && `npm run lint` && `npm run lint:content`** が緑（証拠の貼付を必須。推測で完了と言わない）。ベースラインは 34ファイル/496テスト、lint:content 0/0。

| # | コミット | 触るファイル（絶対パス） | 増えるテスト |
|---|---|---|---|
| **1** | `feat(ai): AIの返事から JSON を取り出す`（手元の未コミット分を確定） | `src/lib/ai/json-reply.ts`(新)、`src/lib/codex-transport.ts`、`docs/constraints.md` | `tests/json_reply.test.ts`（フェンス・前置き・途中切れ・文字列内の括弧） |
| **2** | `fix(checks): 保存のときも ふりがな・秘匿・国名を数える` ← **生成を開ける前に関門を締める** | `src/lib/content-checks.ts`（`checkCountryNames` 新設・`checkSecretLeaks` を error へ）、`src/app/api/studio/content/route.ts`（`runContentChecks(content, publishing)`）、`scripts/lint_content.ts` | `tests/content_checks.test.ts` +約20（国名の許可/不許可・「タイル」等の誤検出しない・公開時のみ error に上がる） |
| **3** | `feat(studio): ステージを 枠だけで 保存できるようにする` | `src/content/schema.ts`（`contents.min(0)`）、`src/lib/content-checks.ts`（`checkStageReadyToPublish`） | `tests/studio_schema.test.ts` +4（空で下書き可・公開は不可） |
| **4** | `feat(manga): 絵に焼く文字を データで持つ（かな限定）` | `src/content/schema.ts`（`bakedText`＋superRefine）、`src/lib/text/furigana.ts`（`kanaOf`）、`src/lib/content-checks.ts`（`checkBakedSpeech`）、`scripts/lint_content.ts` | `tests/furigana.test.ts` +6、`tests/content_checks.test.ts` +8（焼き文字とセリフのズレ）、`tests/studio_schema.test.ts` +6（漢字・20文字・吹き出し2つ・Aモードで空） |
| **5** | `feat(craft): 下相談の入れもの（別テーブル・別スキーマ）` | `src/content/craft.ts`(新)、`supabase/migrations/20260808090000_studio_crafts.sql`(新)、`src/app/api/studio/craft/route.ts`(新)、`src/components/studio/craft-api.ts`(新) | `tests/craft_schema.test.ts`（`stepEnvelope` の型が tsc を通る・candidates 上限4・`draft` が unknown を素通し） |
| **6** | `feat(craft): 形をきめて JSON を作らせる（Codex）` | `src/lib/craft/shapes/*.ts`(新)、`src/lib/codex-transport.ts`（`outputSchema`/`turnId`/`cancel`/`effort`/`timeoutMs`/JSON専用スレッド） | `tests/craft_shapes.test.ts`（Gemini-safe 語彙の機械固定）、`tests/codex_turn.test.ts`（純関数部: 進捗カウント・中断の状態遷移） |
| **7** | `feat(craft): 頼み文（そうだん・したじ・なかみ）` | `src/lib/craft/prompts/*.ts`(新・純関数のみ) | `tests/craft_prompt.test.ts`（禁止語を**配列で**渡す・許可リスト同梱・phase で選択式が消える） |
| **8** | `feat(craft): 過去の教材を ふまえる（文脈）` | `src/lib/craft/context.ts`(新) | `tests/craft_context.test.ts`（8000字の予算・削る順・既習/未習の2列・contextOff の反映） |
| **9** | `feat(craft): 承認のとき 本物のスキーマを通す` ← **A2 の要** | `src/lib/craft/assemble.ts`(新)、`src/lib/craft/gate.ts`(新) | `tests/craft_assemble.test.ts`（beats→pages/script/questions/blocks/words、beatId の追跡）、`tests/craft_gate.test.ts`（規律3違反・keywords 不実在・noJapanese を承認前に捕まえる／日本語の直し依頼文／自動修復は1回で止まる） |
| **10** | `feat(studio): AIと つくる帯（まんが）` ＋ 旧 MangaMaker の生成UIを外す | `src/components/studio/craft-panel.tsx`(新)、`src/components/studio/studio-shell.tsx`、`src/components/studio/manga-maker.tsx`(削除)、`src/app/api/studio/manga/route.ts`(削除)、`src/components/studio/editor-frame.tsx`（状態のしるし） | `tests/studio_editor.test.ts` +（段の遷移・承認するまで下書きに入らない） |
| **11** | `feat(craft): 絵と 音を 1つずつ 作る（とめられる）` | `src/lib/craft/asset-queue.ts`(新)、`src/lib/codex-image.ts`（transport を呼び側に渡せるように＝「とめる」導線） | `tests/craft_queue.test.ts`（直列・1件ごと保存・中断で作った分は残る・2回失敗で絵だけに落ちる） |
| **12** | `feat(manga): 文字入りモード（かな限定・機械変換）` | `src/lib/manga-prompt.ts`（`buildBakedPanelPrompt`）、`src/lib/craft/asset-queue.ts` | `tests/manga_prompt.test.ts` +6（焼く文字が逐語1回・ルビを頼まない・モード切替で全コマ stale） |
| **13** | `feat(craft): のこり4種別（リスニング・もんだい・よみもの・ことば）` ＋ VocabExtractor の公開保存を廃止 | `src/lib/craft/shapes/*`、`src/lib/craft/assemble.ts`、`src/components/studio/vocab-extractor.tsx`、`src/app/api/studio/vocab/route.ts`(削除) | 種別ごとの assemble テスト +4本（keywords 実在・phase・link ブロックを作らない・wrongMeanings×3） |
| **14** | `feat(studio): 公開する前に 学習者と同じ画面で 見る` ＋ AI設定の接続表示・Gemini既定トグル・呼び名統一 | `src/app/admin/preview/[kind]/[id]/page.tsx`(新)、`src/components/studio/stage-list.tsx`、`src/components/admin/gemini-key-panel.tsx`、`src/components/studio/{area-picker,audio-maker}.tsx`、`src/components/studio/craft-panel.tsx`（先生の目でみる3つ） | `tests/preview_routes.test.ts`（下書きは preview へ・公開は実URLへ） |

コミット2・3・4は**生成機能より先**に入れる（規律の関門を締めてからAI経路を開ける）。10より前はすべて既存UIに影響しないので、いつ止めても壊れない。

---

## 8. やらないこと（明示）

1. **たいわ（scenario）のAI生成。** `reqs`×10・persona・調査用模擬ページと重く、そもそもスタジオに編集画面が無い（`studio-shell.tsx:328` が断る）。加えて**規律6（秘匿を模擬ページに書かない）とP4（伏線は置く・答えはページから引ける）の境界が未定義**で、境界を決めないままAIに作らせるとどちらかを必ず踏む。**まんが・リスニング・もんだい・よみもの・ことばの5種で始める。** `craftSchema.target` にも scenario を入れない。※ `checkSecretLeaks` の error 昇格（コミット2）は、既存データが 0/0 なので予定どおり実施する。
2. **第3の公開状態（draft→review→published）。** 承認は制作工程（craft の段）で表し、学習者に出るかどうかの関門は `studio_contents.status` の2値のまま。`route.ts` の三項演算子・RLS・`content-db.ts` の2分岐リーダ・`EditorFrame` の2ボタンは触らない。
3. **`z.toJSONSchema()` の利用。** 実測で Gemini responseSchema に通らない語彙を吐く。shape は手書き＋テストで固定する。
4. **`imageSlot.status = "generating"` を書くこと。** 誰も読まず、タブを閉じると消えない嘘の状態が残る。生成中は `craft.assets[].state` が正。
5. **既存 Content → craft への逆変換（disassemble）。** 「すでにある教材をAIで直す」は今回作らない。作ると種別ごとの分岐が5か所に増える。既存教材は手で直す（エディタは残る）。
6. **焼いた絵のピクセル検査。** 絵に何が描かれたかは機械で判定できない。担保は「かな限定・20文字・2吹き出し」＋人の1回チェック（記録に残す）＋2回失敗で絵だけに落とす、まで。**画質は保証しないと決めておく。**
7. **並列生成。** ブリッジは1接続1操作、`activeTurn` も1枠。直列にして「失敗した1件だけやり直す」を取る。
8. **4コマを1枚に描かせること。** コマ順が崩れる（調査済み）。モードの軸は「絵に文字を焼くか」の1つだけにする。
9. **RAG・埋め込み検索・新しい保存先。** カリキュラムが一本道なので順番による近さで足りる。文脈はブラウザで組む。
10. **音声の Codex 化。** Codex に対応物が無い。リスニングの音声は Gemini Live のまま（`character.voice` を引くようにするのは §6 の配線として実施）。
11. **ルーブリック（R1〜R8）全項目の自動レビュー。** 機械化できない原則は「先生の目でみる3つ」に絞る。残りは従来どおり複数エージェント検収（`docs/design/review_rubric.md`）で行う。
12. **誤読ルビの自動検出。** 機械は「覆っているか」しか数えられず「正しいか」は数えられない。段③で `FuriganaEditor` を必ず見せ、AIが付けた読みに印を出すところまで。
13. **先生が2人で同じ craft を同時に編集したときの競合制御。** 最終更新が勝つ。運用者が1人のうちは作らない。
14. **`/admin` のダッシュボードやサイドバーの再編。** 入口は既存のエディタ画面に貼る帯だけ。新しいURLは `/admin/preview/...` の1本のみ。
