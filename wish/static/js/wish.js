// WISH project page: navbar, equations, BibTeX copy, caption explorer, method walkthrough, look-ahead explorer.
(function () {
  'use strict';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- navbar burger (mobile)
  document.querySelectorAll('.navbar-burger').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById(b.dataset.target);
      b.classList.toggle('is-active');
      t.classList.toggle('is-active');
      b.setAttribute('aria-expanded', b.classList.contains('is-active'));
    });
  });
  document.querySelectorAll('.navbar-menu a').forEach(function (a) {
    a.addEventListener('click', function () {
      document.querySelectorAll('.navbar-burger, .navbar-menu').forEach(function (e) { e.classList.remove('is-active'); });
    });
  });

  if (window.renderMathInElement) {
    renderMathInElement(document.body, { delimiters: [{ left: '$$', right: '$$', display: true }], throwOnError: false });
  }

  // ---- BibTeX copy
  var copyBtn = document.getElementById('copyBib');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var pre = document.getElementById('bibtexText');
      var label = copyBtn.querySelector('span:last-child');
      var done = function () { label.textContent = 'Copied'; setTimeout(function () { label.textContent = 'Copy'; }, 1500); };
      var select = function () { var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      try { navigator.clipboard.writeText(pre.innerText).then(done, select); } catch (e) { select(); }
    });
  }

  // ===================================================================== heatmap drawing (shared)
  // matplotlib "jet" segment data, sampled as a 256-entry colormap
  var JET = (function () {
    var seg = {
      r: [[0, 0], [0.35, 0], [0.66, 1], [0.89, 1], [1, 0.5]],
      g: [[0, 0], [0.125, 0], [0.375, 1], [0.64, 1], [0.91, 0], [1, 0]],
      b: [[0, 0.5], [0.11, 1], [0.34, 1], [0.65, 0], [1, 0]]
    };
    function at(s, x) {
      for (var i = 1; i < s.length; i++) {
        if (x <= s[i][0]) { var a = s[i - 1], c = s[i]; return a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]); }
      }
      return s[s.length - 1][1];
    }
    var lut = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var x = i / 255;
      lut[3 * i] = Math.round(at(seg.r, x) * 255);
      lut[3 * i + 1] = Math.round(at(seg.g, x) * 255);
      lut[3 * i + 2] = Math.round(at(seg.b, x) * 255);
    }
    return lut;
  })();

  // bicubic weights as OpenCV INTER_CUBIC (A = -0.75), pixel-centre alignment, replicated border
  function cubicTaps(src, dst) {
    var A = -0.75, taps = [], scale = src / dst;
    for (var x = 0; x < dst; x++) {
      var fx = (x + 0.5) * scale - 0.5, ix = Math.floor(fx), t = fx - ix, u = 1 - t;
      var w0 = ((A * (t + 1) - 5 * A) * (t + 1) + 8 * A) * (t + 1) - 4 * A;
      var w1 = ((A + 2) * t - (A + 3)) * t * t + 1;
      var w2 = ((A + 2) * u - (A + 3)) * u * u + 1;
      var idx = [ix - 1, ix, ix + 1, ix + 2].map(function (k) { return Math.min(src - 1, Math.max(0, k)); });
      taps.push([idx, [w0, w1, w2, 1 - w0 - w1 - w2]]);
    }
    return taps;
  }
  function decode(b64) {
    var s = atob(b64), a = new Float32Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) / 255;
    return a;
  }
  function upsample(grid, gh, gw, H, W) {
    var tx = cubicTaps(gw, W), ty = cubicTaps(gh, H), tmp = new Float32Array(gh * W), out = new Float32Array(H * W);
    for (var r = 0; r < gh; r++) for (var x = 0; x < W; x++) {
      var t = tx[x], v = 0;
      for (var k = 0; k < 4; k++) v += t[1][k] * grid[r * gw + t[0][k]];
      tmp[r * W + x] = v;
    }
    for (var y = 0; y < H; y++) {
      var q = ty[y];
      for (var x2 = 0; x2 < W; x2++) {
        var v2 = 0;
        for (var k2 = 0; k2 < 4; k2++) v2 += q[1][k2] * tmp[q[0][k2] * W + x2];
        out[y * W + x2] = v2;
      }
    }
    return out;
  }
  // overlay as in the paper's figures: bicubic upsampling, min-max, jet, 50 % over the image
  function overlay(base, mapB64, gh, gw) {
    var W = base.width, H = base.height, out = new ImageData(W, H), px = out.data, im = base.data;
    var m = upsample(decode(mapB64), gh, gw, H, W), lo = Infinity, hi = -Infinity;
    for (var i = 0; i < m.length; i++) { if (m[i] < lo) lo = m[i]; if (m[i] > hi) hi = m[i]; }
    var rng = Math.max(hi - lo, 1e-12);
    for (var p = 0; p < m.length; p++) {
      var c = Math.min(255, Math.floor((m[p] - lo) / rng * 256));
      for (var ch = 0; ch < 3; ch++) px[4 * p + ch] = Math.min(255, Math.floor(0.5 * im[4 * p + ch] + 0.5 * JET[3 * c + ch]));
      px[4 * p + 3] = 255;
    }
    return out;
  }
  function draw(canvas, imageData) {
    canvas.width = imageData.width; canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
  }
  function drawMissing(canvas, base, text) {
    canvas.width = base.width; canvas.height = base.height;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(base, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillRect(0, 0, base.width, base.height);
    ctx.fillStyle = '#5f6368'; ctx.textAlign = 'center';
    ctx.font = Math.round(base.width / 18) + 'px "Noto Sans", sans-serif';
    ctx.fillText(text, base.width / 2, base.height / 2);
  }
  var baseCache = {};
  function loadBase(src, cb) {
    if (baseCache[src]) { cb(baseCache[src]); return; }
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      baseCache[src] = ctx.getImageData(0, 0, c.width, c.height);
      cb(baseCache[src]);
    };
    img.src = src;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  // words come without spaces: one before each word except closing punctuation
  function needsSpace(words, i) {
    return i > 0 && !/^[,.;:!?)\]'’%]/.test(words[i]) && !/[(\[]$/.test(words[i - 1]);
  }

  // ===================================================================== caption explorer
  (function explorer() {
    var EX = window.WISH_EXAMPLES || [];
    var tabs = document.getElementById('exTabs');
    if (!EX.length || !tabs) return;
    var cap = document.getElementById('exCaption');
    var cv = { image: document.getElementById('cvImage'), wish: document.getElementById('cvWish'),
               tam: document.getElementById('cvTam'), dexar: document.getElementById('cvDexar') };
    var state = { ex: null, base: null, pinned: null, cache: {} };

    function showWord(wi) {
      var ex = state.ex, w = ex.words[wi];
      if (!w || !w.maps || !state.base) return;
      cap.querySelectorAll('.w').forEach(function (s) { s.classList.toggle('active', +s.dataset.i === wi); });
      ['wish', 'tam', 'dexar'].forEach(function (k) {
        var key = ex.key + ':' + wi + ':' + k;
        if (!w.maps[k]) { drawMissing(cv[k], state.base, 'no map at the first token'); return; }
        if (!state.cache[key]) state.cache[key] = overlay(state.base, w.maps[k], ex.grid[0], ex.grid[1]);
        draw(cv[k], state.cache[key]);
      });
    }
    function selectExample(i) {
      var ex = EX[i];
      state.ex = ex; state.pinned = ex.first; state.base = null;
      tabs.querySelectorAll('.ex-tab').forEach(function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      document.getElementById('exModel').textContent = ex.model;
      document.getElementById('exData').textContent = ex.dataset;
      document.getElementById('exLabel').textContent = ex.label;
      cap.innerHTML = '';
      var texts = ex.words.map(function (w) { return w.text.trim(); });
      ex.words.forEach(function (w, wi) {
        if (needsSpace(texts, wi)) cap.appendChild(document.createTextNode(' '));
        var s = el('span', w.maps ? 'w' : 'nomap', texts[wi]);
        if (w.maps) {
          s.dataset.i = wi; s.tabIndex = 0; s.setAttribute('role', 'button');
          s.addEventListener('mouseenter', function () { showWord(wi); });
          s.addEventListener('mouseleave', function () { if (state.pinned !== null) showWord(state.pinned); });
          s.addEventListener('click', function () { state.pinned = wi; showWord(wi); });
          s.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.pinned = wi; showWord(wi); }
          });
        }
        cap.appendChild(s);
      });
      loadBase('static/explorer/' + ex.image, function (base) {
        if (state.ex !== ex) return;
        state.base = base; draw(cv.image, base);
        showWord(state.pinned !== null ? state.pinned : ex.words.findIndex(function (w) { return w.maps; }));
      });
    }
    EX.forEach(function (ex, i) {
      var b = el('button', 'ex-tab'); b.type = 'button'; b.setAttribute('role', 'tab');
      b.innerHTML = '<img alt="" loading="lazy" src="static/explorer/' + ex.image + '"><span><b>' +
        ex.model.replace('LLaVA-OneVision', 'LLaVA-OV') + '</b><br>' + ex.label + '</span>';
      b.addEventListener('click', function () { selectExample(i); });
      tabs.appendChild(b);
    });
    selectExample(0);
  })();

  // ===================================================================== look-ahead explorer
  (function lookahead() {
    var X = window.WISH_LOOKAHEAD, pick = document.getElementById('laPick');
    if (!X || !pick) return;
    var pairs = [];
    X.words.forEach(function (w, i) {     // an article right before a noun: "A woman", "a horse"
      var t = w.text.trim().toLowerCase(), n = X.words[i + 1];
      if ((t === 'a' || t === 'an') && n && /^(woman|horse)$/i.test(n.text.trim())) pairs.push([i, i + 1]);
    });
    var cap = document.getElementById('laCaption'), grid = document.getElementById('laGrid'), base = null, cur = 0;
    var texts = X.words.map(function (w) { return w.text.trim(); });
    // the grid is built once; switching examples only redraws the canvases, so nothing moves
    grid.appendChild(el('div', 'la-head'));
    ['Image', 'WISH (ours)', 'TAM', 'DEX-AR'].forEach(function (h, j) { grid.appendChild(el('div', 'la-head' + (j === 1 ? ' ours' : ''), h)); });
    var rows = [0, 1].map(function () {
      var r = { label: el('div', 'la-rowlabel'), cv: [el('canvas'), el('canvas'), el('canvas'), el('canvas')] };
      grid.appendChild(r.label); r.cv.forEach(function (c) { grid.appendChild(c); });
      return r;
    });
    // mask outlines as in supp. Fig. S3: solid = the object this article introduces, dashed = the other object
    function outlines(cv, own) {
      var M = X.masks || {}, ctx = cv.getContext('2d'), lw = Math.max(2, cv.width / 170);
      Object.keys(M).forEach(function (name) {
        ctx.save();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw; ctx.lineJoin = 'round';
        ctx.setLineDash(name === own ? [] : [lw * 3.2, lw * 2.2]);
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = lw;
        M[name].forEach(function (poly) {
          ctx.beginPath();
          poly.forEach(function (pt, i) { if (i) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); });
          ctx.closePath(); ctx.stroke();
        });
        ctx.restore();
      });
    }
    function render() {
      var p = pairs[cur];
      pick.querySelectorAll('button').forEach(function (b, j) { b.setAttribute('aria-selected', j === cur ? 'true' : 'false'); });
      cap.innerHTML = '';
      texts.forEach(function (t, i) {
        if (needsSpace(texts, i)) cap.appendChild(document.createTextNode(' '));
        cap.appendChild(el('span', i === p[0] ? 'la-fw' : (i === p[1] ? 'la-noun' : ''), t));
      });
      [[p[0], 'article'], [p[1], 'noun']].forEach(function (row, ri) {
        var w = X.words[row[0]], r = rows[ri];
        r.label.innerHTML = '“' + texts[row[0]] + '”<small>' + row[1] + '</small>';
        if (!base) return;
        r.cv.forEach(function (c) { c.style.aspectRatio = base.width + ' / ' + base.height; });
        var own = texts[p[1]].toLowerCase();
        draw(r.cv[0], base); outlines(r.cv[0], own);
        ['wish', 'tam', 'dexar'].forEach(function (k, j) {
          if (w.maps[k]) draw(r.cv[j + 1], overlay(base, w.maps[k], X.grid[0], X.grid[1]));
          else drawMissing(r.cv[j + 1], base, 'no map at the first token');
          outlines(r.cv[j + 1], own);
        });
      });
    }
    pairs.forEach(function (p, j) {
      var b = el('button', 'la-btn'); b.type = 'button'; b.setAttribute('role', 'tab');
      b.innerHTML = '<span class="la-fw">' + texts[p[0]] + '</span> ' + texts[p[1]];
      b.addEventListener('click', function () { cur = j; render(); });
      pick.appendChild(b);
    });
    render();
    loadBase('static/explorer/' + X.image, function (b) { base = b; render(); });
  })();

  // ===================================================================== method walkthrough
  (function method() {
    var M = window.WISH_METHOD || [], exBox = document.getElementById('mwExamples');
    if (!M.length || !exBox) return;
    var ACCENT = '#c0392b', SVGNS = 'http://www.w3.org/2000/svg';
    var gridCv = document.getElementById('mwGrid'), curve = document.getElementById('mwCurve');
    var filt = document.getElementById('mwFilter'), agg = document.getElementById('mwAgg');
    var titleEl = document.getElementById('mwTitle'), textEl = document.getElementById('mwText');
    var playBtn = document.getElementById('mwPlay');
    var S = { ex: null, base: null, step: 1, playing: false, token: 0, timers: [], raf: null, autoplayed: false, cleanup: [] };
    // animation length and the pause after it before the next step (ms)
    var ANIM = { 1: 3600, 2: 4600, 3: 7000, 4: 3400 }, HOLD = { 1: 2200, 2: 2600, 3: 2200, 4: 3000 };

    function fmt(n) { return n.toLocaleString('en-US'); }
    function word() { return S.ex.words[S.ex.target]; }
    var STEPS = {
      1: ['Head Ranking', function () { return 'WISH scores all ' + fmt(S.ex.layers * S.ex.heads) + ' attention heads for “' + word() + '”. The score estimates how much the word’s logit at the head’s layer would drop if the head could no longer see the image tokens that support the word. Darker cells are more important.'; }],
      2: ['Adaptive Head Selection', function () { return 'Sorted from highest to lowest, the scores fall steeply and then flatten. WISH keeps every head before the knee: ' + S.ex.n_selected + ' of ' + fmt(S.ex.layers * S.ex.heads) + ' for “' + word() + '”, without a fixed head budget. The grid from (a) shows which heads they are.'; }],
      3: ['Per-Head Spatial Filtering', function () { return 'Each kept head’s positive attention gradients form a map over the image. A 3×3 median filter removes isolated spikes. Shown here: the three highest-ranked kept heads, numbered 1 to 3 in the grid.'; }],
      4: ['Cross-Head Aggregation', function () { return 'A weighted median merges the filtered maps of all ' + S.ex.n_selected + ' kept heads, with higher-ranked heads weighing more. The result is WISH’s explanation of “' + word() + '”.'; }]
    };
    function svg(tag, attrs, parent) {
      var e = document.createElementNS(SVGNS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }
    function stopAll() {
      S.token++; cancelAnimationFrame(S.raf);
      S.timers.forEach(clearTimeout); S.timers = [];
      S.cleanup.forEach(function (f) { f(); }); S.cleanup = [];
    }
    function later(ms, fn) { var tok = S.token; S.timers.push(setTimeout(function () { if (tok === S.token) fn(); }, REDUCED ? 0 : ms)); }
    function tween(ms, fn, done) {
      var tok = S.token;
      if (REDUCED) { fn(1); if (done) done(); return; }
      var t0 = performance.now();
      (function frame(now) {
        if (tok !== S.token) return;
        var p = Math.min(1, (now - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;  // ease in-out
        fn(e);
        if (p < 1) S.raf = requestAnimationFrame(frame); else if (done) done();
      })(t0);
    }

    // ---- (a) score grid: layer 1 at the bottom, filled upwards
    function gridImage(progress, withSel, cell) {
      var ex = S.ex, L = ex.layers, H = ex.heads, sc = decode(ex.scores);
      var c = document.createElement('canvas'); c.width = H * cell; c.height = L * cell;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#f3f3f6'; ctx.fillRect(0, 0, c.width, c.height);
      var rows = progress * L;
      for (var l = 0; l < L; l++) {
        var a = Math.max(0, Math.min(1, rows - l));
        if (a <= 0) break;
        for (var h = 0; h < H; h++) {
          var v = Math.sqrt(sc[l * H + h]) * a, g = Math.round(243 - v * 218);
          ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + (g + 3) + ')';
          ctx.fillRect(h * cell, (L - 1 - l) * cell, cell - 1, cell - 1);
        }
      }
      if (withSel) {
        ctx.strokeStyle = ACCENT; ctx.lineWidth = Math.max(1, cell / 5);
        ex.selected.forEach(function (i) {
          var l = Math.floor(i / H), h = i % H;
          ctx.strokeRect(h * cell + 0.5, (L - 1 - l) * cell + 0.5, cell - 2, cell - 2);
        });
      }
      return c;
    }
    function drawGrid(progress) {
      var g = gridImage(progress, false, 8);
      gridCv.width = g.width; gridCv.height = g.height;
      gridCv.getContext('2d').drawImage(g, 0, 0);
    }

    // ---- (b) curve with axes; knee and the kept heads in a small grid
    function drawCurve(progress, kneeShown) {
      var ex = S.ex, n = ex.curve.length, k = ex.n_selected, N = ex.layers * ex.heads;
      while (curve.firstChild) curve.removeChild(curve.firstChild);
      var x0 = 66, x1 = 425, y0 = 22, y1 = 238;
      var X = function (r) { return x0 + (x1 - x0) * Math.log10(r) / Math.log10(n); };
      var Y = function (v) { return y1 - (y1 - y0) * v; };
      var kx = X(k);
      var shade = svg('rect', { x: x0, y: y0, width: Math.max(0, kx - x0), height: y1 - y0, fill: ACCENT, 'fill-opacity': 0 }, curve);
      [0, 0.5, 1].forEach(function (v) { svg('line', { x1: x0, y1: Y(v), x2: x1, y2: Y(v), stroke: '#e6e8eb' }, curve); });
      svg('line', { x1: x0, y1: y1, x2: x1, y2: y1, stroke: '#5f6368', 'stroke-width': 1.2 }, curve);
      svg('line', { x1: x0, y1: y0, x2: x0, y2: y1, stroke: '#5f6368', 'stroke-width': 1.2 }, curve);
      [1, 10, 100, 1000].forEach(function (r) {
        if (r > n) return;
        svg('line', { x1: X(r), y1: y1, x2: X(r), y2: y1 + 5, stroke: '#5f6368' }, curve);
        svg('text', { x: X(r), y: y1 + 20, 'text-anchor': 'middle', class: 'mw-tick' }, curve).textContent = fmt(r);
      });
      [[0, '0'], [0.5, '0.5'], [1, '1']].forEach(function (p) {
        svg('line', { x1: x0 - 5, y1: Y(p[0]), x2: x0, y2: Y(p[0]), stroke: '#5f6368' }, curve);
        svg('text', { x: x0 - 9, y: Y(p[0]) + 4, 'text-anchor': 'end', class: 'mw-tick' }, curve).textContent = p[1];
      });
      svg('text', { x: (x0 + x1) / 2, y: 290, 'text-anchor': 'middle', class: 'mw-axis-label' }, curve).textContent = 'Head rank (sorted by score, log scale)';
      svg('text', { x: 20, y: (y0 + y1) / 2, 'text-anchor': 'middle', class: 'mw-axis-label', transform: 'rotate(-90 20 ' + (y0 + y1) / 2 + ')' }, curve).textContent = 'Normalized score';
      var pts = [], m = progress <= 0 ? 0 : Math.max(2, Math.round(progress * n));
      for (var i = 0; i < m; i++) pts.push(X(i + 1).toFixed(1) + ',' + Y(ex.curve[i]).toFixed(1));
      if (m) svg('polyline', { points: pts.join(' '), fill: 'none', stroke: '#2f3a45', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, curve);
      if (!kneeShown) return;
      var kp = kneeShown === true ? 1 : kneeShown;                       // 0..1
      var e = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
      var travel = e(kp / 0.45), grow = e((kp - 0.45) / 0.55);
      var rf = Math.exp(travel * Math.log(k)), r0 = Math.floor(rf), fr = rf - r0;   // continuous rank, log scale
      var vy = r0 >= k ? ex.curve[k - 1] : ex.curve[r0 - 1] * (1 - fr) + ex.curve[r0] * fr;
      shade.setAttribute('width', Math.max(0, (kx - x0) * grow));
      shade.setAttribute('fill-opacity', 0.09 * grow);
      if (grow > 0) svg('line', { x1: kx, y1: y0, x2: kx, y2: y0 + (y1 - y0) * grow, stroke: ACCENT, 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }, curve);
      svg('circle', { cx: X(rf), cy: Y(vy), r: 5.5 + 1.5 * Math.sin(Math.PI * grow), fill: ACCENT }, curve);
      var t1 = svg('text', { x: kx - 8, y: y0 + 16, 'text-anchor': 'end', class: 'mw-knee', opacity: grow }, curve); t1.textContent = 'knee: ' + k + ' heads kept';
      var t2 = svg('text', { x: (x0 + kx) / 2, y: y1 - 10, 'text-anchor': 'middle', class: 'mw-kept', opacity: grow }, curve); t2.textContent = 'kept';
    }

    // ---- the head grid travels between panels
    function drawMini(cv, selProgress) {
      var g = gridImage(1, false, 8), ex = S.ex, L = ex.layers, H = ex.heads, cell = 8;
      cv.width = g.width; cv.height = g.height;
      var ctx = cv.getContext('2d'); ctx.drawImage(g, 0, 0);
      var n = Math.round((selProgress || 0) * ex.selected.length);
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 2;
      ex.selected.slice(0, n).forEach(function (i) {
        ctx.strokeRect((i % H) * cell + 1, (L - 1 - Math.floor(i / H)) * cell + 1, cell - 2, cell - 2);
      });
    }
    function fly(from, to, ms, done) {
      var stage = document.getElementById('mwStage'), sr = stage.getBoundingClientRect();
      var a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      if (REDUCED || !a.width || !b.width) { if (done) done(); return; }
      var c = document.createElement('canvas'); c.width = from.width; c.height = from.height;
      c.getContext('2d').drawImage(from, 0, 0); c.className = 'mw-fly';
      var place = function (r) { c.style.left = (r.left - sr.left) + 'px'; c.style.top = (r.top - sr.top) + 'px'; c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; };
      place(a); stage.appendChild(c); to.style.visibility = 'hidden';
      void c.offsetWidth;
      c.style.transition = 'left ' + ms + 'ms cubic-bezier(.45,0,.2,1), top ' + ms + 'ms cubic-bezier(.45,0,.2,1), width ' + ms + 'ms cubic-bezier(.45,0,.2,1), height ' + ms + 'ms cubic-bezier(.45,0,.2,1)';
      place(b);
      later(ms + 60, function () { c.remove(); to.style.visibility = ''; if (done) done(); });
      S.cleanup.push(function () { c.remove(); to.style.visibility = ''; });
    }
    function buildBadges() {
      var box = document.getElementById('mwMini3Box'), ex = S.ex, L = ex.layers, H = ex.heads;
      box.querySelectorAll('.mw-badge').forEach(function (b) { b.remove(); });
      ex.selected.slice(0, 3).forEach(function (i, r) {
        var b = el('span', 'mw-badge', String(r + 1));
        b.style.left = ((i % H + 0.5) / H * 100) + '%';
        b.style.top = ((L - 1 - Math.floor(i / H) + 0.5) / L * 100) + '%';
        b.style.setProperty('--r', r);
        box.appendChild(b);
      });
    }

    // ---- (c) one row per head
    function buildFilter() {
      filt.innerHTML = '';
      var ex = S.ex, hdr = el('div', 'mw-frow mw-fhead');
      ['', 'gradient map', '', 'after 3×3 median'].forEach(function (t) { hdr.appendChild(el('div', '', t)); });
      filt.appendChild(hdr);
      ex.top.slice(0, 3).forEach(function (hd, r) {
        var row = el('div', 'mw-frow'); row.style.setProperty('--r', r);
        var lab = el('div', 'mw-hlabel'); lab.innerHTML = '<span class="mw-num">' + (r + 1) + '</span>Head'; lab.appendChild(el('small', '', 'layer ' + (hd.layer + 1) + ', head ' + (hd.head + 1)));
        var a = el('canvas', 'mw-raw'), b = el('canvas', 'mw-filt');
        draw(a, overlay(S.base, hd.raw, ex.grid[0], ex.grid[1]));
        draw(b, overlay(S.base, hd.filtered, ex.grid[0], ex.grid[1]));
        var arrow = svg('svg', { viewBox: '0 0 60 20', class: 'mw-arrow' });
        svg('path', { d: 'M4 10 H50', stroke: '#2f3a45', 'stroke-width': 2, fill: 'none', class: 'mw-arrow-line' }, arrow);
        svg('path', { d: 'M44 4 L54 10 L44 16', stroke: '#2f3a45', 'stroke-width': 2, fill: 'none' }, arrow);
        var mid = el('div', 'mw-mid'); mid.appendChild(arrow); mid.appendChild(el('span', '', 'filter'));
        row.appendChild(lab); row.appendChild(a); row.appendChild(mid); row.appendChild(b);
        filt.appendChild(row);
      });
      var more = el('div', 'mw-more'), strip = el('div', 'mw-more-strip');
      more.appendChild(el('div', 'mw-more-label', '+ ' + (ex.n_selected - 3) + ' more kept heads'));
      ex.top.slice(3).forEach(function (hd, j) {
        var c = el('canvas', 'mw-thumb'); draw(c, overlay(S.base, hd.filtered, ex.grid[0], ex.grid[1]));
        c.style.opacity = (0.9 - j * 0.15).toFixed(2); strip.appendChild(c);
      });
      for (var d = 0; d < 3; d++) strip.appendChild(el('i'));
      more.appendChild(strip); filt.appendChild(more);
    }
    // ---- (d) fan of filtered maps -> heatmap
    function buildAgg() {
      agg.innerHTML = '';
      var ex = S.ex, stack = el('div', 'mw-stack');
      stack.style.aspectRatio = S.base.width + ' / ' + S.base.height;
      ex.top.forEach(function (hd, i) {
        var c = el('canvas', 'mw-card'); draw(c, overlay(S.base, hd.filtered, ex.grid[0], ex.grid[1]));
        c.style.setProperty('--i', i); stack.appendChild(c);
      });
      var fin = el('canvas', 'mw-final'); draw(fin, overlay(S.base, ex.final, ex.grid[0], ex.grid[1]));
      stack.appendChild(fin);
      agg.appendChild(stack);
      agg.appendChild(el('div', 'mw-agg-label', 'WISH heatmap for “' + word() + '”'));
    }
    function restart(node, cls) { node.classList.remove('go', 'done'); void node.offsetWidth; node.classList.add(cls); }

    function showStep(n, animate, onDone) {
      stopAll(); S.step = n;
      document.querySelectorAll('.mw-step').forEach(function (b) {
        var k = +b.dataset.step;
        b.classList.toggle('active', k === n); b.classList.toggle('past', k < n);
      });
      // text first, then the visual
      titleEl.classList.add('mw-fade'); textEl.classList.add('mw-fade');
      later(animate ? 250 : 0, function () {
        titleEl.innerHTML = '<span>(' + 'abcd'[n - 1] + ')</span>' + STEPS[n][0];
        textEl.textContent = STEPS[n][1]();
        titleEl.classList.remove('mw-fade'); textEl.classList.remove('mw-fade');
      });
      document.querySelectorAll('.mw-layer').forEach(function (l) { l.classList.toggle('show', +l.dataset.layer === n); });
      var finish = function () { if (onDone) later(HOLD[n], onDone); };
      var start = animate ? 900 : 0;
      if (n === 1) {
        drawGrid(animate ? 0 : 1);
        if (animate) later(start, function () { tween(ANIM[1], drawGrid, finish); }); else finish();
      } else if (n === 2) {
        var m2 = document.getElementById('mwMini2'), cap2 = document.getElementById('mwMini2Cap');
        var N = fmt(S.ex.layers * S.ex.heads), K = S.ex.n_selected;
        if (!animate) { drawCurve(1, true); drawMini(m2, 1); cap2.textContent = 'the ' + K + ' kept heads, outlined in the grid from (a)'; finish(); }
        else {
          drawCurve(0, false); drawMini(m2, 0); cap2.textContent = 'all ' + N + ' heads, from (a)';
          fly(gridCv, m2, 1200, function () {
            later(300, function () {
              tween(3200, function (p) { drawCurve(p, false); }, function () {
                later(400, function () {
                  tween(2600, function (p) { drawCurve(1, Math.max(p, 0.001)); }, function () {
                  later(300, function () {
                    cap2.textContent = 'the ' + K + ' kept heads, outlined';
                    tween(1100, function (p) { drawMini(m2, p); }, finish);
                  });
                });
              });
            });
          });
          });
        }
      } else if (n === 3) {
        var m2b = document.getElementById('mwMini2'), m3 = document.getElementById('mwMini3'), cw = document.querySelector('.mw-cwrap');
        drawMini(m3, 1); buildBadges();
        document.getElementById('mwMini3Cap').textContent = 'kept heads; numbers mark the three shown';
        cw.classList.remove('go', 'done'); filt.classList.remove('go', 'done');
        if (!animate) { cw.classList.add('done'); filt.classList.add('done'); finish(); }
        else {
          drawMini(m2b, 1);
          fly(m2b, m3, 1100, function () {
            later(200, function () {
              void cw.offsetWidth; cw.classList.add('go'); filt.classList.add('go');
              later(ANIM[3], function () { cw.classList.add('done'); filt.classList.add('done'); finish(); });
            });
          });
        }
      } else {
        agg.classList.remove('go', 'done', 'landed');
        if (!animate) { agg.classList.add('done'); finish(); }
        else {
          var srcs = Array.prototype.slice.call(filt.querySelectorAll('.mw-filt, .mw-thumb'));
          var cards = Array.prototype.slice.call(agg.querySelectorAll('.mw-card'));
          var n4 = Math.min(srcs.length, cards.length), landed = 0;
          agg.classList.add('landed');
          cards.forEach(function (c) { c.style.visibility = 'hidden'; });
          var onLand = function () {
            if (++landed < n4) return;
            later(500, function () {
              void agg.offsetWidth; agg.classList.remove('landed'); agg.classList.add('go');
              later(ANIM[4], function () { agg.classList.add('done'); finish(); });
            });
          };
          for (var q = 0; q < n4; q++) (function (q) {
            later(q * 110, function () { fly(srcs[q], cards[q], 1300, onLand); });
          })(q);
          if (!n4) onLand();
        }
      }
    }
    function setPlaying(on) {
      S.playing = on;
      playBtn.querySelector('i').className = on ? 'fas fa-pause' : 'fas fa-play';
      playBtn.querySelector('span:last-child').textContent = on ? 'Pause' : (S.step === 4 ? 'Replay' : 'Play');
    }
    function play(from) {
      setPlaying(true);
      (function run(n) {
        showStep(n, true, function () { if (S.playing && n < 4) run(n + 1); else setPlaying(false); });
      })(from);
    }
    function selectExample(i, autoplay) {
      var ex = M[i];
      stopAll(); setPlaying(false); S.ex = ex; S.base = null;
      exBox.querySelectorAll('button').forEach(function (b, j) { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      var cap = document.getElementById('mwCaption'); cap.innerHTML = '';
      ex.words.forEach(function (w, wi) {
        if (needsSpace(ex.words, wi)) cap.appendChild(document.createTextNode(' '));
        cap.appendChild(el('span', wi === ex.target ? 'mw-target' : '', w));
      });
      document.getElementById('mwModel').textContent = ex.model + ' · PASCAL VOC';
      document.getElementById('mwYmax').textContent = ex.layers;
      document.getElementById('mwXmax').textContent = ex.heads;
      loadBase('static/method/' + ex.image, function (base) {
        if (S.ex !== ex) return;
        S.base = base; draw(document.getElementById('mwImage'), base);
        buildFilter(); buildAgg();
        if (autoplay) play(1); else showStep(1, false);
      });
    }
    M.forEach(function (ex, i) {
      var b = el('button', 'la-btn'); b.type = 'button'; b.setAttribute('role', 'tab');
      b.innerHTML = 'Explain “' + ex.words[ex.target] + '”';
      b.addEventListener('click', function () { selectExample(i, !REDUCED); });
      exBox.appendChild(b);
    });
    document.querySelectorAll('.mw-step').forEach(function (b) {
      b.addEventListener('click', function () { if (S.base) { setPlaying(false); showStep(+b.dataset.step, !REDUCED); } });
    });
    playBtn.addEventListener('click', function () {
      if (!S.base) return;
      if (S.playing) { setPlaying(false); stopAll(); showStep(S.step, false); }
      else play(S.step === 4 || S.step === 1 ? 1 : S.step);
    });
    selectExample(0, false);
    // start once when the walkthrough comes into view
    if (!REDUCED && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !S.autoplayed && S.base) { S.autoplayed = true; play(1); io.disconnect(); }
        });
      }, { threshold: 0.55 });
      io.observe(document.querySelector('.mw'));
    }
  })();
})();
