# Contributing to Kaloop

Thanks for taking the time. This project is small and opinionated; a few rules keep it that way.

## Ground rules

1. **One record per external fact.** Addresses, links, dates and endpoints live in `src/js/register.js` with a state of `stated`, `absent` or `unconfirmed`. Do not hard-code them elsewhere.
2. **No link without a statement.** A link may only come from a `stated` record, through `linkOf`. Never add an `href` for something that has not been announced.
3. **Never blanket-reject `0x` hex.** Address checks accept any `0x` plus 40 hex digits in any case. Colour checks look for `#`, not for hex-looking text.
4. **Colours live in `src/styles/tokens.css` only.** New colours must be mixes of the sampled palette. A new literal needs a new sampled swatch in `tools/palette.json` with its source file and coordinates.
5. **Copy is original.** Write in the project's own voice. The copy gate fails on shared two-word sequences with the material listed in `gates/reference-corpus.txt`.
6. **Respect reduced motion.** Anything that moves needs an instant fallback.
7. **No `ch` units, no horizontal overflow, no tap target under 48 pixels.**

## Setup

```bash
npm install
npm run build
npm run gates
```

Gates open a headless Chromium-family browser. Set `CHROME_PATH` if yours is not in a standard location. The suite should finish in a few minutes; if you add a gate, keep the total at thirty or fewer and prefer synthetic fixtures over real network calls.

## Making a change

1. Open an issue first for anything larger than a typo or a one-line fix.
2. Keep changes focused. One concern per pull request.
3. Run the build and the gates before you push, and include the result in the description.
4. If you change visible text, say why. If you change a layout, say which widths you checked.

## Style

- Plain modern JavaScript modules, no bundler, no framework.
- Match the surrounding code: naming, comment density and idiom.
- Comments explain why, not what.
- Do not add dependencies without discussion. The runtime has none.

## Commit messages

Short imperative subject, then a body if the reason is not obvious. Describe what changed and why it is safe.

## Brand files

Files in `brand/` and `reference/` are the property of the project. Do not edit them or redistribute them. To regenerate site assets run `node tools/make-assets.mjs`.

## Code of conduct

Be direct, be kind, and assume good faith. Harassment of any kind ends a discussion and may end participation.
