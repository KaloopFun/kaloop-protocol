// Live data. Every call has a timeout and validates its payload.
async function getJson(url, init, timeout = 9000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    if (!res.ok) throw new Error('http ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const hex = (v) => (typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v) ? parseInt(v, 16) : NaN);

export async function fetchChain(rpc) {
  const body = JSON.stringify([
    { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
    { jsonrpc: '2.0', id: 2, method: 'eth_gasPrice', params: [] },
  ]);
  const out = await getJson(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const byId = Object.fromEntries((Array.isArray(out) ? out : []).map((r) => [r.id, r.result]));
  const block = hex(byId[1]);
  const gwei = hex(byId[2]) / 1e9;
  if (!Number.isFinite(block) || !Number.isFinite(gwei)) throw new Error('bad rpc payload');
  return { block, gwei };
}

export async function fetchTvl(src) {
  const rows = await getJson(`${src.url}/v2/historicalChainTvl/${encodeURIComponent(src.slug)}`);
  const series = (Array.isArray(rows) ? rows : []).filter((r) => Number.isFinite(r?.tvl)).slice(-90);
  if (!series.length) throw new Error('empty tvl');
  const latest = series[series.length - 1].tvl;
  const base = series[Math.max(0, series.length - 31)].tvl;
  return { latest, change30: base > 0 ? ((latest - base) / base) * 100 : null, series: series.map((r) => r.tvl) };
}

const shapePair = (p) => ({
  symbol: String(p.baseToken?.symbol ?? '?').slice(0, 14),
  quote: String(p.quoteToken?.symbol ?? '').slice(0, 8),
  price: Number(p.priceUsd),
  change24: Number(p.priceChange?.h24),
  liquidity: Number(p.liquidity?.usd),
  url: typeof p.url === 'string' && p.url.startsWith('https://dexscreener.com/') ? p.url : null,
});

export async function fetchPairs(src) {
  const out = await getJson(`${src.url}/latest/dex/search?q=${encodeURIComponent(src.query)}`);
  const pairs = (out?.pairs ?? [])
    .filter((p) => p.chainId === src.chainSlug && Number(p.liquidity?.usd) > 0)
    .sort((a, b) => b.liquidity.usd - a.liquidity.usd)
    .slice(0, 5)
    .map(shapePair);
  if (!pairs.length) throw new Error('no pairs');
  return pairs;
}

export async function fetchContractPair(src, address) {
  const out = await getJson(`${src.url}/token-pairs/v1/${encodeURIComponent(src.chainSlug)}/${encodeURIComponent(address)}`);
  const best = (Array.isArray(out) ? out : []).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return best ? shapePair(best) : null;
}
