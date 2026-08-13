"use client";

import { useState } from "react";
import type { Character } from "@/content/schema";
import { buildMouthPrompt, MOUTH_SHAPES, type MouthShapeKey } from "@/lib/manga-prompt";
import { getGeminiKey } from "@/lib/profile";
import { generateImage } from "./image-api";
import { compositeMouth } from "./mouth-composite";
import { uploadAsset } from "./studio-api";
import { MiniButton, StudioSection } from "./studio-ui";

/**
 * 口パクの絵（母音5つ＋閉じ）
 *
 * ミーティングで、音に合わせて口を動かすのに使う。GIF ではなく6枚の切り替えに
 * してあるのは、**鳴っている音の大きさで**開け閉めを決めたいから
 *（GIFは決まった速さでループするので、すぐ音とずれる）。
 *
 * ## 作り方は「口だけ重ねる」
 * 6枚を別々に生成すると、背景や髪がわずかに違って**切り替えのたびに
 * ちらつく**（2026-08-13、背景が青と白で混ざった絵が出た）。
 * ここでは閉じた口の絵を土台にして、口のあたりだけを重ねる（mouth-composite.ts）。
 * 土台が1枚なので、背景も顔も必ずそろう。
 *
 * 先生が自分で用意した絵に差し替えることもできる（URL欄・ファイル選択）。
 */
export function MouthMaker({
  value,
  onChange,
}: {
  value: Character;
  onChange: (character: Character) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const folder = `characters/${value.id || "character"}/mouth`;
  const mouth = value.mouth ?? {};
  const made = MOUTH_SHAPES.filter((shape) => mouth[shape.key]).length;

  const setMouth = (key: MouthShapeKey, url: string | undefined) => {
    const next = { ...mouth, [key]: url };
    const empty = MOUTH_SHAPES.every((shape) => !next[shape.key]);
    onChange({ ...value, mouth: empty ? undefined : next });
  };

  const upload = async (key: MouthShapeKey, file: File | undefined) => {
    if (!file) return;
    setBusy(key);
    setError(null);
    const result = await uploadAsset(file, folder);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMouth(key, result.url);
  };

  /**
   * 6枚まとめて作る。
   *
   * 1. まず「閉じた口」を1枚（設定画を参照にする）
   * 2. その1枚を**参照に足して**、口の形ちがいを5枚
   * 3. どれも 1. の絵に口だけ重ねてから上げる（背景と顔をそろえるため）
   */
  const makeAll = async () => {
    const apiKey = getGeminiKey();
    if (!apiKey && !value.sheet.src) {
      setError("AIの キーが ありません。「AI設定」で 登録してください。");
      return;
    }
    if (value.looks.trim().length === 0) {
      setError("さきに「見た目」を 書いてください。口の 絵も ここから 作ります。");
      return;
    }
    setError(null);
    const references = [value.sheet.src, ...value.references].filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );

    setBusy("closed");
    const closedShape = MOUTH_SHAPES[0];
    const closed = await generateImage({
      apiKey,
      prompt: buildMouthPrompt(value, closedShape),
      references,
    });
    if (!closed.ok) {
      setBusy(null);
      setError(closed.message);
      return;
    }
    const closedUpload = await uploadAsset(closed.file, folder);
    if (!closedUpload.ok) {
      setBusy(null);
      setError(closedUpload.message);
      return;
    }
    const urls: Partial<Record<MouthShapeKey, string>> = { closed: closedUpload.url };

    for (const shape of MOUTH_SHAPES.slice(1)) {
      setBusy(shape.key);
      const variant = await generateImage({
        apiKey,
        prompt: buildMouthPrompt(value, shape),
        // 閉じた口の絵も参照に足す。顔と背景を寄せるため
        references: [closedUpload.url, ...references],
      });
      if (!variant.ok) {
        setBusy(null);
        setError(variant.message);
        break;
      }
      try {
        // 口のあたりだけを土台に重ねる（ちらつきを消す要）
        const merged = await compositeMouth(
          closed.file,
          variant.file,
          `${value.id || "character"}-${shape.key}.webp`,
        );
        const uploaded = await uploadAsset(merged, folder);
        if (!uploaded.ok) {
          setBusy(null);
          setError(uploaded.message);
          break;
        }
        urls[shape.key] = uploaded.url;
      } catch (e) {
        setBusy(null);
        setError(e instanceof Error ? e.message : "絵を まとめられませんでした。");
        break;
      }
    }

    setBusy(null);
    onChange({ ...value, mouth: { ...mouth, ...urls } });
  };

  return (
    <StudioSection
      title="口パクの 絵（ミーティングで つかう）"
      hint="6まい（あ・い・う・え・お・とじる）を 切りかえて 口を 動かします。音の 大きさで 開きます。"
    >
      <div className="bg-panel-tint flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <MiniButton tone="accent" onClick={() => void makeAll()} disabled={busy !== null}>
          {busy ? `つくって います…（${busy}）` : "🎨 6まい まとめて つくる"}
        </MiniButton>
        <span className="text-ink-soft text-xs font-bold">
          いま {made} / {MOUTH_SHAPES.length} まい
        </span>
      </div>
      <p className="text-ink-faint text-xs font-bold">
        とじた 口を 1まい 作り、そこに「口の ところだけ」を 重ねて 残りを 作ります。 まるごと 6まい
        作ると 背景が わずかに ちがって、切りかえた ときに ちらつきます。
      </p>

      <ul className="grid gap-3 sm:grid-cols-2">
        {MOUTH_SHAPES.map((shape) => (
          <li
            key={shape.key}
            className="border-hairline flex items-start gap-3 rounded-2xl border-2 bg-white p-3"
          >
            {mouth[shape.key] ? (
              // next/image は外部URLの許可設定が要るため、ここは素の img で出す
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mouth[shape.key]}
                alt=""
                className="border-hairline h-20 w-20 shrink-0 rounded-lg border-2 object-cover"
              />
            ) : (
              <span className="border-hairline text-ink-faint grid h-20 w-20 shrink-0 place-items-center rounded-lg border-2 border-dashed text-[10px] font-bold">
                まだ
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-navy text-sm font-black">
                {shape.key === "closed" ? "とじる" : shape.key.toUpperCase()}
              </p>
              <input
                type="file"
                accept="image/*"
                disabled={busy !== null}
                onChange={(event) => void upload(shape.key, event.target.files?.[0])}
                className="text-ink-soft w-full text-xs font-bold"
              />
              {mouth[shape.key] ? (
                <MiniButton onClick={() => setMouth(shape.key, undefined)}>はずす</MiniButton>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {!value.mouth ? (
        <p className="text-ink-faint text-xs font-bold">
          1まいも 決めていない ときは /img/characters/{value.id || "〈ID〉"}/mouth/ の 絵を
          さがします（さきに 置いた ぶんは そのまま 動きます）。
        </p>
      ) : null}

      {error ? (
        <p className="text-coral-deep text-xs font-black whitespace-pre-line">{error}</p>
      ) : null}
    </StudioSection>
  );
}
