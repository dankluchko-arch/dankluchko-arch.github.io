/* Стопка «Как я работаю».
   Без JS — три читаемых блока подряд, весь текст на месте.
   Широкий экран — прилипание: карточки накладываются со смещением, видна шапка каждой.
   Узкий экран — раскрытие по тапу.
   Scroll-driven animations сознательно не используются: нет поддержки в Safari 16 (Ventura). */
(function () {
  var stack = document.getElementById('stack');
  if (!stack) return;

  var cards  = Array.prototype.slice.call(stack.querySelectorAll('.card'));
  if (cards.length < 2) return;
  var heads  = cards.map(function (c) { return c.querySelector('.card__head'); });
  var bodies = cards.map(function (c) { return c.querySelector('.card__body'); });

  var wide = window.matchMedia('(min-width: 60rem)');
  var mode = null;
  var open = 0;

  cards.forEach(function (c, i) { c.style.setProperty('--depth', i); });

  /* шаг наложения = самая высокая шапка, иначе нижняя карточка срежет заголовок */
  function measurePeek() {
    var max = 0;
    heads.forEach(function (h) { max = Math.max(max, h.offsetHeight); });
    if (max) stack.style.setProperty('--peek', max + 'px');
  }

  function setTap(i) {
    open = i;
    cards.forEach(function (c, n) {
      var on = n === open;
      c.classList.toggle('is-open', on);
      heads[n].setAttribute('aria-expanded', on ? 'true' : 'false');
      bodies[n].style.maxHeight = on ? bodies[n].scrollHeight + 'px' : '0px';
    });
  }

  function toPin() {
    stack.classList.remove('stack--tap');
    stack.classList.add('stack--pin');
    cards.forEach(function (c, i) {
      c.classList.remove('is-open');
      bodies[i].style.maxHeight = '';
      /* текст виден всегда — раскрывать нечего, поэтому и останавливаться
         на шапке табом незачем: это был бы стоп без действия */
      heads[i].removeAttribute('aria-expanded');
      heads[i].setAttribute('tabindex', '-1');
    });
    measurePeek();
    mode = 'pin';
  }

  function toTap() {
    stack.classList.remove('stack--pin');
    stack.classList.add('stack--tap');
    stack.style.removeProperty('--peek');
    heads.forEach(function (h) { h.removeAttribute('tabindex'); });
    setTap(open);
    mode = 'tap';
  }

  function apply() {
    var next = wide.matches ? 'pin' : 'tap';
    if (next === mode) { if (mode === 'pin') measurePeek(); else setTap(open); return; }
    next === 'pin' ? toPin() : toTap();
  }

  heads.forEach(function (h, i) {
    h.addEventListener('click', function () {
      if (mode === 'tap') { setTap(i); return; }
      /* в прилипании шапка работает как переход к своей карточке */
      cards[i].scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });

  apply();

  wide.addEventListener
    ? wide.addEventListener('change', apply)
    : wide.addListener(apply);

  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(apply, 140);
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
})();
