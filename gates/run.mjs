// Gates: synthetic fixtures only, fast clock, one browser. Max 30 gates.
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { serve } from '../scripts/serve.mjs';
import { register } from '../src/js/register.js';
import { isAddress, linkOf, handleFromUrl, validateRegister, renderSocial, renderCa, ICON_X } from '../src/js/records.js';
import { fmtCompactUsd, fmtInt, fmtGwei } from '../src/js/format.js';
import { FIXTURE } from './fixture-register.js';
import { decodePng } from '../tools/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.now();
const FAST = 0.04;
const BPS = [
  { w: 360, h: 740 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
];

// ---- tiny harness ------------------------------------------------------------
const gates = [];
const gate = (name, fn) => gates.push({ name, fn });
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sleep = (n) => new Promise((r) => setTimeout(r, n));

// ---- file helpers ------------------------------------------------------------
const SKIP = new Set(['node_modules', 'package-lock.json']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const rel = (p) => relative(root, p).replace(/\\/g, '/');
const text = (p) => readFileSync(p, 'utf8');
const srcFiles = () => walk(resolve(root, 'src'));
const TOKENS = resolve(root, 'src/styles/tokens.css');

// ---- scanners (also exercised against fixtures) -------------------------------
// Colour literals. A 0x address is never a colour: hex must follow '#' and nothing word-like.
const COLOR_RES = [
  /(^|[^\w&])#[0-9a-fA-F]{3,8}\b/g,
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g,
];
const stripHtmlAnchors = (s) => s.replace(/href="#[^"]*"/g, '').replace(/&#x?[0-9a-fA-F]+;/g, '');
function colorLiterals(src) {
  const s = stripHtmlAnchors(src);
  return COLOR_RES.flatMap((re) => [...s.matchAll(re)].map((m) => m[0].trim()));
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const bigrams = (s) => {
  const w = words(s);
  return new Set(w.slice(1).map((x, i) => w[i] + ' ' + x));
};

// ---- build outputs -------------------------------------------------------------
function build(env) {
  const r = spawnSync(process.execPath, ['build.mjs'], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  ok(r.status === 0, 'build failed: ' + r.stderr);
}
const DIST = resolve(root, 'dist');
const stateTmp = mkdtempSync(join(tmpdir(), 'kaloop-gate-'));
const STATED = join(stateTmp, 'stated');
build({});
build({ KALOOP_OUT: STATED, KALOOP_REGISTER: resolve(root, 'gates/fixture-register.js') });

// ---- synthetic API -------------------------------------------------------------
const API_HOSTS = new Set([
  new URL(register.chain.rpc).host,
  new URL(register.tvlSource.url).host,
  new URL(register.pairSource.url).host,
]);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const pairOf = (sym, liq, chg, price, chain = 'robinhood') => ({
  chainId: chain,
  url: `https://dexscreener.com/${chain}/${sym.toLowerCase()}`,
  baseToken: { symbol: sym },
  quoteToken: { symbol: 'WETH' },
  priceUsd: String(price),
  priceChange: { h24: chg },
  liquidity: { usd: liq },
});
const PAIRS = {
  pairs: [
    pairOf('FIXC', 300000, 0, 0.0123),
    pairOf('FIXA', 900000, 12.5, 0.5),
    pairOf('FIXF', 20000, 1, 3),
    pairOf('FIXB', 450000, -3.2, 1.2345),
    pairOf('OTHERCHAIN', 99999999, 5, 1, 'basechain'),
    pairOf('FIXE', 90000, 2, 0.0004),
    pairOf('FIXD', 150000, -0.4, 22),
  ],
};
const TVL = Array.from({ length: 100 }, (_, i) => ({ date: 1700000000 + i * 86400, tvl: 100e6 + i * 0.4e6 }));
const TVL_LATEST = TVL[TVL.length - 1].tvl;
const BLOCK0 = 51000000;
const GAS_WEI = 33000000;

function makeApi(mode = 'ok', opts = {}) {
  const api = { mode, delay: opts.delay ?? 0, increment: opts.increment ?? true, calls: 0, hosts: new Set(), external: [] };
  api.handle = async (req) => {
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (api.delay) await sleep(api.delay);
    if (api.mode === 'fail') return req.respond({ status: 500, headers: cors, contentType: 'application/json', body: '{}' });
    const json = (v) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(v) });
    if (u.host === new URL(register.chain.rpc).host) {
      const body = JSON.parse(req.postData() ?? '[]');
      const block = BLOCK0 + (api.increment ? api.calls++ * 7 : 0);
      return json(body.map((c) => ({ jsonrpc: '2.0', id: c.id, result: c.method === 'eth_blockNumber' ? '0x' + block.toString(16) : '0x' + GAS_WEI.toString(16) })));
    }
    if (u.pathname.startsWith('/v2/historicalChainTvl/')) return json(TVL);
    if (u.pathname.startsWith('/latest/dex/search')) return json(PAIRS);
    if (u.pathname.startsWith('/token-pairs/v1/')) return json([pairOf('KLP', 777000, 4.2, 0.0777)]);
    return req.respond({ status: 404, headers: cors, body: '' });
  };
  return api;
}

// ---- page factory ----------------------------------------------------------------
const EDGE = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
ok(EDGE, 'no Chromium-family browser found (set CHROME_PATH)');

const servers = {};
let browser;

async function open(variant, bp, o = {}) {
  const api = o.api ?? makeApi(o.mode ?? 'ok', o);
  const page = await browser.newPage();
  const log = { errors: [], failed: [], hosts: new Set() };
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: bp.w, height: bp.h, deviceScaleFactor: 1, isMobile: bp.w <= 430, hasTouch: bp.w <= 430 });
  const fast = o.fast === false ? 1 : FAST;
  await page.evaluateOnNewDocument((f) => {
    window.__KALOOP_FAST__ = f;
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => void window.__copied.push(t) }, configurable: true });
  }, fast);
  if (o.reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.host === new URL(servers[variant].url).host) return req.continue();
    log.hosts.add(u.host);
    if (!API_HOSTS.has(u.host)) return req.abort();
    api.handle(req).catch(() => {});
  });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && log.errors.push('console: ' + m.text()));
  await page.goto(servers[variant].url + '/', { waitUntil: 'load' });
  if (o.settle !== false) try {
    await page.waitForFunction(() => document.querySelector('#pill').dataset.state !== 'connecting', { timeout: 20000 });
    if (o.mode !== 'fail') {
      await page.waitForFunction(() => document.querySelector('#pairs').dataset.state === 'ready' && document.querySelector('[data-card=tvl]').dataset.state === 'ready', { timeout: 20000 });
    } else {
      await page.waitForFunction(() => document.querySelector('#pairs').dataset.state === 'error', { timeout: 20000 });
    }
  } catch (e) {
    const dump = await page.evaluate(() => JSON.stringify({ pill: document.querySelector('#pill')?.dataset.state, pairs: document.querySelector('#pairs')?.dataset.state, tvl: document.querySelector('[data-card=tvl]')?.dataset.state })).catch(() => '?');
    throw new Error(`open(${variant}@${bp.w}) ${e.message} ${dump} errors=${log.errors.join(' | ')}`);
  }
  return { page, api, log };
}

