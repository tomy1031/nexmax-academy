/* Play flow: intro card → scene → verdict stamp → manner card. */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;

  UI.play = {
    run: null,
    def: null,

    /* opts.manual: drive the clock by hand (screenshots / tests) */
    open(id, opts = {}) {
      const def = KY.stage(id);
      if (!def) { UI.map.open(); return; }
      this.cleanup();
      this.def = def;
      UI.show('scr-play');
      UI.$('#play-no').textContent = def.id;
      UI.$('#play-title').innerHTML = UI.L(def.title);
      const enSlot = UI.$('#play-en');
      if (enSlot) enSlot.innerHTML = UI.enBtn();
      const bar = UI.$('#timer i');
      bar.style.transform = 'scaleX(1)';
      UI.$('#timer').classList.remove('low');

      const host = UI.$('#scene-host');
      try {
        this.run = KY.run(def, host, { manual: !!opts.manual });
      } catch (e) {
        console.error(e);
        UI.$('#play-layer').innerHTML = `<div class="intro"><div class="intro-card">${UI.T(S.loadError)}</div></div>`;
        return;
      }
      const scene = this.run.scene;
      scene.on('timer', k => {
        bar.style.transform = `scaleX(${(1 - k).toFixed(3)})`;
        UI.$('#timer').classList.toggle('low', k > 0.75);
      });
      scene.on('outcome', () => { scene.root.classList.add('ended'); });
      scene.on('end', key => this.verdict(def, key));
      UI.$('#btn-pause').onclick = () => this.pause();
      this.intro(def);
    },

    intro(def) {
      const ch = UI.chapter(def.chapter);
      const layer = UI.$('#play-layer');
      layer.innerHTML = `
        <div class="intro" role="button" tabindex="0" aria-label="Start stage">
          <div class="intro-card">
            <div class="intro-no">${UI.L(S.stage)}<b>${def.id}</b></div>
            <div class="intro-ch">${UI.L(S.chapter)} ${def.chapter} · ${UI.L(ch.title)}</div>
            <h2 class="intro-title">${UI.TE(def.title)}</h2>
            <p class="intro-sit">${UI.TE(def.intro)}</p>
            <div class="intro-hint"><i></i>${UI.L(S.redRule)}</div>
            <div class="intro-go">${UI.L(S.tapToStart)}</div>
          </div>
        </div>`;
      const go = layer.querySelector('.intro');
      const start = this.startNow = () => {
        if (!go.isConnected) return;
        go.remove();
        KY.sfx.play('pop');
        this.run.begin();
      };
      go.addEventListener('click', start, { once: true });
      go.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
      setTimeout(() => go.focus({ preventScroll: true }), 50);
    },

    verdict(def, key) {
      const o = def.outcomes[key];
      const grade = o ? o.grade : 'ky';
      KY.store.recordBest(def.id, grade);
      const G = UI.GRADE[grade];
      const layer = UI.$('#play-layer');
      layer.innerHTML = `
        <div class="verdict ${grade}" role="dialog" aria-label="${G.head.en}">
          ${UI.stampSVG(grade)}
          <div class="v-head">${UI.T(G.head)}</div>
          ${o && o.line ? `<div class="v-line">${o.who ? `<div class="who">${UI.TE(o.who)}</div>` : ''}<div class="body">${UI.TE(o.line)}</div></div>` : ''}
          <button class="btn primary" type="button" id="v-next">${UI.L(S.seeWhy)} <span aria-hidden="true">→</span></button>
        </div>`;
      KY.sfx.play('stamp');
      setTimeout(() => KY.sfx.play(grade), 260);
      const btn = UI.$('#v-next');
      btn.onclick = () => UI.card.open(def.id, { grade, key, fromPlay: true });
      setTimeout(() => btn.focus({ preventScroll: true }), 600);
    },

    pause() {
      if (!this.run) return;
      const scene = this.run.scene;
      if (scene.ended) return;
      const wasRunning = scene.started;
      scene.pause();
      /* the panel drops from the top and leaves the rest of the screen visible and tappable:
         the choices stay readable and their dictionary words can be looked up (the scene is locked while paused) */
      const m = UI.modal(`
        <h2>${UI.L(S.paused)}</h2>
        <p class="pause-hint">${UI.T(S.pauseHint)}</p>
        <div class="pause-grid">
          <button class="btn primary" data-a="resume" type="button">${UI.L(S.resume)}</button>
          <button class="btn" data-a="retry" type="button">${UI.L(S.retryStage)}</button>
          <button class="btn" data-a="settings" type="button">${UI.L(S.settings)}</button>
          <button class="btn ghost" data-a="map" type="button">${UI.L(S.toChapters)}</button>
        </div>`, { cls: 'pause-sheet', onClose: () => { if (!this.leaving && wasRunning) scene.resume(); } });
      m.el.parentElement.classList.add('modal-pause');
      m.el.querySelectorAll('[data-a]').forEach(b => {
        b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'resume') { m.close(); return; }
          this.leaving = true;
          m.close();
          this.leaving = false;
          if (a === 'retry') this.open(this.def.id);
          else if (a === 'map') { this.cleanup(); UI.map.open(this.def.chapter); }
          else if (a === 'settings') UI.settings.open(() => { if (wasRunning) scene.resume(); });
        };
      });
    },

    cleanup() {
      if (this.run) { this.run.destroy(); this.run = null; }
      const layer = UI.$('#play-layer');
      if (layer) layer.innerHTML = '';
    },
  };
})(window);
