# Kaloop

**Build what comes next.**

Kaloop is a token launch platform for RH Chain (network id 4663). It is meant to carry an idea from a first sketch to an open market: create the token, raise capital if the project needs it, and keep control in the wallet that holds the keys.

This repository holds the public website at [kaloop.fun](https://kaloop.fun) and the documents that describe the protocol around it.

## Status

| Piece | State |
| --- | --- |
| Website with live network readout | Built, in this repository |
| Brand kit and palette tooling | Built, in `brand/` and `tools/` |
| Token contract address | Not announced |
| Official X account | Not announced |
| Public code repository link | Not announced |
| Launch date | Not announced |

Nothing is linked from the site until it has been announced. The site renders each of those slots from a single record with one of three states: `stated`, `absent` or `unconfirmed`. Only `stated` records ever produce a link or an address.

## What the site does

- Reads the network directly from the browser: latest block and gas price from the public node, value locked from DefiLlama, nearby trading pairs from DexScreener. No backend, no stored data.
- Shows a contract slot pinned to the top of every page. It stays inert until an address is announced, then becomes a click-to-copy control showing the full address.
- Animates with restraint: scroll reveals, count-up numbers that flash when a value changes, skeleton placeholders, a scroll progress bar, a live status pill. Every motion has an instant fallback under `prefers-reduced-motion`.

## Quick start

Requires Node 20 or newer.

```bash
npm install
npm run build     # writes dist/
npm run gates     # builds fixtures, opens a headless browser, runs every check
node scripts/serve.mjs dist 4173
```

The gates need a Chromium-family browser. Set `CHROME_PATH` if it is not in a standard location.

## Layout

```
brand/        source logos from the design team
reference/    presentation slides and cover image
src/          page template, styles, scripts, generated assets
tools/        asset pipeline and the sampled palette record
gates/        automated checks and their synthetic fixtures
scripts/      static file server used by the gates
docs/         whitepaper, tokenomics, roadmap, architecture
```

## Brand pipeline

`tools/make-assets.mjs` reads the transparent logo in `brand/`, resizes it with premultiplied alpha (the source stores pure black under fully transparent pixels, so a straight resize would leave dark fringes), and writes the header marks plus a 32 by 32 pixel-grid favicon to `src/assets/`.

The colour palette in `src/styles/tokens.css` was sampled from the brand files with k-means and snapped to real pixels. `tools/palette.json` records the source file and coordinates of every swatch, and the gates re-read each pixel to confirm it.

## Documents

- [Whitepaper](docs/whitepaper.md): the idea, the launch lifecycle, and the open questions
- [Tokenomics](docs/tokenomics.md): what will be disclosed and how, with every parameter marked as undecided
- [Roadmap](docs/roadmap.md): sequence of work without dates
- [Architecture](docs/architecture.md): how the site works today and where protocol components would attach

## Contributing and security

See [CONTRIBUTING](.github/CONTRIBUTING.md) and [SECURITY](.github/SECURITY.md).

## License

Source code is released under the [MIT License](LICENSE). The Kaloop name, logo and brand files are not covered by that license.