const jump = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);

// ---- per-breakpoint measurements (shared by several gates) ------------------------
const measured = {};
async function measureAll() {
  const jobs = ['absent', 'stated'].flatMap((variant) =>
      BPS.map((bp) => async () => {
        const { page, log } = await open(variant, bp, { increment: false });
        const m = await page.evaluate(() => {
          const vis = (e) => {
            const r = e.getBoundingClientRect();
            const s = getComputedStyle(e);
            return r.width > 0 && r.height > 0 && r.bottom > 0 && s.visibility !== 'hidden' && s.display !== 'none';
          };
          const sel = 'a[href],button,input,select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])';
          const small = [...document.querySelectorAll(sel)].filter(vis).map((e) => {
            const r = e.getBoundingClientRect();
            return { el: e.tagName.toLowerCase() + '.' + e.className, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
          }).filter((x) => x.w < 47.99 || x.h < 47.99);
          const de = document.documentElement;
          const wide = [...document.querySelectorAll('body *')].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.hero-visual, .skip, .ca-toast, svg');
          }).map((e) => e.tagName.toLowerCase() + '.' + e.className).slice(0, 5);
          return { scrollW: de.scrollWidth, innerW: innerWidth, bodyW: document.body.scrollWidth, small, wide };
        });
        await jump(page, 1e6);
        await sleep(60);
        m.ca = await page.evaluate(() => {
          const top = document.querySelector('.top').getBoundingClientRect();
          const ca = document.querySelector('#ca');
          const addr = document.querySelector('.ca-addr');
          const slot = document.querySelector('.ca-slot');
          return {
            top: top.top,
            h: top.height,
            text: addr.textContent,
            interactive: ca.querySelectorAll('a,button').length,
            ariaDisabled: slot.getAttribute('aria-disabled'),
            addrOverflow: addr.scrollWidth > addr.clientWidth + 1,
            ellipsis: getComputedStyle(addr).textOverflow === 'ellipsis',
            hasDate: /\b(20\d\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(document.body.innerText) && /launch(ed)? (on|date)/i.test(document.body.innerText),
          };
        });
        measured[`${variant}:${bp.w}`] = { ...m, log };
        await page.close();
      }),
    );
  for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map((j) => j()));
}

