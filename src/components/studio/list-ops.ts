/**
 * 並び替えの小道具（コンテンツスタジオ共用）
 *
 * 「上へ／下へ／消す／差し替え」は、ステージのコンテンツ順・漫画のコマ・記事のブロックで
 * まったく同じ操作になる。順序をまちがえると学習順そのものが壊れる（設計07 §3）ため、
 * ここ1か所に閉じてテストできる形にしておく。
 */

/**
 * index の要素を隣（delta = -1 で上、+1 で下）と入れ替える。
 * 端をこえる指定は何も起きない（ボタンを押しても壊れないようにする）。
 */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
  return items.map((item, i) => {
    // 範囲は上で確かめてある（noUncheckedIndexedAccess のための断定）
    if (i === index) return items[to] as T;
    if (i === to) return items[index] as T;
    return item;
  });
}

/** index の要素を消す。範囲外なら元のまま。 */
export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

/** index の要素を差し替える。範囲外なら元のまま。 */
export function replaceAt<T>(items: readonly T[], index: number, value: T): T[] {
  return items.map((item, i) => (i === index ? value : item));
}

/** 末尾に足す。 */
export function appendItem<T>(items: readonly T[], value: T): T[] {
  return [...items, value];
}
