/* Settings sheet: furigana / english / romaji / sound + reset progress. */
(function (root) {
  const KY = root.KY, UI = KY.ui, S = KY.S;

  UI.settings = {
    open(onClose) {
      const s = KY.settings.current();
      const rows = KY.settings.ITEMS.map(it => `
        <label class="toggle"><span>${UI.L(S[it.label])}${it.sub ? `<small>${UI.L(S[it.sub])}</small>` : ''}</span>
          <span class="switch"><input type="checkbox" data-k="${it.key}" ${s[it.key] ? 'checked' : ''}><i></i></span>
        </label>`).join('');
      const m = UI.modal(`
        <h2>${UI.L(S.settings)}</h2>
        ${rows}
        <div class="stack" style="margin-top:16px">
          <button class="btn primary wide" type="button" data-a="done">${UI.L(S.done)}</button>
          <button class="btn ghost wide small" type="button" data-a="reset">${UI.L(S.reset)}</button>
        </div>`, { onClose });
      m.el.querySelectorAll('input[data-k]').forEach(inp => {
        inp.onchange = () => { KY.settings.set(inp.dataset.k, inp.checked); KY.sfx.play('tap'); };
      });
      m.el.querySelector('[data-a=done]').onclick = () => m.close();
      m.el.querySelector('[data-a=reset]').onclick = e => {
        const b = e.currentTarget;
        if (b.dataset.armed) {
          KY.store.reset();
          m.close();
          UI.title.open();
        } else {
          b.dataset.armed = '1';
          b.innerHTML = UI.L(S.resetSure);
        }
      };
    },
  };
})(window);
