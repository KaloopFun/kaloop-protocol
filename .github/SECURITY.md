# Security Policy

## Scope

This repository contains the Kaloop website and its supporting tooling. No Kaloop smart contract has been announced or deployed, so there is currently nothing on-chain to attack. This policy will be extended when contracts exist.

In scope today:

- The static site served at kaloop.fun and its build output
- Cross-site scripting, content injection or request forgery through any value the page reads from third-party feeds
- Anything that would make the site display or copy a wrong contract address once one is announced
- Anything that would make the site link somewhere that has not been announced
- Dependency or build-tool issues that affect what is shipped

Out of scope:

- Findings in third-party services (the public RPC, DefiLlama, DexScreener) themselves
- Social engineering, physical attacks and denial of service by volume
- Reports that depend on a compromised device or browser extension

## Reporting

There is no dedicated security mailbox and no official social account yet, and this document will not invent one.

- When the public repository is announced, use its private vulnerability reporting feature.
- Until then, do not post details publicly. Contact the maintainers through the channel on which you found this project and ask for a private route; do not include exploit details in that first message.

## What to include

A short description, the affected page or file, steps to reproduce, and the impact you believe it has. A proof of concept is welcome if it is harmless.

## What to expect

We aim to acknowledge a report promptly, confirm or dispute it with reasons, and fix confirmed issues before disclosing them. We ask for reasonable time to do so and will credit reporters who want credit.

## Safe harbour

Good-faith research that stays within this policy, avoids harming other people's data or availability, and is reported privately will not be treated as hostile.

## Design notes that help reviewers

- The site has no backend, stores nothing about visitors and holds no keys.
- Feed data is written into the page with `textContent`; link targets from feeds are accepted only on the expected host.
- The contract slot renders the full address from a validated record and is built before any script runs.
- Every external fact lives in one register and nothing is linked unless its record is `stated`.
