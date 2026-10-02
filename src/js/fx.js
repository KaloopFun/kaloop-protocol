import { ms, reduced } from './clock.js';

let io = null;

function show(el) {
  el.classList.add('in');
  el.dispatchEvent(new CustomEvent('revealed'));
}

// Scroll-reveal with per-parent stagger. Reduced motion shows everything at once.
export function observe(root = document) {
  const items = [...root.querySelectorAll('[data-reveal]:not(.in)')];
  const seen = new Map();
  for (const el of items) {
    if (!el.style.getPropertyValue('--i')) {
      const parent = el.parentElement;
      const n = seen.get(parent) ?? 0;
      seen.set(parent, n + 1);
      el.style.setProperty('--i', String(n));
    }
  }
  if (reduced() || !('IntersectionObserver' in window)) {
    items.forEach(show);
    return;
  }
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        show(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  items.forEach((el) => io.observe(el));
}

export function initProgress(bar) {
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? Math.min(1, Math.max(0, scrollY / max)).toFixed(4) : '0');
  };
  addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  addEventListener('resize', update);
  update();
}

// Layers carry --d (depth). Pointer and scroll feed three custom properties.
export function initParallax(stage, region) {
  if (reduced()) return;
  const s = { px: 0, py: 0, sy: 0 };
  let queued = false;
  const write = () => {
    queued = false;
    stage.style.setProperty('--px', s.px.toFixed(2));
    stage.style.setProperty('--py', s.py.toFixed(2));
    stage.style.setProperty('--sy', s.sy.toFixed(2));
  };
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(write);
    }
  };
  const onScroll = () => {
    const r = stage.getBoundingClientRect();
    const offset = r.top + r.height / 2 - innerHeight / 2;
    s.sy = Math.max(-36, Math.min(36, offset * -0.07));
    queue();
  };
  region.addEventListener(
    'pointermove',
    (e) => {
      const r = region.getBoundingClientRect();
      s.px = ((e.clientX - r.left) / r.width - 0.5) * 36;
      s.py = ((e.clientY - r.top) / r.height - 0.5) * 24;
      queue();
    },
    { passive: true },
  );
  region.addEventListener('pointerleave', () => {
    s.px = 0;
    s.py = 0;
    queue();
  });
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  clearTimeout(el._flashTimer);
  el._flashTimer = setTimeout(() => el.classList.remove('flash'), ms(900));
}

// Count up from the last shown value. Later changes flash.
export function countTo(el, to, fmt) {
  const first = el._v === undefined;
  const from = first ? 0 : el._v;
  el._v = to;
  cancelAnimationFrame(el._raf);
  if (!first && from !== to && !reduced()) flash(el);
  if (reduced() || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const dur = ms(first ? 1200 : 700);
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (to - from) * eased);
    if (k < 1) el._raf = requestAnimationFrame(step);
    else el.textContent = fmt(to);
  };
  el._raf = requestAnimationFrame(step);
}
