/* Сеть узлов позади карточек «Как я работаю».
   Три состояния одной истории: при входе в секцию поле проявляется из точки
   схождения веера — хаос сошёлся в точку, точка раскрылась в систему — и по
   нему один раз проходит волна медной подсветки; в покое остаётся тусклая
   постоянная сеть; под курсором она сгущается в медное созвездие, которое
   плывёт за указателем с инерцией. */
(function () {
  var sec   = document.querySelector('.method');
  var cv    = document.querySelector('.method__net');
  var field = document.querySelector('.field');
  if (!sec || !cv || !cv.getContext) return;

  var ctx = cv.getContext('2d');

  var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE   = matchMedia('(pointer: fine)').matches;

  /* Однозначно слабое железо. Порог намеренно низкий: четырёхъядерный ноутбук
     тянет полную плотность, и понижать её по одному лишь числу ядер — значит
     портить картинку там, где всё в порядке. Пограничные случаи ловит adapt(). */
  var LEAN = (navigator.hardwareConcurrency || 8) <= 2 ||
             (navigator.deviceMemory || 8) <= 2;

  var AREA_PER   = LEAN ? 2400 : 800;  /* кв. пикселей холста на один узел */
  var N_MAX      = LEAN ? 900 : 3500;  /* потолок, чтобы большой экран не разнесло */
  var DPR_CAP    = (LEAN || !FINE) ? 1 : 2;
  var CURSOR_R   = 190;   /* зона влияния курсора */
  var LINK_D     = 118;   /* дальность связи между узлами */
  var DOT_A      = 0.13;  /* тусклый узел */
  var DOT_A_HOT  = 0.85;  /* узел под курсором или в волне */
  var AMB_A      = 0.07;  /* потолок яркости постоянной сети в покое */
  var LINK_MAX   = 0.85;  /* потолок яркости медной связи */
  var WAVE_V     = 360;   /* скорость фронта волны, px/сек */
  var WAVE_S     = 80;    /* мягкость фронта волны: сигма гаусса, px */
  var REVEAL_E   = 220;   /* ширина фронта проявления из точки, px */
  var LEAN_MS    = 28;    /* слабое железо остаётся на ~35 fps */
  var TAU        = Math.PI * 2;
  var REST_FILL  = 'rgba(160,150,145,' + DOT_A + ')';

  var nodes = [], grid = new Map();
  var W = 0, H = 0, maxR = 1, originX = 0, originY = -400;
  var mx = -9999, my = -9999, smx = -9999, smy = -9999;
  var revealR = 0, waveR = -1, entered = false;
  var raf = 0, live = false, last = 0;

  function makeNode() {
    var a = Math.random() * TAU;
    var sp = 3 + Math.random() * 7;                  /* 3–10 px/сек */
    return {
      x: Math.random(), y: Math.random(),            /* храним в долях — переживает ресайз */
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 0.7 + Math.random() * 0.8,
      glow: 0                                        /* свечение догоняет курсор с инерцией */
    };
  }

  function build() {
    var r = cv.getBoundingClientRect();
    if (r.width < 2) return;
    var d = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    W = r.width; H = r.height;
    cv.width = Math.round(W * d);
    cv.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);

    /* исток проявления и волны — точка схождения веера: центр экрана поля */
    if (field) {
      var fr = field.getBoundingClientRect();
      originX = fr.left + fr.width / 2 - r.left;
      originY = fr.top + fr.height / 2 - r.top;
    } else { originX = W / 2; originY = -innerHeight / 2; }

    var fx = Math.max(Math.abs(originX), Math.abs(W - originX));
    var fy = Math.max(Math.abs(originY), Math.abs(H - originY));
    maxR = Math.hypot(fx, fy);

    /* плотность задаётся площадью, а не числом: фиксированный счёт разрежал поле */
    var want = Math.min(N_MAX, Math.round(W * H / AREA_PER));
    while (nodes.length < want) nodes.push(makeNode());
    if (nodes.length > want) nodes.length = want;
  }

  function step(dt) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx * dt / W;
      n.y += n.vy * dt / H;
      if (n.x < 0) n.x += 1; else if (n.x > 1) n.x -= 1;   /* заворот на другую сторону */
      if (n.y < 0) n.y += 1; else if (n.y > 1) n.y -= 1;
    }
    /* курсор с инерцией: созвездие плывёт за указателем, а не прыгает */
    if (mx > -5000) {
      if (smx < -5000) { smx = mx; smy = my; }
      smx += (mx - smx) * Math.min(1, dt * 7);
      smy += (my - smy) * Math.min(1, dt * 7);
    } else { smx = smy = -9999; }
  }

  /* пространственная сетка: пары связей ищем только по соседним ячейкам,
     иначе полный перебор по полю на весь экран не влезает ни в какой кадр */
  function bin() {
    grid.clear();
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.px = n.x * W; n.py = n.y * H;
      var k = ((n.px / LINK_D) | 0) + ':' + ((n.py / LINK_D) | 0);
      var cell = grid.get(k);
      if (cell) cell.push(i); else grid.set(k, [i]);
    }
  }

  function waveBoost(px, py) {
    if (waveR < 0) return 0;
    var d = Math.hypot(px - originX, py - originY) - waveR;
    return Math.exp(-(d * d) / (2 * WAVE_S * WAVE_S));
  }
  function revealFactor(px, py) {
    var d = Math.hypot(px - originX, py - originY);
    var t = (revealR - d) / REVEAL_E;
    return t <= 0 ? 0 : (t >= 1 ? 1 : t);
  }

  /* Штрихи пакетируются по квантованной яркости: у волны и постоянной сети
     тысячи связей на кадр, и по одному stroke() на связь кадр не выживает.
     Квантование в 8 ступеней на глаз неотличимо от точной прозрачности. */
  var AQ = 8;
  var batches = [];
  for (var bi = 0; bi < AQ * 2 * 3; bi++) batches.push([]);
  function batchIndex(copper, alpha, wq) {
    var q = (alpha * AQ) | 0; if (q >= AQ) q = AQ - 1;
    return (copper ? AQ * 3 : 0) + wq * AQ + q;
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    bin();

    var hasCur = smx > -5000;
    var R2 = CURSOR_R * CURSOR_R;
    var i, n;

    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      var target = 0;
      if (hasCur) {
        var dx = n.px - smx, dy = n.py - smy;
        var d2c = dx * dx + dy * dy;
        if (d2c < R2) target = 1 - Math.sqrt(d2c) / CURSOR_R;
      }
      /* свечение догоняет цель — связи тают, а не рвутся */
      n.glow += (target - n.glow) * Math.min(1, dt * 6);
      n.rev = revealFactor(n.px, n.py);
      n.wv = waveBoost(n.px, n.py);
      n.hot = Math.max(n.glow * n.glow, n.wv * 0.85);
    }

    /* 1. Покой: один путь и одна заливка на все полностью проявленные узлы */
    ctx.fillStyle = REST_FILL;
    ctx.beginPath();
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.rev < 0.999 || n.hot > 0.02) continue;
      ctx.moveTo(n.px + n.r, n.py);                   /* без moveTo дуги свяжутся линией */
      ctx.arc(n.px, n.py, n.r, 0, TAU);
    }
    ctx.fill();

    /* 2. Горячие и проявляющиеся узлы — своя прозрачность у каждого */
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.rev <= 0.01 || (n.rev >= 0.999 && n.hot <= 0.02)) continue;
      var a;
      if (n.hot > 0.02) {
        a = (DOT_A + (DOT_A_HOT - DOT_A) * n.hot) * n.rev;
        ctx.fillStyle = 'rgba(201,122,62,' + a.toFixed(3) + ')';
      } else {
        ctx.fillStyle = 'rgba(160,150,145,' + (DOT_A * n.rev).toFixed(3) + ')';
      }
      ctx.beginPath();
      ctx.arc(n.px, n.py, n.r + n.hot * 1.1, 0, TAU);
      ctx.fill();
    }

    /* 3. Связи: соседние ячейки сетки, пакетами по яркости */
    for (i = 0; i < batches.length; i++) batches[i].length = 0;
    var NEIGH = [[0, 0], [0, 1], [1, -1], [1, 0], [1, 1]];   /* передняя полуокрестность */

    grid.forEach(function (list, k) {
      var ci = k.indexOf(':');
      var gx = +k.slice(0, ci), gy = +k.slice(ci + 1);
      for (var a2 = 0; a2 < list.length; a2++) {
        var A = nodes[list[a2]];
        for (var s = 0; s < NEIGH.length; s++) {
          var nb = (NEIGH[s][0] === 0 && NEIGH[s][1] === 0)
            ? list
            : grid.get((gx + NEIGH[s][0]) + ':' + (gy + NEIGH[s][1]));
          if (!nb) continue;
          for (var b = (nb === list ? a2 + 1 : 0); b < nb.length; b++) {
            var B = nodes[nb[b]];
            var lx = A.px - B.px, ly = A.py - B.py;
            var d2 = lx * lx + ly * ly;
            if (d2 > LINK_D * LINK_D) continue;
            var rev = A.rev < B.rev ? A.rev : B.rev;
            if (rev <= 0.01) continue;
            var close = 1 - Math.sqrt(d2) / LINK_D;

            var cur = (A.glow + B.glow) * 0.5;
            var wv  = (A.wv + B.wv) * 0.5;
            var amb = close * close * AMB_A;
            var hot = Math.max(cur * cur * LINK_MAX, wv * 0.55);

            if (amb < 0.008 && hot < 0.012) continue;
            var copper = hot > amb;
            var alpha = (copper ? hot : amb) * rev;
            var wq = copper ? ((close * 2.999) | 0) : 0;   /* 0.5 / 0.75 / 1.0 px */
            var bin_ = batches[batchIndex(copper, alpha / (copper ? LINK_MAX : AMB_A), wq)];
            bin_.push(A.px, A.py, B.px, B.py);
          }
        }
      }
    });

    for (i = 0; i < batches.length; i++) {
      var seg = batches[i];
      if (!seg.length) continue;
      var copper2 = i >= AQ * 3;
      var wq2 = ((i % (AQ * 3)) / AQ) | 0;
      var q2 = i % AQ;
      var alpha2 = (q2 + 0.5) / AQ * (copper2 ? LINK_MAX : AMB_A);
      ctx.strokeStyle = (copper2 ? 'rgba(201,122,62,' : 'rgba(150,145,140,') + alpha2.toFixed(3) + ')';
      ctx.lineWidth = copper2 ? 0.5 + wq2 * 0.25 : 0.5;
      ctx.beginPath();
      for (var g2 = 0; g2 < seg.length; g2 += 4) {
        ctx.moveTo(seg[g2], seg[g2 + 1]);
        ctx.lineTo(seg[g2 + 2], seg[g2 + 3]);
      }
      ctx.stroke();
    }
  }

  /* насколько секция вошла в экран — ведёт проявление и запускает волну */
  function entryProgress() {
    var r = sec.getBoundingClientRect();
    var p = (innerHeight - r.top) / (innerHeight * 0.9);
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  /* Замер по факту: заявленные ядра и память врут, а кадр — нет. Если отрисовка
     стабильно не влезает в бюджет, поле разрежается. Не больше двух понижений. */
  var probe = [], thinned = 0;
  function adapt(ms) {
    if (thinned >= 2) return;
    probe.push(ms);
    if (probe.length < 30) return;
    probe.sort(function (a, b) { return a - b; });
    var p50 = probe[15];
    probe.length = 0;
    if (p50 > (LEAN ? LEAN_MS : 17) * 0.7) { thinned++; AREA_PER *= 1.8; build(); }
  }

  function loop(ts) {
    if (!live) return;
    raf = requestAnimationFrame(loop);
    if (LEAN && ts - last < LEAN_MS) return;
    var dt = Math.min(0.05, (ts - last) / 1000) || 0.016;
    last = ts;
    var t0 = performance.now();

    var p = entryProgress();
    var targetR = p * maxR * 1.15;
    revealR += (targetR - revealR) * Math.min(1, dt * 3.5);

    if (!entered && p > 0.22) { entered = true; waveR = 0; }   /* волна — один раз */
    if (waveR >= 0) {
      waveR += WAVE_V * dt;
      if (waveR > maxR + WAVE_S * 4) waveR = -1;               /* волна ушла — гаснем */
    }

    step(dt);
    draw(dt);
    adapt(performance.now() - t0);
  }

  function start() { if (!live) { live = true; last = 0; raf = requestAnimationFrame(loop); } }
  function stop()  { live = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function clearCursor() { mx = my = -9999; }
  /* слушаем окно: холст шире колонки, и курсор над «полями» тоже должен светить */
  addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var r = cv.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', clearCursor);
  addEventListener('blur', clearCursor);

  var rt;
  function remeasure() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      build();
      if (REDUCE) { revealR = maxR * 2; draw(0.016); }
    }, 140);
  }

  build();

  /* высота секции меняется не только от ресайза: Onest грузится с font-display:swap,
     текст переливается, карточки садятся — и холст остаётся от старой геометрии.
     ResizeObserver ловит оба случая, слушатель resize — запасной путь. */
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(sec);
  else addEventListener('resize', remeasure);

  /* Сниженное движение: ни дрейфа, ни волны — поле проявлено целиком и стоит */
  if (REDUCE) { revealR = maxR * 2; draw(0.016); return; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es[0].isIntersecting ? start() : stop();
    }, { threshold: 0.01, rootMargin: '120px 0px' }).observe(sec);
  } else { start(); }
})();
