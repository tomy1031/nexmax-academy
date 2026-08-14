"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs, PDFJS_FONT_OPTIONS } from "@/lib/pdfjs";

/**
 * PDF の1枚を canvas に描くところ（canvas を さわるのは このファイルだけ）
 *
 * 外から渡されるのは「どのファイルの 何枚目か」だけ。開けた枚数と、開けなかったことは
 * 呼び出し側へ返す（送りの見た目・しおりは 親が持つ）。
 */

export function PdfCanvas({
  url,
  page,
  onReady,
  onFailed,
}: {
  url: string;
  /** 何枚目か（1始まり）。 */
  page: number;
  /** 開けたときに ぜんぶで何枚かを返す。 */
  onReady: (pageCount: number) => void;
  /** 開けなかったとき（親が「PDFを ひらく」を出す）。 */
  onFailed: () => void;
}) {
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  /** 描画中のもの。次の1枚へ移ったら止める（同じ canvas に2つ描くと pdf.js が投げる）。 */
  const renderRef = useRef<{ cancel: () => void } | null>(null);
  /** 枠の大きさ。広げた・回した ときに描き直すきっかけになる。 */
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);

  /* PDF を開く */
  useEffect(() => {
    let alive = true;
    /** 読み込みそのもの。閉じるときは これを止める（通信も worker も ここで終わる）。 */
    let task: { destroy: () => Promise<void> } | null = null;

    void (async () => {
      try {
        // legacy ビルドを読む（古い端末でも動くように変換ずみ）。
        const pdfjs = await loadPdfjs();
        const loading = pdfjs.getDocument({ url, ...PDFJS_FONT_OPTIONS });
        task = loading;
        const doc = await loading.promise;
        if (!alive) {
          void loading.destroy();
          return;
        }
        docRef.current = doc;
        setReady(true);
        onReady(doc.numPages);
      } catch {
        // 理由は画面に出さない（学習者に読めない英語が出るだけ）。
        // 親が「PDFを ひらく」を出して、資料そのものには必ず たどり着けるようにする。
        if (alive) onFailed();
      }
    })();

    return () => {
      alive = false;
      renderRef.current?.cancel();
      renderRef.current = null;
      docRef.current = null;
      void task?.destroy();
    };
    // 開き直すのは ファイルが変わったときだけ（onReady/onFailed は毎回作られる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  /* 枠の大きさを見張る（広げた・端末を回した ときに描き直す） */
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* いまの1枚を描く */
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!ready || !doc || !canvas || box.width < 1 || box.height < 1) return;

    let alive = true;
    void (async () => {
      try {
        const target = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        if (!alive) return;

        // 枠に収まる いちばん大きい 倍率（はみ出さない・切らない）
        const base = target.getViewport({ scale: 1 });
        const fit = Math.min(box.width / base.width, box.height / base.height);
        // 画素の細かい端末では そのぶん細かく描く（文字がぼやけない）。
        // 3倍で頭打ちにするのは、それ以上は見た目が変わらないのに重くなるだけだから。
        const ratio = Math.min(window.devicePixelRatio || 1, 3);
        const viewport = target.getViewport({ scale: fit * ratio });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;

        renderRef.current?.cancel();
        const task = target.render({ canvas, viewport });
        renderRef.current = task;
        await task.promise;
        if (renderRef.current === task) renderRef.current = null;
      } catch {
        // 前の1枚を止めたときも ここへ来る（止めたことは 直す対象ではない）。
        // 本当に描けなかったときは 枠が白いままになるが、親の「PDFを ひらく」が残る。
      }
    })();

    return () => {
      alive = false;
    };
  }, [page, box, ready]);

  return (
    <div ref={boxRef} className="absolute inset-0 grid place-items-center">
      {/*
        canvas に PDF の1枚を描く。中の文字は 絵と同じ扱いなので、
        読み上げも ふりがなも 効かない（受け皿は スライドの下の「ひとこと」）。
      */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${page}まいめの スライド`}
        className={ready ? "block" : "hidden"}
      />
    </div>
  );
}
