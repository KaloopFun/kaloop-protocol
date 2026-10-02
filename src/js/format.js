const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const usdSmall = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 4 });

export const fmtCompactUsd = (n) => compact.format(n);
export const fmtInt = (n) => int.format(Math.round(n));
export const fmtGwei = (n) => (n < 1 ? n.toFixed(4) : n.toFixed(2));
export const fmtPrice = (n) => (n >= 1000 ? compact.format(n) : usdSmall.format(n));
export const fmtChange = (n) => {
  if (!Number.isFinite(n)) return '0.0%';
  const abs = Math.abs(n).toFixed(1) + '%';
  return n > 0 ? '▲ ' + abs : n < 0 ? '▼ ' + abs : abs;
};
