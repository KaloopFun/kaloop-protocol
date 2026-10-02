// Static build. No bundler: CSS is concatenated, JS modules are copied, HTML is rendered
// from the register so the contract slot and social icons are correct before any script runs.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validateRegister, renderCa, renderSocial, renderRecordRow, ICON_X, ICON_GITHUB, handleFromUrl, linkOf,
} from './src/js/records.js';

const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, process.env.KALOOP_OUT ?? 'dist');
const regPath = process.env.KALOOP_REGISTER ? resolve(process.env.KALOOP_REGISTER) : resolve(root, 'src/js/register.js');
const { register } = await import(pathToFileURL(regPath).href);

const problems = validateRegister(register);
if (problems.length) {
  console.error('register invalid:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const read = (p) => readFileSync(resolve(root, p), 'utf8');
const tokens = read('src/styles/tokens.css');

// Token colours are hex literals sampled from brand/ (see tools/palette.json); read them for the one tag that cannot use CSS variables.
const hexOf = (name) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error('token is not a hex literal: ' + name);
  return m[1].toLowerCase();
};

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'assets/js'), { recursive: true });

// CSS
const css = (tokens + '\n' + read('src/styles/site.css'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{};,>])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();
writeFileSync(resolve(out, 'assets/app.css'), css);

// JS (register.js is intentionally not shipped: the page reads the JSON the build embeds)
for (const f of ['clock', 'format', 'data', 'fx', 'main']) {
  cpSync(resolve(root, `src/js/${f}.js`), resolve(out, `assets/js/${f}.js`));
}

// Favicon + marks come from tools/make-assets.mjs (pixel grid and premultiplied resizes of the real logo).
const bg = hexOf('bg');
const assetsDir = resolve(root, 'src/assets');
if (!existsSync(assetsDir)) throw new Error('src/assets missing: run node tools/make-assets.mjs');
for (const f of readdirSync(assetsDir)) cpSync(resolve(assetsDir, f), resolve(out, 'assets', f));
cpSync(resolve(assetsDir, 'favicon.svg'), resolve(out, 'favicon.svg'));

const mark = '<img class="mark" src="/assets/logo-mark-112.png" width="32" height="32" alt="" decoding="async">';

const host = (u) => new URL(u).host;
const xHandle = (r) => handleFromUrl(r.url) ?? r.url;
const records = [
  renderRecordRow('Contract', register.contract, (r) => r.value),
  renderRecordRow('X account', register.x, xHandle),
  renderRecordRow('Code repository', register.github, (r) => host(r.url) + new URL(r.url).pathname),
];
if (register.launchDate.state === 'stated') {
  records.push(renderRecordRow('Launch date', register.launchDate, (r) => r.value));
}

const subs = {
  theme_color: bg,
  canonical: (linkOf(register.domain) ?? '').replace(/\/?$/, '/'),
  domain_host: register.domain.state === 'stated' ? host(register.domain.url) : '',
  mark,
  ca: renderCa(register.contract),
  social_x: renderSocial('X', register.x, ICON_X),
  social_github: renderSocial('GitHub', register.github, ICON_GITHUB),
  records: records.join('\n      '),
  chain_id: String(register.chain.id),
  contract_state: register.contract.state,
  tvl_label: register.tvlSource.label,
  tvl_site: register.tvlSource.site,
  pair_label: register.pairSource.label,
  pair_site: register.pairSource.site,
  register_json: JSON.stringify(register).replace(/</g, '\\u003c'),
};

const html = read('src/index.html').replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in subs)) throw new Error('unknown placeholder: ' + k);
  return subs[k];
});
writeFileSync(resolve(out, 'index.html'), html);

if (!existsSync(resolve(out, 'index.html'))) process.exit(1);
console.log(`built ${out}`);
