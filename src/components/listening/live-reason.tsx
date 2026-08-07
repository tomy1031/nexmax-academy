"use client";

import Link from "next/link";

/**
 * たいわに つながらなかった理由を、先生が次の一手を決められる形で出す。
 *
 * ここが「じゅんびちゅう」の一言しか出さなかったせいで、キーを登録したのに
 * 動かない先生が、キーが違うのか・モデルが無いのか・使いすぎなのかを
 * 確かめる手を1つも持てなかった。理由の名前はサーバから来る
 *（src/lib/live/token.ts の LiveTokenReason）。キーそのものは含まれない。
 *
 * 文言は学習者にも読める言い方にするが、直し方は先生向けなので
 * 「AI指示出し」への行き先を添える。
 */

interface Advice {
  /** 何が起きたか。 */
  readonly what: string;
  /** つぎに何をすればよいか。 */
  readonly next: string;
  /** 設定画面へ送るか。 */
  readonly toSettings: boolean;
}

const ADVICE: Record<string, Advice> = {
  noKey: {
    what: "AIの キーが まだ 登録されていません。",
    next: "「AI指示出し」の 画面で Gemini の APIキーを 登録してください。",
    toSettings: true,
  },
  tokenRejected: {
    what: "キーは 読めましたが、たいわ用の みじかい きっぷ が つくれませんでした。",
    next:
      "「AI設定」で「せつぞくを ためす」を おしてください。" +
      "AQ. で はじまる 新しい キーだと ここで 止まることが あります。" +
      "その ときは AIzaSy で はじまる キーを つくり直して ください。",
    toSettings: true,
  },
  noPermission: {
    what: "この キーでは たいわの きのうが つかえません。",
    next: "Google AI Studio で、そのキーの プロジェクトが Gemini API を つかえるか たしかめてください。",
    toSettings: true,
  },
  modelNotFound: {
    what: "たいわに つかう モデルが 見つかりませんでした。",
    next: "「AI指示出し」の 画面で「せつぞくを ためす」を おして、つかえる モデルを えらんでください。",
    toSettings: true,
  },
  rateLimited: {
    what: "きょうは つかいすぎたようです。",
    next: "しばらく 時間を おいてから、もう一度 ためしてください。",
    toSettings: false,
  },
  connect: {
    what: "つなぐ ところで 止まりました。",
    next: "ネットワークを たしかめて、もう一度 ためしてください。",
    toSettings: false,
  },
  upstream: {
    what: "AIの サービスから 返事が ありませんでした。",
    next: "しばらく 時間を おいてから、もう一度 ためしてください。",
    toSettings: false,
  },
};

export function LiveReason({ reason }: { reason: string | null }) {
  const advice = (reason ? ADVICE[reason] : undefined) ?? ADVICE.upstream!;
  return (
    <section
      role="status"
      className="rounded-[20px] border-2 bg-white p-4"
      style={{ borderColor: "var(--color-sun)" }}
    >
      <p className="text-navy text-sm font-black">{advice.what}</p>
      <p className="text-ink mt-1 text-sm font-bold">{advice.next}</p>
      {advice.toSettings ? (
        <Link
          href="/admin/ai"
          className="text-sky mt-2 inline-block text-xs font-black underline underline-offset-4"
        >
          AI指示出しの 画面を ひらく
        </Link>
      ) : null}
      {/* 開発者が原因を追えるよう、理由の名前は小さく出す（キーは含まれない） */}
      <p className="text-ink-faint mt-2 text-[11px] font-bold">reason: {reason ?? "unknown"}</p>
    </section>
  );
}
