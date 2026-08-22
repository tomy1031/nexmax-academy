"use client";

import type { Character, Meeting, MeetingQuestion } from "@/content/schema";
import { emptyMeetingDiscover, emptyMeetingQuestion, type MeetingDiscover } from "./drafts";
import { LISTENING_ACCENT_OPTIONS } from "./listening-drafts";
import { MeetingAudioMaker } from "./meeting-audio-maker";
import { MeetingPromptPreview } from "./meeting-prompt-preview";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import {
  FuriganaEditor,
  MiniButton,
  RowTools,
  SelectField,
  StringListEditor,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/**
 * ミーティング（Zoomの練習）のエディタ
 *
 * ここが無いあいだ、相手の**話し方（persona）と 見かた（judgePrompt）は
 * JSONを直せる人しか変えられなかった**。この2つは教室ごとに合う言い方が違い、
 * 先生がいちばん触りたいところなので、上のほうに大きく置く。
 *
 * ## 人格と判定を分けて置く理由
 * 同じ欄にすると、話し方を丸くするたびに採点の基準まで動く。ある学生には
 * 「よく できました」しか返らず、別の学生には細かい直しが並ぶ——という
 * 教室ごとのばらつきが、先生からは原因の見えないまま起きる。
 *
 * ## `◯◯` の約束
 * `echo`（受け答え）の `◯◯` は、学習者が答えた言葉に置きかわる。ここが無い echo は
 * おうむ返しにならず、「聞いてもらえた」感じが消える——だから枠のすぐ下で知らせる。
 */

/** `meetingSchema` の questions.min(3)。 */
const MIN_QUESTIONS = 3;

/** 受け答えの中で、学習者の言葉に置きかわる目印（meeting-session.tsx と同じ）。 */
const ECHO_MARK = "◯◯";

export function MeetingEditor({
  value,
  cast,
  onChange,
}: {
  value: Meeting;
  /** とうじょう人物（声は人物カードが持つ）。 */
  cast: readonly Character[];
  onChange: (meeting: Meeting) => void;
}) {
  const patch = (part: Partial<Meeting>) => onChange({ ...value, ...part });

  const updateQuestion = (index: number, part: Partial<MeetingQuestion>) => {
    const current = value.questions[index];
    if (!current) return;
    patch({ questions: replaceAt(value.questions, index, { ...current, ...part }) });
  };

  const updateDiscover = (index: number, part: Partial<MeetingDiscover>) => {
    const list = value.discover ?? [];
    const current = list[index];
    if (!current) return;
    patch({ discover: replaceAt(list, index, { ...current, ...part }) });
  };

  return (
    <div className="space-y-4">
      <StudioSection title="きほん" hint="Zoomに 入る 前の 画面に 出ます。">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="ID（半角の 英小文字・数字・- _）"
            value={value.id}
            onChange={(id) => patch({ id })}
            placeholder="hajimari_meeting"
          />
          <TextField
            label="タイトル"
            value={value.title}
            onChange={(title) => patch({ title })}
            placeholder="ヘンディさんと ミーティング"
          />
        </div>
        <TextAreaField
          label="せつめい"
          value={value.description}
          onChange={(description) => patch({ description })}
          placeholder="Zoomで ヘンディさんと 話します。じこしょうかいの れんしゅうです。"
        />
        <TextField
          label="きょう やること（入る 前に 見せます）"
          value={value.focus}
          onChange={(focus) => patch({ focus })}
          placeholder="じこしょうかいを して、ヘンディさんと 話します。"
        />
      </StudioSection>

      {/*
        相手は1人だけ。リスニングのように何人も並べない——自己紹介は
        「1対1で 話しきる」練習で、相手が増えるほど誰に答えるかで詰まる。
      */}
      <StudioSection
        title="あいての 人"
        hint="Zoomの タイルに 出ます。口の 絵は /img/characters/〈ID〉/mouth/ から よみます。"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="ID（半角）"
            value={value.host.id}
            onChange={(id) => patch({ host: { ...value.host, id } })}
            placeholder="hendy"
            hint="とうじょう人物の IDと そろえると、口の 絵が 見つかります。"
          />
          <TextField
            label="名前"
            value={value.host.name}
            onChange={(name) => patch({ host: { ...value.host, name } })}
            placeholder="ヘンディ"
          />
          <TextField
            label="やくわり"
            value={value.host.role}
            onChange={(role) => patch({ host: { ...value.host, role } })}
            placeholder="先輩"
          />
          <SelectField
            label="タイルの 色"
            value={value.host.accent}
            options={LISTENING_ACCENT_OPTIONS}
            onChange={(accent) => patch({ host: { ...value.host, accent } })}
          />
        </div>
      </StudioSection>

      {/*
        先生がいちばん直したいのはこの2つ。だから質問より上に置く。
        下に置くと、質問が6つ並んだ先までスクロールしないと たどり着けない。
      */}
      <StudioSection
        title="あいての 話し方（AIへの 指示）"
        hint="学習者には 見えません。おうむ返し → 共感 → つぎの 質問、の 順で 話すように 書きます。"
      >
        <TextAreaField
          label="話し方"
          value={value.persona}
          onChange={(persona) => patch({ persona })}
          rows={8}
          placeholder="あなたは 日本の 会社の 先輩です。やさしい 日本語で、みじかく 話して ください。"
          // 禁止語そのものを例に書かない。この文字列も検査の対象で、
          // 例として並べた瞬間に このファイルが 保存できなくなる（規律1）
          hint="学習者を 否定する 言い方は、ここでも つかえません（保存で 止まります）。"
        />
      </StudioSection>

      <StudioSection
        title="日本語の 見かた（判定の 指示）"
        hint="話し方と 分けて あります。言い回しを 直しても、見る ところは 動きません。"
      >
        <TextAreaField
          label="見かた"
          value={value.judgePrompt}
          onChange={(judgePrompt) => patch({ judgePrompt })}
          rows={7}
          placeholder="できた ところを 1つ ほめ、直す ところを 1つだけ 言い、その 言い方の れいを 見せて ください。"
          hint="直す ところを 2つ 以上に すると、学習者は どれから 直すか 決められません。"
        />
      </StudioSection>

      <StudioSection
        title={`しつもん（${value.questions.length}つ）`}
        hint="上から 順に 聞きます。1語で 答えられる ものから、りゆうや 気もちを 聞く ものへ 並べます。"
      >
        {value.questions.length < MIN_QUESTIONS ? (
          <p className="text-ink-soft text-xs font-bold">
            あと {MIN_QUESTIONS - value.questions.length}つ たすと ほぞんできます。
          </p>
        ) : null}

        <ol className="space-y-3">
          {value.questions.map((question, index) => (
            <li key={index} className="border-hairline space-y-3 rounded-2xl border-2 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-faint w-6 text-sm font-black">{index + 1}</span>
                <div className="min-w-[8rem] flex-1">
                  <TextField
                    label="ID（半角）"
                    value={question.id}
                    onChange={(id) => updateQuestion(index, { id })}
                    placeholder="q1_name"
                  />
                </div>
                <RowTools
                  index={index}
                  count={value.questions.length}
                  label="しつもん"
                  onMove={(delta) => patch({ questions: moveItem(value.questions, index, delta) })}
                  onRemove={() => patch({ questions: removeAt(value.questions, index) })}
                />
              </div>

              <TextAreaField
                label="しつもん（あいてが 言う ことば）"
                value={question.ask}
                onChange={(ask) => updateQuestion(index, { ask })}
                rows={2}
                placeholder="はじめまして。お名前を おしえて ください。"
              />
              <TextField
                label="ヒント（答え方の 型）"
                value={question.hint}
                onChange={(hint) => updateQuestion(index, { hint })}
                placeholder="「わたしは ◯◯です。」"
              />
              <TextAreaField
                label="うけこたえ（答えた あとに 言う ことば）"
                value={question.echo}
                onChange={(echo) => updateQuestion(index, { echo })}
                rows={2}
                placeholder="◯◯さんですね。おぼえました。よろしく おねがいします。"
                hint={
                  question.echo.length > 0 && !question.echo.includes(ECHO_MARK)
                    ? `${ECHO_MARK} を 入れると、そこに 学習者の ことばが 入ります（おうむ返しに なります）。`
                    : `${ECHO_MARK} が 学習者の ことばに かわります。`
                }
              />

              {/*
                keywords は「言えたら ひとこと足す」ためだけ。空でも先へ進む
                （自己紹介に正解は無い — 詰まらせない）。そこを書いておかないと、
                先生は「正解を全部書かないといけない」と思って手が止まる。
              */}
              <StringListEditor
                label="言えたら うれしい ことば（からでも よい）"
                items={question.keywords}
                itemLabel="ことば"
                placeholder="プログラミング"
                addLabel="＋ ことばを 追加"
                onChange={(keywords) => updateQuestion(index, { keywords })}
              />
              <p className="text-ink-faint text-xs font-bold">
                当たらなくても つぎへ 進みます。当たった ときだけ「だいじな ことばが 言えました」と
                出ます。
              </p>
            </li>
          ))}
        </ol>

        <MiniButton
          tone="accent"
          onClick={() => patch({ questions: [...value.questions, emptyMeetingQuestion()] })}
        >
          ＋ しつもんを 追加
        </MiniButton>
      </StudioSection>

      <StudioSection title="おわりの ひとこと" hint="ぜんぶ 答えた あとに 出ます。">
        <TextAreaField
          label="ひとこと"
          value={value.closing}
          onChange={(closing) => patch({ closing })}
          rows={2}
          placeholder="ありがとう ございました。よく できましたね！ また 話しましょう。"
        />
      </StudioSection>

      {/*
        **ラウンド2で 聞き出す こと**（2026-08-22 に 編集欄を 足した）。
        ここが 無い あいだ、8つの 話題は JSON を 直せる 人しか 変えられなかった。

        表に 出すのは **聞く ための 話題**で、エピソードの 題では ない
        ——答えが 先に 見えると 聞き出す 練習に ならない（2026-08-21 の 指定）。
      */}
      <StudioSection
        title={`聞き出す こと（${(value.discover ?? []).length}つ）`}
        hint="ぜんぶ 答えた あとの ばんで、学生が 聞くと 答えて くれる ことです。カードの 表に 出ます。"
      >
        <ol className="space-y-3">
          {(value.discover ?? []).map((item, index) => (
            <li key={index} className="border-hairline space-y-3 rounded-2xl border-2 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-faint w-6 text-sm font-black">{index + 1}</span>
                <div className="min-w-[8rem] flex-1">
                  <TextField
                    label="ID（半角）"
                    value={item.id}
                    onChange={(id) => updateDiscover(index, { id })}
                    placeholder="sumimasen"
                  />
                </div>
                <RowTools
                  index={index}
                  count={(value.discover ?? []).length}
                  label="話題"
                  onMove={(delta) =>
                    patch({ discover: moveItem(value.discover ?? [], index, delta) })
                  }
                  onRemove={() => patch({ discover: removeAt(value.discover ?? [], index) })}
                />
              </div>

              <TextField
                label="カードの 表（聞く ための 話題）"
                value={item.label}
                onChange={(label) => updateDiscover(index, { label })}
                placeholder="日本語の むずかしい ところ"
              />
              <p className="text-ink-faint text-xs font-bold">
                中身が 分かる 題（「すみません」の 3つの 意味）は ここに 書きません。 答えが 先に
                見えると、聞き出す 練習に なりません。
              </p>

              <TextAreaField
                label="聞かれたら 話す こと"
                value={item.answer}
                onChange={(answer) => updateDiscover(index, { answer })}
                rows={3}
                placeholder="あやまる ときにも、ありがとうの ときにも つかいます。"
              />

              <StringListEditor
                label="当たる ことば"
                items={item.keywords}
                placeholder="むずかし"
                itemLabel="ことば"
                addLabel="＋ ことばを 追加"
                onChange={(keywords) => updateDiscover(index, { keywords })}
              />
              <p className="text-ink-faint text-xs font-bold">
                みじかすぎる ことばは 気を つけて ください。「はな」は「日本の はなしを」にも
                当たって しまいます。当たらなかった ときは AIが もう一度 見ます。
              </p>
            </li>
          ))}
        </ol>

        <MiniButton
          tone="accent"
          onClick={() => patch({ discover: [...(value.discover ?? []), emptyMeetingDiscover()] })}
        >
          ＋ 話題を 追加
        </MiniButton>
      </StudioSection>

      <MeetingPromptPreview value={value} />

      <MeetingAudioMaker value={value} cast={cast} onChange={onChange} />

      <FuriganaEditor
        content={value}
        entries={value.furigana ?? []}
        onChange={(furigana) => patch({ furigana })}
        emptyNote="しつもんと うけこたえの 漢字に よみを つけます。"
      />
    </div>
  );
}