// =================================================================================
// GATES
// =================================================================================
gate('register: every record has a valid state and absent records carry nothing', () => {
  ok(validateRegister(register).length === 0, validateRegister(register).join('; '));
  ok(register.contract.state === 'absent' && register.x.state === 'absent' && register.github.state === 'absent', 'brief says contract/X/GitHub start absent');
  ok(validateRegister({ ...register, x: { state: 'absent', url: 'https://x.com/oops' } }).length === 1, 'validator must catch data on an absent record');
  ok(validateRegister({ ...register, x: { state: 'maybe', url: null } }).length === 1, 'validator must catch an unknown state');
});

gate('link rule: no href for unstated records, handle derived from the stored URL', () => {
  ok(linkOf(register.x) === null && linkOf({ state: 'unconfirmed', url: 'https://x.com/a' }) === null, 'unstated records must not link');
  ok(linkOf({ state: 'stated', url: 'https://x.com/syn' }) === 'https://x.com/syn', 'stated record links');
  ok(handleFromUrl(FIXTURE.x) === '@fixture_handle', 'handle must derive from url');
  ok(!JSON.stringify(register).includes('handle'), 'register must not store a handle');
  const absentSocial = renderSocial('X', register.x, ICON_X);
  ok(!absentSocial.includes('href') && !absentSocial.includes('<a '), 'absent social must be inert');
  const html = text(join(DIST, 'index.html'));
  ok(!/href="https?:\/\/(x|twitter)\.com|href="https?:\/\/github\.com/.test(html), 'dist links to a social that is not stated');
});

gate('gate warning: 0x hex is never blanket-rejected', () => {
  for (const a of [FIXTURE.address, '0x' + 'a'.repeat(40), '0x' + 'ABCDEF0123'.repeat(4), '0x' + '0'.repeat(40)]) ok(isAddress(a), 'rejected valid address ' + a);
  for (const a of ['0x' + 'a'.repeat(39), '0x' + 'a'.repeat(41), '0x' + 'g'.repeat(40), 'a'.repeat(42), '']) ok(!isAddress(a), 'accepted invalid ' + a);
  ok(colorLiterals(`const a = "${FIXTURE.address}"; x = 0xdeadbeef`).length === 0, 'colour scanner flagged a 0x address');
  ok(colorLiterals('a{color:#ff00ff}').length === 1 && colorLiterals('a{color:rgb(1 2 3)}').length === 1, 'colour scanner misses real literals');
  const built = text(join(STATED, 'index.html'));
  ok(built.includes(FIXTURE.address), 'stated contract must reach the page whole');
});

gate('palette rule: colour literals live in tokens.css only', () => {
  const bad = srcFiles()
    .filter((f) => f !== TOKENS && /\.(css|js|html)$/.test(f))
    .map((f) => [rel(f), colorLiterals(text(f))])
    .filter(([, l]) => l.length);
  ok(!bad.length, 'literals outside tokens: ' + JSON.stringify(bad));
  ok(colorLiterals(text(TOKENS)).length > 10, 'tokens file should hold the palette');
});

