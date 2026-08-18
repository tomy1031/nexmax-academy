/**
 * この きかいで「マウスを のせる」が できるか。
 *
 * ことばの いみは **マウスを のせただけで 出す**（2026-08-18 の指定）。
 * ただし スマホでは 指を 置いた だけで hover が 起きた ことに されるため、
 * そのまま 付けると タップの たびに「出て すぐ 消える」ことになる。
 * だから **マウスが ある きかいだけ** hover で ひらき、
 * 指の きかいは これまでどおり タップで ひらく。
 */
export function canHover(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
