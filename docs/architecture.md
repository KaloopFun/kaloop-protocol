# Architecture

This document describes what is in the repository today, then where protocol components would attach. It keeps the two clearly apart.

## 1. The website

A static site with no server component.

```
src/index.html            page template with {{placeholders}}
src/styles/tokens.css     the only file that may contain colour literals
src/styles/site.css       layout, components, motion
src/js/register.js        every external fact, one record each
src/js/records.js         pure helpers: validation, link derivation, markup for records
src/js/main.js            boot, polling, rendering of live values
src/js/data.js            network, value-locked and pair fetchers
src/js/fx.js              reveals, progress bar, parallax, count-up
src/js/clock.js           duration scaling used by the gates
src/js/format.js          number formatting
build.mjs                 renders the template and writes dist/
```

### 1.1 Build

`build.mjs` loads the register, validates it, and renders the HTML so that the contract slot and social icons are correct before any script runs. CSS is concatenated (tokens first) and lightly minified. Scripts are copied as ES modules; there is no bundler. The register is embedded in the page as a JSON block so the browser reads the same facts the build used.

### 1.2 The register

Every external fact is one record with a `state` of `stated`, `absent` or `unconfirmed`.

- A record that is not `stated` carries no value and no URL. The validator rejects it otherwise.
- A link is produced only through `linkOf(record)`, which returns a URL for `stated` records and `null` for everything else.
- Handles are derived from stored URLs and never stored themselves.
- The contract validator accepts any `0x` followed by 40 hexadecimal digits in any case and never rejects an address because it looks like hex.

### 1.3 Live data

All data is fetched in the visitor's browser.

| Value | Source | Call |
| --- | --- | --- |
| Block height, gas price | Public RPC for network 4663 | One batched JSON-RPC request: `eth_blockNumber`, `eth_gasPrice` |
| Value locked and 90-day history | DefiLlama | `historicalChainTvl` for the chain |
| Nearby trading pairs | DexScreener | Search, filtered to the chain and sorted by liquidity |
| Kaloop market line | DexScreener | Token pairs for the contract, only once the contract is stated |

Each call has a timeout and validates its payload. Polling pauses while the tab is hidden. When a feed fails the card shows a calm "Unavailable" state, the status pill reports the network as unreachable, and the next poll tries again. Text from feeds is inserted with `textContent`; link targets from feeds are accepted only on the expected host.

### 1.4 Motion

All motion is driven by CSS custom properties and one scale factor, `--ts`. The gates set a fast clock by scaling it down. Under `prefers-reduced-motion` every animation and transition is removed and the scripts apply final states immediately.

### 1.5 Assets and palette

`tools/make-assets.mjs` produces the header marks and the pixel-grid favicon from the brand files. Colours in `tokens.css` are sampled values recorded in `tools/palette.json`; every other colour in the styles is a mix of those.

### 1.6 Checks

`gates/run.mjs` builds the site twice (once with the real register, once with a synthetic register where everything is announced), serves both, drives a headless browser against synthetic feed responses, and reports pass or fail for each gate. No gate touches the real network.

## 2. Protocol components (not yet built)

These describe intent only. None of them exist, and their shape may change.

- **Launch contracts.** Deploy a token with fixed, readable terms. Anything adjustable is a deliberate, visible choice.
- **Funding path.** An optional route whose amounts are displayed in full and approved from the holder's wallet.
- **Indexing.** Reading launched tokens and their market data into public pages without introducing custody.

The website would stay static: new features would read from contracts and public indexers in the browser, preserving the property that the site stores nothing about its visitors.

## 3. Trust boundaries

- The site never holds keys and never sends a transaction on its own.
- Third-party feeds are untrusted input: validated, bounded in time, and never executed.
- The register is the single place a fact becomes public. If it is not stated there, it does not appear.
