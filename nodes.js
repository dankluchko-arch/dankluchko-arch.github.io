/* Сеть узлов позади карточек «Как я работаю».
   Постоянных связей нет — они рождаются только под курсором и гаснут вместе с ним. */
(function () {
  var sec = document.querySelector('.method');
  var cv  = document.querySelector('.method__net');
  if (!sec || !cv || !cv.getContext) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = cv.getContext('2d');

  /* Связи существуют только под курсором. Без точного указателя вся анимация
     работала бы вхолостую, поэтому там поле рисуется один раз и замирает. */
  var FINE = matchMedia('(pointer: fine)').matches;

  /* Однозначно слабое железо. Порог намеренно низкий: четырёхъядерный ноутбук
     тянет полную плотность, и понижать её по одному лишь числу ядер — значит
     портить картинку там, где всё в порядке. Пограничные случаи ловит adapt(). */
  var LEAN = (navigator.hardwareConcurrency || 8) <= 2 ||
             (navigator.deviceMemory || 8) <= 2;

  var AREA_PER   = LEAN ? 2400 : 800;  /* кв. пикселей холста на один узел */
  var N_MAX      = LEAN ? 900 : 3500;  /* потолок, чтобы большой экран не разнесло */
  /* без курсора картинка статична, и удвоенная плотность пикселей стоит только
     памяти: на телефоне это 6.6 МБ холста против 2.2 при том же виде */
  var DPR_CAP    = (LEAN || !FINE) ? 1 : 2;
  var CURSOR_R   = 180;   /* зона влияния курсора */
  var LINK_D     = 118;   /* дальность связи между узлами */
  var DOT_A      = 0.14;  /* тусклый узел */
  var DOT_A_HOT  = 0.88;  /* узел под курсором */
  var FRAME_MS   = 28;    /* ~35 fps */
  var TAU        = Math.PI * 2;
  var REST_FILL  = 'rgba(160,150,145,' + DOT_A + ')';

  var LINK_MAX = 0.85;   /* множитель прозрачности связи */

  /* Связи намеренно рисуются по одной. Объединение их в общий путь убрало бы
     ещё около тысячи вызовов, но у одного пути пересечения композитятся один
     раз вместо каждого: замер на реальной плотности дал −19% яркости, и плотный
     центр созвездия тускнел. Выигрыш здесь не стоит порчи самого эффекта. */
  var nodes = [], W = 0, H = 0, raf = 0, live = false, last = 0;
  var mx = -9999, my = -9999;

  function makeNode() {
    var a = Math.random() * TAU;
    var sp = 0.05 + Math.random() * 0.12;            /* 0.05–0.17 px/кадр */
    return {
      x: Math.random(), y: Math.random(),            /* храним в долях — переживает ресайз */
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 0.7 + Math.random() * 0.8
    };
  }

  function build() {
    var r = sec.getBoundingClientRect();
    var d = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    W = r.width; H = r.height;
    cv.width = Math.round(W * d);
    cv.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);

    /* плотность задаётся площадью, а не числом: секция крупнее того холста,
       под который подбиралась исходная цифра, и фиксированный счёт её разрежал */
    var want = Math.min(N_MAX, Math.round(W * H / AREA_PER));

    /* на ресайзе достраиваем или срезаем хвост — уцелевшие узлы не прыгают */
    while (nodes.length < want) nodes.push(makeNode());
    if (nodes.length > want) nodes.length = want;
  }

  function step() {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx / W;
      n.y += n.vy / H;
      if (n.x < 0) n.x += 1; else if (n.x > 1) n.x -= 1;   /* заворот на другую сторону */
      if (n.y < 0) n.y += 1; else if (n.y > 1) n.y -= 1;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    var near = [];            /* только узлы в зоне курсора — пары ищем внутри них */
    var hasCursor = mx > -5000;
    var R2 = CURSOR_R * CURSOR_R;
    var i, n, px, py;

    /* 1. Покой: один путь и одна заливка на все узлы. Цвет и прозрачность у них
          общие, так что отдельный вызов на каждый был чистой тратой. */
    ctx.fillStyle = REST_FILL;
    ctx.beginPath();
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      px = n.x * W; py = n.y * H;

      if (hasCursor) {
        var dx = px - mx, dy = py - my;
        var d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          near.push({ x: px, y: py, h: 1 - Math.sqrt(d2) / CURSOR_R, r: n.r });
          continue;                                   /* горячие рисуем отдельно */
        }
      }
      ctx.moveTo(px + n.r, py);                       /* без moveTo дуги свяжутся линией */
      ctx.arc(px, py, n.r, 0, TAU);
    }
    ctx.fill();

    /* 2. Горячие узлы: их немного (~120), у каждого своя прозрачность */
    for (i = 0; i < near.length; i++) {
      var hn = near[i];
      var a = DOT_A + (DOT_A_HOT - DOT_A) * hn.h * hn.h;
      ctx.fillStyle = 'rgba(201,122,62,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(hn.x, hn.y, hn.r + hn.h * 0.9, 0, TAU);
      ctx.fill();
    }

    /* 3. Связи: перебор пар только внутри списка под курсором */
    for (var p = 0; p < near.length; p++) {
      for (var q = p + 1; q < near.length; q++) {
        var A = near[p], B = near[q];
        var lx = A.x - B.x, ly = A.y - B.y;
        var dist = Math.sqrt(lx * lx + ly * ly);
        if (dist > LINK_D) continue;
        var closeness = 1 - dist / LINK_D;       /* близость пары */
        var pull = (A.h + B.h) * 0.5;            /* близость к курсору */
        var alpha = closeness * closeness * pull * LINK_MAX;
        if (alpha < 0.012) continue;
        ctx.strokeStyle = 'rgba(201,122,62,' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 0.5 + closeness * 0.5;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }
    }
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
    if (p50 > FRAME_MS * 0.7) { thinned++; AREA_PER *= 1.8; build(); }
  }

  function loop(ts) {
    if (!live) return;
    if (ts - last >= FRAME_MS) {
      var t0 = performance.now();
      step(); draw();
      adapt(performance.now() - t0);
      last = ts;
    }
    raf = requestAnimationFrame(loop);
  }

  function start() { if (!live) { live = true; raf = requestAnimationFrame(loop); } }
  function stop()  { live = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  sec.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var r = cv.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
  });
  sec.addEventListener('pointerleave', function () { mx = my = -9999; });

  var rt;
  function remeasure() {
    clearTimeout(rt);
    rt = setTimeout(function () { build(); draw(); }, 140);
  }

  build(); draw();

  /* высота секции меняется не только от ресайза: Onest грузится с font-display:swap,
     текст переливается, карточки садятся — и холст остаётся от старой геометрии.
     ResizeObserver ловит оба случая, слушатель resize — запасной путь. */
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(sec);
  else addEventListener('resize', remeasure);

  /* Без точного указателя цикл не запускается вовсе: пыль уже нарисована,
     а двигать её ради самого движения — расход без отдачи. */
  if (!FINE) return;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es[0].isIntersecting ? start() : stop();
    }, { threshold: 0.01 }).observe(sec);
  } else { start(); }
})();
