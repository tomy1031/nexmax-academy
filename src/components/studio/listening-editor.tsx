"use client";

import type { Listening, ListeningParticipant, ListeningScriptLine } from "@/content/schema";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import {
  countLinesBySpeaker,
  emptyListeningParticipant,
  LISTENING_ACCENT_OPTIONS,
  missingKeywords,
  SPEAKER_ME,
  SPEAKER_NARRATION,
} from "./listening-drafts";
import { AudioMaker } from "./audio-maker";
import { ImageSlotEditor } from "./image-slot-editor";
import {
  CheckChoice,
  FuriganaEditor,
  MiniButton,
  NumberField,
  RowTools,
  SelectField,
  StringListEditor,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";

/**
 * リスニングのエディタ（設計07 §6）
 *
 * リスニングは「Zoom風の画面で聞く」教材で、参加者・台本・キーワードが噛み合って
 * はじめて成立する。噛み合わなくなる形（未登録の話者・台本に無いキーワード）は
 * schema.ts の superRefine が保存で止めるが、止められてから直すのは遅い。
 * だからこのエディタは、話す人を選択式にして未登録を作れないようにし、
 * キーワードのずれと参加者削除の影響を入力中に画面へ出す。
 */
export function ListeningEditor({
  value,
  onChange,
}: {
  value: Listening;
  onChange: (listening: Listening) => void;
}) {
  const patch = (part: Partial<Listening>) => onChange({ ...value, ...part });

  /**
   * 話す人の候補。IDがまだ空の参加者は候補に出さない。
   * 空のIDを選べてしまうと、台本の speaker が空文字になって保存で止まるため。
   */
  const speakerOptions = [
    { value: SPEAKER_NARRATION, label: "ナレーション" },
    { value: SPEAKER_ME, label: "じぶん（学習者）" },
    ...value.participants
      .filter((person) => person.id.length > 0)
      .map((person) => ({
        value: person.id,
        label: person.name.length > 0 ? `${person.name}（${person.id}）` : person.id,
      })),
  ];

  const updateParticipant = (index: number, next: ListeningParticipant) =>
    patch({ participants: replaceAt(value.participants, index, next) });

  const removeParticipant = (index: number) => {
    const person = value.participants[index];
    if (!person) return;
    const lines = countLinesBySpeaker(value, person.id);
    // 参加者を消しても台本の行は残る。残った行は話す人が未登録になり保存で止まるので、
    // 「あとから原因を探す」ことにならないよう、消す前に何行あるかを見せて確かめる。
    if (
      lines > 0 &&
      !window.confirm(
        `この人が 話す セリフが ${lines}行 あります。けすと その行の 話す人が いなくなります。けしますか。`,
      )
    ) {
      return;
    }
    patch({ participants: removeAt(value.participants, index) });
  };

  const updateLine = (index: number, next: ListeningScriptLine) =>
    patch({ script: replaceAt(value.script, index, next) });

  const missing = missingKeywords(value);

  return (
    <div className="space-y-4">
      <StudioSection
        title="画面の かたち"
        hint="「聞く」だけなら 顔を ならべる 必要は ありません。"
      >
        <div className="sm:w-72">
          <SelectField
            label="タイプ"
            value={value.mode}
            options={[
              { value: "player", label: "ふつうの 再生プレイヤー" },
              { value: "call", label: "Zoom風（相手の 顔が ならぶ）" },
            ]}
            onChange={(mode) => patch({ mode })}
          />
        </div>
      </StudioSection>

      <StudioSection title="きほん" hint="リスニングの 入口に 出る 文です。">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="ID（半角の英小文字・数字・- _）"
            value={value.id}
            onChange={(id) => patch({ id })}
            placeholder="m7-asakai"
            hint="あとから変えると 進捗の記録が つながらなくなります。"
          />
          <TextField
            label="タイトル"
            value={value.title}
            onChange={(title) => patch({ title })}
            placeholder="朝会（あさかい）"
          />
        </div>
        <TextAreaField
          label="せつめい"
          value={value.description}
          onChange={(description) => patch({ description })}
          placeholder="チームの 朝会を 聞いて、こまっていることの つたえ方を 見つけます。"
        />
        <TextAreaField
          label="聞く まえに 配る 見かた"
          value={value.focus}
          onChange={(focus) => patch({ focus })}
          placeholder="ヘンディさんが「こまっていること」を どう つたえるかに 注目して 聞いてみましょう。"
          hint="どこに 注目して 聞くかを 先に わたします。ここが 無いと ただ 聞き流す 教材に なります。"
        />
        <TextField
          label="音声の ばしょ（なくてもよい）"
          value={value.audioUrl ?? ""}
          onChange={(audioUrl) => patch({ audioUrl: audioUrl.length > 0 ? audioUrl : undefined })}
          placeholder="https://…/asakai.mp3"
          hint="入れなければ 台本を 読む 画面に なります。"
        />
        {/*
          動画の リスニング（2026-08-29 の 指定）。**音と 両方は 置けない**
          （どちらを 鳴らすか 決まらなく なる ので スキーマが 止める）。
          聞き取りチェックも 速さの ボタンも 音の ときと 同じに 効く。
        */}
        <TextField
          label="動画の ばしょ（なくてもよい）"
          value={value.videoUrl ?? ""}
          onChange={(videoUrl) => patch({ videoUrl: videoUrl.length > 0 ? videoUrl : undefined })}
          placeholder="/video/hourensou/xxx.mp4"
          hint="動画で 聞かせる ときは こちら。音声の ばしょは 空に してください（両方は 置けません）。"
        />
        <TextField
          label="YouTube の ばしょ（なくてもよい）"
          value={value.youtube ?? ""}
          onChange={(youtube) => patch({ youtube: youtube.length > 0 ? youtube : undefined })}
          placeholder="https://www.youtube.com/watch?v=..."
          hint="動画の ページの URL を そのまま 貼って ください。音・動画・YouTube は どれか 1つです。速さの ボタンは 出ません（動画の 中の ⚙ で 変えます）。"
        />
        <TextField
          label="動画を 読みこむ 前に 出す 絵（なくてもよい）"
          value={value.posterUrl ?? ""}
          onChange={(posterUrl) =>
            patch({ posterUrl: posterUrl.length > 0 ? posterUrl : undefined })
          }
          placeholder="/img/hourensou/xxx.webp"
          hint="空なら 黒い 面に 再生ボタンが 出ます。"
        />
      </StudioSection>

      <StudioSection
        title="参加者"
        hint="台本の「話す人」は ここに 入れた 人から えらびます。"
        right={
          <MiniButton
            tone="accent"
            onClick={() =>
              patch({ participants: [...value.participants, emptyListeningParticipant()] })
            }
          >
            ＋ 人を 追加
          </MiniButton>
        }
      >
        {value.participants.length === 0 ? (
          <p className="text-ink-faint text-xs font-bold">
            まだ ありません。ひとりは 入れてください。
          </p>
        ) : null}
        <div className="space-y-2">
          {value.participants.map((person, index) => (
            <ParticipantRow
              key={index}
              person={person}
              index={index}
              count={value.participants.length}
              lineCount={countLinesBySpeaker(value, person.id)}
              onChange={(next) => updateParticipant(index, next)}
              onMove={(delta) =>
                patch({ participants: moveItem(value.participants, index, delta) })
              }
              onRemove={() => removeParticipant(index)}
            />
          ))}
        </div>
      </StudioSection>

      <StudioSection
        title="台本"
        hint="上から 順に 話します。この 並びが そのまま 会話に なります。"
      >
        <div className="space-y-2">
          {value.script.map((line, index) => (
            <div
              key={index}
              className="border-hairline flex flex-wrap items-end gap-2 rounded-2xl border-2 bg-white p-3"
            >
              <span className="text-ink-faint w-6 text-sm font-black">{index + 1}</span>
              <div className="w-44">
                <SelectField
                  label="話す人"
                  value={line.speaker}
                  /*
                    参加者を消したあとなど、候補に無いIDが残ることがある。
                    そのまま出さないと勝手に別人へ すり替わるので、印を付けて残す。
                  */
                  options={
                    speakerOptions.some((option) => option.value === line.speaker)
                      ? speakerOptions
                      : [
                          ...speakerOptions,
                          { value: line.speaker, label: `${line.speaker}（参加者に いません）` },
                        ]
                  }
                  onChange={(speaker) => updateLine(index, { ...line, speaker })}
                />
              </div>
              <div className="min-w-[12rem] flex-1">
                <TextAreaField
                  label="ことば"
                  rows={2}
                  value={line.text}
                  onChange={(text) => updateLine(index, { ...line, text })}
                />
              </div>
              <TimeField line={line} onChange={(next) => updateLine(index, next)} />
              <RowTools
                index={index}
                count={value.script.length}
                label="セリフ"
                onMove={(delta) => patch({ script: moveItem(value.script, index, delta) })}
                onRemove={() => patch({ script: removeAt(value.script, index) })}
              />
            </div>
          ))}
        </div>
        {value.script.length < 2 ? (
          <p className="text-ink-faint text-xs font-bold">
            会話に するために、セリフは 2行 いじょう 入れてください。
          </p>
        ) : null}
        <MiniButton
          tone="accent"
          onClick={() =>
            patch({
              script: [
                ...value.script,
                { speaker: speakerOptions[0]?.value ?? SPEAKER_NARRATION, text: "" },
              ],
            })
          }
        >
          ＋ セリフを 追加
        </MiniButton>
      </StudioSection>

      <StudioSection title="聞き取り チェック" hint="聞こえた ことばを 入れて さがす ゲームです。">
        <StringListEditor
          label="さがす ことば（キーワード）"
          items={value.keywords}
          itemLabel="ことば"
          placeholder="サーバー"
          addLabel="＋ ことばを 追加"
          onChange={(keywords) => patch({ keywords })}
        />
        {missing.length > 0 ? (
          // 台本に無い言葉は学習者が どうやっても 見つけられない。保存でも止まるが、
          // 打っている そばで 気づけるように ここへ 出す。
          <p className="text-coral-deep text-xs font-black">
            つぎの ことばは 台本に 出てきません: {missing.join("、")}
            <span className="text-ink-soft mt-1 block font-bold">
              台本に ある ことばに するか、台本の ほうに その ことばを 入れてください。
            </span>
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="こたえあわせに すすむ 目標（％）"
            value={value.revealGoal}
            min={1}
            max={100}
            onChange={(revealGoal) => patch({ revealGoal })}
            hint="原稿が この 割合まで ひらくと つぎへ 進めます。"
          />
          <NumberField
            label="うけつける 文字数"
            value={value.check.minLength}
            min={1}
            max={8}
            onChange={(minLength) => patch({ check: { ...value.check, minLength } })}
            hint="ひらがなだけの 入力を 何文字から 受けるか。みじかいと まぐれ当たりが 増えます。"
          />
          <NumberField
            label="ヒントを 出す ミスの 回数"
            value={value.check.maxMiss}
            min={1}
            max={20}
            onChange={(maxMiss) => patch({ check: { ...value.check, maxMiss } })}
            hint="この 回数を こえたら「もういちど 聞こう」と 出します。"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <CheckChoice
            label="はじめから げんこうを 見せる"
            checked={value.check.showScript}
            onToggle={(showScript) => patch({ check: { ...value.check, showScript } })}
          />
          <CheckChoice
            label="タイピングを 出す"
            checked={value.check.showTyping}
            onToggle={(showTyping) => patch({ check: { ...value.check, showTyping } })}
          />
        </div>
        <p className="text-ink-faint text-xs font-bold">
          げんこうは ふつう 見せません（見えていると 読む れんしゅうに なってしまいます）。 学習者は
          画面の「げんこう ON」で 出せます。
        </p>
      </StudioSection>

      <StudioSection
        title="聞く 前の 1枚（なくてもよい）"
        hint="画面の いちばん 上に 出ます。**答えを 描かない こと**——「どこで 働くか」「何を 作るか」を 絵で 見せると、聞かずに 答えられて しまいます。描いて よいのは 場面の 雰囲気までです。"
      >
        <ImageSlotEditor
          slot={value.cover ?? { refs: [], status: "empty" }}
          prefix={`listening/${value.id.length > 0 ? value.id : "draft"}`}
          onChange={(cover) => onChange({ ...value, cover })}
        />
      </StudioSection>

      <AudioMaker value={value} onChange={onChange} />

      <FuriganaEditor
        entries={value.furigana ?? []}
        onChange={(furigana) => onChange({ ...value, furigana })}
        emptyNote="まだ ありません。ないと 台本の 漢字に ふりがなが つきません。"
        content={value}
      />
    </div>
  );
}

function ParticipantRow({
  person,
  index,
  count,
  lineCount,
  onChange,
  onMove,
  onRemove,
}: {
  person: ListeningParticipant;
  index: number;
  count: number;
  /** この人が話す台本の行数（消したときの影響の大きさ）。 */
  lineCount: number;
  onChange: (person: ListeningParticipant) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border-hairline flex flex-wrap items-end gap-2 rounded-2xl border-2 bg-white p-3">
      <div className="w-36">
        <TextField
          label="ID（半角の英小文字・数字・- _）"
          value={person.id}
          onChange={(id) => onChange({ ...person, id })}
          placeholder="hendy"
        />
      </div>
      <div className="w-36">
        <TextField
          label="名前"
          value={person.name}
          onChange={(name) => onChange({ ...person, name })}
          placeholder="ヘンディ"
        />
      </div>
      <div className="min-w-[8rem] flex-1">
        <TextField
          label="やくわり"
          value={person.role}
          onChange={(role) => onChange({ ...person, role })}
          placeholder="先輩"
        />
      </div>
      <div className="w-32">
        <SelectField
          label="タイルの色"
          value={person.accent}
          options={LISTENING_ACCENT_OPTIONS}
          onChange={(accent) => onChange({ ...person, accent })}
        />
      </div>
      <div className="flex flex-col items-start gap-1">
        <span className="text-ink-soft text-xs font-bold">
          {person.id.length === 0 ? "IDを 入れると 台本で えらべます" : `セリフ ${lineCount}行`}
        </span>
        <RowTools index={index} count={count} label="人" onMove={onMove} onRemove={onRemove} />
      </div>
    </div>
  );
}

/**
 * 音に合わせる開始秒（任意）。
 *
 * 数字欄をいつも出しておくと、空欄が 0秒 として保存されて字幕が先頭へ飛ぶ。
 * だから「つける／やめる」を 明示の ボタンに して、無いことを 無いまま 保てるようにする。
 */
function TimeField({
  line,
  onChange,
}: {
  line: ListeningScriptLine;
  onChange: (line: ListeningScriptLine) => void;
}) {
  if (line.at === undefined) {
    return (
      <MiniButton onClick={() => onChange({ ...line, at: 0 })} title="音に 合わせる 秒を つける">
        ⏱ 秒を つける
      </MiniButton>
    );
  }
  return (
    <div className="w-28 space-y-1">
      <NumberField
        label="はじまる 秒"
        value={line.at}
        min={0}
        onChange={(at) => onChange({ ...line, at })}
      />
      <MiniButton onClick={() => onChange({ ...line, at: undefined })}>秒を やめる</MiniButton>
    </div>
  );
}
