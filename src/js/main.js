import { ms } from './clock.js';
import { fetchChain, fetchTvl, fetchPairs, fetchContractPair } from './data.js';
import { fmtCompactUsd, fmtInt, fmtGwei, fmtPrice, fmtChange } from './format.js';
import { observe, initProgress, initParallax, countTo } from './fx.js';

const $ = (sel, root = document) => root.querySelector(sel);
const reg = JSON.parse($('#register').textContent);

if (window.__KALOOP_FAST__) document.documentElement.dataset.clock = 'fast';

// ---- status pill -----------------------------------------------------------
const pill = $('#pill');
const PILL_TEXT = { connecting: 'Reaching chain', live: 'Chain live', offline: 'Chain unreachable' };
function setPill(state) {
  pill.dataset.state = state;
  $('.pill-text', pill).textContent = PILL_TEXT[state];
}

// ---- stat cards ------------------------------------------------------------
const card = (name) => $(`[data-card="${name}"]`);
function setCard(name, state) {
  const c = card(name);
  c.dataset.state = state;
  c.setAttribute('aria-busy', String(state === 'loading'));
}
const num = (name) => $(`[data-num="${name}"]`);

function drawSpark(series) {
  const w = 200;
  const h = 56;
  const pad = 3;
  const min = Math.min(...series);
  const span = Math.max(...series) - min || 1;
  const pts = series.map((v, i) => [
    pad + (i / (series.length - 1 || 1)) * (w - pad * 2),
    h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
  const line = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  $('[data-spark="line"]').setAttribute('d', line);
  $('[data-spark="area"]').setAttribute('d', `${line} L${w - pad} ${h} L${pad} ${h} Z`);
}

async function pollChain() {
  try {
    const { block, gwei } = await fetchChain(reg.chain.rpc);
    countTo(num('block'), block, fmtInt);
    countTo(num('gas'), gwei, fmtGwei);
    setCard('block', 'ready');
    setCard('gas', 'ready');
    setPill('live');
  } catch {
    setPill('offline');
    if (card('block').dataset.state === 'loading') {
      setCard('block', 'error');
      setCard('gas', 'error');
    }
  }
}

async function pollTvl() {
  try {
    const t = await fetchTvl(reg.tvlSource);
    countTo(num('tvl'), t.latest, fmtCompactUsd);
    $('[data-num="tvlchg"]').textContent = t.change30 == null ? '' : `${fmtChange(t.change30)} over 30 days`;
    drawSpark(t.series);
    setCard('tvl', 'ready');
  } catch {
    if (card('tvl').dataset.state === 'loading') setCard('tvl', 'error');
  }
}

// ---- pairs -----------------------------------------------------------------
const mk = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

function pairRow(p, i) {
  const li = mk('li', 'pair-item');
  li.dataset.reveal = '';
  li.style.setProperty('--i', String(i));
  const row = mk(p.url ? 'a' : 'div', 'pair-row');
  if (p.url) {
    row.href = p.url;
    row.target = '_blank';
    row.rel = 'noopener noreferrer';
  }
  const sym = mk('span', 'pair-sym');
  sym.append(mk('b', null, p.symbol), mk('i', null, p.quote ? '/' + p.quote : ''));
  const chg = mk('span', 'pair-chg', fmtChange(p.change24));
  chg.dataset.dir = p.change24 > 0 ? 'up' : p.change24 < 0 ? 'down' : 'flat';
  row.append(
    sym,
    mk('span', 'pair-px', Number.isFinite(p.price) ? fmtPrice(p.price) : '—'),
    chg,
    mk('span', 'pair-liq', fmtCompactUsd(p.liquidity)),
    mk('span', 'pair-go', '↗'),
  );
  li.append(row);
  return li;
}

async function pollPairs() {
  const list = $('#pairs');
  try {
    const pairs = await fetchPairs(reg.pairSource);
    const sig = JSON.stringify(pairs);
    if (list.dataset.sig === sig) return;
    list.dataset.sig = sig;
    list.replaceChildren(...pairs.map(pairRow));
    list.dataset.state = 'ready';
    list.setAttribute('aria-busy', 'false');
    observe(list);
  } catch {
    if (list.dataset.state === 'loading') {
      list.replaceChildren(mk('li', 'pair-msg', 'Pair data is unavailable right now. We will try again shortly.'));
      list.dataset.state = 'error';
      list.setAttribute('aria-busy', 'false');
    }
  }
}

async function pollContractLine() {
  const kline = $('#kline');
  try {
    const p = await fetchContractPair(reg.pairSource, reg.contract.value);
    if (!p) return;
    $('[data-kline="price"]', kline).textContent = Number.isFinite(p.price) ? fmtPrice(p.price) : '—';
    $('[data-kline="chg"]', kline).textContent = fmtChange(p.change24);
    $('[data-kline="liq"]', kline).textContent = fmtCompactUsd(p.liquidity);
    kline.dataset.ready = '';
  } catch {
    /* keep the quiet state */
  }
}

// ---- contract copy ---------------------------------------------------------
function initCopy() {
  const btn = $('.ca-copy');
  if (!btn) return;
  const toast = $('.ca-toast');
  let timer;
  btn.addEventListener('click', async () => {
    const value = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = mk('textarea');
      ta.value = value;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.dataset.copied = '';
    toast.textContent = 'Copied';
    toast.dataset.show = '';
    clearTimeout(timer);
    timer = setTimeout(() => {
      delete btn.dataset.copied;
      delete toast.dataset.show;
      toast.textContent = '';
    }, ms(1800));
  });
}

// ---- polling ---------------------------------------------------------------
function every(fn, interval) {
  let busy = false;
  const run = async () => {
    if (busy || document.hidden) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };
  run();
  setInterval(run, ms(interval));
  document.addEventListener('visibilitychange', () => !document.hidden && run());
}

// ---- boot ------------------------------------------------------------------
const idEl = num('chainid');
idEl.textContent = '0';
card('chainid').addEventListener('revealed', () => countTo(idEl, reg.chain.id, (n) => String(Math.round(n))), { once: true });

observe();
initProgress($('.progress'));
initParallax($('.hero-visual'), $('.hero'));
initCopy();

every(pollChain, 12000);
every(pollTvl, 120000);
every(pollPairs, 60000);
if (reg.contract.state === 'stated') every(pollContractLine, 60000);
