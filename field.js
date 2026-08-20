/* Один непрерывный отрезок: герой → веер.
   Прогресс считается на всю связку и ведёт сразу две вещи —
   гашение портрета и фазу частиц. */
import { initRays } from './rays.js';

const wrap = document.querySelector('.reveal');
const cv   = document.querySelector('.reveal__canvas');
const hero = document.querySelector('.hero');
const port = document.querySelector('.hero__portrait');
const field = document.querySelector('.field');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const FADE_END = 0.34;   /* к этому прогрессу портрета уже нет */

/* Холст перехода растянут на две высоты экрана — при DPR 2 это 7.7 мегапикселя
   заливки на кадр, самая дорогая работа на странице. На слабом устройстве
   роняем плотность до 1: лучи тонкие, разница почти не видна, а заливки вчетверо
   меньше. Порог тот же, что у сети узлов: заявленным ядрам верим только когда
   они однозначно малы. */
const lean = !matchMedia('(pointer: fine)').matches ||
             (navigator.hardwareConcurrency || 8) <= 2 ||
             (navigator.deviceMemory || 8) <= 2;

if (wrap && cv && field) {
  const rays = initRays(cv, {
    centerOf: field,        /* точка схождения — центр экрана веера, не холста */
    portraitOf: port,       /* рамка, в которую ложится силуэт */
    silhouette: './me.webp',
    pointerOn: wrap,
    dprCap: lean ? 1 : 2
  });

  if (!reduce) {
    let ticking = false;

    function measure() {
      const top = wrap.getBoundingClientRect().top + scrollY;
      const span = Math.max(1, wrap.offsetHeight - innerHeight);
      const p = Math.min(1, Math.max(0, (scrollY - top) / span));

      rays.setProgress(p);
      if (port) {
        /* портрет гаснет по тому же прогрессу; до первой прокрутки он нетронут */
        port.style.opacity = p <= 0 ? '' : String(Math.max(0, 1 - p / FADE_END));
      }
      ticking = false;
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(measure); }
    }

    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    measure();
  }
}
