# Open Startup Ecosystem: from a pin on a map to a program a founder can trust

**Track A · The Survey (data infrastructure) · Qatalyst Labs · David Jorjani**

> We turned two regional directories into one open, tested dataset of **237 organizations and
> 350 programs**—then used it to answer the question a founder actually has: _What can I apply
> to, from where, and can I trust this information?_

## The gap

A map can tell a founder where DMZ or MassChallenge is. It cannot tell them which program fits
their stage, who can apply, what it offers, or which facts still need review. Organizations are
containers; **programs are decisions**.

The Toronto ecosystem map and Mass AI Atlas began as useful but separate regional sources. They
did not share a program-level contract, so another region would repeat the same spreadsheet
cleanup, judgment calls and publishing work.

## What we built

`regional sources → structured YAML → validator → versioned JSON/CSV → live maps and org pages`

- **A program-level contract.** Programs record type, founder stage, audience, eligibility,
  delivery, fee, equity and what the founder receives. Headquarters (`hq`) is separate from who
  may apply (`open_to`).
- **Honest uncertainty.** Unconfirmed fields live under `review`; checks carry
  `last_verified`. Generated program details omit fields under review rather than quietly
  presenting a first guess as a fact.
- **Automated guardrails.** JSON Schema and cross-file rules catch unknown fields, duplicate ids
  and hosts, broken references, impossible coordinates and invalid variants. CI applies the same
  rules to every pull request.
- **Reusable output.** One build publishes versioned JSON and flat CSV. A live consumer generates
  two regional maps and 239 static pages from that same data.

## The measured result

| Before | Now |
| --- | --- |
| Two sources with no shared contract | 237 organizations and 350 programs under one schema |
| Organization rows hiding distinct offerings | Comparable program stage, audience, eligibility and source |
| Location used as a proxy for reach | `hq`, delivery location and `open_to` modeled separately |
| Uncertainty embedded in prose | Machine-readable `review` and `last_verified` |
| Manual, one-off publishing | 119 tests plus reproducible JSON, CSV and site builds |

Our new probe moved from **no shared program dataset to 350 schema-valid program records**.

## Why it is different—and trustworthy

The novelty is the combination of program-level actionability, geographic reach and explicit
uncertainty. A Toronto founder considering Boston can see Massachusetts organizations alongside
Toronto programs that remain open to them. Program variants reuse shared facts without copying
their eligibility or review state. One correction rebuilds every downstream surface.

Every program links to an official page. Sensitive identity eligibility requires the program's
own words and source URL. Link health distinguishes dead, parked, hijacked, moved and blocked
sites instead of trusting every HTTP 200. The validator can refuse a change, but it cannot
publish one: a maintainer remains the human gate.

This is not an AI system that makes plausible facts faster. It is infrastructure that makes it
harder for automation—or a human—to publish a plausible fact as a verified one.

## What the judges can verify live

1. **Pick any record:** open its YAML, click its official source and show verified versus review.
2. **Make it fail:** add a bad field or reference; the real repository validator refuses it.
3. **Build it again:** valid data produces the 237-organization, 350-program release and live
   regional pages.
4. **Follow one founder:** move from Toronto to Boston, find a defensible program and reach its
   official application source.

## Beyond the hackathon

The data is CC BY 4.0, the code is MIT, the repository is public, and releases have stable
download URLs. Next: verify Massachusetts programs to the Toronto standard, add safe organization
claims, and build a short “find my next step” intake on the same contract.

**Try it:** [live maps](https://getqatalyst.com/ecosystem/) ·
[source and validator](https://github.com/getqatalyst/startup-ecosystem) ·
[latest JSON](https://github.com/getqatalyst/startup-ecosystem/releases/latest/download/ecosystem.json)
