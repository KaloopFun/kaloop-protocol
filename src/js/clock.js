const w = typeof window !== 'undefined' ? window : {};
const fast = Number(w.__KALOOP_FAST__) > 0 ? Number(w.__KALOOP_FAST__) : 1;

// Scale a duration. The gates set a fast clock; production always gets 1.
export const ms = (n) => n * fast;

export const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
