"use client";

import { useId, useState } from "react";
import type { Character } from "@/content/schema";
import { synthesizeSample, TtsError } from "@/lib/audio/live-tts";
import { LIVE_VOICES } from "@/lib/audio/voices";
import { buildCharacterSheetPrompt } from "@/lib/manga-prompt";
import { getGeminiKey } from "@/lib/profile";
import { generateImage } from "./image-api";
import { MouthMaker } from "./mouth-maker";
import { uploadAsset } from "./studio-api";
import { MiniButton, SelectField, StudioSection, TextAreaField, TextField } from "./studio-ui";

/**
 * 登場人物のエディタ
 *
 * まんがのコマを何枚も作ると、**コマごとに顔や服が変わる**のがいちばんの問題になる。
 * これを防ぐ確立した方法は「先にキャラクターシート（設定画）を1枚作り、
 * それを参照画像として毎回渡す」こと。だからこの画面の主役はシートである。
 *
 * 参考画像を先生が持ち込めるようにしてあるのは、頭の中にある人物像を
 * 文字だけで伝えるのが難しいため。持ち込んだ絵を入力にすればシートが寄る。
 */
export function CharacterEditor({
  value,
  onChange,
}: {
  value: Character;
  onChange: (character: Character) => void;
}) {
  const patch = (part: Partial<Character>) => onChange({ ...value, ...part });

  return (
    <div className="space-y-4">
      <StudioSection title="きほん" hint="まんが・リスニングで つかいまわす 人です。">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="ID（半角の 英小文字・数字・- _）"
            value={value.id}
            onChange={(id) => patch({ id })}
            placeholder="hendy"
          />
          <VoicePicker value={value} onChange={onChange} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="名前"
            value={value.name}
            onChange={(name) => patch({ name })}
            placeholder="ヘンディ"
          />
          <TextField
            label="よみ（ひらがな）"
            value={value.reading}
            onChange={(reading) => patch({ reading })}
            placeholder="へんでぃ"
          />
        </div>
        <TextField
          label="立場"
          value={value.role}
          onChange={(role) => patch({ role })}
          placeholder="先輩エンジニア"
          hint="上下関係が 分からないと、学習者は ていねいな 言い方の あて先を 読み取れません。"
        />
        <TextAreaField
          label="見た目"
          value={value.looks}
          onChange={(looks) => patch({ looks })}
          placeholder="20代後半の男性。黒い短髪、細いシルバーの眼鏡、紺色のポロシャツ、社員証を首から下げている。"
          hint="色や形を 具体的に 書きます。あいまいだと コマごとに 絵が 変わります。"
        />
        <TextAreaField
          label="せいかく・話し方（なくても よい）"
          value={value.personality ?? ""}
          onChange={(personality) =>
            patch({ personality: personality.length > 0 ? personality : undefined })
          }
          placeholder="おだやかで、まず相手の話を最後まで聞く。指示は短く区切って言う。"
        />
      </StudioSection>

      <SheetMaker value={value} onChange={onChange} />
      <MouthMaker value={value} onChange={onChange} />
    </div>
  );
}

/**
 * 声。**この人の声はここで決める**（教材ごとに持たせない）。
 *
 * リスニングの読み上げにも、ミーティングで Live が話すときにも同じ声を使う。
 * 教材側に書けるようにすると、まんがのヘンディさんとミーティングのヘンディさんで
 * 声が食い違ったときに、どちらが正しいのか誰にも分からなくなる。
 *
 * その場で試聴できるようにしてあるのは、**名前だけでは決められない**から
 *（「Charon」がどんな声かは、聞くまで分からない）。
 */
