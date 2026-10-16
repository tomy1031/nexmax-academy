/* ORDER — drag red cards into slots in the right order. Slot i expects cards[i]. */
(function (root) {
  const KY = root.KY;
  const { el } = KY.svg;

  function defaultJudge(placed, cards) {
    const n = cards.length;
    const ok = placed.filter((id, i) => id === cards[i].id).length;
    if (ok === n) return 'great';
    if (ok >= Math.ceil(n / 2)) return 'ok';
    return 'ky';
  }

  KY.mech.order = {
    start(scene, def, refs) {
      const P = def.params;
      const cards = P.cards;
      const slots = P.slots.map(s => Object.assign({ w: 96, h: 40, card: null }, s));
      let done = false;
      for (const [ms, fn] of P.script || []) scene.at(ms, () => fn(scene, refs));

      for (const s of slots) {
        scene.add('mid', el('rect', { x: s.x - s.w / 2, y: s.y - s.h / 2, width: s.w, height: s.h, rx: 8, class: 'slot' }));
        if (s.label) scene.label(s.x, s.y - s.h / 2 - 12, s.label, 'slot-label');
      }

      /* tray: shuffled, never already in the correct order */
      let order = cards.map((c, i) => i);
      for (let tries = 0; tries < 20; tries++) {
        order = order.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
        if (order.some((v, i) => v !== i)) break;
      }
      const trayY = (P.tray && P.tray.y) || 570;
      const perRow = Math.min(cards.length, 3);
      const items = order.map((ci, k) => {
        const row = Math.floor(k / perRow), col = k % perRow;
        const rowCount = Math.min(perRow, cards.length - row * perRow);
        const gap = 112;
        const x = 180 + (col - (rowCount - 1) / 2) * gap;
        const y = trayY + row * 50;
        const node = root.document.createElement('div');
        node.className = 'ocard';
        node.innerHTML = KY.text.html(cards[ci].text, { gloss: false });
        const it = scene._track(node, x, y, 'center');
        return { card: cards[ci], node, it, home: { x, y }, slot: null };
      });

      const moveItem = (item, x, y) => { item.it.x = x; item.it.y = y; scene._layoutItem(item.it); };
      const slotAt = p => slots.find(s => Math.abs(p.x - s.x) <= s.w / 2 + 12 && Math.abs(p.y - s.y) <= s.h / 2 + 14);

      function seat(item, slot) {
        if (item.slot) item.slot.card = null;
        if (slot.card && slot.card !== item) {
          const other = slot.card;
          if (item.slot) { seat(other, item.slot); } else { other.slot = null; moveItem(other, other.home.x, other.home.y); other.node.classList.remove('placed'); }
        }
        slot.card = item; item.slot = slot;
        moveItem(item, slot.x, slot.y);
        item.node.classList.add('placed');
        KY.sfx.play('drop');
        if (slots.every(s => s.card)) finish();
      }

      function finish() {
        if (done) return;
        done = true;
        const placed = slots.map(s => (s.card ? s.card.card.id : null));
        slots.forEach((s, i) => { if (s.card) s.card.node.classList.add(placed[i] === cards[i].id ? 'right' : 'wrong'); });
        const key = P.judge ? P.judge(placed) : defaultJudge(placed, cards);
        scene.after(P.settle ?? 1000, () => scene.end(key));
      }

      for (const item of items) {
        let off = null;
        item.node.addEventListener('pointerdown', e => {
          if (scene.locked || done) return;
          e.preventDefault();
          try { item.node.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
          const p = scene.toPoint(e.clientX, e.clientY);
          off = { x: p.x - item.it.x, y: p.y - item.it.y };
          item.node.classList.add('dragging');
          KY.sfx.play('pick');
        });
        item.node.addEventListener('pointermove', e => {
          if (!off) return;
          const p = scene.toPoint(e.clientX, e.clientY);
          moveItem(item, p.x - off.x, p.y - off.y);
        });
        const up = () => {
          if (!off) return;
          off = null;
          item.node.classList.remove('dragging');
          if (done || scene.locked) return;
          const s = slotAt({ x: item.it.x, y: item.it.y });
          if (s) seat(item, s);
          else {
            if (item.slot) { item.slot.card = null; item.slot = null; item.node.classList.remove('placed'); }
            moveItem(item, item.home.x, item.home.y);
          }
        };
        item.node.addEventListener('pointerup', up);
        item.node.addEventListener('pointercancel', up);
        /* keyboard: Enter puts the card into the first empty slot */
        item.node.tabIndex = 0;
        item.node.setAttribute('role', 'button');
        item.node.addEventListener('keydown', e => {
          if ((e.key === 'Enter' || e.key === ' ') && !done && !scene.locked) {
            e.preventDefault();
            const s = slots.find(x => !x.card);
            if (s) seat(item, s);
          }
        });
      }

      scene.timer(def.time, () => { if (!done) finish(); });
      scene._order = {
        placeAll(ids) { ids.forEach((id, i) => { const item = items.find(x => x.card.id === id); seat(item, slots[i]); }); },
      };
    },

    simulate(scene, def, refs, ids) {
      scene.after(300, () => scene._order.placeAll(ids));
    },
  };

  KY.mech.order.defaultJudge = defaultJudge;
})(typeof window !== 'undefined' ? window : globalThis);
