/**
 * ページの 並び。**この 配列の 順が、そのまま ナビの 順**に なる。
 *
 * 「お問い合わせ」は 置かない。学習者が 送る ものが 無く、送信の できない
 * 空の フォームは「押しても 何も 起きない ボタン」に なるだけだから。
 */

import { HOME } from "./home.js";
import { ABOUT } from "./about.js";
import { VIETNAM } from "./vietnam.js";
import { SERVICES } from "./services.js";
import { MAKING } from "./making.js";
import { CAMBODIA } from "./cambodia.js";
import { WORKS } from "./works.js";
import { DICTIONARY } from "./dictionary.js";

export const PAGES = [HOME, ABOUT, VIETNAM, SERVICES, MAKING, CAMBODIA, WORKS, DICTIONARY];
