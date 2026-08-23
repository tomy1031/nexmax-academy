/**
 * ページの 並び。**この 配列の 順が、そのまま ナビの 順**に なる。
 *
 * 「お問い合わせ」は 置かない。学習者が 送る ものが 無く、送信の できない
 * 空の フォームは「押しても 何も 起きない ボタン」に なるだけだから。
 */

import { HOME } from "./home.js";
import { ABOUT } from "./about.js";
import { CAMBODIA } from "./cambodia.js";
import { GROUP } from "./group.js";
import { SERVICES } from "./services.js";
import { MAKING } from "./making.js";
import { WORKS } from "./works.js";
import { DICTIONARY } from "./dictionary.js";

/*
 * 並びは 2026-08-23 の 指定:
 *   ホーム → 会社紹介 → **カンボジア事業** → グループ会社 → 事業 → つくる仕事 → 実績 → 辞典
 *
 * カンボジア事業を 前に 出すのは、**学習者自身が 載って いる ページ**だから。
 * 会社の ことを 知った すぐ あとに「自分たちが ここに いる」と 分かるほうが、
 * その先の ページを 読む 理由に なる（設計01 P7: 感情が エンジン）。
 */
export const PAGES = [HOME, ABOUT, CAMBODIA, GROUP, SERVICES, MAKING, WORKS, DICTIONARY];
