"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type { ImageSlot } from "@/content/schema";
import { uploadAsset } from "./studio-api";
import { MiniButton, TextAreaField } from "./studio-ui";

/**
 * 画像スロットの編集（漫画のコマ・記事の画像ブロック共通 — 設計07 §4/§5）
 *
 * 「生成する／アップロードする／あとで」の3状態を1か所で扱う。画像が無いままでも
 * 教材は成立する（読む画面は「え は じゅんびちゅう」を出す）ので、空を異常扱いしない。
 * prompt は再生成のために保存しておく（あとで「少し直して再生成」ができる）。
 */
export function ImageSlotEditor({
  slot,
  onChange,
  prefix,
}: {
  slot: ImageSlot;
  onChange: (slot: ImageSlot) => void;
  /** Storage の置き場（例: manga/m7-intro）。 */
  prefix: string;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadAsset(file, prefix);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChange({ ...slot, src: result.url, status: "done" });
  };

  return (
    <div className="border-hairline bg-panel-tint rounded-[20px] border-2 p-3">
      <div className="flex flex-wrap items-start gap-3">
        {slot.src ? (
          <Image
            src={slot.src}
            alt=""
            width={160}
            height={110}
            unoptimized
            className="h-[110px] w-[160px] rounded-xl border-4 border-white object-cover"
          />
        ) : (
          <div className="text-ink-faint grid h-[110px] w-[160px] place-items-center rounded-xl border-4 border-dashed border-white text-xs font-black">
            がぞうは あとで
          </div>
        )}

        <div className="min-w-[12rem] flex-1 space-y-2">
          <label
            htmlFor={inputId}
            className="btn-island btn-game inline-flex cursor-pointer px-4 py-2 text-xs"
          >
            {busy ? "アップロード中…" : "画像を アップロード"}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            className="sr-only"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-soft text-xs font-bold">
              じょうたい: {STATUS_LABEL[slot.status]}
            </span>
            {slot.src ? (
              <MiniButton
                tone="danger"
                onClick={() => onChange({ ...slot, src: undefined, status: "empty" })}
              >
                画像を はずす
              </MiniButton>
            ) : null}
          </div>
          {error ? <p className="text-coral-deep text-xs font-black">{error}</p> : null}
        </div>
      </div>

      <div className="mt-3">
        <TextAreaField
          label="画像のプロンプト（あとで作り直すときに使う）"
          rows={2}
          value={slot.prompt ?? ""}
          placeholder="例: ネクマックスが 会議室で メモを取っている。やわらかい色。"
          onChange={(value) => onChange({ ...slot, prompt: value.length > 0 ? value : undefined })}
        />
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<ImageSlot["status"], string> = {
  empty: "まだ ない",
  generating: "作成中",
  done: "できた",
};
