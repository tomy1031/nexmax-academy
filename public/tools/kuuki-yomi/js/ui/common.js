/* Shared UI helpers: screens, modal, stamps, labels, EN toggle, navigation helpers. */
(function (root) {
  const KY = root.KY;
  const doc = root.document;
  const UI = KY.ui;
  const S = KY.S;

  UI.$ = sel => doc.querySelector(sel);
  UI.h = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  /* text with dictionary links (reading areas) */
  UI.T = (t, cls) => KY.text.html(t, cls ? { cls } : undefined);
  /* text without dictionary links (buttons, chips: the whole thing is the tap target) */
  UI.L = (t, cls) => KY.text.html(t, { cls: cls || 'lbl', gloss: false });

  UI.show = function (id) {
    doc.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
    const s = doc.getElementById(id);
    if (s) s.scrollTop = 0;
    UI.current = id;
    UI.dict && UI.dict.close();
  };

  UI.GRADE = {
    great: { head: S.grade.great, stamp: '読', ink: '#d7261e' },
    ok: { head: S.grade.ok, stamp: '可', ink: '#d7261e' },
    ky: { head: S.grade.ky, stamp: 'KY', ink: '#2b2b2b' },
  };
  UI.BADGE = S.badge;

  /* small, quiet English switch shown in every top bar */
  UI.enBtn = () => {
    const on = KY.settings.current().english;
    return `<button class="en-toggle" type="button" data-en-toggle aria-pressed="${on}" aria-label="English on/off">EN</button>`;
  };
  doc.addEventListener('click', e => {
    const b = e.target.closest('[data-en-toggle]');
    if (!b) return;
    const on = !KY.settings.current().english;
    KY.settings.set('english', on);
    KY.sfx.play('tap');
    UI.current && root.requestAnimationFrame(() => UI.play && UI.play.run && UI.play.run.scene.relayout());
  });

  let stampN = 0;
  UI.stampSVG = function (grade, cls = 'stamp') {
    const g = UI.GRADE[grade] || UI.GRADE.ky;
    const id = 'ink' + (++stampN);
    const isKY = g.stamp === 'KY';
    return `<svg class="${cls}" viewBox="0 0 200 200" role="img" aria-label="${KY.text.esc(g.head.en)}">
      <defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${7 + stampN % 5}" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feComponentTransfer in="n" result="m"><feFuncA type="discrete" tableValues="1 1 1 .35 1 1 1 1 .6 1"/></feComponentTransfer>
        <feComposite in="d" in2="m" operator="in"/>
      </filter></defs>
      <g filter="url(#${id})" fill="none" stroke="${g.ink}">
        <circle cx="100" cy="100" r="86" stroke-width="10"/>
        <circle cx="100" cy="100" r="71" stroke-width="3.5"/>
        <text x="100" y="${isKY ? 126 : 132}" text-anchor="middle" font-size="${isKY ? 74 : 92}" fill="${g.ink}" stroke="none" font-weight="700" ${isKY ? 'letter-spacing="-2"' : ''}>${g.stamp}</text>
      </g>
    </svg>`;
  };

  /* bottom-sheet modal; returns { el, close } */
  UI.modal = function (html, { onClose, cls } = {}) {
    const rootEl = UI.$('#modal-root');
    const m = UI.h('div', 'modal');
    const sheet = UI.h('div', 'sheet' + (cls ? ' ' + cls : ''), html);
    m.append(sheet);
    let closed = false;
    const close = () => { if (closed) return; closed = true; m.remove(); if (onClose) onClose(); };
    m.addEventListener('click', e => { if (e.target === m) close(); });
    rootEl.append(m);
    return { el: sheet, close };
  };

  UI.backBtn = (id, label = S.back) =>
    `<button class="icon-btn" id="${id}" type="button" aria-label="${KY.text.esc(label.en)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;

  UI.chapter = n => KY.CHAPTERS.find(c => c.n === n);
  UI.nextStageId = function (id) {
    const all = KY.stages, i = all.findIndex(s => s.id === id);
    return i >= 0 && i < all.length - 1 ? all[i + 1].id : null;
  };
  UI.isLastOfChapter = function (id) {
    const def = KY.stage(id);
    const list = KY.stagesOf(def.chapter);
    return list[list.length - 1].id === id;
  };

  UI.progress = function () {
    const s = KY.store.load();
    const ids = KY.stages.map(x => x.id);
    const played = ids.filter(id => s.best[id]).length;
    const pct = KY.scoring.percent(s.best, ids);
    return { s, ids, played, pct, rank: KY.scoring.rank(pct) };
  };
})(window);