function VoicePicker({
  value,
  onChange,
}: {
  value: Character;
  onChange: (character: Character) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);

  const playSample = async () => {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError("AIの キーが ありません。「AI設定」で 登録してください。");
      return;
    }
    if (!value.voice) {
      setError("さきに 声を えらんでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const wav = await synthesizeSample(apiKey, value.voice);
      // 前の試聴のURLは必ず捨てる。押すたびに増えるとメモリを食う
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
      setSampleUrl(URL.createObjectURL(wav));
    } catch (e) {
      setError(e instanceof TtsError ? e.message : "音声の 作成に しっぱいしました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <SelectField
        label="声（リスニングの 読み上げと ミーティングの 会話）"
        value={value.voice ?? ""}
        options={[
          { value: "", label: "— きめない —" },
          ...LIVE_VOICES.map((voice) => ({
            value: voice.name,
            label: `${voice.label}（${voice.hint}）`,
          })),
        ]}
        onChange={(voice) => onChange({ ...value, voice: voice.length > 0 ? voice : undefined })}
        hint="ここで きめた 声で、この人は どの 教材でも 話します。"
      />
      <MiniButton onClick={() => void playSample()} disabled={busy}>
        {busy ? "つくっています…" : "▶ 声を ためす"}
      </MiniButton>
      {sampleUrl ? <audio controls src={sampleUrl} className="w-full" /> : null}
      {error ? (
        <p className="text-coral-deep text-xs font-black whitespace-pre-line">{error}</p>
      ) : null}
    </div>
  );
}

/** キャラクターシート（設定画）。参考画像を入力にして作る。 */
function SheetMaker({
  value,
  onChange,
}: {
  value: Character;
  onChange: (character: Character) => void;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState<"upload" | "make" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addReference = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    setError(null);
    const result = await uploadAsset(file, `characters/${value.id || "character"}`);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChange({ ...value, references: [...value.references, result.url] });
  };

  const makeSheet = async () => {
    if (value.looks.trim().length === 0) {
      setError("さきに「見た目」を 書いてください。");
      return;
    }
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError("AIの キーが ありません。「AI設定」で 登録してください。");
      return;
    }
    setBusy("make");
    setError(null);
    const prompt = buildCharacterSheetPrompt(value);
    const made = await generateImage({ apiKey, prompt, references: value.references });
    if (!made.ok) {
      setBusy(null);
      setError(made.message);
      return;
    }
    const uploaded = await uploadAsset(made.file, `characters/${value.id || "character"}`);
    setBusy(null);
    if (!uploaded.ok) {
      setError(uploaded.message);
      return;
    }
    onChange({
      ...value,
      // プロンプトも残す。「少し直して作り直す」が、ゼロから書き直しにならないように
      sheet: { src: uploaded.url, prompt, refs: [...value.references], status: "done" },
    });
  };

  return (
    <StudioSection
      title="キャラクターシート（設定画）"
      hint="まんがの コマを 作るとき、この絵を 毎回 わたします。これが あると 顔や服が ぶれません。"
    >
      <div className="flex flex-wrap items-start gap-4">
        {value.sheet.src ? (
          // next/image は外部URLの許可設定が要るため、ここは素の img で出す
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.sheet.src}
            alt=""
            className="border-hairline h-40 w-auto rounded-xl border-2 object-contain"
          />
        ) : (
          <div className="border-hairline text-ink-faint grid h-40 w-40 place-items-center rounded-xl border-2 border-dashed text-center text-xs font-bold">
            まだ
            <br />
            ありません
          </div>
        )}

        <div className="min-w-[14rem] flex-1 space-y-2">
          <MiniButton tone="accent" onClick={() => void makeSheet()} disabled={busy !== null}>
            {busy === "make" ? "つくっています…" : "🎨 設定画を つくる"}
          </MiniButton>
          <p className="text-ink-faint text-xs font-bold">
            正面・よこ・うしろ と、表情6つを 1枚に します。文字は 入れません。
          </p>
          <TextField
            label="絵の ばしょ（URL）"
            value={value.sheet.src ?? ""}
            onChange={(src) =>
              onChange({
                ...value,
                sheet: { ...value.sheet, src: src.length > 0 ? src : undefined },
              })
            }
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="border-hairline space-y-2 rounded-2xl border-2 bg-white p-3">
        <p className="text-navy text-xs font-black">参考の 絵（あれば）</p>
        <p className="text-ink-faint text-xs font-bold">
          頭の中の 人物を 文字だけで つたえるのは むずかしいので、絵が あれば それを 入力に
          できます。
        </p>
        {value.references.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {value.references.map((url, index) => (
              <li key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="border-hairline h-20 w-20 rounded-lg border-2 object-cover"
                />
                <MiniButton
                  tone="danger"
                  onClick={() =>
                    onChange({
                      ...value,
                      references: value.references.filter((_, i) => i !== index),
                    })
                  }
                  title="この絵を はずす"
                >
                  はずす
                </MiniButton>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          disabled={busy !== null}
          onChange={(event) => void addReference(event.target.files?.[0])}
          className="text-ink-soft text-xs font-bold"
        />
        {busy === "upload" ? (
          <p className="text-ink-soft text-xs font-black">あげています…</p>
        ) : null}
      </div>

      {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
    </StudioSection>
  );
}
