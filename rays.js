/* Ядро поля — код заказчика. Наши добавления помечены [переход] и дают
   первую фазу: частицы рождаются на силуэте портрета и разлетаются в хаос,
   из которого затем собирается веер. */
export function initRays(cv, opts){
  opts = opts || {};
  const ctx = cv.getContext('2d');
  const N = 300;

  /* [переход] границы фаз */
  const INTRO_END = 0.42;   /* origin -> chaos завершается здесь */
  let sil = null;           /* точки силуэта, доли внутри рамки портрета */
  let ctr = null;           /* центр схождения = центр экрана веера */
  let RR  = 0;              /* дальность лучей считаем от экрана веера, не от всего холста */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W=0, H=0, nd=[], prog=0, T=0, raf=null, live=false, last=0;
  let mx=-9999, my=-9999, tx=-9999, ty=-9999;

  const rn = s => { const x = Math.sin(s)*10000; return x - Math.floor(x); };
  const ez = x => x<=0 ? 0 : x>=1 ? 1 : 1-Math.pow(1-x,3);

  /* [бюджет] потолок плотности пикселей приходит снаружи: холст растянут на две
     высоты экрана, и на слабом устройстве это самая дорогая заливка на странице.
     По умолчанию 2 — ровно как было у заказчика. */
  const DPR_CAP = opts.dprCap || 2;

  function build(){
    const r = cv.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio||1, DPR_CAP);
    W = r.width; H = r.height;
    cv.width = W*d; cv.height = H*d;
    ctx.setTransform(d,0,0,d,0,0);
    /* [переход] центр схождения и масштаб — по секции веера */
    const cvBox = cv.getBoundingClientRect();
    const fBox = opts.centerOf ? opts.centerOf.getBoundingClientRect() : cvBox;
    ctr = { x: fBox.left - cvBox.left + fBox.width/2,
            y: fBox.top  - cvBox.top  + fBox.height/2 };
    RR = Math.max(fBox.width, fBox.height) * 0.62;
    const R = RR;
    nd = [];
    for (let i=0;i<N;i++){
      const t=i/N, j=(rn(i*3.7)-0.5)*0.028, lf=rn(i*7.1);
      nd.push({
        a0:(t+j)*Math.PI*2,
        len:R*(0.3+lf*0.72), lf,
        ph:rn(i*4.4)*6.283, sp:0.3+rn(i*9.2)*0.4,
        bow:(rn(i*6.6)-0.5)*0.1,
        cx:rn(i*2.3)*W, cy:rn(i*5.9)*H,
        ax:0, ay:0,        /* [переход] точка рождения на силуэте */
        st:rn(i*11.3)*0.4,
        w:0.3+rn(i*13.7)*0.4,
        d1:0.42+rn(i*8.8)*0.2, d2:0.7+rn(i*12.1)*0.2
      });
    }
  }

  /* [переход] разложить узлы по силуэту портрета */
  function placeOrigins(){
    if (!sil || !sil.length || !opts.portraitOf) return;
    const cvBox = cv.getBoundingClientRect();
    const pBox = opts.portraitOf.getBoundingClientRect();
    const left = pBox.left - cvBox.left, top = pBox.top - cvBox.top;
    for (let i=0;i<nd.length;i++){
      const s0 = sil[i % sil.length];
      nd[i].ax = left + s0.x * pBox.width;
      nd[i].ay = top  + s0.y * pBox.height;
    }
  }

  /* [переход] прочитать альфу портрета и собрать точки головы и плеч */
  function loadSilhouette(){
    if (!opts.silhouette) return;
    const im = new Image();
    im.onload = function(){
      const w = 90, h = Math.round(w * im.naturalHeight / im.naturalWidth);
      const oc = document.createElement('canvas');
      oc.width = w; oc.height = h;
      const ox2 = oc.getContext('2d');
      ox2.drawImage(im, 0, 0, w, h);
      let d;
      try { d = ox2.getImageData(0,0,w,h).data; } catch(e){ return; }
      const pts = [];
      const LIMIT = 0.62;                       /* голова и плечи — верхняя часть кадра */
      for (let y=0; y<Math.round(h*LIMIT); y++){
        for (let x=0; x<w; x++){
          if (d[(y*w+x)*4+3] > 120) pts.push({ x:(x+0.5)/w, y:(y+0.5)/h });
        }
      }
      /* перемешиваем, чтобы соседние узлы не садились рядом */
      for (let i=pts.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const t=pts[i]; pts[i]=pts[j]; pts[j]=t; }
      sil = pts;
      placeOrigins();
      if (!live) render();
    };
    im.src = opts.silhouette;
  }

  function render(){
    ctx.clearRect(0,0,W,H);

    /* [переход] первая фаза: частицы уходят с силуэта в хаос, лучей ещё нет */
    if (prog < INTRO_END){
      if (!sil) return;                          /* пока силуэт не прочитан — экран чист */
      const t1 = prog / INTRO_END;
      const born = Math.min(1, t1 * 2.4);        /* рождение: до этого герой статичен */
      for (const n of nd){
        const lag = n.st * 0.55;
        const e = ez((t1 - lag) / (1 - lag));
        if (e <= 0) continue;
        const px = n.ax + (n.cx - n.ax) * e;
        const py = n.ay + (n.cy - n.ay) * e;
        const a = born * (0.20 + 0.55 * e);
        ctx.fillStyle = `rgba(214,168,120,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.8 + e * 0.7, 0, Math.PI*2);
        ctx.fill();
      }
      return;
    }
    const ox=ctr.x, oy=ctr.y, R=170;
    /* [переход] вторая фаза считает свой прогресс от конца первой */
    const prog2 = (prog - INTRO_END) / (1 - INTRO_END);

    if (prog2>0.35){
      const s=(prog2-0.35)/0.65;
      const g=ctx.createRadialGradient(ox,oy,0,ox,oy,150);
      g.addColorStop(0,`rgba(224,170,110,${0.30*s})`);
      g.addColorStop(0.45,`rgba(150,95,55,${0.10*s})`);
      g.addColorStop(1,'rgba(10,10,12,0)');
      ctx.fillStyle=g;
      ctx.fillRect(ox-150,oy-150,300,300);
    }

    for (const n of nd){
      const k = ez((prog2-n.st)/(1-n.st));
      let a = n.a0 + Math.sin(T*n.sp+n.ph)*(0.012+n.lf*0.022);
      let ex = ox+Math.cos(a)*n.len, ey = oy+Math.sin(a)*n.len;

      let inf=0;
      if (mx>-5000 && k>0.3){
        const dx=ex-mx, dy=ey-my, ds=Math.hypot(dx,dy);
        if (ds<R){ const u=1-ds/R; inf=u*u; }
      }
      if (inf>0){
        a += inf*0.05;
        ex = ox+Math.cos(a)*n.len; ey = oy+Math.sin(a)*n.len;
      }

      const fx = n.cx+(ex-n.cx)*k, fy = n.cy+(ey-n.cy)*k;
      const mxp = (ox+fx)/2 - Math.sin(a)*n.len*n.bow;
      const myp = (oy+fy)/2 + Math.cos(a)*n.len*n.bow;

      if (k>0.04){
        ctx.strokeStyle=`rgba(201,122,62,${k*0.30+inf*0.32})`;
        ctx.lineWidth=n.w+inf*0.6;
        ctx.beginPath(); ctx.moveTo(ox,oy);
        ctx.quadraticCurveTo(mxp,myp,fx,fy); ctx.stroke();
        if (inf>0.05){
          ctx.strokeStyle=`rgba(245,200,150,${inf*0.45})`;
          ctx.lineWidth=n.w*0.55;
          ctx.beginPath(); ctx.moveTo(ox,oy);
          ctx.quadraticCurveTo(mxp,myp,fx,fy); ctx.stroke();
        }
      }

      const dots=[[n.d1,0.40],[n.d2,0.55],[1,0.95]];
      for (const [u,sc] of dots){
        const s2=1-u;
        const px = s2*s2*ox + 2*s2*u*mxp + u*u*fx;
        const py = s2*s2*oy + 2*s2*u*myp + u*u*fy;
        const al = Math.min((0.18+k*0.30+inf*0.50)*sc, 1);
        const c1 = Math.round(160+95*(k*0.4+inf*0.6));
        const c2 = Math.round(125+105*(k*0.35+inf*0.65));
        const c3 = Math.round(130+97*(k*0.25+inf*0.75));
        ctx.fillStyle=`rgba(${c1},${c2},${c3},${al})`;
        ctx.beginPath();
        ctx.arc(px,py,(0.85+k*0.3+inf*1.2)*sc,0,Math.PI*2);
        ctx.fill();
      }
    }

    if (prog2>0.5){
      ctx.fillStyle=`rgba(255,225,195,${(prog2-0.5)*1.9})`;
      ctx.beginPath(); ctx.arc(ox,oy,3.2,0,Math.PI*2); ctx.fill();
    }
  }

  function loop(ts){
    if (!live) return;
    T = ts/1000;
    if (tx>-5000){
      if (mx<-5000){ mx=tx; my=ty; }
      mx += (tx-mx)*0.14; my += (ty-my)*0.14;
    } else { mx=-9999; my=-9999; }
    if (ts-last>28){ render(); last=ts; }
    raf = requestAnimationFrame(loop);
  }

  function start(){ if(!live && !reduce){ live=true; raf=requestAnimationFrame(loop);} }
  function stop(){ live=false; if(raf) cancelAnimationFrame(raf); raf=null; }

  build(); loadSilhouette(); render();

  if (!reduce){
    new IntersectionObserver(es=>{ es[0].isIntersecting ? start() : stop(); },
      {threshold:0.01}).observe(cv);
    const host = opts.pointerOn || cv;
    host.addEventListener('mousemove', e=>{
      const r=cv.getBoundingClientRect();
      tx=e.clientX-r.left; ty=e.clientY-r.top;
    });
    host.addEventListener('mouseleave', ()=>{ tx=-9999; ty=-9999; });
  } else {
    prog=1; render();
  }

  let rt=null;
  window.addEventListener('resize', ()=>{
    clearTimeout(rt);
    rt=setTimeout(()=>{ build(); placeOrigins(); render(); },150);
  });

  return {
    setProgress(p){
      prog = p<0?0:p>1?1:p;
      if (!live) render();
    },
    destroy(){ stop(); }
  };
}
