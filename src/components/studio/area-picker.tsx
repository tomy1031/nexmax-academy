"use client";

import { useId, useState } from "react";
import type { Stage } from "@/content/schema";
import { SCENE_IMAGES } from "@/content/scene-images.generated";
import { getGeminiKey } from "@/lib/profile";
import { buildScenePrompt } from "@/lib/scene-prompt";
import { MiniButton, StudioSection, TextField } from "./studio-ui";
import { uploadAsset } from "./studio-api";

/**
 * エリアの絵（ステージの背景・設計: src/content/areas.ts）
 *
 * マップは「1ステージ＝1エリア＝背景画像1枚」。絵の用意の仕方は3通りあり、
 * どれが要るかは場面で変わる:
 *  - **えらぶ** … すでにサーバーにある絵を使い回す（いちばん速い。多くはこれで済む）
 *  - **あげる** … 手元で作った絵を上げる（Codex で作ったものもここから入る）
 *  - **つくる** … その場でAIに描かせる（絵の当てが無いとき）
 *
 * 3つを別の場所に置くと「どこから絵を入れるのか」を先生が覚えることになる。
 * 同じ場所のタブにして、押した先だけを変える。
 *
 * サーバー内の一覧はビルド時に焼き込んだもの（Cloudflare Workers には fs が無い —
 * scripts/generate_scene_index.mjs）。実行時に走査すると必ず空になる。
 */

type Source = "pick" | "upload" | "make";

const SOURCES: readonly { key: Source; label: string; hint: string }[] = [
  { key: "pick", label: "えらぶ", hint: "サーバーに ある 絵から えらびます。" },
  { key: "upload", label: "あげる", hint: "手元の 絵の ファイルを あげます。" },
  { key: "make", label: "つくる", hint: "景色の 名前から AIに 描いてもらいます。" },
];

type Area = NonNullable<Stage["area"]>;

