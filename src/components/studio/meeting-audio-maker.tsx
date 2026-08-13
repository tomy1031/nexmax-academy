"use client";

import { useState } from "react";
import type { Character, Meeting } from "@/content/schema";
import { getGeminiKey } from "@/lib/profile";
import { synthesizeSample, synthesizeScript, TtsError } from "@/lib/audio/live-tts";
import { DEFAULT_VOICE, LIVE_VOICES } from "@/lib/audio/voices";
import { uploadAsset } from "./studio-api";
import { MiniButton, SelectField, StudioSection } from "./studio-ui";

/**
 * ミーティングの「決まっている ことば」の音声づくり
 *
 * 質問とおわりの ひとことは**毎回おなじ文**なので、その場でAIに読ませる必要が無い。
 * 作り置きすると3つ良くなる:
 *   1. 開いた瞬間に鳴る（毎回2〜3秒 待たない）
 *   2. 毎回おなじ声・おなじ速さで聞ける（聞き取りは「同じ音」の繰り返しが効く）
 *   3. キーを持たない学習者にも 声が届く
 *
 * ## 声は人物カードのものを使う
 * まんがのヘンディさんと声が違う人にならないように、既定は
 * `characters` の `voice`。ここで選び直すと**人物カードのほうを直す**ように促す
 *（この画面だけで変えると、たいわとミーティングで声が食い違う）。
 *
 * 音声は**ブラウザで作ってブラウザから置き場へ上げる**。サーバは短命トークンを
 * 出すだけで音を通さない（規律4・リスニングの音声づくりと同じ）。
 */
