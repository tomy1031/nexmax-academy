"use client";

import { useState } from "react";
import type { Character, Manga } from "@/content/schema";
import { buildPanelPrompt } from "@/lib/manga-prompt";
import { getGeminiKey } from "@/lib/profile";
import { generateImage } from "./image-api";
import { emptyImageSlot } from "./drafts";
import { uploadAsset } from "./studio-api";
import { CheckChoice, MiniButton, NumberField, StudioSection, TextAreaField } from "./studio-ui";

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
}: {
  value: Manga;
  onChange: (manga: Manga) => void;
  /** 使える登場人物（管理画面「とうじょう人物」で作ったもの）。 */
  cast: readonly Character[];
}) {
  const [request, setRequest] = useState("");
  const [panels, setPanels] = useState(4);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const chosen = cast.filter((character) => value.castIds.includes(character.id));

  const makeScript = async () => {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError("AIの キーが ありません。「AI設定」で 登録してください。");
      return;
    }
    if (request.trim().length === 0) {
      setError("どんな 場面か を 書いてください。");
      return;
    }
    setBusy("script");
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/studio/manga", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey,
          request: request.trim(),
          panels,
          cast: chosen.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            personality: c.personality,
          })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ready?: boolean;
        reason?: string;
        script?: Script;
      };
      if (!response.ok || !body.ready || !body.script) {
        setError(messageForReason(body.reason ?? ""));
        return;
      }
      onChange(applyScript(value, body.script, chosen));
      setNote(
        `${body.script.panels.length}コマ ぶんの わりつけと セリフを 入れました。` +
          "つぎに 下の「コマの 絵を つくる」で 1枚ずつ 描きます。",
      );
    } catch {
      setError("つうしんに 失敗しました。ネットワークを たしかめてください。");
    } finally {
      setBusy(null);
    }
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
    const prompt = buildPanelPrompt({
      scene,
      cast: chosen.map((c) => ({ name: c.name, role: c.role, looks: c.looks })),
      balloons: panel.lines.length,
    });
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
          <MiniButton tone="accent" onClick={() => void makeScript()} disabled={busy !== null}>
            {busy === "script" ? "つくっています…" : "✍️ わりつけと セリフを つくる"}
          </MiniButton>
        </div>
        <p className="text-ink-faint text-xs font-bold">
          漢字には ぜんぶ ふりがなを つけるよう たのみます（1つでも 漏れると 保存できません）。
        </p>
      </div>

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
