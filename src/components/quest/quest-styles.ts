/**
 * クエストの 見た目（ドット絵の RPG）— **この ゲームの 中でしか 使わない** CSS
 *
 * 2026-10-20 の 指定「もっと リッチな ドット絵の RPG 風に」で 作りかえた
 *（見本: https://claude.ai/artifact/11ygepKokJFFpvd3Bnp3T6）。
 *
 * ## globals.css に 置かない
 * ドットの 枠・ゆれ・光り・文字送りは この ゲームの 手ざわりで、ほかの 画面は 使わない。
 * テーマの 共有ファイルを 太らせず、すべて `.quest-shell` の 内側に 閉じこめる。
 *
 * ## 字は 2つ
 * - わくの 見出し・数字・名前・ボタン … ドットの 字（DotGothic16・`--font-dot`）
 * - 会話・問い・選択肢・解説（`.qx-t`）… いつもの 丸い 字。**ふりがなを 読みやすく する ため**
 *   （「読めるかが 最優先」・注意事項の 製品の 制約）
 *
 * ## スマホと パソコン
 * 幅は **画面ではなく ゲームの 箱**で 見る（`@container`）。ステージの 中に 埋めこむと
 * 画面が 広くても 箱は せまい ことが ある。
 */
export const QUEST_STYLES = `
.quest-shell {
  --qx-bg: #04050b;
  --qx-win: #0b1024;
  --qx-line: #f4f4f0;
  --qx-dim: #8d96b4;
  --qx-yellow: #ffd84a;
  --qx-red: #ff6464;
  --qx-green: #74e886;
  --qx-blue: #8ccdff;
  --qx-purple: #cfa6ff;
  --qx-teal: #46d1c3;
  background: var(--qx-bg);
  color: #fff;
  font-family: var(--font-dot), var(--font-rounded), ui-monospace, monospace;
}
.quest-shell rt { color: currentColor; font-family: var(--font-rounded), sans-serif; font-weight: 500; }
.quest-shell .qx-t { font-family: var(--font-rounded), sans-serif; font-weight: 700; }
.quest-shell img.qx-px, .quest-shell .qx-px { image-rendering: pixelated; }
.quest-shell button { font-family: inherit; color: inherit; }

/* ドットの わく（9分割の 絵で 角を 1段 けずる） */
.quest-shell .qx-win {
  position: relative;
  border: 8px solid transparent;
  border-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' shape-rendering='crispEdges'%3E%3Cpath fill='%23f4f4f0' d='M2 0h8v1h1v1h1v8h-1v1h-1v1H2v-1H1v-1H0V2h1V1h1z'/%3E%3Cpath fill='%230b1024' d='M2 2h8v8H2z'/%3E%3Cpath fill='%23384266' d='M2 2h8v1H2z'/%3E%3C/svg%3E") 4 fill / 8px / 0 stretch;
  image-rendering: pixelated;
  padding: 4px 6px;
  min-width: 0;
}
.quest-shell .qx-win-title {
  position: absolute; top: -15px; left: 6px; z-index: 2;
  background: var(--qx-bg); color: var(--qx-yellow);
  padding: 0 6px; font-size: 12px; letter-spacing: .14em; line-height: 1.4;
}

.quest-shell .qx-btn {
  --c: var(--qx-line);
  background: var(--qx-win); border: 2px solid var(--c); color: #fff; cursor: pointer;
  padding: 3px 9px; font-size: 12px; line-height: 1.6;
  clip-path: polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px);
}
.quest-shell .qx-btn:hover { background: #1c2448; }
.quest-shell .qx-btn:focus-visible { outline: 2px dashed var(--qx-yellow); outline-offset: 2px; }
.quest-shell .qx-btn:disabled { opacity: .45; cursor: default; }
.quest-shell .qx-btn.qx-on { background: var(--qx-yellow); color: #000; --c: var(--qx-yellow); }
.quest-shell .qx-btn.qx-primary { background: var(--qx-yellow); color: #000; --c: #fff3b0; font-size: 15px; padding: 8px 14px; width: 100%; }
.quest-shell .qx-btn.qx-primary:hover { background: #ffe680; }
.quest-shell .qx-btn.qx-blue { background: #1d3f9a; --c: #fff; font-size: 15px; padding: 8px 14px; width: 100%; }
.quest-shell .qx-btn.qx-blue:hover { background: #2a52bd; }
.quest-shell .qx-btn.qx-danger { --c: var(--qx-red); color: var(--qx-red); }

/* 遊ぶ 画面の 組み立て（スマホ: 上から 1列。パソコン: PARTY と COMMAND を 横に） */
.quest-shell .qx-play { container: qx-play / inline-size; width: 100%; max-width: 1024px; margin: 0 auto; padding: 10px 6px; }
.quest-shell .qx-grid { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); grid-template-areas: "head" "party" "scene" "log" "cmd"; }
.quest-shell .qx-head { grid-area: head; display: grid; gap: 4px; }
.quest-shell .qx-party { grid-area: party; padding: 12px 4px 4px; }
.quest-shell .qx-scene { grid-area: scene; }
.quest-shell .qx-log { grid-area: log; }
.quest-shell .qx-cmd { grid-area: cmd; }
.quest-shell .qx-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.quest-shell .qx-row .qx-sp { flex: 1; }
.quest-shell .qx-meter { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 12px; position: relative; }
.quest-shell .qx-meter img { width: 20px; height: 20px; object-fit: contain; }
.quest-shell .qx-meter b { font-weight: 400; font-size: 14px; }
.quest-shell .qx-meter .qx-lbl { color: var(--qx-dim); }
.quest-shell .qx-coin b { color: var(--qx-yellow); }
.quest-shell .qx-bug b { color: var(--qx-purple); }
.quest-shell .qx-star b { color: var(--qx-blue); }
.quest-shell .qx-bump img { animation: qx-bump .45s steps(3) 2; }
@keyframes qx-bump { 50% { transform: translateY(-4px) scale(1.25); } }

/* 仲間の 札（スマホ: 横に 並べる。パソコン: 縦に 並べる） */
.quest-shell .qx-plist { display: grid; grid-template-columns: repeat(var(--qx-n, 4), minmax(0, 1fr)); }
.quest-shell .qx-pcard { position: relative; min-width: 0; padding: 2px 4px 3px; }
.quest-shell .qx-pcard + .qx-pcard { border-left: 1px solid #262d47; }
.quest-shell .qx-pcard .qx-top { display: flex; align-items: center; gap: 3px; min-width: 0; }
.quest-shell .qx-face { display: inline-block; flex: none; width: 32px; height: 32px; background-repeat: no-repeat; background-size: 210%; image-rendering: pixelated; }
.quest-shell .qx-pcard .qx-face { width: 18px; height: 18px; }
.quest-shell .qx-pcard .qx-nm { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quest-shell .qx-pcard .qx-nums { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--qx-dim); }
.quest-shell .qx-pcard .qx-nums .qx-hp { color: #fff; }
.quest-shell .qx-pcard.qx-down { opacity: .4; filter: grayscale(1); }
.quest-shell .qx-pcard.qx-turn { background: #141b3a; }
.quest-shell .qx-pcard.qx-turn .qx-nm { color: var(--qx-yellow); }
.quest-shell .qx-pcard.qx-turn .qx-nm::before { content: "▶"; margin-right: 2px; animation: qx-blink .8s steps(2) infinite; }
.quest-shell .qx-hpbar { height: 7px; background: #1a1f33; border: 1px solid #000; outline: 1px solid #4a5478; margin-top: 3px; position: relative; overflow: hidden; }
.quest-shell .qx-hpbar i { position: absolute; inset: 0 auto 0 0; background: var(--qx-green); transition: width .5s steps(5); }
.quest-shell .qx-hpbar i.qx-mid { background: var(--qx-yellow); }
.quest-shell .qx-hpbar i.qx-low { background: var(--qx-red); }
.quest-shell .qx-hpbar::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 5px, rgba(0, 0, 0, .45) 5px 6px); }

/* 場面（背景＋相手＋仲間） */
.quest-shell .qx-scene { padding: 0; aspect-ratio: 2 / 1; overflow: hidden; }
.quest-shell .qx-scene .qx-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 70%; }
.quest-shell .qx-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.35), transparent 30%, transparent 70%, rgba(0,0,0,.25)); }
.quest-shell .qx-hud { position: absolute; top: 3px; left: 3px; background: rgba(4, 5, 11, .78); padding: 1px 6px 4px; border: 1px solid #4a5478; max-width: 60%; z-index: 3; }
.quest-shell .qx-hud .qx-ch { font-size: 11px; line-height: 1.35; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.quest-shell .qx-hud .qx-ch em { font-style: normal; color: var(--qx-yellow); margin-right: 4px; }
.quest-shell .qx-blocks { display: flex; gap: 2px; margin-top: 3px; align-items: center; }
.quest-shell .qx-blocks i { width: 8px; height: 6px; background: #262d47; outline: 1px solid #000; }
.quest-shell .qx-blocks i.qx-done { background: var(--qx-teal); }
.quest-shell .qx-blocks i.qx-now { background: var(--qx-yellow); animation: qx-blink 1s steps(2) infinite; }
.quest-shell .qx-blocks span { font-size: 10px; color: var(--qx-dim); margin-left: 4px; white-space: nowrap; }
.quest-shell .qx-enemy { position: absolute; left: 6%; bottom: 2%; height: 69%; aspect-ratio: 1; z-index: 1; }
.quest-shell .qx-enemy img { width: 100%; height: 100%; animation: qx-idle 1.4s steps(2) infinite; }
.quest-shell .qx-enemy.qx-hit img { animation: qx-blink .12s steps(2) 6; }
@keyframes qx-idle { 50% { transform: translateY(-2.5%); } }
@keyframes qx-blink { 50% { opacity: 0; } }
.quest-shell .qx-plate { position: absolute; left: 3%; bottom: 4px; z-index: 2; background: rgba(4, 5, 11, .85); border: 2px solid var(--qx-line); padding: 1px 8px; font-size: 12px; max-width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.quest-shell .qx-troop { position: absolute; right: 3%; top: 10%; bottom: 3%; width: 40%; --mw: 44%; z-index: 1; }
.quest-shell .qx-mem { position: absolute; width: var(--mw); aspect-ratio: 1; transition: transform .3s steps(3); }
.quest-shell .qx-mem img { width: 100%; height: 100%; }
.quest-shell .qx-mem.qx-down img { filter: grayscale(1) brightness(.6); transform: rotate(90deg) translateX(20%); }
.quest-shell .qx-mem.qx-turn { transform: translateX(-28%); }
.quest-shell .qx-mem.qx-turn::before { content: "▼"; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); color: var(--qx-yellow); font-size: 11px; animation: qx-hop .6s steps(2) infinite; z-index: 2; }
.quest-shell .qx-mem.qx-hurt img { animation: qx-hurt .1s steps(2) 6; }
@keyframes qx-hurt { 50% { filter: brightness(0) saturate(100%) invert(30%) sepia(100%) saturate(3000%) hue-rotate(340deg); } }
.quest-shell .qx-mem.qx-act { animation: qx-act .5s steps(3); }
@keyframes qx-act { 40% { transform: translateX(-60%) translateY(-6%); } }
.quest-shell .qx-fx { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
.quest-shell .qx-flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
.quest-shell .qx-flash.qx-red { background: #ff2a2a; }
.quest-shell .qx-flash.qx-go { animation: qx-flash .42s steps(1); }
@keyframes qx-flash { 0% { opacity: .85; } 25% { opacity: 0; } 50% { opacity: .6; } 75%, 100% { opacity: 0; } }
.quest-shell .qx-float { position: absolute; font-size: 18px; transform: translate(-50%, 0); white-space: nowrap; animation: qx-rise 1.1s steps(8) forwards; z-index: 5;
  text-shadow: 2px 0 #000, -2px 0 #000, 0 2px #000, 0 -2px #000, 2px 2px #000, -2px -2px #000, 2px -2px #000, -2px 2px #000; }
.quest-shell .qx-float.qx-exp { color: var(--qx-yellow); }
.quest-shell .qx-float.qx-dmg { color: var(--qx-red); }
.quest-shell .qx-float.qx-bugs { color: var(--qx-purple); font-size: 14px; }
.quest-shell .qx-float.qx-money { color: var(--qx-yellow); font-size: 13px; }
@keyframes qx-rise { 0% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -26px); } }
.quest-shell .qx-spark { position: absolute; width: 14px; height: 14px; background: var(--qx-yellow); clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); animation: qx-spark .7s steps(4) forwards; }
@keyframes qx-spark { 0% { transform: scale(.2); opacity: 1; } 100% { transform: scale(1.4) translateY(-12px); opacity: 0; } }
.quest-shell .qx-banner { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); background: rgba(4,5,11,.9); border: 2px solid var(--qx-yellow); color: var(--qx-yellow); padding: 4px 14px; font-size: 16px; white-space: nowrap; animation: qx-blink .25s steps(2) 4; z-index: 6; }
.quest-shell .qx-card { position: absolute; inset: 0; background: rgba(2, 3, 8, .86); display: grid; place-content: center; text-align: center; gap: 2px; cursor: pointer; z-index: 7; border: 0; width: 100%; }
.quest-shell .qx-card .qx-no { color: var(--qx-yellow); font-size: 24px; letter-spacing: .2em; }
.quest-shell .qx-card .qx-nm { font-size: 20px; }
.quest-shell .qx-card .qx-ds { color: var(--qx-dim); font-size: 12px; }
.quest-shell .qx-card .qx-go { color: var(--qx-dim); font-size: 12px; margin-top: 10px; animation: qx-blink 1s steps(2) infinite; }

/* ログ */
.quest-shell .qx-log { height: 58px; overflow-y: auto; font-size: 12px; line-height: 1.75; scrollbar-width: thin; }
.quest-shell .qx-log p { margin: 0; }
.quest-shell .qx-tone-normal { color: #fff; }
.quest-shell .qx-tone-critical { color: var(--qx-yellow); }
.quest-shell .qx-tone-hit { color: var(--qx-green); }
.quest-shell .qx-tone-miss { color: var(--qx-red); }
.quest-shell .qx-tone-system { color: var(--qx-blue); }

/* COMMAND */
.quest-shell .qx-cmd { min-height: 200px; padding: 10px 8px 8px; }
.quest-shell .qx-talk { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 8px; width: 100%; text-align: left; background: transparent; border: 0; padding: 4px 2px; cursor: pointer; }
.quest-shell .qx-face.qx-portrait { width: 44px; height: 44px; border: 2px solid var(--qx-line); background-color: #1b2448; background-size: 200%; }
.quest-shell .qx-who { color: var(--qx-yellow); font-size: 12px; display: block; }
.quest-shell .qx-say { display: block; font-size: 14px; line-height: 2.05; min-height: 4.1em; }
.quest-shell .qx-say.qx-system { color: #cfd5e6; }
.quest-shell .qx-more { grid-column: 2; text-align: right; color: var(--qx-dim); font-size: 12px; }
.quest-shell .qx-more i { font-style: normal; display: inline-block; animation: qx-hop2 .6s steps(2) infinite; }
@keyframes qx-hop2 { 50% { transform: translateY(-3px); } }
.quest-shell .qx-ask { display: flex; gap: 8px; align-items: flex-start; padding: 2px 2px 8px; border-bottom: 2px dashed #39436a; }
.quest-shell .qx-ask .qx-face { width: 32px; height: 32px; }
.quest-shell .qx-q { font-size: 13.5px; line-height: 2; display: block; }
.quest-shell .qx-opts { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; }
.quest-shell .qx-opt { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 4px; width: 100%; height: 100%; text-align: left; background: transparent; border: 0; padding: 5px 4px; cursor: pointer; font-size: 13px; line-height: 2; }
.quest-shell .qx-opt .qx-cur { color: var(--qx-yellow); visibility: hidden; animation: qx-blink .8s steps(2) infinite; }
.quest-shell .qx-opt:hover, .quest-shell .qx-opt:focus-visible { background: #18204a; outline: none; }
.quest-shell .qx-opt:hover .qx-cur, .quest-shell .qx-opt:focus-visible .qx-cur { visibility: visible; }
.quest-shell .qx-opts li + li { border-top: 1px dotted #2c3558; }
.quest-shell .qx-res { display: grid; gap: 8px; }
.quest-shell .qx-rt { font-size: 14.5px; line-height: 2; }
.quest-shell .qx-ex { font-size: 13px; line-height: 2; background: #070a18; border: 1px solid #39436a; padding: 4px 8px; max-height: 170px; overflow-y: auto; }
.quest-shell .qx-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.quest-shell .qx-chips li { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #39436a; padding: 2px 8px; font-size: 13px; }
.quest-shell .qx-chips img { width: 18px; height: 18px; }

/* しらべる 窓 */
.quest-shell .qx-modal { position: fixed; inset: 0; background: rgba(2, 3, 8, .92); display: grid; place-items: center; padding: 14px; z-index: 50; }
.quest-shell .qx-modal > .qx-win { width: min(100%, 520px); max-height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; padding: 10px; }
.quest-shell .qx-modal h3 { margin: 0; font-weight: 400; color: var(--qx-teal); letter-spacing: .14em; font-size: 15px; display: flex; justify-content: space-between; align-items: center; }
.quest-shell .qx-modal .qx-x { background: transparent; border: 0; font-size: 22px; line-height: 1; color: var(--qx-dim); cursor: pointer; }
.quest-shell .qx-modal .qx-body { overflow-y: auto; min-height: 0; max-height: 60vh; font-size: 13px; line-height: 1.9; }
.quest-shell .qx-falls { display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 10px; align-items: start; }
.quest-shell .qx-falls > img { width: 116px; border: 2px solid #39436a; }
.quest-shell .qx-falls ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; position: relative; }
.quest-shell .qx-falls ol::before { content: ""; position: absolute; left: 11px; top: 6px; bottom: 6px; width: 6px; background: repeating-linear-gradient(180deg, #8ccdff 0 4px, #3d8fd0 4px 8px); animation: qx-water .6s steps(2) infinite; }
@keyframes qx-water { to { background-position: 0 8px; } }
.quest-shell .qx-falls li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 6px; align-items: center; position: relative; }
.quest-shell .qx-falls .qx-n { width: 28px; height: 22px; display: grid; place-items: center; background: #262d47; border: 2px solid #4a5478; font-size: 11px; z-index: 1; }
.quest-shell .qx-falls li.qx-done .qx-n { background: #134a46; border-color: var(--qx-teal); color: var(--qx-teal); }
.quest-shell .qx-falls li.qx-now .qx-n { background: var(--qx-yellow); border-color: #fff; color: #000; }
.quest-shell .qx-falls .qx-l { font-size: 12.5px; line-height: 1.9; color: var(--qx-dim); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.quest-shell .qx-falls li.qx-done .qx-l { color: #c9f2ec; }
.quest-shell .qx-falls li.qx-now .qx-l { color: var(--qx-yellow); }
.quest-shell .qx-falls .qx-me { width: 26px; height: 26px; flex: none; margin-block: -6px; }
.quest-shell .qx-falls .qx-note { grid-column: 1 / -1; color: var(--qx-blue); font-size: 12px; line-height: 1.9; margin: 0; }


@container qx-play (min-width: 640px) {
  .quest-shell .qx-grid { grid-template-columns: 260px minmax(0, 1fr); grid-template-areas: "head head" "scene scene" "log log" "party cmd"; align-items: start; gap: 12px; }
  .quest-shell .qx-head { grid-template-columns: auto 1fr; align-items: center; }
  .quest-shell .qx-head .qx-meters { justify-content: flex-end; gap: 18px; }
  .quest-shell .qx-scene { aspect-ratio: auto; height: 300px; }
  .quest-shell .qx-scene .qx-bg { object-position: 50% 64%; }
  .quest-shell .qx-enemy { left: 16%; height: 86%; }
  .quest-shell .qx-troop { right: 8%; width: 30%; top: 8%; --mw: 32%; }
  .quest-shell .qx-hud .qx-ch { font-size: 13px; }
  .quest-shell .qx-plate { font-size: 14px; left: 12%; }
  .quest-shell .qx-log { height: 66px; font-size: 13px; }
  .quest-shell .qx-party { padding: 14px 8px 6px; }
  .quest-shell .qx-plist { grid-template-columns: minmax(0, 1fr); }
  .quest-shell .qx-pcard { padding: 6px 4px; }
  .quest-shell .qx-pcard + .qx-pcard { border-left: 0; border-top: 1px solid #262d47; }
  .quest-shell .qx-pcard .qx-face { width: 32px; height: 32px; }
  .quest-shell .qx-pcard .qx-top { gap: 6px; }
  .quest-shell .qx-pcard .qx-nm { font-size: 13px; }
  .quest-shell .qx-pcard .qx-nums { font-size: 12px; }
  .quest-shell .qx-cmd { min-height: 250px; padding: 12px 12px 10px; }
  .quest-shell .qx-talk { grid-template-columns: 64px minmax(0, 1fr); gap: 12px; }
  .quest-shell .qx-face.qx-portrait { width: 64px; height: 64px; }
  .quest-shell .qx-say { font-size: 16px; }
  .quest-shell .qx-q, .quest-shell .qx-opt { font-size: 14.5px; }
  .quest-shell .qx-opts { grid-template-columns: 1fr 1fr; column-gap: 10px; }
  .quest-shell .qx-opts li + li { border-top: 0; }
  .quest-shell .qx-opts li { border-bottom: 1px dotted #2c3558; }
  .quest-shell .qx-rt { font-size: 16px; }
  .quest-shell .qx-ex { font-size: 14px; }
  .quest-shell .qx-falls { grid-template-columns: 150px minmax(0, 1fr); }
  .quest-shell .qx-falls > img { width: 150px; }
}

/* タイトル（だれと 遊ぶか） */
.quest-shell .qx-title { position: relative; width: 100%; max-width: 420px; margin: 0 auto; min-height: 640px; overflow: hidden; }
.quest-shell .qx-title > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.quest-shell .qx-title .qx-over { position: relative; min-height: 640px; display: grid; align-content: space-between; gap: 16px; padding: 24px 14px 16px; background: linear-gradient(180deg, rgba(4,5,11,.15), rgba(4,5,11,0) 30%, rgba(4,5,11,.55) 55%, rgba(4,5,11,.92)); }
.quest-shell .qx-logo { text-align: center; line-height: 1.05; font-size: 38px; letter-spacing: .06em; color: #fff; margin: 0; font-weight: 400;
  text-shadow: 3px 0 #0b2b6b, -3px 0 #0b2b6b, 0 3px #0b2b6b, 0 -3px #0b2b6b, 3px 3px #0b2b6b, -3px -3px #0b2b6b, 3px -3px #0b2b6b, -3px 3px #0b2b6b, 0 6px #000; }
.quest-shell .qx-logo span { color: var(--qx-yellow); }
.quest-shell .qx-logo-sub { width: fit-content; margin: 10px auto 0; font-size: 12px; background: rgba(4,5,11,.8); border: 1px solid #4a5478; padding: 0 8px; }
.quest-shell .qx-mlist { display: grid; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.quest-shell .qx-mlist li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.quest-shell .qx-mlist .qx-face { width: 30px; height: 30px; }
.quest-shell .qx-k { width: 20px; height: 20px; flex: none; display: grid; place-items: center; background: #262d47; color: #fff; font-size: 11px; }
.quest-shell .qx-k.qx-me { background: var(--qx-yellow); color: #000; }
.quest-shell .qx-select { width: 100%; min-width: 0; background: #070a18; color: #fff; border: 2px solid #4a5478; padding: 4px 6px; font: inherit; font-size: 13px; }
.quest-shell .qx-select:disabled { opacity: .5; }

/* 終わりの 画面 */
.quest-shell .qx-end { width: 100%; max-width: 640px; margin: 0 auto; padding: 20px 8px; display: grid; gap: 16px; }
.quest-shell .qx-end-title { text-align: center; font-size: 30px; letter-spacing: .12em; margin: 0; font-weight: 400; }
.quest-shell .qx-stats { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.quest-shell .qx-stats li { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid #262d47; padding: 4px 8px; font-size: 13px; }
.quest-shell .qx-stats img { width: 20px; height: 20px; }

@media (prefers-reduced-motion: reduce) {
  .quest-shell *, .quest-shell *::before, .quest-shell *::after { animation: none !important; transition: none !important; }
}
`;
