// Pure helpers shared by the build step and the gates. No DOM, no colours.
export const STATES = ['stated', 'absent', 'unconfirmed'];

// Any 0x + 40 hex address, any case. Never reject a 0x string for looking like hex.
export const isAddress = (s) => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The only way to get an href out of a record.
export const linkOf = (rec) =>
  rec && rec.state === 'stated' && typeof rec.url === 'string' && rec.url ? rec.url : null;

// Store the URL, derive the handle.
export function handleFromUrl(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : null;
  } catch {
    return null;
  }
}

export function validateRegister(reg) {
  const errors = [];
  for (const [key, rec] of Object.entries(reg)) {
    if (!rec || !STATES.includes(rec.state)) {
      errors.push(`${key}: bad state`);
      continue;
    }
    const payload = Object.entries(rec).filter(([k]) => k !== 'state');
    if (rec.state !== 'stated' && payload.some(([, v]) => v != null)) errors.push(`${key}: ${rec.state} record carries data`);
    if (rec.state === 'stated' && payload.every(([, v]) => v == null)) errors.push(`${key}: stated record is empty`);
  }
  if (reg.contract.state === 'stated' && !isAddress(reg.contract.value)) errors.push('contract: stated value is not an address');
  return errors;
}

const ICON_COPY =
  '<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>';
export const ICON_X =
  '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
export const ICON_GITHUB =
  '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>';

// Contract slot: a copy button once stated, an inert block until then.
export function renderCa(rec) {
  if (rec.state === 'stated' && isAddress(rec.value)) {
    return `<button type="button" class="ca-slot ca-copy" data-copy="${esc(rec.value)}" aria-label="Copy contract address ${esc(rec.value)}"><span class="ca-addr">${esc(rec.value)}</span><span class="ca-icon">${ICON_COPY}</span></button><span class="ca-toast" role="status" aria-live="polite"></span>`;
  }
  const word = rec.state === 'unconfirmed' ? 'Unconfirmed' : 'Not announced yet';
  return `<div class="ca-slot ca-empty" aria-disabled="true"><span class="ca-addr">${word}</span></div><span class="ca-toast" role="status" aria-live="polite"></span>`;
}

export function renderSocial(name, rec, icon) {
  const href = linkOf(rec);
  if (href) {
    const handle = handleFromUrl(href);
    const label = handle ? `${name}, ${handle}` : name;
    return `<a class="icon-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}">${icon}</a>`;
  }
  return `<span class="icon-btn is-inert" role="img" aria-label="${esc(name)}, not announced yet">${icon}</span>`;
}

const BADGE = { stated: 'Announced', absent: 'Not announced', unconfirmed: 'Unconfirmed' };

export function renderRecordRow(label, rec, display) {
  const href = linkOf(rec);
  let value = '<span class="rec-none">Nothing to point at yet</span>';
  if (rec.state === 'stated') {
    value = href
      ? `<a class="rec-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(display(rec))}</a>`
      : `<span class="rec-value">${esc(display(rec))}</span>`;
  }
  return `<li class="rec-row" data-reveal data-state="${rec.state}"><span class="rec-label">${esc(label)}</span><span class="badge" data-state="${rec.state}">${BADGE[rec.state]}</span><span class="rec-val">${value}</span></li>`;
}
