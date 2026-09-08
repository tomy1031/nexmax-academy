"use client";

import { useMemo, useState } from "react";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaEntry, type FuriganaIndex } from "@/lib/text/furigana";

/**
 * しつもんメモ — 調べて 分かった ことの「その先」を、会う 前に 3つ 書く 段。
 *
 * ## 書かせてから 会わせる
 * 旧アプリ（youken_teigi/hearing）の 4段目。**調べただけでは 質問に ならない**——
 * 「売り切れが 多い」と 分かっても、聞くべきは その先（なぜ 作りたいのか／だれが 使うのか）で ある。
 * ここで 手を 動かして 1文でも 書いた 学習者は、つないだ 直後の 沈黙が 短い。
 *
 * ## えらばせない（規律3）
 * 産出は 自由入力だけ。下の「つかえる 型」は **答えの 選択肢では なく**、
 * 押すと 入力欄に 入る 下書き（そのあと 自分で 直せる）。
 *
 * 書いた メモは 会話の 画面へ 持って いく（`TalkSession` が 開いた ままにする）。
 * 旧アプリは この 段を 出た 時点で メモを 捨てて いて、いちばん 要る ところ
 *——相手を 目の前に して 頭が 真っ白に なる ところ——で 手元に 何も 残らなかった。
 */

/** つかえる 型（押すと 空いている 欄に 入る）。旧アプリの TEMPLATES を 逐語で 移す。 */
const TEMPLATES = [
  "なぜ アプリを 作りたいですか？",
  "だれが 使いますか？",
  "いつまでに 必要ですか？",
  "ご予算は どのくらいですか？",
  "〜について、もう少し 教えてください",
] as const;

/**
 * 型の 文に 出る 漢字の 読み。
 *
 * **教材の 読み辞書（`scenario.furigana`）とは 混ぜない**——あちらは 先生が 直す ものなので、
 * 画面が 自分で 出す 字の 読みを そこに 足すと、教材を 直した 人に 消せて しまう
 *（ミーティングの `ui-furigana.ts` と 同じ 分けかた）。
 */
export const MEMO_FURIGANA: readonly FuriganaEntry[] = [
  ["作", "つく"],
  ["使", "つか"],
  ["必要", "ひつよう"],
  ["予算", "よさん"],
  ["少", "すこ"],
  ["教", "おし"],
];

export function MemoStep({
  findings,
  clientName,
  memo,
  onChange,
  furigana,
  onDone,
  onBack,
}: {
  findings: readonly string[];
  clientName: string;
  memo: readonly string[];
  onChange: (next: readonly string[]) => void;
  furigana: FuriganaIndex;
  onDone: () => void;
  onBack: () => void;
}) {
  /** 型を 押した ときの しらせ（3つ 埋まって いると 入れる 場所が ない）。 */
  const [full, setFull] = useState(false);
  /** 型の 文は 画面の ことばなので、教材の 辞書では なく こちらで 読みを 付ける。 */
  const uiFurigana = useMemo(() => buildFuriganaIndex(MEMO_FURIGANA), []);
  const written = memo.filter((m) => m.trim()).length;

  const put = (text: string) => {
    const slot = memo.findIndex((m) => !m.trim());
    if (slot < 0) {
      setFull(true);
      return;
    }
    setFull(false);
    onChange(memo.map((m, i) => (i === slot ? text : m)));
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="card-island p-5">
        <h2 className="text-ink text-lg font-extrabold">
          📝 しつもんメモを{" "}
          <ruby>
            作<rt>つく</rt>
          </ruby>
          ろう
        </h2>
        <p className="text-ink-soft mt-2 leading-relaxed font-bold">
          <ruby>
            調査<rt>ちょうさ</rt>
          </ruby>
          で わかったことの <b>「その先」</b>を{" "}
          <ruby>
            聞<rt>き</rt>
          </ruby>
          くのが、いい{" "}
          <ruby>
            質問<rt>しつもん</rt>
          </ruby>
          です。
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 p-4">
            <h3 className="text-ink text-sm font-extrabold">✅ わかったこと</h3>
            <ul className="mt-2 grid gap-1.5">
              {findings.map((f) => (
                <li key={f} className="text-ink-soft text-sm font-bold">
                  ・<RubyText text={f} index={furigana} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-ink text-sm font-extrabold">
              ❓{" "}
              <ruby>
                聞<rt>き</rt>
              </ruby>
              きたいこと（3つ{" "}
              <ruby>
                書<rt>か</rt>
              </ruby>
              こう）
            </h3>
            <div className="mt-2 grid gap-2">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  type="text"
                  value={memo[i] ?? ""}
                  onChange={(e) => {
                    setFull(false);
                    onChange(memo.map((m, j) => (j === i ? e.target.value : m)));
                  }}
                  placeholder={`しつもん ${i + 1}`}
                  aria-label={`しつもん ${i + 1}`}
                  className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 font-bold"
                />
              ))}
            </div>
            <p className="text-ink-soft mt-3 text-xs font-bold">
              つかえる{" "}
              <ruby>
                型<rt>かた</rt>
              </ruby>
              （おすと{" "}
              <ruby>
                入<rt>はい</rt>
              </ruby>
              ります）
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => put(t)}
                  className="border-hairline bg-panel text-ink rounded-full border-2 px-3 py-1.5 text-xs font-extrabold"
                >
                  <RubyText text={t} index={uiFurigana} />
                </button>
              ))}
            </div>
            {full && (
              <p className="text-ink-soft mt-2 text-xs font-bold">
                メモは 3つまでです。いらない ものを{" "}
                <ruby>
                  消<rt>け</rt>
                </ruby>
                してから、もう
                <ruby>
                  一度<rt>いちど</rt>
                </ruby>{" "}
                おしてください。
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-ink-soft hover:text-navy text-sm font-extrabold"
        >
          ← もどる
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={written === 0}
          className="btn-island btn-game px-6 py-3 disabled:opacity-40"
        >
          🚪 {clientName}さんに{" "}
          <ruby>
            会<rt>あ</rt>
          </ruby>
          いに
          <ruby>
            行<rt>い</rt>
          </ruby>
          く →
        </button>
      </div>
    </div>
  );
}
