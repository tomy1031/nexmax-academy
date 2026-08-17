"use client";

import { useState } from "react";
import type { Character, Content, Manga } from "@/content/schema";
import {
  buildBakedPanelPrompt,
  buildMangaScriptPrompt,
  buildPanelPrompt,
  MANGA_SCRIPT_SCHEMA,
} from "@/lib/manga-prompt";
import {
  buildLayoutPrompt,
  buildStoryContext,
  buildStoryPrompt,
  STORY_OUTLINE_SCHEMA,
  validateOutline,
  type StoryOutline,
} from "@/lib/manga-story";
import { generateFromBrowser } from "@/lib/ai/generate-browser";
import { TEXT_MODEL } from "@/lib/ai/models";
import { hasCodex } from "@/lib/codex-settings";
import { getGeminiKey } from "@/lib/profile";
import { generateImage } from "./image-api";
import { generateStructured } from "./text-api";
import { emptyImageSlot } from "./drafts";
import { uploadAsset } from "./studio-api";
import {
  CheckChoice,
  MiniButton,
  NumberField,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/**
 * 一言の依頼から まんがを 作る
 *
 * 作る順番は2段階。
 *  1. **文字を先に作る**（コマ割り・セリフ・読み辞書）。1コマ1ページに割り付ける
 *  2. **絵はコマごとに1枚ずつ**。人物の設定画を参照画像として毎回わたす
 *
 * 4コマを1枚で描かせないのは、コマ順とレイアウトが制御できず読み順が崩れるため
 *（調査 2026-08-06）。枠とセリフはアプリが持ち、AIには1コマ＝1枚だけ描かせる。
 *
 * 絵の中に日本語は描かせない。漢字が崩れやすく、**ふりがなは実例が無い**。
 * 吹き出しは空で描かせ、セリフは画面で重ねる（AGENTS.md 規律2）。
 */
export function MangaMaker({
  value,
  onChange,
  cast,
  known = [],
}: {
  value: Manga;
  onChange: (manga: Manga) => void;
  /** 使える登場人物（管理画面「とうじょう人物」で作ったもの）。 */
  cast: readonly Character[];
  /**
   * すでに作った教材。**AIに「過去の内容を踏まえて」作らせる**ために渡す
   *（習った語・前の話のおわり）。渡さなくても動く。
   */
  known?: readonly Content[];
}) {
  const [request, setRequest] = useState("");
  const [panels, setPanels] = useState(4);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** 承認まちの すじがき。null なら まだ 作っていない。 */
  const [outline, setOutline] = useState<StoryOutline | null>(null);

  const chosen = cast.filter((character) => value.castIds.includes(character.id));

  /** AIが つながっているか（Codex の合言葉 か Gemini の キー）。 */
  const aiReady = () => {
    if (getGeminiKey() || hasCodex()) return true;
    setError(
      "AIが まだ つながっていません。「AI設定」で Codex の 合言葉か Gemini の キーを 入れてください。",
    );
    return false;
  };

  const castBrief = () =>
    chosen.map((c) => ({ id: c.id, name: c.name, role: c.role, personality: c.personality }));

  /**
   * 段①→②。**話の骨組みだけ**を作らせる。セリフはまだ作らない。
   *
   * 一発で全部作らせると、直したいところが1か所でも全部作り直しになる。
   * 話の筋が違うのか、コマの割り方が違うのかを分けて直せるようにする。
   */
  const makeOutline = async () => {
    if (!aiReady()) return;
    if (request.trim().length === 0) {
      setError("どんな 場面か を 書いてください。");
      return;
    }
    setBusy("outline");
    setError(null);
    setNote(null);

    const prompt = buildStoryPrompt({
      request: request.trim(),
      panels,
      cast: castBrief(),
      // すでに作った教材を踏まえる（習った語・前の話のおわり）
      context: buildStoryContext(known),
    });
    const made = await generateStructured<StoryOutline>({
      prompt,
      shape: JSON.stringify(STORY_OUTLINE_SCHEMA, null, 2),
      outputSchema: STORY_OUTLINE_SCHEMA,
      validate: validateOutline,
      viaGemini: async () => ({
        ok: false,
        message: "すじがきは Codex で 作ります。「AI設定」で 合言葉を 入れてください。",
      }),
    });

    setBusy(null);
    if (!made.ok) {
      setError(made.message);
      return;
    }
    setOutline(made.value);
    setNote("すじがきが できました。直してから「これで すすむ」を おしてください。");
  };

  /**
   * 段②→③。承認ずみの骨組みがあれば、それを**逐語で**渡す。
   * 無ければ、いままでどおり依頼から直接コマを作る（急ぐときの近道）。
   */
  const makeScript = async (approved?: StoryOutline) => {
    const apiKey = getGeminiKey();
    if (!aiReady()) return;
    if (request.trim().length === 0 && !approved) {
      setError("どんな 場面か を 書いてください。");
      return;
    }
    setBusy("script");
    setError(null);
    setNote(null);

    const cast = chosen.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      personality: c.personality,
    }));
    const brief = { request: request.trim(), panels, cast };

    /*
     * Codex と Gemini で **同じ頼み文・同じスキーマ**を使う。
     * 頼み文は純関数、形は `MANGA_SCRIPT_SCHEMA`。
     * どちらかにだけ手を入れて片方が古くなる、という壊れ方をしないため。
     *
     * 承認ずみの骨組みがあるときは、それを逐語で渡す頼み文に切りかえる。
     * 言い換えさせないのは、**先生が承認したのは「その文」**だから。
     */
    const made = await generateStructured<Script>({
      prompt: approved
        ? buildLayoutPrompt({ outline: approved, cast })
        : buildMangaScriptPrompt(brief),
      shape: JSON.stringify(MANGA_SCRIPT_SCHEMA, null, 2),
      outputSchema: MANGA_SCRIPT_SCHEMA,
      validate: validateScript,
      viaGemini: async () => {
        if (!apiKey) return { ok: false, message: messageForReason("noKey") };
        /*
         * この端末から Google に直接頼む（2026-08-17 から サーバは 通さない）。
         * うちの Worker は香港で動くことがあり、そこを通すと Google に断られるうえ、
         * キーが香港のデータセンターで復号される。BYOK のキーはこの端末にある。
         */
        const direct = await generateFromBrowser({
          apiKey,
          model: TEXT_MODEL,
          prompt: approved
            ? buildLayoutPrompt({ outline: approved, cast })
            : buildMangaScriptPrompt(brief),
          schema: MANGA_SCRIPT_SCHEMA,
          // 教材づくりなので、思いつきより依頼に忠実な方を採る
          temperature: 0.4,
          timeoutMs: 60_000,
        });
        if (!direct.ok) return { ok: false, message: messageForReason(direct.reason) };
        try {
          return { ok: true, value: JSON.parse(direct.text) as Script };
        } catch {
          return { ok: false, message: messageForReason("badResponse") };
        }
      },
    });

    setBusy(null);
    if (!made.ok) {
      setError(made.message);
      return;
    }
    // ここではじめて教材に書き込む（承認より前には触らない）
    onChange(applyScript(value, made.value, chosen));
    setOutline(null);
    setNote(
      `${made.value.panels.length}コマ ぶんの わりつけと セリフを 入れました` +
        `（${made.via === "codex" ? "Codex" : "Gemini"}）。` +
        "つぎに 下の「コマの 絵を つくる」で 1枚ずつ 描きます。",
    );
  };

  /** 1コマぶんの絵。人物の設定画を参照画像として渡す。 */
  const makePanelImage = async (pageIndex: number, panelIndex: number) => {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError("AIの キーが ありません。「AI設定」で 登録してください。");
      return;
    }
    const panel = value.pages[pageIndex]?.panels[panelIndex];
    if (!panel) return;
    const scene = panel.caption?.trim() ?? "";
    if (scene.length === 0) {
      setError("そのコマの「絵の ないよう」が 空です。さきに 書いてください。");
      return;
    }

    setBusy(`${pageIndex}:${panelIndex}`);
    setError(null);
    const brief = {
      scene,
      cast: chosen.map((c) => ({ name: c.name, role: c.role, looks: c.looks })),
      balloons: panel.lines.length,
    };
    /*
     * セリフ入りモードでは、吹き出しの中の文字も描かせる。
     * 焼く文字は `bakedText`（読み辞書からの機械変換）を**逐語で**渡す——
     * ここで言い換えると、データのセリフと絵の字がずれる。
     */
    const baked = value.speechInImage ? panel.bakedText.filter((t) => t.length > 0) : [];
    if (value.speechInImage && baked.length !== panel.lines.length) {
      setBusy(null);
      setError(
        "絵に 焼く 文字が そろっていません。「セリフの 出し方」で もう一度 「セリフを 絵に 入れる」を 押してください。",
      );
      return;
    }
    const prompt =
      baked.length > 0
        ? buildBakedPanelPrompt({ ...brief, texts: baked })
        : buildPanelPrompt(brief);
    // 設定画を渡すのが、コマ間で顔や服をぶれさせない いちばん確実な方法
    const references = chosen.flatMap((c) => (c.sheet.src ? [c.sheet.src] : []));
    const made = await generateImage({ apiKey, prompt, references });
    if (!made.ok) {
      setBusy(null);
      setError(made.message);
      return;
    }
    const uploaded = await uploadAsset(made.file, `manga/${value.id || "manga"}`);
    setBusy(null);
    if (!uploaded.ok) {
      setError(uploaded.message);
      return;
    }
    const pages = value.pages.map((page, pi) =>
      pi !== pageIndex
        ? page
        : {
            ...page,
            panels: page.panels.map((item, ci) =>
              ci !== panelIndex
                ? item
                : {
                    ...item,
                    image: { src: uploaded.url, prompt, refs: references, status: "done" as const },
                  },
            ),
          },
    );
    onChange({ ...value, pages });
  };

  return (
    <StudioSection
      title="AIで つくる"
      hint="やりたいことを 1行 書くと、コマ割りと セリフを 作ります。絵は そのあと 1コマずつ。"
    >
      <div className="border-hairline space-y-3 rounded-2xl border-2 bg-white p-3">
        <p className="text-navy text-xs font-black">① だれが 出るか</p>
        {cast.length === 0 ? (
          <p className="text-ink-soft text-xs font-bold">
            まだ 人が いません。「とうじょう人物」で 作って、設定画を 1枚 用意すると、 コマごとに
            顔や服が ぶれなくなります。
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {cast.map((character) => (
              <CheckChoice
                key={character.id}
                label={`${character.name}（${character.role}）${character.sheet.src ? "" : "※設定画なし"}`}
                checked={value.castIds.includes(character.id)}
                onToggle={(on) =>
                  onChange({
                    ...value,
                    castIds: on
                      ? [...value.castIds, character.id]
                      : value.castIds.filter((id) => id !== character.id),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-hairline space-y-3 rounded-2xl border-2 bg-white p-3">
        <p className="text-navy text-xs font-black">② どんな 場面か</p>
        <TextAreaField
          label="やりたいこと（1〜3行）"
          value={request}
          onChange={setRequest}
          placeholder="サーバーが 止まって こまっている 新人が、先輩に すぐ 報告する場面。「まず 事実だけ 先に 言う」が つたわるように。"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <NumberField label="コマの 数" value={panels} min={1} max={8} onChange={setPanels} />
          </div>
          <MiniButton tone="accent" onClick={() => void makeOutline()} disabled={busy !== null}>
            {busy === "outline" ? "かんがえています…" : "📝 すじがきを つくる"}
          </MiniButton>
          {outline === null && (
            <MiniButton onClick={() => void makeScript()} disabled={busy !== null}>
              {busy === "script" ? "つくっています…" : "すじがきを とばして 作る"}
            </MiniButton>
          )}
        </div>
        <p className="text-ink-faint text-xs font-bold">
          漢字には ぜんぶ ふりがなを つけるよう たのみます（1つでも 漏れると 保存できません）。
        </p>
      </div>

      {/*
        段②。**ここで承認するまで教材に書き込まない。**
        いまの作りは生成した瞬間に流し込むので、2回目を押すと前のコマと
        生成ずみの絵が確認なしで消える。先生が「もう一度押すのが怖い」状態になる。
      */}
      {outline !== null && (
        <div className="border-hairline space-y-3 rounded-2xl border-2 bg-[#fffdf5] p-3">
          <p className="text-navy text-xs font-black">
            ②-2 すじがき（直してから すすめます・まだ 教材には 入っていません）
          </p>
          <TextField
            label="見出し"
            value={outline.title}
            onChange={(title) => setOutline({ ...outline, title })}
          />
          <TextField
            label="この回で 身につくこと"
            value={outline.teachingPoint}
            onChange={(teachingPoint) => setOutline({ ...outline, teachingPoint })}
          />
          <div className="space-y-2">
            {outline.beats.map((beat, i) => (
              <div
                key={i}
                className="bg-panel-tint flex flex-wrap items-start gap-2 rounded-xl p-2"
              >
                <span className="text-ink-soft w-14 shrink-0 pt-2 text-xs font-black">
                  {i + 1}コマ目
                </span>
                <div className="min-w-52 flex-1">
                  <TextField
                    label="何が おきるか"
                    value={beat.what}
                    onChange={(what) =>
                      setOutline({
                        ...outline,
                        beats: outline.beats.map((b, j) => (j === i ? { ...b, what } : b)),
                      })
                    }
                  />
                </div>
                <MiniButton
                  onClick={() =>
                    setOutline({
                      ...outline,
                      beats: outline.beats.filter((_, j) => j !== i),
                    })
                  }
                >
                  けす
                </MiniButton>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <MiniButton
              tone="accent"
              onClick={() => void makeScript(outline)}
              disabled={busy !== null || outline.beats.length === 0}
            >
              {busy === "script" ? "つくっています…" : "✓ これで すすむ（コマと セリフを つくる）"}
            </MiniButton>
            <MiniButton onClick={() => void makeOutline()} disabled={busy !== null}>
              べつの 案に する
            </MiniButton>
            <MiniButton onClick={() => setOutline(null)} disabled={busy !== null}>
              やめる
            </MiniButton>
          </div>
        </div>
      )}

      {value.pages.some((page) => page.panels.length > 0) ? (
        <div className="border-hairline space-y-2 rounded-2xl border-2 bg-white p-3">
          <p className="text-navy text-xs font-black">③ コマの 絵を つくる</p>
          <p className="text-ink-faint text-xs font-bold">
            1コマ＝1枚 ずつ 描きます。吹き出しは 空で 描かせ、セリフは 画面で 重ねます （絵の中の
            日本語は 漢字が くずれ、ふりがなは 出せません）。
          </p>
          <ul className="space-y-2">
            {value.pages.flatMap((page, pageIndex) =>
              page.panels.map((panel, panelIndex) => (
                <li
                  key={`${pageIndex}:${panelIndex}`}
                  className="bg-panel-tint flex flex-wrap items-center gap-2 rounded-xl p-2"
                >
                  <span className="text-ink-soft w-10 text-xs font-black">
                    {pageIndex + 1}-{panelIndex + 1}
                  </span>
                  {panel.image.src ? (
                    // next/image は外部URLの許可設定が要るため、ここは素の img で出す
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={panel.image.src}
                      alt=""
                      className="border-hairline h-14 w-20 rounded-lg border-2 object-cover"
                    />
                  ) : (
                    <span className="border-hairline text-ink-faint grid h-14 w-20 place-items-center rounded-lg border-2 border-dashed text-[10px] font-bold">
                      絵なし
                    </span>
                  )}
                  <span className="text-ink-soft min-w-[8rem] flex-1 text-xs font-bold">
                    {panel.caption ?? "（絵の ないようが まだ）"}
                  </span>
                  <MiniButton
                    tone="accent"
                    onClick={() => void makePanelImage(pageIndex, panelIndex)}
                    disabled={busy !== null}
                  >
                    {busy === `${pageIndex}:${panelIndex}` ? "つくっています…" : "🎨 絵を つくる"}
                  </MiniButton>
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}

      {note ? <p className="text-navy text-xs font-black">{note}</p> : null}
      {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
    </StudioSection>
  );
}

interface Script {
  title: string;
  description: string;
  furigana: string[][];
  panels: { scene: string; lines: { speaker: string; text: string }[] }[];
}

/**
 * 台本の形をたしかめる。
 *
 * Gemini の `responseSchema` も Codex の `outputSchema` も「たいてい守られる」
 * であって保証ではない。**まんがに流し込む前に**ここで止める——
 * 流し込んでから気づくと、先生の作りかけを壊したあとになる。
 *
 * 直せる形（zod でなく手書き）にしてあるのは、AIへ返す言い直しの文が
 * 日本語で1文になっている必要があるため。zod の英語パス表記だけを渡すと
 * モデルが直しどころを誤る（`json-reply.ts` の `buildRetryNote`）。
 */
function validateScript(
  value: unknown,
): { ok: true; value: Script } | { ok: false; problem: string } {
  if (typeof value !== "object" || value === null)
    return { ok: false, problem: "JSONオブジェクトではありません" };
  const raw = value as Record<string, unknown>;

  if (typeof raw.title !== "string" || raw.title.length === 0) {
    return { ok: false, problem: "title が ありません" };
  }
  if (typeof raw.description !== "string") {
    return { ok: false, problem: "description が ありません" };
  }
  if (!Array.isArray(raw.panels) || raw.panels.length === 0) {
    return { ok: false, problem: "panels が 空です" };
  }
  for (const [i, panel] of raw.panels.entries()) {
    if (typeof panel !== "object" || panel === null) {
      return { ok: false, problem: `panels[${i}] が オブジェクトでは ありません` };
    }
    const p = panel as Record<string, unknown>;
    if (typeof p.scene !== "string" || p.scene.length === 0) {
      return { ok: false, problem: `panels[${i}].scene が ありません（絵の指示）` };
    }
    if (!Array.isArray(p.lines)) {
      return { ok: false, problem: `panels[${i}].lines が 配列では ありません` };
    }
    for (const [j, line] of p.lines.entries()) {
      const l = line as Record<string, unknown>;
      if (typeof l?.speaker !== "string" || typeof l?.text !== "string") {
        return { ok: false, problem: `panels[${i}].lines[${j}] に speaker か text が ありません` };
      }
    }
  }
  /*
   * 読み辞書は [表記, よみ] の2要素ちょうど。ここがずれると
   * ルビの合成が黙って外れる（画面には裸の漢字が出る）ので、形の段階で止める。
   */
  if (!Array.isArray(raw.furigana))
    return { ok: false, problem: "furigana が 配列では ありません" };
  for (const [i, entry] of raw.furigana.entries()) {
    if (!Array.isArray(entry) || entry.length !== 2 || entry.some((s) => typeof s !== "string")) {
      return { ok: false, problem: `furigana[${i}] は [表記, よみ] の2つに してください` };
    }
  }
  return { ok: true, value: raw as unknown as Script };
}

/**
 * 作った台本を まんがに流し込む。
 *
 * 1コマ＝1ページにする。横スライドの読み手は「コマ」を単位に送るので、
 * ページに複数コマを詰めても学習者の見え方は変わらない。1対1にしておくと、
 * ページの補足（note）が そのコマの補足として そのまま効く。
 */
function applyScript(manga: Manga, script: Script, cast: readonly Character[]): Manga {
  const known = new Set([...cast.map((c) => c.id), "narration"]);
  return {
    ...manga,
    title: script.title || manga.title,
    description: script.description || manga.description,
    // 読み辞書は上書きせず足す。先生が手で入れたものを消さない
    furigana: [
      ...(manga.furigana ?? []),
      ...script.furigana.flatMap((pair) =>
        pair.length === 2 && pair[0] && pair[1] ? [[pair[0], pair[1]] as [string, string]] : [],
      ),
    ],
    characters: cast.map((c) => ({ id: c.id, name: c.name, role: c.role })),
    pages: script.panels.map((panel) => ({
      panels: [
        {
          size: "normal" as const,
          image: emptyImageSlot(),
          // 焼く文字は台本づくりでは作らない。モードを切りかえたときに機械変換で入れる
          bakedText: [] as string[],
          // 知らない話者は ナレーションに寄せる（保存の検査で止まらないように）
          lines: panel.lines.map((line) => ({
            speaker: known.has(line.speaker) ? line.speaker : "narration",
            text: line.text,
          })),
          // 絵の内容は caption に置く。ここが 絵をつくるときの指示になる
          caption: panel.scene,
        },
      ],
    })),
  };
}

function messageForReason(reason: string): string {
  switch (reason) {
    case "noKey":
      return "AIの キーが ありません。「AI設定」で 登録してください。";
    case "invalidRequest":
      return "やりたいことを 書いてください（ながすぎる ときは みじかく）。";
    case "badResponse":
      return "うまく 作れませんでした。書き方を 少し 変えて ためしてください。";
    case "forbidden":
      return "この そうさは 先生（管理者）だけです。";
    default:
      return "作れませんでした。少し 待って もう一度 ためしてください。";
  }
}