export function AreaPicker({
  stageId,
  value,
  onChange,
}: {
  stageId: string;
  value: Stage["area"];
  onChange: (area: Stage["area"]) => void;
}) {
  const [source, setSource] = useState<Source>("pick");
  const area: Area = value ?? { name: "", reading: "", image: "", note: "" };
  const patch = (part: Partial<Area>) => onChange({ ...area, ...part });

  return (
    <StudioSection
      title="② エリアの 絵"
      hint="マップで この ステージが 立つ 土地です。景色の 名前で 呼びます（国の 名前は 入れません）。"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="景色の 名前（国の 名前は 入れない）"
          value={area.name}
          onChange={(name) => patch({ name })}
          placeholder="きりの やまなみ"
          hint="まちの 名前・いせきの 名前は つかえます。"
        />
        <TextField
          label="よみ（ひらがな）"
          value={area.reading}
          onChange={(reading) => patch({ reading })}
          placeholder="きりの やまなみ"
        />
      </div>
      <TextField
        label="地図に そえる ひとこと"
        value={area.note}
        onChange={(note) => patch({ note })}
        placeholder="きりの なかを ぬけて いきます。"
      />

      <div className="border-hairline space-y-3 rounded-2xl border-2 bg-white p-3">
        <div className="flex flex-wrap items-start gap-3">
          {area.image ? (
            // next/image は外部URLの許可設定が要るため、ここは素の img で出す（確認用の小さな見本）
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={area.image}
              alt=""
              className="border-hairline h-32 w-24 rounded-xl border-2 object-cover"
            />
          ) : (
            <div className="border-hairline text-ink-faint grid h-32 w-24 place-items-center rounded-xl border-2 border-dashed text-center text-[11px] font-bold">
              まだ
              <br />
              ありません
            </div>
          )}
          <div className="min-w-[12rem] flex-1 space-y-2">
            <p className="text-navy text-xs font-black">はいけいの 絵（たて長 1024×1536）</p>
            <p className="text-ink-faint text-xs font-bold">
              絵が なくても ステージは マップに 出ます（空色の おびに なります）。
            </p>
            <TextField
              label="絵の ばしょ"
              value={area.image}
              onChange={(image) => patch({ image })}
              placeholder="/img/scenes/area_misty_peaks.webp"
            />
          </div>
        </div>

        <nav aria-label="絵の 入れかた" className="flex flex-wrap gap-2">
          {SOURCES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSource(item.key)}
              aria-pressed={source === item.key}
              className={`rounded-full border-2 px-4 py-1.5 text-xs font-black ${
                source === item.key
                  ? "bg-navy border-navy text-white"
                  : "border-hairline text-ink bg-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="text-ink-soft text-xs font-bold">
          {SOURCES.find((item) => item.key === source)?.hint}
        </p>

        {source === "pick" ? (
          <PickFromServer selected={area.image} onPick={(image) => patch({ image })} />
        ) : null}
        {source === "upload" ? (
          <UploadImage stageId={stageId} onDone={(image) => patch({ image })} />
        ) : null}
        {source === "make" ? (
          <MakeImage stageId={stageId} area={area} onDone={(image) => patch({ image })} />
        ) : null}
      </div>

      {value ? (
        <MiniButton onClick={() => onChange(undefined)}>この 土地を やめる</MiniButton>
      ) : null}
    </StudioSection>
  );
}

/** サーバーにすでにある絵。見本を並べて押すだけにする（ファイル名では選べない）。 */
function PickFromServer({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (image: string) => void;
}) {
  if (SCENE_IMAGES.length === 0) {
    return (
      <p className="text-ink-soft text-xs font-bold">
        サーバーに 絵が ありません。「あげる」か「つくる」を つかってください。
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {SCENE_IMAGES.map((image) => (
        <li key={image}>
          <button
            type="button"
            onClick={() => onPick(image)}
            aria-pressed={selected === image}
            title={image}
            className={`block w-full overflow-hidden rounded-xl border-2 ${
              selected === image ? "border-navy ring-navy ring-2" : "border-hairline"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={image} className="h-20 w-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function UploadImage({ stageId, onDone }: { stageId: string; onDone: (image: string) => void }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadAsset(file, `areas/${stageId || "stage"}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone(result.url);
  };

  return (
    <div className="space-y-2">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
        className="text-ink-soft text-xs font-bold"
      />
      {busy ? <p className="text-ink-soft text-xs font-black">あげています…</p> : null}
      {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
      <p className="text-ink-faint text-xs font-bold">
        Codex で 作った 絵も ここから 入れられます（docs/skills/codex_image_generation.md §7.1）。
      </p>
    </div>
  );
}

/**
 * その場でAIに描いてもらう。
 *
 * 画風・比率・入れてはいけないものは `buildScenePrompt` が毎回同じものを付ける。
 * 先生が書くのは景色だけ——1枚だけ画風が違うと、地図をスクロールしたときに
 * そこで世界が切れて見える。
 */
function MakeImage({
  stageId,
  area,
  onDone,
}: {
  stageId: string;
  area: Area;
  onDone: (image: string) => void;
}) {
  const [scenery, setScenery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = scenery.trim().length > 0 ? scenery.trim() : area.name.trim();

  const make = async () => {
    if (subject.length === 0) {
      setError("どんな 景色か を 書いてください。");
      return;
    }
    const apiKey = getGeminiKey();
    if (!apiKey) {
      setError("AIの キーが まだ ありません。「AI指示出し」で 登録してください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const image = await requestImage(apiKey, buildScenePrompt(subject, area.note));
      // 生成物はそのままだと消える。Storage に置いて、URLをステージに持たせる。
      const uploaded = await uploadAsset(image, `areas/${stageId || "stage"}`);
      if (!uploaded.ok) {
        setError(uploaded.message);
        return;
      }
      onDone(uploaded.url);
    } catch (e) {
      setError(e instanceof SceneError ? e.message : "絵を つくれませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <TextField
        label="どんな 景色（日本語で よい）"
        value={scenery}
        onChange={setScenery}
        placeholder="きりの かかった 岩山と、ふもとの 古い まち"
        hint="国の 名前は 書かないでください。絵の 中に 文字は 入りません。"
      />
      <MiniButton tone="accent" onClick={() => void make()} disabled={busy}>
        {busy ? "つくっています…" : "🎨 この 景色で つくる"}
      </MiniButton>
      {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
      <p className="text-ink-faint text-xs font-bold">
        キーは 先生ご本人の ものを つかいます（サーバーには のこりません）。
      </p>
    </div>
  );
}

class SceneError extends Error {}

/** サーバのプロキシへ頼んで、画像だけ受け取る（キーは返ってこない）。 */
async function requestImage(apiKey: string, prompt: string): Promise<File> {
  let response: Response;
  try {
    response = await fetch("/api/studio/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, prompt }),
    });
  } catch {
    throw new SceneError("つうしんに 失敗しました。ネットワークを たしかめてください。");
  }

  let body: { data?: unknown; mimeType?: unknown; reason?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // 本文が読めない＝理由も分からない。下の言い分けに任せる
  }
  if (!response.ok || typeof body.data !== "string") {
    throw new SceneError(messageForImageReason(typeof body.reason === "string" ? body.reason : ""));
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/png";
  const bytes = Uint8Array.from(atob(body.data), (char) => char.charCodeAt(0));
  const extension = mimeType.split("/")[1] ?? "png";
  return new File([bytes], `scene.${extension}`, { type: mimeType });
}

function messageForImageReason(reason: string): string {
  switch (reason) {
    case "noKey":
      return "AIの キーが まだ ありません。「AI指示出し」で 登録してください。";
    case "invalidPrompt":
      return "景色の 説明が ながすぎます。みじかく してください。";
    case "noImage":
      return "絵が かえって きませんでした。景色の 書き方を 少し 変えて ためしてください。";
    case "forbidden":
      return "この そうさは 先生（管理者）だけです。";
    default:
      return "絵を つくれませんでした。少し 待って もう一度 ためしてください。";
  }
}
