"use client";

import { useMemo, useState } from "react";
import type { Listening } from "@/content/schema";
import { getGeminiKey } from "@/lib/profile";
import { synthesizeSample, synthesizeScript, TtsError, type TtsLine } from "@/lib/audio/live-tts";
import { DEFAULT_VOICE, LIVE_VOICES } from "@/lib/audio/voices";
import { uploadAsset } from "./studio-api";
import { MiniButton, SelectField, StudioSection } from "./studio-ui";

/**
 * リスニングの音声づくり（設計07 §11・音声）
 *
 * 台本を書いたあと、話す人ごとに声を決めて、まとめて読み上げさせる。
 * 音声は**ブラウザで作ってブラウザから置き場へ上げる**。サーバは短命トークンを
 * 出すだけで音を通さない（Cloudflare Workers に長い接続を抱えさせないため —
 * AGENTS.md 規律4 / 設計03 §2。Live対話と同じ考え方）。
 *
 * 声は必ず**先に試聴できる**ようにしてある。20行ぶん作ってから
 * 「思っていた声と違う」となると、待ち時間も API の残りも無駄になる。
 */
export function AudioMaker({
  value,
  onChange,
}: {
  value: Listening;
  onChange: (listening: Listening) => void;
}) {
  const [voices, setVoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);

  /** 台本に出てくる話す人（participants ＋ 自分 ＋ ナレーション）。 */
  const speakers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const line of value.script) {
      if (seen.has(line.speaker)) continue;
      const person = value.participants.find((p) => p.id === line.speaker);
      seen.set(
        line.speaker,
        person
          ? `${person.name}（${person.role}）`
          : line.speaker === "me"
            ? "あなた"
            : "ナレーション",
      );
    }
    return [...seen].map(([id, label]) => ({ id, label }));
  }, [value.script, value.participants]);

  const voiceOf = (speaker: string) => voices[speaker] ?? DEFAULT_VOICE;

  const voiceOptions = LIVE_VOICES.map((voice) => ({
    value: voice.name,
    label: `${voice.label} — ${voice.hint}`,
  }));

  const playSample = async (voice: string) => {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError("さきに はじめの せっていで Gemini の APIキーを 登録してください。");
      return;
    }
    setError(null);
    setBusy(`sample:${voice}`);
    try {
      const wav = await synthesizeSample(apiKey, voice);
      // 前の試聴のURLは必ず捨てる。押すたびに増えるとメモリを食う
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
      setSampleUrl(URL.createObjectURL(wav));
    } catch (e) {
      setError(e instanceof TtsError ? e.message : "音声の 作成に しっぱいしました。");
    } finally {
      setBusy(null);
    }
  };

  const makeAudio = async () => {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError("さきに はじめの せっていで Gemini の APIキーを 登録してください。");
      return;
    }
    setError(null);
    setBusy("script");
    setProgress({ done: 0, total: value.script.length });
    try {
      const lines: TtsLine[] = value.script.map((line) => ({
        text: line.text,
        voice: voiceOf(line.speaker),
      }));
      const { wav, startSeconds } = await synthesizeScript(apiKey, lines, setProgress);

      const file = new File([wav], `${value.id || "listening"}.wav`, { type: "audio/wav" });
      const uploaded = await uploadAsset(file, `listening/${value.id || "draft"}`);
      if (!uploaded.ok) {
        setError(uploaded.message);
        return;
      }

      // 行ごとの開始秒も入れる。字幕が音に追従するようになり、
      // 先生が秒数を手で測らずに済む（schema の script[].at）。
      onChange({
        ...value,
        audioUrl: uploaded.url,
        script: value.script.map((line, index) => ({ ...line, at: startSeconds[index] })),
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
      title="音声を つくる"
      hint="台本を 読み上げた 音声を つくります。声は 先に ためせます。"
    >
      {value.script.length === 0 ? (
        <p className="text-ink-faint text-xs font-bold">
          さきに 台本を 書いてください。書いた 行を 読み上げます。
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {speakers.map((speaker) => (
              <div
                key={speaker.id}
                className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
              >
                <div className="min-w-[12rem] flex-1">
                  <SelectField
                    label={`${speaker.label} の 声`}
                    value={voiceOf(speaker.id)}
                    options={voiceOptions}
                    onChange={(voice) => setVoices((prev) => ({ ...prev, [speaker.id]: voice }))}
                  />
                </div>
                <MiniButton
                  onClick={() => void playSample(voiceOf(speaker.id))}
                  disabled={busy !== null}
                >
                  {busy === `sample:${voiceOf(speaker.id)}` ? "つくっています…" : "▶ 声を ためす"}
                </MiniButton>
              </div>
            ))}
          </div>

          {sampleUrl ? <audio controls src={sampleUrl} className="w-full" /> : null}

          <div className="bg-panel-tint flex flex-wrap items-center gap-3 rounded-2xl p-3">
            <MiniButton tone="accent" onClick={() => void makeAudio()} disabled={busy !== null}>
              🎙️ 台本ぜんぶの 音声を つくる（{value.script.length}行）
            </MiniButton>
            {progress ? (
              <span className="text-ink-soft text-xs font-black">
                {progress.done} / {progress.total} 行
              </span>
            ) : null}
          </div>

          {value.audioUrl ? (
            <div className="border-hairline space-y-2 rounded-xl border-2 bg-white p-3">
              <p className="text-navy text-xs font-black">いまの 音声</p>
              <audio controls src={value.audioUrl} className="w-full" />
              <MiniButton onClick={() => onChange({ ...value, audioUrl: undefined })}>
                音声を はずす
              </MiniButton>
            </div>
          ) : (
            <p className="text-ink-faint text-xs font-bold">
              まだ 音声は ありません。無くても 台本を 読む 画面として つかえます。
            </p>
          )}

          {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
        </>
      )}
    </StudioSection>
  );
}
