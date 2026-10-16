/* Minimal SVG helpers. */
(function (root) {
  const KY = root.KY;
  const NS = 'http://www.w3.org/2000/svg';

  function set(node, attrs) {
    if (!attrs) return node;
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) node.removeAttribute(k);
      else node.setAttribute(k, v);
    }
    return node;
  }

  function el(tag, attrs, children) {
    const node = root.document.createElementNS(NS, tag);
    set(node, attrs);
    if (children) for (const c of [].concat(children)) if (c) node.appendChild(c);
    return node;
  }

  const g = (attrs, children) => el('g', attrs, children);

  function text(x, y, str, attrs) {
    const t = el('text', Object.assign({ x, y }, attrs));
    t.textContent = str;
    return t;
  }

  /* Tokens shared by every drawing so the look stays consistent. */
  const C = {
    ink: '#2b2b2b',
    line: '#3a3a3a',
    soft: '#bdbdbd',
    faint: '#e3e3e3',
    paper: '#ffffff',
    npc: '#4a4a4a',
    npc2: '#8f8f8f',
    red: '#e60012',
    redSoft: '#ffe3e5',
    gold: '#d4a72c',
    water: '#7fb2e5',
    tea: '#9cc27a',
    beer: '#f2b632',
    foam: '#fffaf0',
  };

  const deg = d => (d * Math.PI) / 180;

  KY.svg = { NS, el, g, set, text, C, deg };
})(typeof window !== 'undefined' ? window : globalThis);
