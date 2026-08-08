"use client";

/**
 * まとめて作る — 足りない絵と音を、上から1件ずつ作る
 *
 * 教材が増えると、絵の無いコマは教材の中に散らばる。エディタを1つずつ開いて
 * 探すのは現実的でなく、**探す作業そのものが「作らない理由」になる**。
 *
 * ## 直列にする理由
 * ブリッジは1接続1操作（`CodexTransport.activeTurn` が1枠）。並列にすると
 * 2件目以降が「前の生成が終わるまで待ってください」で落ちる。
 * 直列なら遅いが、**失敗した1件だけをやり直せる**利点がある。
 *
 * ## 1件できるたびに保存する
 * まとめて最後に保存すると、途中でとめたぶん・ブラウザを閉じたぶんが全部消える。
 * 絵は1枚に1分前後かかるので、8枚なら8分。その間ずっと閉じられないのは無理がある。
 *
 * 数える所と書き戻す所は純関数（`src/lib/batch/missing-assets.ts`）。
 * 一括処理はまちがえると教材を一度にたくさん壊すので、そこはテストで固定してある。
 */

import { useMemo, useRef, useState } from "react";
import type { Content } from "@/content/schema";
import {
  applyAsset,
  collectMissingAssets,
  reasonCannotMake,
  summarize,
  type AssetOutcome,
  type MissingAsset,
} from "@/lib/batch/missing-assets";
import { getGeminiKey } from "@/lib/profile";
import { synthesizeScript, TtsError, type TtsLine } from "@/lib/audio/live-tts";
import { DEFAULT_VOICE } from "@/lib/audio/voices";
import { generateImage } from "./image-api";
import { saveContent, uploadAsset } from "./studio-api";
import { MiniButton } from "./studio-ui";

const KIND_LABEL: Record<MissingAsset["kind"], string> = {
  mangaPanel: "まんがの コマ",
  articleImage: "よみものの え",
  characterSheet: "設定画",
  listeningAudio: "音声",
};

