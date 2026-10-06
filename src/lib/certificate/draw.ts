/**
 * 修了証を **画像（PNG）に 描いて 保存する**（ブラウザの canvas。新しい 道具は 足さない）
 *
 * スクリーンショットの 代わりに 提出する ものなので、1枚の 画像に する。
 * 画面の カード（`certificate-card.tsx`）と **同じ 行**（`certificateLines`）から 描く——
 * 画面と 画像で 中身が ずれない ように。
 *
 * 画像は 先生が 読む 提出物なので ルビは 描かない（学習者は 画面の カードで ルビつきで 読む）。
 *
 * ## 保存の 道（スマホ と PC）
 * 1. スマホで `navigator.share({ files })` が 使えれば 共有シート（「画像を 保存」）
 * 2. それ以外は `<a download>`
 */
"use client";

import {
  certificateFileName,
  certificateLines,
  formatIssuedAt,
  notPerfectReasons,
  type IssuedCertificate,
} from "./model";

const W = 1600;
const H = 1130;
const GOLD = "#f0a819";
const GOLD_SOFT = "#fff6dc";
const SKY = "#0288d1";
const SKY_SOFT = "#eef7fd";
const NAVY = "#12324a";
const INK_SOFT = "#5a7089";
const CORAL = "#d9472b";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 画面と 同じ 字の 形（丸ゴシック）で 描く。字を 先に 読みこむ（豆腐を 出さない）。 */
async function fontFamily(sample: string): Promise<string> {
  // next/font が 入れる 変数（layout.tsx の `--font-rounded`）。画面の 字と そろえる
  const rounded = getComputedStyle(document.body).getPropertyValue("--font-rounded").trim();
  const family = `${rounded ? `${rounded}, ` : ""}"Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif`;
  try {
    await document.fonts.load(`bold 40px ${family}`, sample);
    await document.fonts.ready;
  } catch {
    /* 読めなくても 描く（端末の 字で） */
  }
  return family;
}

/** 文字を はばに 収まるよう 折り返して 描き、描いた 行数を 返す。 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  let line = "";
  let lines = 0;
  for (const ch of text) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) {
    ctx.fillText(line, x, y + lines * lineHeight);
    lines += 1;
  }
  return lines;
}

export async function drawCertificate(cert: IssuedCertificate): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas が 使えません");

  const lines = certificateLines(cert);
  const reasons = notPerfectReasons(cert);
  const all = [
    "修了証PERFECT修了名前教材終えた時刻回目成績照合番号見本",
    cert.title,
    cert.learnerName,
    ...lines.flatMap((line) => [line.label, line.value]),
    ...reasons,
  ].join("");
  const family = await fontFamily(all);
  const font = (size: number, weight = 800) => `${weight} ${size}px ${family}`;

  const accent = cert.perfect ? GOLD : SKY;
  const soft = cert.perfect ? GOLD_SOFT : SKY_SOFT;

  // 地と ふち（パーフェクトは 金・そうでない ものは 青。ひと目で 分かる）
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 28;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.lineWidth = 3;
  ctx.strokeRect(52, 52, W - 104, H - 104);

  // 題
  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(84, 900);
  ctx.fillText("修了証", W / 2, 170);
  ctx.font = font(30, 700);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("NexMax Academy", W / 2, 215);

  // 判（右上）
  ctx.save();
  ctx.translate(W - 230, 190);
  ctx.rotate(-0.12);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(-170, -62, 340, 124, 24);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = font(cert.perfect ? 54 : 64, 900);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cert.perfect ? "★ PERFECT" : "修了", 0, 4);
  ctx.restore();

  // 名前・教材・時刻・回
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const left = 130;
  const labelW = 250;
  let y = 330;
  const row = (label: string, value: string, size = 46) => {
    ctx.fillStyle = INK_SOFT;
    ctx.font = font(30, 700);
    ctx.fillText(label, left, y);
    ctx.fillStyle = NAVY;
    ctx.font = font(size, 900);
    const used = wrapText(ctx, value, left + labelW, y, W - left - labelW - 330, size * 1.25);
    y += Math.max(1, used) * size * 1.25 + 22;
  };
  row("名前", cert.learnerName || "（名前が ありません）", 60);
  row("教材", cert.title, 42);
  row("終えた 時刻", formatIssuedAt(cert.issuedAt), 42);
  if (cert.official) row("回", `${cert.attempt}回目`, 42);

  // 成績
  y += 10;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y - 30);
  ctx.lineTo(W - 360, y - 30);
  ctx.stroke();
  for (const line of lines) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = font(30, 700);
    ctx.fillText(line.label, left, y + 10);
    ctx.fillStyle = NAVY;
    ctx.font = font(38, 900);
    ctx.fillText(line.value, left + 420, y + 10);
    y += 56;
  }
  if (reasons.length > 0) {
    ctx.fillStyle = CORAL;
    ctx.font = font(32, 900);
    ctx.fillText(`パーフェクトでは ありません：${reasons.join(" ")}`, left, y + 16);
    y += 56;
  }

  // 照合番号（いちばん 下に 大きく）
  ctx.fillStyle = INK_SOFT;
  ctx.font = font(28, 700);
  ctx.fillText("照合番号", left, H - 150);
  ctx.fillStyle = NAVY;
  ctx.font = `900 64px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(cert.official ? cert.code : "--------", left, H - 85);

  // ネクマックス（右下）
  const img = await loadImage(
    cert.perfect ? "/img/characters/nexmax/cheer.webp" : "/img/characters/nexmax/hello.webp",
  );
  if (img) {
    const size = 300;
    ctx.drawImage(img, W - size - 90, H - size - 80, size, (img.height / img.width) * size);
  }

  // 見本（ログインして いない）は 大きく 透かしを 入れる
  if (!cert.official) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.35);
    ctx.fillStyle = "rgba(217, 71, 43, 0.18)";
    ctx.font = font(260, 900);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("見本", 0, 0);
    ctx.restore();
    ctx.fillStyle = CORAL;
    ctx.font = font(28, 800);
    ctx.textAlign = "left";
    ctx.fillText("ログインして いないので、正式な 修了証では ありません。", left, H - 200);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像に できませんでした"))),
      "image/png",
    );
  });
}

/** 描いて 保存する。スマホは 共有シート、PC は ダウンロード。 */
export async function saveCertificateImage(cert: IssuedCertificate): Promise<void> {
  const blob = await drawCertificate(cert);
  const name = certificateFileName(cert.contentId, cert.issuedAt);
  const file = new File([blob], name, { type: "image/png" });
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (mobile && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "修了証" });
      return;
    } catch {
      /* 閉じられた・使えない → ダウンロードへ */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
