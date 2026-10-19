/* PLACE — drag the red thing to one of several zones (seats, shelves, pockets...). */
(function (root) {
  const KY = root.KY;
  const { el, g, set, C } = KY.svg;

  const firstKy = def => Object.keys(def.outcomes).find(k => def.outcomes[k].grade === 'ky');
  const posOf = it => (it.o ? { x: it.o.x, y: it.o.y } : it.pos());

  function addHitArea(item) {
    const node = item.el;
    let hit;
    if (KY.TopPerson && item instanceof KY.TopPerson) hit = el('circle', { r: 30, fill: 'transparent' });
    else if (KY.Person && item instanceof KY.Person) hit = el('rect', { x: -28, y: -122, width: 56, height: 124, fill: 'transparent' });
    else hit = el('circle', { r: 30, fill: 'transparent' });
    node.insertBefore(hit, node.firstChild);
  }

  KY.mech.place = {
    start(scene, def, refs) {
      const P = def.params;
      const item = refs[P.item || 'player'];
      const home = posOf(item);
      const zones = P.zones.map(z => Object.assign({ r: 34 }, z));
      let done = false;
      for (const [ms, fn] of P.script || []) scene.at(ms, () => fn(scene, refs));

      const hints = g({ class: 'zones' });
      const rings = zones.map(z => {
        const c = el('circle', { cx: z.x, cy: z.y, r: z.r * 0.8, class: 'zone' });
        hints.append(c);
        return c;
      });
      scene.add('fg', hints);
      const showHints = on => hints.classList.toggle('on', on);
      const nearest = p => {
        let best = null, bd = Infinity;
        for (const z of zones) {
          const d = Math.hypot(p.x - z.x, p.y - z.y);
          if (d < z.r * 1.35 && d < bd) { bd = d; best = z; }
        }
        return best;
      };

      const finish = zone => {
        if (done || !zone) return;
        done = true;
        showHints(false);
        KY.sfx.play('drop');
        scene.glide(item, { x: zone.x, y: zone.y }, 180, 'out', () => {
          const d = P.onPlace ? (P.onPlace(scene, refs, zone) ?? 500) : 500;
          scene.after(d, () => scene.end(zone.outcome));
        });
      };

      addHitArea(item);
      let off = { x: 0, y: 0 };
      scene.onDrag(item.el, {
        start(p) { const q = posOf(item); off = { x: p.x - q.x, y: p.y - q.y }; showHints(true); KY.sfx.play('pick'); },
        move(p) {
          item.moveTo(p.x - off.x, p.y - off.y);
          const z = nearest(posOf(item));
          rings.forEach((r, i) => r.classList.toggle('near', zones[i] === z));
        },
        end() {
          const z = nearest(posOf(item));
          if (z) finish(z);
          else { showHints(false); scene.glide(item, home, 220, 'out'); }
        },
      }, 'You (drag to move)');

      /* tapping a highlighted zone also works (keyboard / accessibility) */
      rings.forEach((r, i) => {
        r.addEventListener('pointerdown', e => {
          if (scene.locked || !hints.classList.contains('on')) return;
          e.stopPropagation();
          finish(zones[i]);
        });
      });

      scene.timer(def.time, () => {
        if (done) return;
        done = true;
        showHints(false);
        scene.end(P.timeout || firstKy(def));
      });
      scene._place = { finish, zones, item, showHints };
    },

    /* input: zone id, or null = never move (wait for the timeout) */
    /* in the model-answer replay (scene.demo): wait until the scene has been set up (its script lines),
       then carry the red thing over to the zone so the viewer can follow it */
    simulate(scene, def, refs, zoneId) {
      if (zoneId == null) return;
      const z = () => {
        const zone = scene._place.zones.find(x => x.id === zoneId);
        if (!zone) throw new Error(`${def.id}: no zone "${zoneId}"`);
        return zone;
      };
      if (!scene.demo) { scene.after(300, () => scene._place.finish(z())); return; }
      const lastLine = Math.max(0, ...(def.params.script || []).map(([ms]) => ms));
      scene.at(lastLine + 1600, () => {
        const zone = z();
        scene._place.showHints(true);
        scene.glide(scene._place.item, { x: zone.x, y: zone.y }, 900, 'inout', () => scene._place.finish(zone));
      });
    },
  };

  /* Wrap any SVG node so it can be dragged by PLACE: { el, pos(), moveTo(x,y) } */
  KY.props.movable = function (node, x, y) {
    const wrap = g({ transform: `translate(${x} ${y})` }, [node.el || node]);
    const c = { el: wrap, x, y };
    c.pos = () => ({ x: c.x, y: c.y });
    c.moveTo = (nx, ny) => { c.x = nx; c.y = ny; set(wrap, { transform: `translate(${nx} ${ny})` }); };
    return c;
  };
})(typeof window !== 'undefined' ? window : globalThis);
