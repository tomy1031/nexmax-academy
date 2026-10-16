/* Certificate of completion (修了証): name input + a printable A4 paper (css/print.css prints only .cert-paper). */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;

  /* dictionary words used here (修了証, 研修…) live in js/core/glossary.js */

  /* ---------- date in Japanese: 2026年10月14日, readings written as furigana ---------- */
  const D1 = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
  const THOUSANDS = ['', 'せん', 'にせん', 'さんぜん', 'よんせん', 'ごせん', 'ろくせん', 'ななせん', 'はっせん', 'きゅうせん'];
  const HUNDREDS = ['', 'ひゃく', 'にひゃく', 'さんびゃく', 'よんひゃく', 'ごひゃく', 'ろっぴゃく', 'ななひゃく', 'はっぴゃく', 'きゅうひゃく'];
  const MONTHS = ['', 'いちがつ', 'にがつ', 'さんがつ', 'しがつ', 'ごがつ', 'ろくがつ', 'しちがつ', 'はちがつ', 'くがつ', 'じゅうがつ', 'じゅういちがつ', 'じゅうにがつ'];
  const DAYS = ['', 'ついたち', 'ふつか', 'みっか', 'よっか', 'いつか', 'むいか', 'なのか', 'ようか', 'ここのか', 'とおか',
    'じゅういちにち', 'じゅうににち', 'じゅうさんにち', 'じゅうよっか', 'じゅうごにち', 'じゅうろくにち', 'じゅうしちにち', 'じゅうはちにち', 'じゅうくにち', 'はつか',
    'にじゅういちにち', 'にじゅうににち', 'にじゅうさんにち', 'にじゅうよっか', 'にじゅうごにち', 'にじゅうろくにち', 'にじゅうしちにち', 'にじゅうはちにち', 'にじゅうくにち', 'さんじゅうにち', 'さんじゅういちにち'];

  function yearReading(y) {
    const th = Math.floor(y / 1000) % 10, h = Math.floor(y / 100) % 10, t = Math.floor(y / 10) % 10, o = y % 10;
    const ones = ['', 'いち', 'に', 'さん', 'よ', 'ご', 'ろく', 'なな', 'はち', 'きゅう'][o];
    return THOUSANDS[th] + HUNDREDS[h] + (t ? (t === 1 ? '' : D1[t]) + 'じゅう' : '') + ones + 'ねん';
  }

  /* → furigana markup for "YYYY年M月D日" */
  function dateMarkup(d) {
    return `{${d.getFullYear()}年|${yearReading(d.getFullYear())}}{${d.getMonth() + 1}月|${MONTHS[d.getMonth() + 1]}}{${d.getDate()}日|${DAYS[d.getDate()]}}`;
  }

  /* ---------- the red hanko seal with 読 ---------- */
  let sealN = 0;
  function sealSVG() {
    const id = 'seal' + (++sealN);
    return `<svg class="cert-seal" viewBox="0 0 120 120" aria-hidden="true">
      <defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feComponentTransfer in="n" result="m"><feFuncA type="discrete" tableValues="1 1 1 1 .55 1 1 1 1 .7"/></feComponentTransfer>
        <feComposite in="d" in2="m" operator="in"/>
      </filter></defs>
      <g filter="url(#${id})" fill="none" stroke="#d7261e" transform="rotate(-8 60 60)">
        <circle cx="60" cy="60" r="55" stroke-width="5.5"/>
        <circle cx="60" cy="60" r="46" stroke-width="1.6"/>
        <text x="60" y="81" text-anchor="middle" font-size="62" fill="#d7261e" stroke="none" font-weight="700" style="font-family:var(--font-stamp)">読</text>
      </g>
    </svg>`;
  }

  /* always-visible English line on the paper (a bilingual document) */
  const en = (t, cls) => `<span class="cert-en${cls ? ' ' + cls : ''}">${KY.text.esc(t.en)}</span>`;
  const jp = t => KY.text.html({ jp: t.jp }, { cls: 'cert-jp' });

  /* the name shrinks to stay on one line (full-width characters count 1, others 0.6) */
  function nameSize(name) {
    const w = [...name].reduce((a, ch) => a + (/[ -~]/.test(ch) ? 0.6 : 1), 0);
    return Math.max(3.4, Math.min(7.5, 64 / Math.max(w, 1))).toFixed(2);
  }

  function paper(name, pr, doneCh, totalCh, date) {
    return `
      <article class="cert-paper" id="cert-paper" aria-label="${KY.text.esc(S.cert.en)}">
        <div class="cert-in">
          <div class="cert-eyebrow">KUUKI YOMI · IT EDITION</div>
          <h2 class="cert-title">${KY.text.html({ jp: S.cert.jp }, { cls: 'cert-jp' })}</h2>
          <div class="cert-sub">${KY.text.esc(S.cert.en)}</div>
          <div class="cert-rule" aria-hidden="true"><i></i></div>
          <div class="cert-name" id="cert-name-out" style="font-size:${nameSize(name)}cqw">${KY.text.esc(name)}</div>
          <p class="cert-text">${jp(S.certText)}</p>
          <p class="cert-text-en">${KY.text.esc(S.certText.en)}</p>
          <dl class="cert-meta">
            <div><dt>${jp(S.score)}${en(S.score)}</dt><dd>${pr.pct}<small>%</small></dd></div>
            <div><dt>${jp(S.certRank)}${en(S.certRank)}</dt><dd class="rank">${KY.text.html({ jp: pr.rank.title.jp }, { cls: 'cert-jp', gloss: false })}${en(pr.rank.title, 'rank-en')}</dd></div>
            <div><dt>${jp(S.certChapters)}${en(S.certChapters)}</dt><dd>${doneCh}<small> / ${totalCh}</small></dd></div>
          </dl>
          <div class="cert-foot">
            <div class="cert-sign">
              <div class="cert-date"><span class="cert-lbl">${jp(S.certDate)} · ${KY.text.esc(S.certDate.en)}</span>
                <b>${KY.text.ruby(dateMarkup(date), { gloss: false })}</b></div>
              <div class="cert-issuer"><b>${KY.text.html({ jp: '{空気読|くうきよ}み〜IT{業界編|ぎょうかいへん}〜' }, { cls: 'cert-jp', gloss: false })}</b><span>Kuuki Yomi: IT Edition</span></div>
            </div>
            ${sealSVG()}
          </div>
        </div>
      </article>`;
  }

  UI.cert = {
    dateMarkup,
    /* opts.from: 'title' when opened from the title screen (after clearing every stage) */
    open(opts = {}) {
      const back = () => (opts.from === 'title' ? UI.title.open() : UI.final.open());
      const scr = UI.$('#scr-cert');
      const pr = UI.progress();
      const name = KY.store.load().name || '';
      const withStages = KY.CHAPTERS.filter(c => KY.stagesOf(c.n).length);
      const doneCh = withStages.filter(c => KY.stagesOf(c.n).every(s => pr.s.best[s.id])).length;
      const partial = pr.played < pr.ids.length;

      scr.innerHTML = `
        <div class="topbar">
          ${UI.backBtn('ce-back')}
          <h1>${UI.T(S.cert)}</h1>
          ${UI.enBtn()}
        </div>
        <div class="cert-body">
          <label class="sec cert-field">
            <h3>${UI.L(S.certName)}</h3>
            <input id="ce-name" type="text" maxlength="40" autocomplete="name" enterkeyhint="done"
              value="${KY.text.esc(name)}" placeholder="${KY.text.esc(KY.text.kana(S.certNamePh.jp))}" aria-label="${KY.text.esc(S.certName.en)}">
          </label>
          <div class="cert-sheet" id="ce-sheet">${paper(name, pr, doneCh, withStages.length, new Date())}</div>
          <p class="cert-note">${UI.T(S.certHint)}</p>
          ${partial ? `<p class="cert-note soft">${UI.T(S.certPartial)}</p>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn" type="button" id="ce-close">${UI.L(S.back)}</button>
          <button class="btn primary" type="button" id="ce-save">${UI.L(S.certSave)}</button>
        </div>`;
      UI.show('scr-cert');

      /* scale the A4 paper (794 px wide) to the preview width */
      const sheet = UI.$('#ce-sheet');
      const fit = () => sheet.style.setProperty('--k', String(sheet.clientWidth / 794));
      fit();
      if (root.ResizeObserver) new root.ResizeObserver(fit).observe(sheet);

      const input = UI.$('#ce-name');
      input.addEventListener('input', () => {
        const v = input.value.trim().slice(0, 40);
        const st = KY.store.load();
        st.name = v;
        KY.store.save(st);
        const out = UI.$('#cert-name-out');
        out.textContent = v;
        out.style.fontSize = nameSize(v) + 'cqw';
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      UI.$('#ce-back').onclick = back;
      UI.$('#ce-close').onclick = back;
      const save = UI.$('#ce-save');
      save.onclick = async () => {
        KY.sfx.play('tap');
        save.disabled = true;
        try { await UI.certImage.download(UI.$('#cert-paper'), KY.store.load().name); }
        catch (e) { console.error(e); root.alert(KY.text.plain(S.certSaveError.jp)); }
        finally { save.disabled = false; }
      };
    },
  };
})(window);
