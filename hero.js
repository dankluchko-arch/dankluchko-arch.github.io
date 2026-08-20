/* Первый экран: портрет слегка идёт за курсором.
   Только это — фоновых анимаций здесь нет, весь вес движения на экране веера.
   Отключено при prefers-reduced-motion и на устройствах без точного указателя. */
(function () {
  var wrap = document.querySelector('.hero__portrait');
  var hero = document.querySelector('.hero');
  if (!wrap || !hero) return;
  if (!matchMedia('(pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var MAX_X = 16, MAX_Y = 9;
  var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, live = false;
  var base = getComputedStyle(wrap).transform;
  if (base === 'none') base = '';

  function loop() {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    wrap.style.transform = base + ' translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
    if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
      raf = requestAnimationFrame(loop);
    } else { raf = 0; }
  }
  function nudge() { if (!raf && live) raf = requestAnimationFrame(loop); }

  /* цикл не крутится, пока экран не виден, поэтому сброс к нулю нужно
     записывать напрямую — иначе смещение застывает до следующего движения мыши */
  function rest() {
    tx = ty = cx = cy = 0;
    wrap.style.transform = base;
    wrap.style.willChange = '';
  }

  hero.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    wrap.style.willChange = 'transform';
    var r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * -2 * MAX_X;
    ty = ((e.clientY - r.top) / r.height - 0.5) * -2 * MAX_Y;
    nudge();
  });
  hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; nudge(); });


  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      live = es[0].isIntersecting;
      if (!live) { if (raf) { cancelAnimationFrame(raf); raf = 0; } rest(); }
    }, { threshold: 0.01 }).observe(hero);
  } else { live = true; }

  /* мобильная раскладка центрует портрет через transform — пересчитываем базу */
  addEventListener('resize', function () {
    wrap.style.transform = '';
    base = getComputedStyle(wrap).transform;
    if (base === 'none') base = '';
    cx = cy = tx = ty = 0;
  });
})();
