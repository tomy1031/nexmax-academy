import type { Metadata } from "next";
import { RecordsSync } from "@/components/records-sync";
import { RegisterOnLogin } from "@/components/register-on-login";
import "./fonts.css";
import "./globals.css";

/*
 * 字（丸ゴシック M PLUS Rounded 1c と 和文の 予備 Noto Sans JP）は **手元に 置いた ファイル**を
 * 使う（public/fonts/・@font-face は ./fonts.css）。2026-11-17 に next/font/google を やめた——
 * ビルドの たびに Google から 約750本を 取って いて、Google の 返す CSS が ときどき 違う 形に
 * なると Next.js の 取り込みが 止まり、テストが 落ちて いた（11/13 に 2回・11/17 に 1回）。
 * 作り方は scripts/fonts/selfhost_google_fonts.mjs。
 *
 * 前と 同じく preload は しない。和文の 字は 文字の 範囲ごとに 何百にも 分かれて いて、
 * ブラウザは 画面に ある 字の 分だけ 取る。`font-display: swap` なので、読みこむ あいだは
 * 代わりの 字で 出て、あとから 差し替わる。
 */

export const metadata: Metadata = {
  title: "Nexmax Academy | NEXT MAKE",
  description:
    "ネクマックスアカデミーは、カンボジアのITの学生が、日本の会社で はたらくための ことばと しごとを、みちを 一歩ずつ すすみながら たのしく まなぶ アプリです。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* 画面は出さない。ログインした人を登録し、端末にある情報を送る（2026-08-25）。 */}
        <RegisterOnLogin />
        {/* 画面は出さない。端末にしか無かった学習の記録を、まとめて台帳へ写す（2026-09-04）。 */}
        <RecordsSync />
        {children}
      </body>
    </html>
  );
}
