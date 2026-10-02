// One record per external fact. state: stated | absent | unconfirmed.
// A record that is not "stated" carries no value and no url.
export const register = {
  contract: { state: 'absent', value: null },
  x: { state: 'absent', url: null },
  github: { state: 'absent', url: null },
  launchDate: { state: 'absent', value: null },
  domain: { state: 'stated', url: 'https://kaloop.fun' },
  chain: {
    state: 'stated',
    id: 4663,
    label: 'RH Chain',
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
  },
  tvlSource: {
    state: 'stated',
    url: 'https://api.llama.fi',
    label: 'DefiLlama',
    site: 'https://defillama.com',
    slug: 'Robinhood Chain',
  },
  pairSource: {
    state: 'stated',
    url: 'https://api.dexscreener.com',
    label: 'DexScreener',
    site: 'https://dexscreener.com',
    chainSlug: 'robinhood',
    query: 'robinhood',
  },
  brandAssets: { state: 'stated', value: 'brand/' },
};
