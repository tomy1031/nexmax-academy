"use client";

import { motion } from "motion/react";
import type { Scenario } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import type { FuriganaIndex } from "@/lib/text/furigana";
import { ownerOf } from "./people";

/**
 * けっか — 聞き出せた ようけんを かぞえ、**プロが まとめた 要件定義書**を 見せる 段。
 *
 * ## ここが 教材の 山
 * 旧アプリ（youken_teigi/hearing）の 5段目。会話が うまく いったかを 点で 出す 場では なく、
 * 「いま 聞いた 話は、**会社に 持ち帰ると こういう 書類に なる**」を 見せる ところ。
 * 自分が 聞き出せた ぶんに ✅ が つくので、**質問1つが 書類の1行に なる**ことが 目で 分かる。
 *
 * ## ぼかさない（規律1）
 * 10 のうち いくつ 聞き出せたかを 数で 言い切る。聞けなかった ものは 伏せずに 出し、
 * それぞれに「つぎは こう 聞いて みよう」を 1つ 添える——数だけ 見せて 終わると、
 * 直しようが ない。
 */

/**
 * 星の 数。10件の 教材では 旧アプリと 同じ しきい値（10 / 8 / 5）。
 * 12件の 教材（3人の たいわ）も 同じ 割合で 見る——件数を 決め打ちすると、
 * 12件 中 8件 でも ★2 に なり、10件の ときより ゆるく なる。
 */
function starsOf(covered: number, total: number): number {
  if (covered >= total) return 3;
  if (covered / total >= 0.8) return 2;
  if (covered / total >= 0.5) return 1;
  return 0;
}

