# Open Startup Ecosystem: five-minute product walkthrough

This is a complete five-minute walkthrough of the problem, the working product, the trust model,
and the next product priority. It uses two verified Boston examples: Harvard Innovation Labs and
The Open Accelerator's Residency.

## The one sentence to remember

> Founders do not apply to organizations; they apply to programs. We turned two regional
> directories into one open, tested dataset of 237 organizations and 352 programs, without
> letting an unverified guess look like a fact.

## Before presenting

Open these pages and files in order:

1. [Massachusetts ecosystem map](https://getqatalyst.com/ecosystem/us/ma/)
2. [Harvard Innovation Labs record](../data/orgs/us/ma/boston/harvard-innovation-labs.yml)
3. [Harvard Student i-lab](https://innovationlabs.harvard.edu/labs/student-i-lab)
4. [The Open Accelerator record](../data/orgs/us/ma/boston/the-open-accelerator.yml)
5. [The Residency](https://the-open-accelerator.com/residency/)
6. A large-font terminal in the repository root

Run `bun run build` once before the walkthrough so dependencies and caches are warm. Keep the
terminal clear, notifications off, and browser zoom near 125%.

## 0:00–0:40 — Start with the founder's problem

**Show:** the Massachusetts ecosystem map.

**Say:**

> A founder does not wake up wanting a directory. They want to know: what can I apply to, am I
> eligible, and can I trust the answer? Most ecosystem maps show organizations as pins. But one
> organization can run several programs with different stages, audiences, costs, and rules.
> Founders do not apply to organizations; they apply to programs.

> We started with two useful but separate regional sources—the Toronto ecosystem directory and
> the Mass AI Atlas—and turned them into one open, tested program directory.

## 0:40–1:35 — Show why program-level detail matters

**Show:** `harvard-innovation-labs.yml`, then the official Student i-lab page.

**Say:**

> Harvard Innovation Labs is one organization, but it is not one opportunity. Our record now
> distinguishes three paths. Student i-lab Membership is for current Harvard students and
> fellows exploring, testing, or growing an idea. Launch Lab X is for Harvard alumni founders
> with pre-seed or seed ventures working toward product-market fit. The Pagliuca Harvard Life Lab
> is an in-person wet-lab and coworking program for Harvard-affiliated life-science ventures.

> Those differences—audience, affiliation, stage, sector, delivery, and access—determine whether
> a founder should spend time applying. Every program links back to its official source and shows
> when it was last verified.

Point briefly to `audiences`, `eligibility`, `delivery`, and `last_verified`. Do not read every
field.

## 1:35–2:20 — Show a second, very different Boston program

**Show:** `the-open-accelerator.yml`, then the official Residency page.

**Say:**

> The Open Accelerator's Residency demonstrates why a generic accelerator label is not enough.
> It is a 16-week, in-person program in Boston for founders building AI products or AI-native
> services. Teams can apply globally, but accepted founders commit to a Massachusetts presence.
> The program is free, takes no equity, and expects in-person participation four days a week.

> That is actionable information. A founder can quickly decide whether the program matches their
> sector, stage, geography, and availability before leaving for the official application page.

## 2:20–3:05 — Explain how the information stays trustworthy

**Show:** either YAML record and its official source side by side.

**Say:**

> The source of truth is structured YAML in a public repository. The schema gives every program
> the same vocabulary for stage, audience, eligibility, location, fee, equity, and delivery.
> `last_verified` records freshness. Anything not confirmed stays under `review` and is not
> promoted as a fact on generated program details.

> Automated checks reject unknown fields, duplicate ids and hosts, broken references, impossible
> coordinates, and invalid variants. Automation can propose and check a change, but a maintainer
> still controls publication.

Run:

```bash
bun run validate
```

The current result should report 237 organizations, 352 programs, and zero validation errors.

## 3:05–4:10 — Present the maintenance model honestly

**Show:** a simple claim flow or return to the organization record.

**Say:**

> The remaining problem is maintenance. A public directory cannot depend on one central team to
> notice every new cohort, eligibility change, or expired link. Our next priority is a Wikipedia-
> style contribution model with stronger accountability for organization operators.

> A program owner starts with “Claim this organization.” We verify their identity and relationship
> to the organization, then authorize them to propose structured edits to the programs they
> manage. The same schema and validator check those edits. Every change remains attributed,
> reviewable, and reversible before it is published.

> That makes the directory friendly to both people and agents: contributors update a predictable
> structure, automated tools can suggest changes with sources, and permissions plus human review
> prevent an agent from silently rewriting the public record.

Be explicit that organization claiming and self-service editing are the next product priority,
not a finished feature.

## 4:10–5:00 — Close on the durable value

**Show:** the map and one of the two program records.

**Say:**

> The working foundation is already here: 237 organizations, 352 programs, official sources,
> explicit review state, 119 automated tests, and reproducible JSON and CSV outputs. Harvard
> Innovation Labs and The Residency show the level of detail a founder actually needs.

> The next step is not to add more prose by hand. It is to let verified program operators keep
> this structured public resource current, with attribution, validation, and review built in.
> That is how a regional map becomes durable infrastructure for finding a founder's next credible
> step.

## Evidence used in the walkthrough

- [Harvard Innovation Labs](https://innovationlabs.harvard.edu/)
- [Student i-lab Membership](https://innovationlabs.harvard.edu/labs/student-i-lab)
- [Launch Lab X application](https://innovationlabs.harvard.edu/labs/alumni-launch-lab/application)
- [Pagliuca Harvard Life Lab](https://innovationlabs.harvard.edu/labs/pagliuca-harvard-life-lab)
- [The Open Accelerator Residency](https://the-open-accelerator.com/residency/)

## Delivery notes

- Say “official source,” “under review,” and “human review” at least once.
- Distinguish clearly between the working data pipeline and the proposed claim workflow.
- Let the terminal prove the totals; do not spend time reading validation warnings.
- Prefer one complete founder decision over a tour of every field.
- At 4:10, move to the close even if an earlier segment ran long.
