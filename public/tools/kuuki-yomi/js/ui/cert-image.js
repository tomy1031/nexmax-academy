/* Certificate → JPG. The paper on screen (.cert-paper, laid out at A4 = 794 × 1123 px and scaled down)
   is copied onto a canvas character by character, at the positions the browser already laid out —
   so furigana, letter spacing and line breaks match the preview. No library, works offline. */
(function (root) {
  const KY = root.KY, UI = KY.ui;
  const PW = 794, PH = 1123, SCALE = 2;

  /* every character of every visible text node, drawn where the browser put it */
  function drawText(ctx, paper, box) {
    const doc = root.document;
    const walker = doc.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    for (let node; (node = walker.nextNode());) {
      const host = node.parentElement;
      if (!host || host.closest('svg')) continue;
      const cs = root.getComputedStyle(host);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.fillStyle = cs.color;
      const text = node.data;
      for (let i = 0; i < text.length;) {
        const ch = String.fromCodePoint(text.codePointAt(i));
        range.setStart(node, i);
        range.setEnd(node, i + ch.length);
        i += ch.length;
        if (!ch.trim()) continue;
        const r = range.getClientRects()[0];
        if (!r || !r.width) continue;
        const b = box(r);
        const m = ctx.measureText(ch);
        const fs = parseFloat(cs.fontSize);
        const asc = m.fontBoundingBoxAscent || fs * 0.88, desc = m.fontBoundingBoxDescent || fs * 0.12;
        ctx.fillText(ch, b.x, b.y + (b.h - (asc + desc)) / 2 + asc);
      }
    }
  }

  /* solid borders of the elements (name line, meta table, issuer line) */
  function drawBorders(ctx, paper, box) {
    for (const el of paper.querySelectorAll('*')) {
      if (el.closest('svg')) continue;
      const cs = root.getComputedStyle(el);
      if (cs.display === 'none') continue;
      const b = box(el.getBoundingClientRect());
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const w = parseFloat(cs[`border${side}Width`]);
        if (!w || cs[`border${side}Style`] === 'none') continue;
        ctx.fillStyle = cs[`border${side}Color`];
        if (side === 'Top') ctx.fillRect(b.x, b.y, b.w, w);
        if (side === 'Bottom') ctx.fillRect(b.x, b.y + b.h - w, b.w, w);
        if (side === 'Left') ctx.fillRect(b.x, b.y, w, b.h);
        if (side === 'Right') ctx.fillRect(b.x + b.w - w, b.y, w, b.h);
      }
    }
  }

  /* the double frame (::before / ::after of .cert-in) and the gold rule with its diamond */
  function drawFrame(ctx, paper, box) {
    const ink = root.getComputedStyle(paper).color;
    ctx.strokeStyle = ink;
    [[0.04, 0.0045], [0.055, 0.0016]].forEach(([inset, lw]) => {
      const d = PW * inset, w = PW * lw;
      ctx.lineWidth = w;
      ctx.strokeRect(d + w / 2, d + w / 2, PW - 2 * d - w, PH - 2 * d - w);
    });
    const rule = paper.querySelector('.cert-rule');
    if (rule) {
      const b = box(rule.getBoundingClientRect());
      ctx.fillStyle = root.getComputedStyle(rule).backgroundColor;
      ctx.fillRect(b.x, b.y, b.w, Math.max(b.h, 1));
      const s = PW * 0.016;
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  /* the red 読 seal, with a little ink texture like a real hanko */
  function drawSeal(ctx, paper, box) {
    const svg = paper.querySelector('.cert-seal');
    if (!svg) return;
    const b = box(svg.getBoundingClientRect());
    const R = b.w / 2, k = b.w / 120, red = '#d7261e';
    const font = root.getComputedStyle(root.document.documentElement).getPropertyValue('--font-stamp') || 'serif';
    const tmp = root.document.createElement('canvas');
    tmp.width = tmp.height = Math.ceil(b.w * SCALE);
    const t = tmp.getContext('2d');
    t.scale(SCALE, SCALE);
    t.translate(R, R);
    t.rotate(-8 * Math.PI / 180);
    t.strokeStyle = red;
    t.lineWidth = 5.5 * k; t.beginPath(); t.arc(0, 0, 55 * k, 0, Math.PI * 2); t.stroke();
    t.lineWidth = 1.6 * k; t.beginPath(); t.arc(0, 0, 46 * k, 0, Math.PI * 2); t.stroke();
    t.fillStyle = red;
    t.font = `700 ${62 * k}px ${font}`;
    t.textAlign = 'center';
    t.fillText('読', 0, 21 * k);
    /* ink texture: punch tiny holes */
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'destination-out';
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      t.globalAlpha = 0.35 + rnd() * 0.5;
      t.beginPath();
      t.arc(rnd() * tmp.width, rnd() * tmp.height, (0.4 + rnd() * 1.3) * SCALE, 0, Math.PI * 2);
      t.fill();
    }
    ctx.drawImage(tmp, b.x, b.y, b.w, b.w);
  }

  async function render(paper) {
    if (root.document.fonts && root.document.fonts.ready) { try { await root.document.fonts.ready; } catch (e) { /* draw with what we have */ } }
    const P = paper.getBoundingClientRect();
    const k = P.width / PW;
    const box = r => ({ x: (r.left - P.left) / k, y: (r.top - P.top) / k, w: r.width / k, h: r.height / k });
    const cv = root.document.createElement('canvas');
    cv.width = PW * SCALE; cv.height = PH * SCALE;
    const ctx = cv.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PW, PH);
    drawFrame(ctx, paper, box);
    drawBorders(ctx, paper, box);
    drawText(ctx, paper, box);
    drawSeal(ctx, paper, box);
    return cv;
  }

  /* 修了証_名前_20261016.jpg */
  function fileName(name) {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const safe = String(name || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30);
    return `修了証${safe ? '_' + safe : ''}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.jpg`;
  }

  UI.certImage = {
    render,
    async download(paper, name) {
      const cv = await render(paper);
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('could not make the image');
      const url = URL.createObjectURL(blob);
      const a = root.document.createElement('a');
      a.href = url;
      a.download = fileName(name);
      root.document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return blob;
    },
  };
})(window);
