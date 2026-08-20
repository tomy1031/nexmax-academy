"use client";

import { useState } from "react";
import type { Article, ArticleBlock, Character, Content, ContentRefType } from "@/content/schema";
import { ArticleView } from "@/components/article/article-view";
import { ARTICLE_BLOCK_OPTIONS, CONTENT_TYPE_OPTIONS, emptyArticleBlock } from "./drafts";
import { ImageSlotEditor } from "./image-slot-editor";
import { moveItem, removeAt, replaceAt } from "./list-ops";
import {
  MiniButton,
  RowTools,
  SelectField,
  StringListEditor,
  StudioSection,
  TextAreaField,
  TextField,
} from "./studio-ui";
import { ArticleMaker } from "./lesson-maker";

/**
 * 説明ページのエディタ（設計07 §5）
 *
 * 保存形式はブロックJSON。生HTMLを受け取らないので、禁止語・ふりがな・秘匿漏れの
 * 機械検査がそのまま効く。右のプレビューは学習者と同じ ArticleView を使い、
 * 「見えているもの＝出るもの」にする。
 */
export function ArticleEditor({
  value,
  onChange,
  known = [],
  characters = [],
}: {
  value: Article;
  onChange: (article: Article) => void;
  /** すでに作った教材。AIに「習った ことば」を踏まえさせるために渡す。 */
  known?: readonly Content[];
  /**
   * 人物カードの一覧。しょうかいカードで だれを 出すか えらぶのと、
   * 右のプレビューに **本物の 絵**を 出すのに使う（「見えているもの＝出るもの」）。
   */
  characters?: readonly Character[];
}) {
  const [addKind, setAddKind] = useState<ArticleBlock["kind"]>("paragraph");
  const patch = (part: Partial<Article>) => onChange({ ...value, ...part });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-4">
        <ArticleMaker value={value} onChange={onChange} known={known} />
        <StudioSection title="きほん">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="ID（半角の英小文字・数字・- _）"
              value={value.id}
              onChange={(id) => patch({ id })}
              placeholder="m7-howto"
            />
            <TextField
              label="タイトル"
              value={value.title}
              onChange={(title) => patch({ title })}
            />
          </div>
          <TextAreaField
            label="せつめい"
            value={value.description}
            onChange={(description) => patch({ description })}
          />
        </StudioSection>

        <StudioSection
          title="ブロック"
          hint="上から順に 表示されます。見出しが3つ以上あると もくじが出ます。"
        >
          <div className="space-y-3">
            {value.blocks.map((block, index) => (
              <article key={index} className="border-hairline bg-panel rounded-2xl border-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-navy text-sm font-black">
                    {index + 1}. {blockLabel(block.kind)}
                  </p>
                  <RowTools
                    index={index}
                    count={value.blocks.length}
                    label="ブロック"
                    onMove={(delta) => patch({ blocks: moveItem(value.blocks, index, delta) })}
                    onRemove={() => patch({ blocks: removeAt(value.blocks, index) })}
                  />
                </div>
                <div className="mt-3">
                  <BlockEditor
                    block={block}
                    articleId={value.id}
                    onChange={(next) => patch({ blocks: replaceAt(value.blocks, index, next) })}
                    characters={characters}
                  />
                </div>
              </article>
            ))}
          </div>

          {value.blocks.length === 0 ? (
            <p className="text-ink-faint text-xs font-bold">
              まだ ありません。下から 追加してください。
            </p>
          ) : null}

          <div className="bg-panel-tint flex flex-wrap items-end gap-2 rounded-2xl p-3">
            <div className="w-52">
              <SelectField
                label="追加するブロック"
                value={addKind}
                options={ARTICLE_BLOCK_OPTIONS}
                onChange={setAddKind}
              />
            </div>
            <MiniButton
              tone="accent"
              onClick={() => patch({ blocks: [...value.blocks, emptyArticleBlock(addKind)] })}
            >
              ＋ ブロックを 追加
            </MiniButton>
          </div>
        </StudioSection>
      </div>

      <aside className="xl:sticky xl:top-4 xl:self-start">
        <div className="card-island p-3">
          <p className="text-ink-soft text-xs font-black">プレビュー（学習者と同じ画面）</p>
          <div className="mt-2 max-h-[70dvh] overflow-y-auto rounded-2xl bg-white/60">
            <ArticleView article={value} preview characters={characters} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function blockLabel(kind: ArticleBlock["kind"]): string {
  return ARTICLE_BLOCK_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function BlockEditor({
  block,
  articleId,
  onChange,
  characters,
}: {
  block: ArticleBlock;
  articleId: string;
  onChange: (block: ArticleBlock) => void;
  /** 人物カードの一覧（しょうかいカードで だれを 出すか えらぶ）。 */
  characters: readonly Character[];
}) {
  switch (block.kind) {
    case "heading":
      return (
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <SelectField
            label="レベル"
            value={String(block.level) as "2" | "3"}
            options={[
              { value: "2", label: "大見出し" },
              { value: "3", label: "小見出し" },
            ]}
            onChange={(level) => onChange({ ...block, level: level === "3" ? 3 : 2 })}
          />
          <TextField
            label="見出しの文字"
            value={block.text}
            onChange={(text) => onChange({ ...block, text })}
          />
        </div>
      );

    case "paragraph":
      return (
        <TextAreaField
          label="本文"
          rows={4}
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
        />
      );

    case "image":
      return (
        <div className="space-y-3">
          <ImageSlotEditor
            slot={block}
            prefix={`article/${articleId.length > 0 ? articleId : "draft"}`}
            onChange={(slot) => onChange({ ...block, ...slot })}
          />
          <TextField
            label="ひとこと（なくてもよい）"
            value={block.caption ?? ""}
            onChange={(caption) =>
              onChange({ ...block, caption: caption.length > 0 ? caption : undefined })
            }
          />
        </div>
      );

    case "callout":
      return (
        <div className="space-y-3">
          <SelectField
            label="枠の種類"
            value={block.tone}
            options={[
              { value: "point", label: "ここが ポイント" },
              { value: "care", label: "ここに きを つけて" },
            ]}
            onChange={(tone) => onChange({ ...block, tone })}
          />
          <TextAreaField
            label="文"
            rows={3}
            value={block.text}
            onChange={(text) => onChange({ ...block, text })}
          />
        </div>
      );

    case "list":
    case "steps":
      return (
        <StringListEditor
          label={block.kind === "list" ? "かじょうがき" : "てじゅん"}
          items={block.items ?? []}
          itemLabel="行"
          onChange={(items) => onChange({ ...block, items })}
        />
      );

    case "vocab":
      return (
        <div className="space-y-2">
          {(block.items ?? []).map((item, index) => (
            <div
              key={index}
              className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
            >
              <div className="w-36">
                <TextField
                  label="ことば"
                  value={item.term}
                  onChange={(term) =>
                    onChange({
                      ...block,
                      items: replaceAt(block.items ?? [], index, { ...item, term }),
                    })
                  }
                />
              </div>
              <div className="w-36">
                <TextField
                  label="よみ（ひらがな）"
                  value={item.reading}
                  onChange={(reading) =>
                    onChange({
                      ...block,
                      items: replaceAt(block.items ?? [], index, { ...item, reading }),
                    })
                  }
                />
              </div>
              <div className="min-w-[8rem] flex-1">
                <TextField
                  label="いみ"
                  value={item.meaning}
                  onChange={(meaning) =>
                    onChange({
                      ...block,
                      items: replaceAt(block.items ?? [], index, { ...item, meaning }),
                    })
                  }
                />
              </div>
              {/*
                英語は N5 を超える語の 最後の 受け皿。ひらがなに 開いても 意味は
                伝わらないので、漢字＋ふりがな＋英語で 支える（docs/constraints.md）。
              */}
              <div className="w-40">
                <TextField
                  label="えいご（なくてもよい）"
                  value={item.en ?? ""}
                  onChange={(en) =>
                    onChange({
                      ...block,
                      items: replaceAt(block.items ?? [], index, {
                        ...item,
                        en: en.length > 0 ? en : undefined,
                      }),
                    })
                  }
                />
              </div>
              <RowTools
                index={index}
                count={(block.items ?? []).length}
                label="ことば"
                onMove={(delta) =>
                  onChange({ ...block, items: moveItem(block.items ?? [], index, delta) })
                }
                onRemove={() => onChange({ ...block, items: removeAt(block.items ?? [], index) })}
              />
            </div>
          ))}
          <MiniButton
            tone="accent"
            onClick={() =>
              onChange({
                ...block,
                items: [...(block.items ?? []), { term: "", reading: "", meaning: "" }],
              })
            }
          >
            ＋ ことばを 追加
          </MiniButton>
        </div>
      );

    case "link":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            label="種別"
            value={block.type}
            options={CONTENT_TYPE_OPTIONS}
            onChange={(type: ContentRefType) => onChange({ ...block, type })}
          />
          <TextField
            label="参照先のID"
            value={block.ref}
            onChange={(ref) => onChange({ ...block, ref })}
          />
          <TextField
            label="リンクの文字"
            value={block.label}
            onChange={(label) => onChange({ ...block, label })}
          />
        </div>
      );

    case "extlink":
      /*
       * 外のサイトは この ブロックで 置く。本文に URL の 文字を 書いても
       * 学習者は タップできない（改善#24）。
       */
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="URL（https:// から）"
            value={block.url}
            onChange={(url) => onChange({ ...block, url })}
          />
          <TextField
            label="リンクの文字"
            value={block.label}
            onChange={(label) => onChange({ ...block, label })}
          />
          <TextField
            label="ひとこと（なくてもよい）"
            value={block.note ?? ""}
            onChange={(note) => onChange({ ...block, note: note.length > 0 ? note : undefined })}
          />
        </div>
      );

    case "characters":
      /*
       * 絵と 名前は 人物カードから 引くので、ここで 書くのは **学習者に見せる
       * 立場と ひとこと**だけ。人物カードの `role` は 先生向けの 覚書なので
       * そのまま 出さない（schema.ts）。
       */
      return (
        <div className="space-y-2">
          {(block.items ?? []).map((item, index) => (
            <div
              key={index}
              className="border-hairline flex flex-wrap items-end gap-2 rounded-xl border-2 bg-white p-2"
            >
              <div className="w-44">
                <SelectField
                  label="だれ（人物カード）"
                  value={item.ref}
                  options={[
                    { value: "", label: "えらんでください" },
                    ...characters.map((person) => ({
                      value: person.id,
                      label: person.name.length > 0 ? person.name : person.id,
                    })),
                  ]}
                  onChange={(ref) =>
                    onChange({
                      ...block,
                      items: replaceAt(block.items ?? [], index, { ...item, ref }),
                    })
                  }
                />
              </div>
              <div className="w-40">
                <TextField
                  label="立場（学習者に見せる）"
                  value={item.role}
                  onChange={(role) =>
                    onChange({
                      ...block,
                      items: replaceAt(block.items ?? [], index, { ...item, role }),
                    })
                  }
                />
              </div>
              <div className="min-w-[12rem] flex-1">
                <TextField
                  label="ひとこと しょうかい"
                  value={item.note}
                  onChange={(note) =>
                    onChange({
                      ...block,
                      items: replaceAt(block.items ?? [], index, { ...item, note }),
                    })
                  }
                />
              </div>
              <RowTools
                index={index}
                count={(block.items ?? []).length}
                label="人物"
                onMove={(delta) =>
                  onChange({ ...block, items: moveItem(block.items ?? [], index, delta) })
                }
                onRemove={() => onChange({ ...block, items: removeAt(block.items ?? [], index) })}
              />
            </div>
          ))}
          <MiniButton
            tone="accent"
            onClick={() =>
              onChange({
                ...block,
                items: [...(block.items ?? []), { ref: "", role: "", note: "" }],
              })
            }
          >
            ＋ 人物を 追加
          </MiniButton>
        </div>
      );
  }
}
