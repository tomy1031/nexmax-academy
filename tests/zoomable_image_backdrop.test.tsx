import {
  Children,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ZoomedView } from "../src/components/media/zoomable-image";

/*
 * 拡大した 絵の **外側を 押しても もどる**（`closeOnBackdrop`）
 *（2026-10-09 の 指定「写真を 拡大した 場合に、右上の「もどす」ボタンだけでなく、写真の 外側の
 * 領域クリックでも 戻すと 同じ 挙動に なるように」）。
 *
 * この リポジトリの 単体テストは DOM を 持たない（`environment: "node"`）。`ZoomedView` は
 * フックを 持たない 関数なので、**じかに 呼んで 返る 要素の 木から `onClick` を 取り出し**、
 * 偽の クリックを 渡して 見る。本物の ブラウザでの 通しは e2e（`tests/e2e/asakai.spec.ts`）。
 */

type Click = (event: MouseEvent<HTMLDivElement>) => void;

/** 木の 中から、タグ名で 要素を 探す（深さ 優先・最初の 1つ）。 */
function find(node: ReactNode, tag: string): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement(node)) return undefined;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === tag) return element;
  for (const child of Children.toArray(element.props.children as ReactNode)) {
    const hit = find(child, tag);
    if (hit) return hit;
  }
  return undefined;
}

/** 殻（いちばん 外の div）と、絵を 真ん中に 置く 枠（その 中の div）。 */
function parts(closeOnBackdrop: boolean | undefined) {
  const onClose = vi.fn();
  const tree = ZoomedView({
    onClose,
    closeOnBackdrop,
    children: <span data-picture="a" />,
  });
  const shell = tree as ReactElement<Record<string, unknown>>;
  const grid = find(Children.toArray(shell.props.children as ReactNode)[0], "div") as ReactElement<
    Record<string, unknown>
  >;
  return { onClose, shell, grid };
}

/** 偽の クリック。`target` が 押された 場所、`currentTarget` が ハンドラを 付けた 場所。 */
function click(handler: unknown, target: object, currentTarget: object) {
  const stopPropagation = vi.fn();
  (handler as Click)({
    target,
    currentTarget,
    stopPropagation,
  } as unknown as MouseEvent<HTMLDivElement>);
  return stopPropagation;
}

describe("ZoomedView（closeOnBackdrop あり）", () => {
  it("幕（殻そのもの）を 押すと もどる", () => {
    const { onClose, shell } = parts(true);
    const self = {};
    click(shell.props.onClick, self, self);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("絵を 真ん中に 置く 枠（絵の 外側の 余白）を 押しても もどる", () => {
    const { onClose, grid } = parts(true);
    const self = {};
    click(grid.props.onClick, self, self);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("絵そのものを 押しても もどらない（押された のは 子）", () => {
    const { onClose, shell, grid } = parts(true);
    const image = {};
    /* 絵の click は 枠でも 殻でも 「自分では ない 子」から 来る。 */
    click(grid.props.onClick, image, {});
    click(shell.props.onClick, image, {});
    expect(onClose).not.toHaveBeenCalled();
  });

  it("外側を 押して 閉じる click は 親へ 伝えない（報告メモごと 閉じない）", () => {
    const { shell } = parts(true);
    const self = {};
    const stop = click(shell.props.onClick, self, self);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("絵を 押した click は 止めない（絵の 上の 操作を 邪魔しない）", () => {
    const { grid } = parts(true);
    const stop = click(grid.props.onClick, {}, {});
    expect(stop).not.toHaveBeenCalled();
  });

  it("「✕ もどす」は これまでどおり 自分の onClick で もどる", () => {
    const { onClose, shell } = parts(true);
    const button = find(shell, "button") as ReactElement<Record<string, unknown>>;
    (button.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ZoomedView（closeOnBackdrop なし＝既定）", () => {
  it("幕を 押しても 何も 起きない（ハンドラが 付かない）", () => {
    const { onClose, shell, grid } = parts(undefined);
    expect(shell.props.onClick).toBeUndefined();
    expect(grid.props.onClick).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("false を 明示しても 同じ", () => {
    const { shell, grid } = parts(false);
    expect(shell.props.onClick).toBeUndefined();
    expect(grid.props.onClick).toBeUndefined();
  });

  it("「✕ もどす」は 効く（外側クリックの 有無に よらず）", () => {
    const { onClose, shell } = parts(undefined);
    const button = find(shell, "button") as ReactElement<Record<string, unknown>>;
    (button.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ZoomedView の 見た目", () => {
  it("絵を 真ん中に 置き、もどす ボタンを 持つ（markup は 従来どおり）", () => {
    const html = renderToStaticMarkup(
      <ZoomedView onClose={() => {}} closeOnBackdrop>
        <span data-picture="a" />
      </ZoomedView>,
    );
    expect(html).toContain("fixed inset-0 z-50");
    expect(html).toContain("place-items-center");
    expect(html).toContain("✕ もどす");
    expect(html).toContain('data-picture="a"');
  });
});
