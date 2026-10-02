# Kaloop Whitepaper

Working draft. Anything marked *open* has not been decided and should not be read as a promise.

## 1. Summary

Kaloop is a token launch platform for RH Chain, an EVM network with chain id 4663. It exists to shorten the distance between having an idea and having a token that people can hold, trade and build around, while leaving every consequential decision with the person who signs.

The name describes the shape of the product. A launch is not a single event; it is a loop of making something, funding it, handing it to a community, and learning from what the market does with it. Kaloop is designed around the whole turn.

## 2. The problem

Launching a token today usually means stitching together several unrelated pieces: a contract nobody on the team fully understands, a liquidity step done by hand, a funding conversation held somewhere else, and a community channel that has no verifiable link to any of it. Three things go wrong repeatedly:

1. **Opacity.** Holders cannot tell what a token's rules are, who controls them, or what changed.
2. **Friction at the start.** Creators lose weeks to plumbing before they reach the part that matters, which is the project.
3. **Weak accountability.** When something is announced, there is rarely a simple, public place that shows what has and has not been confirmed.

## 3. Approach

### 3.1 Create

A creator names a token, sets its supply and settles its terms in one sitting, before anything touches the network. The terms are fixed in the open and are readable by anyone who inspects the token afterwards. *Open:* the exact set of configurable terms, and which of them are immutable once deployed.

### 3.2 Fund

Some projects need capital and some do not. Kaloop treats funding as optional. Where a creator wants it, one path begins on RH Chain itself: the amounts and the route are displayed in full and nothing proceeds until the creator reviews and approves it from their own wallet. *Open:* the providers behind any funding path, their fees, and the geographies in which a path is offered.

### 3.3 Own

Control stays with whoever holds the keys. Day-to-day management happens from the wallet, not from an account on a server. The community can hold a real share of what is built, and the market data around a token stays public so that anyone can check it. *Open:* which management actions exist at launch and which come later.

## 4. Principles

- **Signed by the person who means it.** Kaloop does not take custody. Transactions are prepared for review and signed by the holder.
- **Announce, then link.** A contract address, a social account or a repository appears on the site only after it has been announced. Until then the slot is visibly empty.
- **Live numbers, not screenshots.** The network readout on the website is fetched from public endpoints in the visitor's browser and is never mocked.
- **Small surface.** The site has no backend and stores nothing about visitors.

## 5. What exists today

- The public website, including the live readout of block height, gas price, value locked and nearby trading pairs.
- A contract slot and social links that stay inert until announced.
- A brand kit, a sampled colour palette and an automated check suite that guards them.

## 6. What does not exist yet

- A deployed Kaloop token contract. No address has been announced.
- A deployed launch contract or any funding path.
- An audit of anything. No audit has taken place, and no claim of one is made here.

## 7. Risks

Tokens are volatile and can lose all of their value. Smart contracts can contain defects even when carefully written and reviewed. A launch platform concentrates attention on young projects, and young projects fail often. Nothing in this repository is financial advice, and nothing on the website is an offer to sell anything.

## 8. Open questions

- Final shape of the launch terms and which are immutable.
- Funding providers, fees and availability.
- Whether any protocol-level fee exists and where it would go (see the tokenomics document).
- Governance, if any, and how it would be introduced.
- Audit scope and timing.

These will be settled in public and reflected in this document as they are.