gate('palette rule: tokens use only sampled colours, each one re-read from the real pixel', async () => {
  const palette = JSON.parse(text(resolve(root, 'tools/palette.json'))).swatches;
  const code = text(TOKENS);
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '');
  const used = [...new Set([...bare.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => '#' + m[1].toLowerCase()))];
  ok(used.length >= 8, 'tokens should hold the sampled palette, found ' + used.length);
  const known = new Set(palette.map((s) => s.hex));
  ok(used.every((h) => known.has(h)), 'hex in tokens that was never sampled: ' + used.filter((h) => !known.has(h)));
  const comment = code.match(/\/\*[\s\S]*?\*\//)[0];
  ok(/k-means/.test(comment), 'tokens.css needs the k-means provenance comment');
  for (const s of palette.filter((p) => used.includes(p.hex))) ok(comment.includes(s.hex) && comment.includes(`(${s.x},${s.y})`), 'provenance comment lacks ' + s.hex);
  // chromatic now: the brand is teal, so make sure nothing grey-only slipped in as the accent
  const acc = bare.match(/--accent:\s*#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  ok(acc && parseInt(acc[2], 16) - parseInt(acc[1], 16) > 40, 'accent should be the sampled teal');
  const page = await browser.newPage();
  const png = {};
  for (const s of palette) {
    let rgb;
    if (s.file.endsWith('.png')) {
      png[s.file] ??= decodePng(resolve(root, s.file));
      const im = png[s.file], k = (s.y * im.w + s.x) * 4;
      rgb = [im.px[k], im.px[k + 1], im.px[k + 2]];
    } else {
      const b64 = readFileSync(resolve(root, s.file)).toString('base64');
      rgb = await page.evaluate(async (b64, x, y) => {
        const img = new Image();
        img.src = 'data:image/jpeg;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
      }, b64, s.x, s.y);
    }
    const got = '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
    // PNG is exact. JPEG decoders round YCbCr differently, so allow one step per channel.
    const want = [1, 3, 5].map((k) => parseInt(s.hex.slice(k, k + 2), 16));
    const tol = s.file.endsWith('.png') ? 0 : 2;
    ok(rgb.every((v, k) => Math.abs(v - want[k]) <= tol), `${s.role}: ${s.file} @${s.x},${s.y} is ${got}, palette says ${s.hex}`);
  }
  await page.close();
});

gate('no ch units anywhere', () => {
  const bad = [...srcFiles(), ...walk(DIST)].filter((f) => /\.(css|js|html)$/.test(f) && /\d(?:\.\d+)?ch\b/.test(text(f))).map(rel);
  ok(!bad.length, 'ch units in ' + bad);
});

gate('repo hygiene: no agent config, no AI attribution', () => {
  const files = walk(root).filter((f) => !rel(f).startsWith('dist/') || true);
  const names = files.map((f) => basename(f).toLowerCase());
  ok(!names.includes('cl' + 'aude.md'), 'agent memory file present');
  ok(!files.some((f) => rel(f).split('/').includes('.cl' + 'aude')), 'agent config dir present');
  const needles = ['cl' + 'aude', 'anth' + 'ropic', 'co-authored' + '-by', 'generated' + ' with', 'noreply' + '@'];
  const hits = files
    .filter((f) => /\.(js|mjs|css|html|json|md|txt|svg)$/.test(f))
    .map((f) => [rel(f), needles.filter((n) => text(f).toLowerCase().includes(n))])
    .filter(([, n]) => n.length);
  ok(!hits.length, 'attribution strings: ' + JSON.stringify(hits));
});

gate('copy originality: zero shared word pairs with the reference', () => {
  const html = text(join(DIST, 'index.html'));
  const attrs = [...html.matchAll(/(?:aria-label|title|content)="([^"]*)"/g)].map((m) => m[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  const js = ['main', 'data', 'fx', 'format'].flatMap((n) => [...text(resolve(root, `src/js/${n}.js`)).matchAll(/(['"`])((?:(?!\1)[^\\\n$])+)\1/g)].map((m) => m[2]).filter((s) => /\s/.test(s)));
  const mine = bigrams([visible, ...attrs, ...js].join(' . '));
  const ref = bigrams(text(resolve(root, 'gates/reference-corpus.txt')));
  const shared = [...mine].filter((g) => ref.has(g));
  ok(shared.length === 0, 'shared word pairs: ' + shared.join(' | '));
  // The slides supply the product facts, not the wording: no four-word run may be lifted from them.
  const quad = (s) => { const w = words(s); return new Set(w.slice(3).map((_, i) => w.slice(i, i + 4).join(' '))); };
  const slides = quad(text(resolve(root, 'gates/slides-corpus.txt')));
  const lifted = [...quad([visible, ...attrs, ...js].join(' . '))].filter((q) => slides.has(q));
  ok(lifted.length === 0, 'phrases lifted from the slides: ' + lifted.join(' | '));
});

gate('build output: page, styles, scripts, favicon, no external assets', () => {
  for (const f of ['index.html', 'favicon.svg', 'assets/app.css', 'assets/js/main.js', 'assets/js/fx.js', 'assets/js/data.js']) ok(existsSync(join(DIST, f)), 'missing ' + f);
  const html = text(join(DIST, 'index.html'));
  ok(/<title>[^<]{6,}<\/title>/.test(html) && /name="description"/.test(html) && /rel="canonical" href="https:\/\/kaloop\.fun\/"/.test(html), 'head metadata incomplete');
  ok(!/<(script|img)[^>]+src="https?:/.test(html) && !/<link[^>]+rel="(stylesheet|icon|preload|modulepreload)"[^>]+href="https?:/.test(html), 'external asset reference');
  ok(!/\{\{\w+\}\}/.test(html), 'unfilled placeholder');
  const fav = text(join(DIST, 'favicon.svg'));
  const palette = new Set(JSON.parse(text(resolve(root, 'tools/palette.json'))).swatches.map((s) => s.hex));
  const runs = [...fav.matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})"/g)];
  ok(fav.startsWith('<svg') && fav.includes('viewBox="0 0 32 32"') && runs.length >= 50 && !fav.includes('<circle'), 'favicon must be the 32x32 pixel grid of the real logo');
  ok(runs.every((m) => palette.has(m[1])), 'favicon colour outside the sampled palette');
  for (const n of [512, 112]) {
    const im = decodePng(join(DIST, `assets/logo-mark-${n}.png`));
    ok(im.w === n && im.h === n, 'logo mark size ' + n);
    let edge = 0, dark = 0;
    for (let i = 0; i < n * n; i++) {
      const a = im.px[i * 4 + 3];
      if (a > 0 && a < 255) { edge++; if (im.px[i * 4 + 1] < 120) dark++; }
    }
    ok(edge > 50 && dark === 0, `logo mark ${n}: ${dark} of ${edge} edge pixels fringe dark (resize must be premultiplied)`);
  }
  ok(!/marquee/i.test(html + text(join(DIST, 'assets/app.css'))), 'reference has no marquee, so neither do we');
});

// ---- browser gates -------------------------------------------------------------------
gate('five breakpoints (360/390/430/1366/1440): no horizontal overflow', () => {
  const rows = [];
  for (const variant of ['absent', 'stated']) for (const bp of BPS) {
    const m = measured[`${variant}:${bp.w}`];
    rows.push(`${variant}@${bp.w}: doc ${m.scrollW}/${m.innerW}`);
    ok(m.scrollW <= m.innerW && m.bodyW <= m.innerW, `overflow ${variant}@${bp.w}: ${m.scrollW} > ${m.innerW}`);
    ok(!m.wide.length, `element past viewport ${variant}@${bp.w}: ${m.wide}`);
  }
  console.log('    ' + rows.join('  '));
});

gate('tap targets are at least 48px at every breakpoint', () => {
  for (const [k, m] of Object.entries(measured)) ok(!m.small.length, `${k}: ${JSON.stringify(m.small)}`);
});

gate('contract slot: always visible at the top, inert while absent, no date', () => {
  for (const bp of BPS) {
    const m = measured[`absent:${bp.w}`];
    ok(Math.abs(m.ca.top) < 0.5 && m.ca.h >= 48, `bar not pinned at ${bp.w}: top ${m.ca.top} h ${m.ca.h}`);
    ok(/not announced/i.test(m.ca.text), 'absent slot must say so');
    ok(m.ca.interactive === 0 && m.ca.ariaDisabled === 'true', 'absent slot must be inert');
    ok(!m.ca.hasDate, 'no date while absent');
  }
});

gate('contract slot: stated address shows whole, copies on click, socials link from stored URLs', async () => {
  for (const bp of BPS) {
    const m = measured[`stated:${bp.w}`];
    ok(m.ca.text === FIXTURE.address, `address not whole at ${bp.w}: ${m.ca.text}`);
    ok(!m.ca.addrOverflow && !m.ca.ellipsis, `address truncated at ${bp.w}`);
    ok(Math.abs(m.ca.top) < 0.5, 'stated bar must stay pinned');
  }
  const { page } = await open('stated', BPS[0]);
  await page.evaluate(() => {
    window.__toast = false;
    new MutationObserver(() => { if (document.querySelector('.ca-toast[data-show]')) window.__toast = true; }).observe(document.body, { subtree: true, attributes: true });
  });
  await page.click('.ca-copy');
  await page.waitForFunction(() => window.__toast, { timeout: 3000 });
  const copied = await page.evaluate(() => window.__copied);
  ok(copied.length === 1 && copied[0] === FIXTURE.address, 'clipboard got ' + JSON.stringify(copied));
  const links = await page.$$eval('.socials a', (as) => as.map((a) => [a.href, a.getAttribute('aria-label')]));
  ok(links.length === 2 && links[0][0] === FIXTURE.x && links[0][1].includes('@fixture_handle') && links[1][0] === FIXTURE.github, 'socials: ' + JSON.stringify(links));
  await page.waitForFunction(() => document.querySelector('#kline[data-ready]'), { timeout: 5000 });
  const kline = await page.$eval('#kline', (e) => e.innerText);
  ok(/0\.0777/.test(kline), 'contract market line missing: ' + kline);
  await page.close();
});

gate('skeletons: every live slot shows one while loading, none after', async () => {
  const { page } = await open('absent', BPS[3], { mode: 'ok', delay: 1500, settle: false });
  const during = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-card][data-state=loading]')].map((c) => getComputedStyle(c.querySelector('.skel')).display + ':' + getComputedStyle(c.querySelector('.skel')).animationName),
    rows: document.querySelectorAll('#pairs .is-skel .skel').length,
    busy: document.querySelector('#pairs').getAttribute('aria-busy'),
  }));
  ok(during.cards.length === 3 && during.cards.every((c) => c === 'block:skeleton-shimmer'), 'card skeletons: ' + during.cards);
  ok(during.rows === 5 && during.busy === 'true', 'pair skeleton rows: ' + during.rows);
  await page.waitForFunction(() => document.querySelector('#pairs').dataset.state === 'ready' && !document.querySelector('[data-card][data-state=loading]'), { timeout: 9000 });
  const after = await page.evaluate(() => [...document.querySelectorAll('.skel')].filter((s) => s.offsetParent !== null).length);
  ok(after === 0, 'skeletons still visible: ' + after);
  await page.close();
});

gate('live data: chain, value locked and pairs render from the feeds', async () => {
  const { page } = await open('absent', BPS[3], { increment: false });
  await sleep(120);
  const v = await page.evaluate(() => ({
    block: document.querySelector('[data-num=block]').textContent,
    gas: document.querySelector('[data-num=gas]').textContent,
    tvl: document.querySelector('[data-num=tvl]').textContent,
    chg: document.querySelector('[data-num=tvlchg]').textContent,
    spark: document.querySelector('[data-spark=line]').getAttribute('d').length,
    rows: [...document.querySelectorAll('#pairs .pair-row')].map((r) => [r.querySelector('b').textContent, r.href]),
  }));
  ok(v.block === fmtInt(BLOCK0), 'block ' + v.block);
  ok(v.gas === fmtGwei(GAS_WEI / 1e9), 'gas ' + v.gas);
  ok(v.tvl === fmtCompactUsd(TVL_LATEST), 'tvl ' + v.tvl);
  ok(/▲/.test(v.chg) && v.spark > 100, 'tvl change / sparkline missing: ' + v.chg);
  ok(v.rows.map((r) => r[0]).join() === 'FIXA,FIXB,FIXC,FIXD,FIXE', 'pairs ' + v.rows.map((r) => r[0]));
  ok(v.rows.every((r) => r[1].startsWith('https://dexscreener.com/')), 'pair links must stay on the source');
  await page.close();
});

gate('count-up: numbers climb from zero on a real clock', async () => {
  const { page } = await open('absent', BPS[3], { fast: false, increment: false, settle: false });
  await page.evaluate(() => {
    window.__seen = [];
    new MutationObserver(() => {
      const t = document.querySelector('[data-num=block]').textContent;
      if (t) window.__seen.push([Math.round(performance.now()), Number(t.replace(/,/g, ''))]);
    }).observe(document.querySelector('[data-num=block]'), { childList: true, characterData: true, subtree: true });
  });
  await page.waitForFunction(() => document.querySelector('[data-card=block]').dataset.state === 'ready', { timeout: 9000 });
  await sleep(1600);
  const rec = await page.evaluate(() => window.__seen);
  const seen = rec.map((r) => r[1]);
  ok(seen.length >= 6 && seen.some((n) => n > 0 && n < BLOCK0), 'no intermediate value: ' + JSON.stringify(rec.slice(0, 8)));
  ok(seen.every((n, i) => i === 0 || n >= seen[i - 1]), 'count-up not monotonic');
  ok(rec[rec.length - 1][0] - rec[0][0] > 700, 'count-up finished too fast: ' + (rec[rec.length - 1][0] - rec[0][0]) + 'ms');
  ok((await page.$eval('[data-num=block]', (e) => e.textContent)) === fmtInt(BLOCK0), 'did not land on the value');
  await page.close();
});

gate('flash: a changed live value flashes', async () => {
  const { page } = await open('absent', BPS[3], { increment: true, settle: false });
  await page.evaluate(() => {
    window.__flashes = 0;
    new MutationObserver((ms) => ms.forEach((m) => m.target.classList?.contains('flash') && window.__flashes++)).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.waitForFunction(() => window.__flashes > 0, { timeout: 20000 });
  await page.close();
});

gate('status pill: live dot pulses when live, goes still when the chain is unreachable', async () => {
  const live = await open('absent', BPS[3]);
  const a = await live.page.evaluate(() => ({ s: document.querySelector('#pill').dataset.state, t: document.querySelector('.pill-text').textContent, a: getComputedStyle(document.querySelector('#pill .dot'), '::after').animationName }));
  ok(a.s === 'live' && a.t === 'Chain live' && a.a === 'pulse-ring', JSON.stringify(a));
  await live.page.close();
  const down = await open('absent', BPS[3], { mode: 'fail' });
  const b = await down.page.evaluate(() => ({ s: document.querySelector('#pill').dataset.state, a: getComputedStyle(document.querySelector('#pill .dot'), '::after').animationName }));
  ok(b.s === 'offline' && b.a === 'none', JSON.stringify(b));
  await down.page.close();
});

gate('scroll progress bar tracks the page from 0 to 1', async () => {
  const { page } = await open('absent', BPS[3], { increment: false });
  const read = () => page.$eval('.progress', (e) => new DOMMatrix(getComputedStyle(e).transform).a);
  await jump(page, 0);
  await sleep(80);
  const top = await read();
  await jump(page, 1e6);
  await sleep(80);
  const bottom = await read();
  await jump(page, 1);
  await jump(page, (await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)) / 2);
  await sleep(80);
  const mid = await read();
  ok(top < 0.01 && bottom > 0.99 && mid > 0.3 && mid < 0.7, `progress ${top} / ${mid} / ${bottom}`);
  await page.close();
});

gate('scroll reveals: below-fold content waits, then enters with a stagger', async () => {
  const { page } = await open('absent', BPS[3], { increment: false });
  const before = await page.$eval('#records .rec-row', (e) => ({ inView: e.classList.contains('in'), op: getComputedStyle(e).opacity }));
  ok(!before.inView && before.op === '0', 'record row revealed too early: ' + JSON.stringify(before));
  await page.$eval('#records', (e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelectorAll('#records .rec-row.in').length === 3, { timeout: 5000 });
  const delays = await page.$$eval('#records .rec-row', (rs) => rs.map((r) => parseFloat(getComputedStyle(r).animationDelay)));
  ok(delays[0] < delays[1] && delays[1] < delays[2], 'no stagger: ' + delays);
  const hero = await page.$$eval('.hero-copy [data-reveal]', (rs) => rs.map((r) => parseFloat(getComputedStyle(r).animationDelay)));
  ok(hero.every((d, i) => i === 0 || d > hero[i - 1]), 'hero entrance not staggered: ' + hero);
  await page.close();
});

gate('reduced motion: nothing animates, everything is already in place', async () => {
  const { page } = await open('stated', BPS[3], { reduced: true, increment: false });
  const r = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('*')) {
      for (const ps of [null, '::before', '::after']) {
        const s = getComputedStyle(el, ps);
        if (s.animationName !== 'none') bad.push(el.tagName + el.className + ps + ' anim ' + s.animationName);
        if (s.transitionDuration.split(',').some((d) => parseFloat(d) !== 0)) bad.push(el.tagName + el.className + ps + ' trans ' + s.transitionDuration);
      }
    }
    const hidden = [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity !== '1').length;
    return { bad: bad.slice(0, 6), hidden, block: document.querySelector('[data-num=block]').textContent, id: document.querySelector('[data-num=chainid]').textContent, smooth: getComputedStyle(document.documentElement).scrollBehavior };
  });
  ok(!r.bad.length, 'motion under reduce: ' + r.bad);
  ok(r.hidden === 0, r.hidden + ' reveal elements hidden');
  ok(r.block === fmtInt(BLOCK0) && r.id === '4663', 'counters not instant: ' + r.block + ' ' + r.id);
  ok(r.smooth === 'auto', 'smooth scroll under reduce');
  await page.mouse.move(600, 300);
  await sleep(100);
  ok((await page.$eval('.hero-visual', (e) => e.style.getPropertyValue('--px'))) === '', 'parallax must be inert under reduce');
  await page.close();
});

gate('parallax: depth layers move at different rates on pointer and scroll', async () => {
  const { page } = await open('absent', BPS[3], { increment: false });
  const box = await page.$eval('.hero', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.2);
  await sleep(250);
  const shifts = await page.$$eval('.depth', (ds) => ds.map((d) => [parseFloat(d.style.getPropertyValue('--d')), new DOMMatrix(getComputedStyle(d).transform).m41]));
  const near = shifts.find((s) => s[0] === 1.5)[1];
  const far = shifts.find((s) => s[0] === 0.25)[1];
  ok(near > far && far > 0, `layers did not separate: ${JSON.stringify(shifts)}`);
  const sy0 = await page.$eval('.hero-visual', (e) => e.style.getPropertyValue('--sy'));
  await jump(page, 260);
  await sleep(120);
  const sy1 = await page.$eval('.hero-visual', (e) => e.style.getPropertyValue('--sy'));
  ok(sy0 !== sy1, `scroll parallax static: ${sy0} -> ${sy1}`);
  await page.close();
});

gate('hover: every interactive element answers a hover, and focus shows a ring', async () => {
  const { page } = await open('stated', BPS[3], { increment: false });
  const count = await page.$$eval('a[href]:not(.skip),button', (e) => e.length);
  ok(count >= 12, 'expected the full interactive set, saw ' + count);
  const dead = [];
  for (let i = 0; i < count; i++) {
    const el = (await page.$$('a[href]:not(.skip),button'))[i];
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.mouse.move(1, 1);
    await sleep(60);
    const snap = (e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.borderColor, s.opacity, s.transform, s.borderBottomColor].join('|'); };
    const before = await el.evaluate(snap);
    const trans = await el.evaluate((e) => getComputedStyle(e).transitionDuration);
    await el.hover();
    await sleep(120);
    const after = await el.evaluate(snap);
    const name = await el.evaluate((e) => e.tagName + '.' + e.className);
    if (before === after) dead.push(name + ' no hover change');
    if (trans.split(',').every((d) => parseFloat(d) === 0)) dead.push(name + ' no transition');
  }
  ok(!dead.length, dead.join('; '));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth; });
  ok(/solid 2px/.test(ring), 'focus ring: ' + ring);
  await page.close();
});

gate('no console errors, no stray hosts, only the three feeds', async () => {
  for (const variant of ['absent', 'stated']) {
    const m = measured[`${variant}:1366`];
    ok(!m.log.errors.length, variant + ': ' + m.log.errors.join(' | '));
    ok([...m.log.hosts].every((h) => API_HOSTS.has(h)), variant + ' contacted ' + [...m.log.hosts]);
    ok(m.log.hosts.size === 3, 'expected all three feeds, got ' + [...m.log.hosts]);
  }
});

gate('feeds down: calm error states, no NaN or undefined, still no overflow', async () => {
  const { page } = await open('absent', BPS[0], { mode: 'fail' });
  const r = await page.evaluate(() => ({
    body: document.body.innerText,
    errs: [...document.querySelectorAll('[data-card][data-state=error] .err')].filter((e) => e.offsetParent).length,
    pairs: document.querySelector('#pairs').innerText,
    sw: document.documentElement.scrollWidth,
  }));
  ok(!/NaN|undefined|null|\[object/.test(r.body), 'leaked junk text');
  ok(r.errs === 3 && /unavailable/i.test(r.pairs), `error states: ${r.errs} ${r.pairs}`);
  ok(r.sw <= 360, 'overflow in error state');
  await page.close();
});

gate('whole run stays under five minutes', () => {
  ok(Date.now() - T0 < 300000, 'run took ' + (Date.now() - T0) + 'ms');
});

// =================================================================================
if (gates.length > 30) throw new Error(`gate budget exceeded: ${gates.length} > 30`);

servers.absent = await serve(DIST);
servers.stated = await serve(STATED);
browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: false,
  userDataDir: mkdtempSync(join(tmpdir(), 'kaloop-prof-')),
  timeout: 30000,
  args: ['--headless=new', '--no-first-run', '--no-default-browser-check'],
});

let failed = 0;
try {
  await measureAll();
  for (const [i, g] of gates.entries()) {
    const t = Date.now();
    try {
      await g.fn();
      console.log(`PASS ${String(i + 1).padStart(2, '0')} ${g.name} (${Date.now() - t}ms)`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${String(i + 1).padStart(2, '0')} ${g.name}\n     ${String(e.message).slice(0, 600)}`);
    }
  }
} finally {
  const proc = browser.process();
  await Promise.race([browser.close().catch(() => {}), sleep(4000)]);
  proc?.kill();
  servers.absent.close();
  servers.stated.close();
  rmSync(stateTmp, { recursive: true, force: true });
}
console.log(`\n${gates.length - failed}/${gates.length} gates passed in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
