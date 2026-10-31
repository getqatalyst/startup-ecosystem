# TOA judge demo: the four-minute core and five-minute walkthrough

The official [TOA event brief](https://the-open-accelerator.com/hackathon/upcoming/Chart-the-Common-Wealth/)
sets a **four-minute hard cut**, followed by two minutes of questions. This walkthrough has a
complete ending at 4:00 and one optional minute for a longer rehearsal or non-competition
walkthrough.

## The one sentence to remember

> Founders do not apply to organizations; they apply to programs. We turned two regional
> directories into one open, tested dataset of 237 organizations and 350 programs, without
> letting an unverified guess look like a fact.

## Before presenting

Open these in order and preload every page:

1. [Ecosystem landing page](https://getqatalyst.com/ecosystem/)
2. [Toronto map](https://getqatalyst.com/ecosystem/ca/on/toronto/)
3. [DMZ detail page](https://getqatalyst.com/ecosystem/org/dmz/)
4. [DMZ Validator official source](https://dmz.torontomu.ca/validator)
5. [MassChallenge detail page](https://getqatalyst.com/ecosystem/org/masschallenge/)

In the editor, open:

- `data/orgs/ca/on/toronto/dmz.yml`
- `data/orgs/us/ma/boston/masschallenge.yml`

In a large-font terminal, start in the repository root. Run `bun run build` once before the
demo so dependencies and caches are warm. Keep the terminal clear, notifications off and browser
zoom near 125%.

## 0:00–0:30 — Start with the founder, not the schema

**Show:** the ecosystem landing page.

**Say:**

> A founder does not wake up wanting a directory. They want to know: what can I apply to, am I
> eligible, and can I trust the answer? Existing maps are good at showing organizations. But an
> organization can run five programs with different stages, audiences and rules. Founders do not
> apply to organizations; they apply to programs.

Do not explain the tech stack yet.

## 0:30–1:10 — Show the result first

**Show:** Toronto map → DMZ detail page.

**Say:**

> This is one live consumer of our data. Toronto and Massachusetts now come from the same open
> contract. On DMZ, we do not stop at one pin. We can distinguish its Incubator, Pre-Incubator,
> Validator and Launchpad—and tell a founder which one fits.

Point briefly at the individual programs. Do not read every field.

## 1:10–2:00 — Click a source and expose the trust model

**Show:** `dmz.yml`, around `dmz-validator`.

Point to:

- `last_verified: 2026-10`
- the program's `stages` and `audiences`
- the identity eligibility `quote` and `source`
- `open_to`, which is separate from `hq`

Then click the official DMZ Validator source.

**Say:**

> Every program links back to its official page. For sensitive identity eligibility, the data
> contract requires the program's own words and the exact source. We also separate where an
> organization is based from who can apply. That is why a Toronto program can still be relevant
> to a founder looking from somewhere else.

Pause on the source long enough for a judge to see that the quote is real.

## 2:00–2:45 — Show what the system refuses to claim

**Show:** `masschallenge.yml`, especially `review:`.

**Say:**

> This Massachusetts record came from the Mass AI Atlas with attribution. We have not yet
> verified its program fields to the Toronto standard, so the guesses are explicitly listed
> under review. The generated program detail does not promote those guesses as facts. Honest
> incompleteness is better than confident fiction.

Run:

```bash
bun test tests/validate.test.ts -t "unknown field"
```

**Say:**

> This is one refusal test: an undeclared field is rejected. The full validator also catches
> duplicate ids and hosts, broken references, impossible coordinates and invalid program
> variants. Automation proposes and checks; a maintainer remains the publishing gate.

If a judge asks for a different refusal, use the tests for an unknown category, HTML in a text
field, a duplicate id or a future verification date.

## 2:45–3:30 — Put the measured result on screen

Run:

```bash
bun run build
```

The last line should report:

```text
237 orgs, 350 programs
```

**Say:**

> Our before state was two regional sources with no shared program-level output. The same build
> now produces 237 organizations and 350 programs under one validator. The repository has 119
> automated tests and publishes versioned JSON and CSV on every merge.

This is the number to repeat if asked which probe moved: **no shared program dataset to 350
schema-valid program records**.

## 3:30–4:00 — Close on the durable value

**Show:** the ecosystem landing page again, with Toronto and Massachusetts together.

**Say:**

> The unusual part is not another scraper or another map. It is the combination of program-level
> actionability, geographic reach and explicit uncertainty. Correct a source record once, and
> the release, maps and organization pages rebuild from it. The data is CC BY, the code is MIT,
> and the next region does not need to start from another spreadsheet.

> We are building public infrastructure for the question every founder asks: what is my next
> credible step?

Stop here for the official four-minute demo.

## 4:00–5:00 — Optional deeper walkthrough

Use this minute only when the format actually allows five minutes.

**Show:** Massachusetts map, then search for DMZ or Creative Destruction Lab.

**Say:**

> Reach and location are different. The Massachusetts view can include organizations based
> elsewhere when a real program is open to founders there. That is a small modeling choice with a
> large product consequence: the map follows the founder's opportunity, not only the office
> address.

Then show the latest GitHub release and its JSON/CSV downloads:

> The website is only one consumer. Anyone can download the same versioned data, audit it, or
> build a different experience without scraping us.

## Likely judge questions

### “Run it again on this one I picked.”

Open the judge's chosen organization page, find its YAML by id, click its official URL and point
out either `last_verified` or `review`. Do not pretend an imported Massachusetts program is
verified. That honesty is part of the demo.

### “Click a source. Any source.”

Use a verified Toronto program. DMZ Validator is the cleanest example because the eligibility
quote and source are adjacent in the YAML.

### “What is innovative?”

> Most ecosystem data models make the organization the unit and geography the filter. We make the
> program the actionable unit, model reach separately from headquarters, and carry uncertainty
> through the build so a consumer cannot accidentally turn a guess into a fact.

### “What did you automate?”

> Imports produce the same YAML contract; validation checks both schema and cross-record rules;
> the build resolves variants and defaults; export publishes JSON and CSV; the site generator
> turns the result into regional maps and organization pages.

### “Why are there validator warnings?”

> The current warnings identify programs with broad regional, national or global reach. They are
> review prompts for a core maintainer, not ignored errors. The build has zero validation errors.

### “What is unfinished?”

> Toronto has deep program verification. The Massachusetts import is intentionally marked for
> review. Next we verify those programs, add safe organization claims and build a founder intake
> that matches needs to programs.

### “Could the pipeline publish bad data automatically?”

> No. Validation can refuse a change, but only a maintainer can merge and publish it. The human
> gate is part of the product, not a temporary limitation.

## Delivery notes

- Say “official source,” “under review,” and “human gate” at least once.
- Say **237 organizations, 350 programs, 119 tests** only once each; let the terminal prove them.
- Never call a Massachusetts program verified unless its record says so.
- Prefer one complete founder story over a tour of every feature.
- At 3:30, move to the closing regardless of where you are. A clean ending scores better than one
  more technical detail.