export function BatchMaker({
  contents,
  onSaved,
}: {
  /** いま手元にある教材ぜんぶ（git ∪ DB）。 */
  contents: readonly Content[];
  /** 1件保存できたら呼ぶ（一覧を作り直してもらう）。 */
  onSaved?: (content: Content) => void;
}) {
  const missing = useMemo(() => collectMissingAssets(contents), [contents]);

  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(missing.filter((a) => reasonCannotMake(a) === null).map((a) => a.id)),
  );
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, AssetOutcome>>(new Map());
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /**
   * 「とめる」の合図。state ではなく ref にするのは、走っている最中のループが
   * **その瞬間の値**を見る必要があるため（state だと閉じ込められた古い値を見る）。
   */
  const stopping = useRef(false);

  const targets = missing.filter((a) => chosen.has(a.id));
  const totals = summarize(outcomes);

  const toggle = (id: string) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const record = (id: string, outcome: AssetOutcome) => {
    setOutcomes((prev) => new Map(prev).set(id, outcome));
  };

  /** 1件作る。教材への書き戻しと保存までやって、結末を返す。 */
  const makeOne = async (asset: MissingAsset): Promise<AssetOutcome> => {
    const blocked = reasonCannotMake(asset);
    if (blocked) return { state: "skipped", message: blocked };

    const content = contents.find((c) => c.id === asset.contentId);
    if (!content) return { state: "failed", message: "教材が 見つかりません" };

    const apiKey = getGeminiKey();

    // 1. 作る
    let file: File;
    if (asset.kind === "listeningAudio") {
      if (content.kind !== "listening")
        return { state: "failed", message: "教材の 種類が ちがいます" };
      if (!apiKey) {
        return { state: "skipped", message: "音声には Gemini の キーが 要ります（AI設定で 登録）" };
      }
      try {
        /*
         * 声は登場人物DB（character.voice）から引く。リスニングの participants は
         * 声を持たない——同じ人が別の教材に出ても声が変わらないようにするには、
         * 人物のほうに1つ持たせるしかない。名前で突き合わせる（IDは教材ごとに別々のため）。
         */
        const voiceOf = (speaker: string): string => {
          const name = content.participants.find((p) => p.id === speaker)?.name;
          if (!name) return DEFAULT_VOICE;
          const person = contents.find((c) => c.kind === "character" && c.name === name);
          return person?.kind === "character" ? (person.voice ?? DEFAULT_VOICE) : DEFAULT_VOICE;
        };
        const lines: TtsLine[] = content.script.map((line) => ({
          text: line.text,
          voice: voiceOf(line.speaker),
        }));
        const { wav } = await synthesizeScript(apiKey, lines);
        file = new File([wav], "audio.wav", { type: "audio/wav" });
      } catch (error) {
        return {
          state: "failed",
          message: error instanceof TtsError ? error.message : "音声を 作れませんでした",
        };
      }
    } else {
      const made = await generateImage({
        apiKey: apiKey ?? "",
        prompt: asset.prompt,
        references: asset.references,
      });
      if (!made.ok) return { state: "failed", message: made.message };
      file = made.file;
    }

    // 2. 置く
    const uploaded = await uploadAsset(file, asset.prefix);
    if (!uploaded.ok) return { state: "failed", message: uploaded.message };

    // 3. 教材へ入れて保存する（1件ごと。途中でやめても ここまでは残る）
    const updated = applyAsset(content, asset, uploaded.url);
    const saved = await saveContent(updated, false);
    if (!saved.ok) return { state: "failed", message: saved.message };

    onSaved?.(updated);
    return { state: "done", url: uploaded.url };
  };

  const run = async () => {
    if (targets.length === 0) return;
    stopping.current = false;
    setRunning(true);
    setNote(null);

    for (const asset of targets) {
      if (stopping.current) {
        setNote("とめました。ここまでの ぶんは 保存ずみです。");
        break;
      }
      setNow(asset.id);
      // 1件ずつ待つ。ブリッジが1接続1操作なので、まとめて投げると2件目から落ちる
      record(asset.id, await makeOne(asset));
    }

    setNow(null);
    setRunning(false);
  };

  if (missing.length === 0) {
    return (
      <section className="card-pop mx-auto max-w-4xl p-5 sm:p-8">
        <h2 className="text-navy text-xl font-black">まとめて つくる</h2>
        <p className="text-ink-soft mt-3 text-sm font-bold">
          ✨ 足りない 絵や 音は ありません。ぜんぶ そろっています。
        </p>
      </section>
    );
  }

  const doneCount = totals.done + totals.failed + totals.skipped;

  return (
    <section className="card-pop mx-auto max-w-4xl p-5 sm:p-8">
      <h2 className="text-navy text-xl font-black">まとめて つくる</h2>
      <p className="text-ink-soft mt-2 text-sm font-bold">
        まだ 絵や 音の ない ところが <strong>{missing.length}</strong> こ あります。 上から 1つずつ
        作ります。1つ できるたびに 保存するので、 とちゅうで とめても そこまでは のこります。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running || targets.length === 0}
          className="btn-game px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
        >
          {running
            ? `つくっています… ${doneCount}/${targets.length}`
            : `${targets.length}こ つくる`}
        </button>
        {running && (
          <MiniButton
            onClick={() => {
              stopping.current = true;
            }}
          >
            とめる
          </MiniButton>
        )}
        {!running && (
          <>
            <MiniButton onClick={() => setChosen(new Set(missing.map((a) => a.id)))}>
              ぜんぶ えらぶ
            </MiniButton>
            <MiniButton onClick={() => setChosen(new Set())}>ぜんぶ はずす</MiniButton>
            {totals.failed > 0 && (
              <MiniButton
                onClick={() =>
                  setChosen(
                    new Set(
                      missing
                        .filter((a) => outcomes.get(a.id)?.state === "failed")
                        .map((a) => a.id),
                    ),
                  )
                }
              >
                できなかった {totals.failed}こ だけ えらぶ
              </MiniButton>
            )}
          </>
        )}
      </div>

      {doneCount > 0 && (
        <p className="text-ink mt-3 text-sm font-bold">
          できた {totals.done}こ{totals.failed > 0 && ` ／ できなかった ${totals.failed}こ`}
          {totals.skipped > 0 && ` ／ とばした ${totals.skipped}こ`}
        </p>
      )}
      {note && <p className="text-ink-soft mt-2 text-sm font-bold">{note}</p>}

      <ul className="mt-4 space-y-2">
        {missing.map((asset) => {
          const outcome = outcomes.get(asset.id);
          const blocked = reasonCannotMake(asset);
          const isNow = now === asset.id;
          return (
            <li
              key={asset.id}
              className={`border-hairline flex flex-wrap items-center gap-3 rounded-2xl border-2 p-3 ${
                isNow ? "bg-sky-tint" : "bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={chosen.has(asset.id)}
                onChange={() => toggle(asset.id)}
                disabled={running || blocked !== null}
                aria-label={`${asset.label} を えらぶ`}
                className="size-5 shrink-0"
              />
              <span className="bg-panel-tint text-ink-soft shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-black">
                {KIND_LABEL[asset.kind]}
              </span>
              <span className="text-ink min-w-40 flex-1 text-sm font-bold break-words">
                {asset.label}
              </span>
              <span className="shrink-0 text-sm font-bold">
                {isNow && <span className="text-navy">つくっています…</span>}
                {!isNow && outcome?.state === "done" && (
                  <span className="text-leaf-deep">✓ できた</span>
                )}
                {!isNow && outcome?.state === "failed" && (
                  <span className="text-[#c2410c]">✗ {outcome.message}</span>
                )}
                {!isNow && outcome?.state === "skipped" && (
                  <span className="text-ink-soft">— {outcome.message}</span>
                )}
                {!isNow && !outcome && blocked && <span className="text-ink-faint">{blocked}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