export function MeetingAudioMaker({
  value,
  cast,
  onChange,
}: {
  value: Meeting;
  cast: readonly Character[];
  onChange: (meeting: Meeting) => void;
}) {
  const host = cast.find((person) => person.id === value.host.id);
  const [voice, setVoice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);

  const chosen = voice ?? host?.voice ?? DEFAULT_VOICE;
  const voiceOptions = LIVE_VOICES.map((item) => ({
    value: item.name,
    label: `${item.label} — ${item.hint}`,
  }));

  /** 読み上げる文（質問ぜんぶ＋おわりの ひとこと）。並びは画面に出る順。 */
  const lines = [
    ...value.questions.map((question) => ({ key: question.id, text: question.ask })),
    { key: "closing", text: value.closing },
  ].filter((line) => line.text.trim().length > 0);

  const madeCount =
    value.questions.filter((q) => q.audioUrl).length + (value.closingAudioUrl ? 1 : 0);

  const needKey = (): string | null => {
    const apiKey = getGeminiKey();
    if (apiKey) return apiKey;
    setError("さきに「AI設定」で Gemini の APIキーを 登録してください。");
    return null;
  };

  const playSample = async () => {
    const apiKey = needKey();
    if (!apiKey) return;
    setError(null);
    setBusy("sample");
    try {
      const wav = await synthesizeSample(apiKey, chosen);
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
      setSampleUrl(URL.createObjectURL(wav));
    } catch (e) {
      setError(e instanceof TtsError ? e.message : "音声の 作成に しっぱいしました。");
    } finally {
      setBusy(null);
    }
  };

  /**
   * 1文ずつ別のファイルにする。
   *
   * リスニングのように1本につなぐと、質問3のところから鳴らすために
   * 秒数を測って持たなければならない。会話は行ったり来たりする（言い直し）ので、
   * 「その質問のファイルを鳴らす」ほうが確実で、作り直しも1文だけで済む。
   */
  const makeAll = async () => {
    const apiKey = needKey();
    if (!apiKey) return;
    setError(null);
    setBusy("all");
    setProgress({ done: 0, total: lines.length });
    try {
      const urls: Record<string, string> = {};
      for (const [index, line] of lines.entries()) {
        const { wav } = await synthesizeScript(apiKey, [{ text: line.text, voice: chosen }]);
        const file = new File([wav], `${value.id || "meeting"}-${line.key}.wav`, {
          type: "audio/wav",
        });
        const uploaded = await uploadAsset(file, `meeting/${value.id || "draft"}`);
        if (!uploaded.ok) {
          setError(uploaded.message);
          return;
        }
        urls[line.key] = uploaded.url;
        setProgress({ done: index + 1, total: lines.length });
      }
      onChange({
        ...value,
        questions: value.questions.map((question) =>
          urls[question.id] ? { ...question, audioUrl: urls[question.id] } : question,
        ),
        closingAudioUrl: urls.closing ?? value.closingAudioUrl,
      });
    } catch (e) {
      setError(e instanceof TtsError ? e.message : "音声の 作成に しっぱいしました。");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <StudioSection
      title="決まっている ことばの 音声"
      hint="しつもんと おわりの ひとことは 毎回 おなじ 文なので、さきに 音に して おきます。"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="声"
          value={chosen}
          options={voiceOptions}
          onChange={setVoice}
          hint={
            host
              ? host.voice
                ? `人物カード「${host.name}」の 声です。変えるときは 人物カードの ほうを 直します。`
                : `人物カード「${host.name}」に 声が ありません。とうじょう人物の 画面で 決めると、まんがと 声が そろいます。`
              : "あいての IDに 合う 人物カードが ありません。"
          }
        />
        <div className="flex items-end gap-2">
          <MiniButton onClick={() => void playSample()} disabled={busy !== null}>
            {busy === "sample" ? "つくっています…" : "▶ 声を ためす"}
          </MiniButton>
        </div>
      </div>

      {sampleUrl ? <audio controls src={sampleUrl} className="w-full" /> : null}

      <div className="bg-panel-tint flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <MiniButton tone="accent" onClick={() => void makeAll()} disabled={busy !== null}>
          🎙️ ぜんぶの 音声を つくる（{lines.length}文）
        </MiniButton>
        {progress ? (
          <span className="text-ink-soft text-xs font-black">
            {progress.done} / {progress.total} 文
          </span>
        ) : null}
        <span className="text-ink-soft text-xs font-bold">
          いま {madeCount} / {lines.length} 文が 音に なって います
        </span>
      </div>

      <ul className="space-y-2">
        {value.questions.map((question, index) => (
          <li
            key={question.id || index}
            className="border-hairline space-y-1 rounded-xl border-2 bg-white p-2"
          >
            <p className="text-navy text-xs font-black">
              {index + 1}. {question.ask}
            </p>
            {question.audioUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                <audio controls src={question.audioUrl} className="min-w-0 flex-1" />
                <MiniButton
                  onClick={() =>
                    onChange({
                      ...value,
                      questions: value.questions.map((q, i) =>
                        i === index ? { ...q, audioUrl: undefined } : q,
                      ),
                    })
                  }
                >
                  はずす
                </MiniButton>
              </div>
            ) : (
              <p className="text-ink-faint text-xs font-bold">
                まだ 音は ありません（その場で AIが 読みます）。
              </p>
            )}
          </li>
        ))}
        <li className="border-hairline space-y-1 rounded-xl border-2 bg-white p-2">
          <p className="text-navy text-xs font-black">おわりの ひとこと: {value.closing}</p>
          {value.closingAudioUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <audio controls src={value.closingAudioUrl} className="min-w-0 flex-1" />
              <MiniButton onClick={() => onChange({ ...value, closingAudioUrl: undefined })}>
                はずす
              </MiniButton>
            </div>
          ) : (
            <p className="text-ink-faint text-xs font-bold">まだ 音は ありません。</p>
          )}
        </li>
      </ul>

      {error ? (
        /* モデルごとの理由が複数行で来る。改行を潰すと どれが何か 読めない */
        <p className="text-coral-deep text-xs font-black whitespace-pre-line">{error}</p>
      ) : null}
    </StudioSection>
  );
}
