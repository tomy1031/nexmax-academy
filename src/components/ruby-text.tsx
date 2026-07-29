/**
 * ルビ表示コンポーネント（共有部品・再実装しない）
 *
 * プレーンテキスト＋読み辞書を受け取り、ルビ合成エンジン（src/lib/ruby.ts）が
 * 切り出した区間を <ruby> 要素として描画する。ルビHTMLを手書きしないための入口。
 */

import { synthesizeRuby, type FuriganaEntry } from "@/lib/ruby";

interface RubyTextProps {
  /** 表示するプレーンテキスト（ルビHTMLを含めない）。 */
  text: string;
  /** 読み辞書。省略時はルビなしで素通しする。 */
  furigana?: readonly FuriganaEntry[];
  /** ルビ表示のON/OFF（学習レベルに応じて切り替える）。 */
  showRuby?: boolean;
  className?: string;
}

export function RubyText({ text, furigana, showRuby = true, className }: RubyTextProps) {
  if (!showRuby) return <span className={className}>{text}</span>;

  const segments = synthesizeRuby(text, furigana);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.kind === "ruby" ? (
          <ruby key={i}>
            {seg.base}
            <rt>{seg.reading}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
