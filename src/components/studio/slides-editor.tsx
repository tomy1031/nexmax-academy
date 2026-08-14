"use client";

import { useId, useState } from "react";
import type { Slides } from "@/content/schema";
import { loadPdfjs } from "@/lib/pdfjs";
import { removeAt, replaceAt } from "./list-ops";
import { uploadAsset } from "./studio-api";
import {
  FuriganaEditor,
  MiniButton,
  NumberField,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/**
 * スライド教材の編集（先生向け）
 *
 * やることは3つだけにしてある: **PDFを上げる → 名前を書く → 1枚ずつ ひとことを足す**。
 *
 * ## パワポは そのままでは 置けない
 * 変換はサーバでできない（無料枠に変換の置き場が無い）。だから「PDFで書き出してから
 * 上げる」ひと手間が先生に残る。ここを黙って受け取ると、上げられたのに学習者の画面が
 * 真っ白になり、原因が誰にも見えない。**上げた瞬間に、書き出し方まで言う**。
 *
 * ## 枚数は先生に数えさせない
 * 上げる前に ブラウザが PDF を開いて 枚数を読む。ついでに「本当に開けるPDFか」も
 * ここで分かるので、開けないファイルは Storage に上げる前に断れる。
 */

/** 大きすぎるPDFは 教室の通信で開かない。ここで断る。 */
const MAX_MB = 40;
/** これを超えたら「重い」と伝える（止めはしない）。 */
const HEAVY_MB = 10;

export function SlidesEditor({
  value,
  onChange,
}: {
  value: Slides;
  onChange: (next: Slides) => void;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heavy, setHeavy] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setHeavy(null);

    const megabytes = file.size / 1024 / 1024;
    if (megabytes > MAX_MB) {
      setError(
        `ファイルが 大きすぎます（${megabytes.toFixed(0)}MB）。${MAX_MB}MB までに してください。`,
      );
      return;
    }

    setBusy(true);
    // 上げる前に 開いてみる。開けない物を Storage に置くと、
    // 先生は「ほぞんできた」と思ったまま、学習者の画面だけが 白くなる。
    const pageCount = await readPageCount(file);
    if (pageCount === null) {
      setBusy(false);
      setError(
        "この ファイルは ひらけませんでした。PowerPoint の「ファイル → 名前を つけて ほぞん」で " +
          "しゅるいを PDF に して 書き出してから 上げてください。",
      );
      return;
    }

    const result = await uploadAsset(file, `slides/${value.id.length > 0 ? value.id : "new"}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (megabytes > HEAVY_MB) {
      setHeavy(
        `${megabytes.toFixed(0)}MB あります。教室の 通信が おそいと ひらくのに 時間が かかります` +
          "（写真の 多い スライドは、書き出すときに 画質を 下げると 軽く なります）。",
      );
    }
    // 枚数を先生に数えさせない。差し替えで 枚数が 減ったときも ここで そろう
    onChange({ ...value, fileUrl: result.url, pageCount });
  };

  const notes = value.notes;

  return (
    <div className="space-y-4">
      <StudioSection
        title="スライド（PDF）"
        hint="パワポは 先に PDF で 書き出してから 上げてください（そのままの 見た目で 出ます）。"
      >
        <div className="border-hairline bg-panel-tint rounded-[20px] border-2 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={inputId}
              className="btn-island btn-game inline-flex cursor-pointer px-4 py-2 text-xs"
            >
              {busy ? "アップロード中…" : value.fileUrl ? "PDFを さしかえる" : "PDFを アップロード"}
            </label>
            <input
              id={inputId}
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
              className="sr-only"
            />

            {value.fileUrl ? (
              <>
                <span className="text-ink text-xs font-black">ぜんぶで {value.pageCount} まい</span>
                <a
                  href={value.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-deep text-xs font-black underline"
                >
                  いまの PDFを ひらく
                </a>
              </>
            ) : (
              <span className="text-ink-faint text-xs font-bold">まだ ありません。</span>
            )}
          </div>

          {error ? <p className="text-coral-deep mt-2 text-xs font-black">{error}</p> : null}
          {heavy ? <p className="text-navy mt-2 text-xs font-black">⚠ {heavy}</p> : null}
        </div>

        <TextField
          label="タイトル"
          value={value.title}
          onChange={(title) => onChange({ ...value, title })}
          placeholder="ほうこくの しかた"
        />
        <TextAreaField
          label="せつめい"
          rows={2}
          value={value.description}
          onChange={(description) => onChange({ ...value, description })}
          placeholder="じゅぎょうで つかった スライドです。"
        />
      </StudioSection>

      <StudioSection
        title="1まいずつの ひとこと"
        hint="スライドの 中の 字には ふりがなを つけられません。ここに 書いた ひとことだけが、ふりがな つきで 出ます。"
      >
        {notes.length === 0 ? (
          <p className="text-ink-faint text-xs font-bold">
            まだ ありません。むずかしい 1まいにだけ 足すので だいじょうぶです。
          </p>
        ) : null}

        <div className="space-y-2">
          {notes.map((note, index) => (
            <div
              key={index}
              className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
            >
              <div className="w-24">
                <NumberField
                  label="何まい目"
                  min={1}
                  max={value.pageCount}
                  value={note.page}
                  onChange={(page) =>
                    onChange({
                      ...value,
                      notes: replaceAt(notes, index, { ...note, page: Math.max(1, page) }),
                    })
                  }
                />
              </div>
              <div className="min-w-[14rem] flex-1">
                <TextField
                  label="ひとこと（その 1まいで 見る ところ）"
                  value={note.text}
                  onChange={(text) =>
                    onChange({ ...value, notes: replaceAt(notes, index, { ...note, text }) })
                  }
                  placeholder="はじめに けつろんを 言います。"
                />
              </div>
              <MiniButton
                tone="danger"
                onClick={() => onChange({ ...value, notes: removeAt(notes, index) })}
              >
                けす
              </MiniButton>
            </div>
          ))}
        </div>

        <MiniButton
          tone="accent"
          onClick={() =>
            onChange({
              ...value,
              // まだ ひとことの ない いちばん 早い 1枚を はじめの 値にする
              notes: [...notes, { page: firstFreePage(notes, value.pageCount), text: "" }],
            })
          }
        >
          ＋ ひとことを 追加
        </MiniButton>
      </StudioSection>

      <FuriganaEditor
        entries={value.furigana ?? []}
        onChange={(furigana) => onChange({ ...value, furigana })}
        emptyNote="タイトル・せつめい・ひとこと に 出てくる 漢字の よみを 書きます。"
        content={value}
      />
    </div>
  );
}

/** まだ ひとことの 付いていない いちばん早い 枚。ぜんぶ付いていたら 1枚目。 */
function firstFreePage(notes: readonly { page: number }[], pageCount: number): number {
  const used = new Set(notes.map((note) => note.page));
  for (let page = 1; page <= pageCount; page += 1) {
    if (!used.has(page)) return page;
  }
  return 1;
}

/**
 * PDF を開いて 枚数を読む。開けなければ null。
 *
 * 学習者の画面と**同じ pdf.js**で開く。別のやり方で数えると、
 * 「スタジオでは 12まいと 出たのに 学習者の画面では ひらかない」が起こりうる。
 */
async function readPageCount(file: File): Promise<number | null> {
  try {
    const pdfjs = await loadPdfjs();
    const loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const count = (await loading.promise).numPages;
    // 数えたら すぐ 閉じる（先生は 何本も 続けて 上げるので、worker を 残さない）
    void loading.destroy();
    return count > 0 ? count : null;
  } catch {
    return null;
  }
}