export function TalkResult({
  scenario,
  opened,
  furigana,
  people,
  onRetry,
}: {
  scenario: Scenario;
  /** 聞き出せた req の id。 */
  opened: ReadonlySet<string>;
  furigana: FuriganaIndex;
  /** 相手が 3人 いる 教材では、人ごとの 聞き出せた 数も 出す（だれに 聞き足りなかったか）。 */
  people?: readonly { readonly id: string; readonly name: string }[];
  onRetry: () => void;
}) {
  const reqs = scenario.interview.reqs;
  const covered = reqs.filter((r) => opened.has(r.id)).length;
  const stars = starsOf(covered, reqs.length);
  const missed = reqs.filter((r) => !opened.has(r.id));

  return (
    <div className="flex flex-col gap-4">
      <section className="card-island p-6 text-center">
        {/*
          見出しで 祝わない ときが ある。1つも 聞き出せなかった 回に
          「🎉 おつかれさまでした！」を 出すと、0 / 10 と ★0 の 真上で
          結果を ぼかす ことに なる（規律1・2026-09-07 の R3 検収）。
          言い切った あとで、下の「つぎは これを 聞いて みよう」へ 送る。

          **星の 数（`starsOf`）では 分けない。** ★は 出来ばえの 目安で、1〜4件の 回は
          ★0 だが「1つも 聞き出せて いない」わけでは ない——星で 分けた ときは
          4 / 10 の 回に「まだ 聞き出せて いません」と 出て いた。見出しは 数そのもので 決める。
        */}
        <h2 className="text-ink text-lg font-extrabold">
          {covered === reqs.length
            ? "🏆 ぜんぶ 聞き出せました！"
            : covered > 0
              ? "🎉 おつかれさまでした！"
              : "🌱 まだ 聞き出せて いません"}
        </h2>
        {/* 数で 言い切る（規律1）。割合や「よくできました」だけに しない */}
        <p className="text-navy mt-3 text-3xl font-black">
          {covered} / {reqs.length}
        </p>
        {/*
          数の 下の 一文も 結果に 合わせる。0 のとき「要件を 聞き出せました」と
          出て いた——見出しで 言い切った ことを、すぐ 下で 取り消して いた（規律1）。
        */}
        <p className="text-ink-soft text-sm font-extrabold">
          <ruby>
            要件<rt>ようけん</rt>
          </ruby>
          を{" "}
          <ruby>
            聞<rt>き</rt>
          </ruby>
          き
          <ruby>
            出<rt>だ</rt>
          </ruby>
          {covered > 0 ? "せました" : "せて いません"}
        </p>
        <p aria-hidden className="mt-2 text-2xl">
          <span className="text-sun-deep">{"★".repeat(stars)}</span>
          <span className="text-ink-faint">{"★".repeat(3 - stars)}</span>
        </p>
        {people && (
          <ul className="mt-3 flex flex-wrap justify-center gap-2" aria-label="人ごとの 数">
            {people.map((person) => {
              const mine = reqs.filter((r) => ownerOf(r) === person.id);
              const got = mine.filter((r) => opened.has(r.id)).length;
              return (
                <li
                  key={person.id}
                  className="bg-panel-tint text-ink rounded-full px-3 py-1 text-xs font-extrabold"
                >
                  👤 <RubyText text={person.name} index={furigana} /> {got} / {mine.length}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {missed.length > 0 && (
        <section className="card-island p-5">
          <h3 className="text-ink font-extrabold">
            🔭 つぎは これを{" "}
            <ruby>
              聞<rt>き</rt>
            </ruby>
            いて みよう
          </h3>
          <ul className="mt-3 grid gap-2">
            {missed.map((r) => (
              <li
                key={r.id}
                className="border-hairline bg-panel-tint rounded-[var(--radius-card)] border-2 px-4 py-3"
              >
                <p className="text-ink text-sm font-extrabold">
                  <span className="mr-1">{r.icon}</span>
                  <RubyText text={r.label} index={furigana} />：
                  <RubyText text={r.secret} index={furigana} />
                </p>
                <p className="text-ink-soft mt-1 text-sm font-bold">
                  💡 <RubyText text={r.hint} index={furigana} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-island p-5">
        <h3 className="text-ink font-extrabold">
          📄{" "}
          <ruby>
            完成版<rt>かんせいばん</rt>
          </ruby>
          の{" "}
          <ruby>
            要件定義書<rt>ようけんていぎしょ</rt>
          </ruby>
        </h3>
        <p className="text-ink-soft mt-1 text-sm font-bold">
          プロが まとめると、こう なります。✅＝あなたが{" "}
          <ruby>
            聞<rt>き</rt>
          </ruby>
          き
          <ruby>
            出<rt>だ</rt>
          </ruby>
          せた ところ。
        </p>

        <div className="border-hairline bg-panel mt-3 rounded-[var(--radius-card)] border-2 p-4">
          <div className="border-b border-[color:var(--color-hairline)] pb-3">
            <p className="text-ink font-extrabold">
              <RubyText text={scenario.doc.projectName} index={furigana} />{" "}
              <ruby>
                要件定義書<rt>ようけんていぎしょ</rt>
              </ruby>
            </p>
            <p className="text-ink-soft mt-1 text-xs font-bold">
              <RubyText text={scenario.doc.clientLine} index={furigana} /> ／{" "}
              <ruby>
                作成<rt>さくせい</rt>
              </ruby>
              ：ネクストメイク
              <ruby>
                株式会社<rt>かぶしきがいしゃ</rt>
              </ruby>
            </p>
          </div>

          {scenario.doc.sections.map((sec) => (
            <div key={sec.title} className="mt-4">
              <h4 className="text-navy text-sm font-extrabold">
                <RubyText text={sec.title} index={furigana} />
              </h4>
              <ul className="mt-1.5 grid gap-1.5">
                {sec.items.map((item) => {
                  // reqId が null＝事前調査で 分かった こと（会話では 聞かない）
                  const got = item.reqId === null || opened.has(item.reqId);
                  return (
                    <motion.li
                      key={item.text}
                      layout
                      className="border-hairline flex items-start gap-2 rounded-[var(--radius-button)] border-2 px-3 py-2"
                      style={{
                        background: got ? "var(--color-sky-soft)" : "var(--color-panel-tint)",
                        opacity: got ? 1 : 0.75,
                      }}
                    >
                      <span aria-hidden className="shrink-0">
                        {item.reqId === null ? "🔍" : got ? "✅" : "▢"}
                      </span>
                      <span className="text-ink text-sm font-bold">
                        <RubyText text={item.text} index={furigana} />
                        {!got && (
                          <span className="text-ink-soft ml-2 text-xs font-extrabold">
                            （
                            <ruby>
                              聞<rt>き</rt>
                            </ruby>
                            けなかった ところ）
                          </span>
                        )}
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card-island p-5">
        <h3 className="text-ink font-extrabold">
          🎓 <RubyText text={scenario.lesson.title} index={furigana} />
        </h3>
        <ul className="mt-2 grid gap-1.5">
          {scenario.lesson.points.map((pt) => (
            <li key={pt} className="text-ink-soft leading-relaxed font-bold">
              ・<RubyText text={pt} index={furigana} />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-center">
        <button type="button" onClick={onRetry} className="btn-island btn-game px-6 py-3">
          🔁 もう
          <ruby>
            一度<rt>いちど</rt>
          </ruby>{" "}
          やってみる
        </button>
      </div>
    </div>
  );
}
