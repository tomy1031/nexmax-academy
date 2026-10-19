import {
  Children,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { closeOnOutsideClick, ZoomedView } from "../src/components/media/zoomable-image";

/*
 * 拡大した 絵の **外側を 押しても もどる**（`ZoomableImage` の どの 絵も 同じ）
 *（2026-10-09 の 指定「写真を 拡大した 場合に、右上の「もどす」ボタンだけでなく、写真の 外側の
 * 領域クリックでも 戻すと 同じ 挙動に なるように」→ 同日の 回答「B」で **アプリ全体**に）。
 *
 * はじめは 朝礼の しごとの 絵だけの 約束（`closeOnBackdrop` の 申し出式）だった。
 * 回答「B」で 申し出式を やめ、**常に 外側クリックで もどる**。ここは その 新しい 既定を 見張る
 *（申し出なしの 「幕を 押しても 何も 起きない」は 仕様変更で 書き換えた。ユーザー承認）。
 *
 * この リポジトリの 単体テストは DOM を 持たない（`environment: "node"`）。`ZoomedView` は
 * フックを 持たない 関数なので、**じかに 呼んで 返る 要素の 木から `onClick` を 取り出し**、
 * 偽の クリックを 渡して 見る。本物の ブラウザでの 通しは e2e（`tests/e2e/asakai.spec.ts`・
 * `tests/e2e/hourensou.spec.ts`・`tests/e2e/manga_page.spec.ts`）。
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
function parts() {
  const onClose = vi.fn();
  const tree = ZoomedView({
    onClose,
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

/** `closeOnOutsideClick` を じかに 呼ぶ。返すのは `stopPropagation` の 見張り。 */
function outside(target: object, currentTarget: object, onClose: () => void) {
  const stopPropagation = vi.fn();
  closeOnOutsideClick(
    { target, currentTarget, stopPropagation } as unknown as MouseEvent<HTMLElement>,
    onClose,
  );
  return stopPropagation;
}

describe("ZoomedView（外側クリックは 常に 効く）", () => {
  it("幕（殻そのもの）を 押すと もどる", () => {
    const { onClose, shell } = parts();
    const self = {};
    click(shell.props.onClick, self, self);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("絵を 真ん中に 置く 枠（絵の 外側の 余白）を 押しても もどる", () => {
    const { onClose, grid } = parts();
    const self = {};
    click(grid.props.onClick, self, self);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("絵そのものを 押しても もどらない（押された のは 子）", () => {
    const { onClose, shell, grid } = parts();
    const image = {};
    /* 絵の click は 枠でも 殻でも 「自分では ない 子」から 来る。 */
    click(grid.props.onClick, image, {});
    click(shell.props.onClick, image, {});
    expect(onClose).not.toHaveBeenCalled();
  });

  it("外側を 押して 閉じる click は 親へ 伝えない（報告メモごと 閉じない）", () => {
    const { shell } = parts();
    const self = {};
    const stop = click(shell.props.onClick, self, self);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("絵を 押した click は 止めない（絵の 上の 操作を 邪魔しない）", () => {
    const { grid } = parts();
    const stop = click(grid.props.onClick, {}, {});
    expect(stop).not.toHaveBeenCalled();
  });

  it("「✕ もどす」は これまでどおり 自分の onClick で もどる", () => {
    const { onClose, shell } = parts();
    const button = find(shell, "button") as ReactElement<Record<string, unknown>>;
    (button.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ZoomedView（申し出なしでも 効く＝アプリ全体の 既定）", () => {
  it("何も 渡さなくても 幕と 枠に ハンドラが 付く（以前は 申し出なしだと 付かなかった）", () => {
    const { shell, grid } = parts();
    expect(typeof shell.props.onClick).toBe("function");
    expect(typeof grid.props.onClick).toBe("function");
  });

  it("中に 押せる もの（ボタン）が あっても、それを 押した click では もどらない", () => {
    const onClose = vi.fn();
    const tree = ZoomedView({ onClose, children: <button type="button">中の ボタン</button> });
    const shell = tree as ReactElement<Record<string, unknown>>;
    const grid = find(
      Children.toArray(shell.props.children as ReactNode)[0],
      "div",
    ) as ReactElement<Record<string, unknown>>;
    const inner = {};
    /* 中の ボタンを 押した click は、枠・殻の どちらでも 「自分では ない 子」から 来る。 */
    click(grid.props.onClick, inner, {});
    click(shell.props.onClick, inner, {});
    expect(onClose).not.toHaveBeenCalled();
  });

  it("「✕ もどす」の click が 殻まで 泡立っても 二重に もどさない（押された のは 子）", () => {
    const { onClose, shell } = parts();
    const button = find(shell, "button") as ReactElement<Record<string, unknown>>;
    (button.props.onClick as () => void)();
    /* 泡立った click は target が ボタンで、殻の 側では 見送られる。 */
    click(shell.props.onClick, {}, {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("closeOnOutsideClick（まんがの ページ絵 `<dialog>` も これを 使う）", () => {
  it("地（dialog そのもの）を 押すと もどり、親へは 伝えない", () => {
    const onClose = vi.fn();
    const self = {};
    const stop = outside(self, self, onClose);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("絵（子）を 押しても もどらず、click は 止めない（「もっと おおきく」の 切り替えを 邪魔しない）", () => {
    const onClose = vi.fn();
    const stop = outside({}, {}, onClose);
    expect(onClose).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it("押すたびに 判定し直す（1回 もどした あとも 次の 外側クリックで また もどる）", () => {
    const onClose = vi.fn();
    const self = {};
    outside(self, self, onClose);
    outside(self, self, onClose);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ZoomedView の 見た目", () => {
  it("絵を 真ん中に 置き、もどす ボタンを 持つ（markup は 従来どおり）", () => {
    const html = renderToStaticMarkup(
      <ZoomedView onClose={() => {}}>
        <span data-picture="a" />
      </ZoomedView>,
    );
    expect(html).toContain("fixed inset-0 z-50");
    expect(html).toContain("place-items-center");
    expect(html).toContain("✕ もどす");
    expect(html).toContain('data-picture="a"');
  });
});
