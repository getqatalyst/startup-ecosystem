# Contributing

Each organization is one file: `data/orgs/<country>/<province-or-state>/<city>/<id>.yml`,
filed under the city where the org is based, with its programs inside. To add or fix one,
edit that file and open a pull request. CI checks it; a moderator reviews it.

## Rules for an entry

CI enforces the rules marked **(CI)**. A moderator checks the rest in review.

1. **Facts from the org's own site, and a link to it (CI: the link is https).** Every org and
   program has its official URL. Dates, amounts and deadlines stay on that page; don't copy
   them here.
2. **Descriptions are 1–2 sentences**: what it is and who it's for. No dates, amounts, street
   addresses or people's names; they go stale. (CI: length and no HTML.)
3. **Who a program is for, only as the program states it (CI: every identity label has a
   requirement, quote and source).** `requirement` is `required`, `priority` or
   `encouraged`; `quote` is the page's own words.
4. **Where an org is and whom it serves are separate.** `hq.city` is where it's based (CI: the
   file sits in that city's folder). `open_to` on each program lists the places whose founders
   can apply; it defaults to the HQ city. A Montreal VC that invests across Canada lives in
   `ca/qc/montreal/` with `open_to: [ca]`, and shows on Toronto's page.
5. **`last_verified` means a person checked the record against the org's site that month (CI:
   not in the future).** Leave it out until someone has. Never set it in a bulk edit.
6. **`review` lists fields still to confirm.** Remove a field from the list once you've
   checked it. Sites built from this data don't show program fields still under review.
7. **Ids are permanent (CI: unique; files named after them).** Add an old name to `aliases`
   rather than changing an id. When an org or program ends or merges, set `status` (and
   `replaced_by`) instead of deleting the file. A program's id becomes permanent once its
   `name` is out of `review`; the placeholder programs from the Toronto import can be
   renamed or replaced until then.

The full field reference is the schema, `schema/org.schema.yml`; every field has a description.
Allowed values for categories, program types, audiences and the rest are in
`data/shared/vocab.yml`; stages are in `data/shared/stages.yml`. Cities, provinces or
states, and countries are in `data/regions/index.yml`.

## Run the checks

```bash
bun install
bun run validate   # schema and cross-file rules
bun test
bun run build      # writes dist/ecosystem.json
```

## How the data reaches a site

`bun run build` writes `dist/ecosystem.json` (not committed). Consumers read that file; its
`format` number changes when they'd have to change. getqatalyst.com regenerates its ecosystem
pages from it and commits the result.

## Who reviews what

`.github/CODEOWNERS` maps folders to reviewers. Each region's folder goes to that region's
moderators once they're assigned; until then, to the core maintainer. `data/shared/`,
`schema/`, `scripts/` and `.github/` change every city at once, so core maintainers review
them. The validator warns when a program is opened to a whole country or the world, since
it then shows on many pages; the reviewer should check that claim against the program's page.

## Organizations managing their own records (planned)

Each org's file holds everything about it, so an org can own one file. When this opens up:

- A person at the org proves they speak for it on one of its `hosts`: a page or meta tag at
  that address. Emails on shared domains (a university's, a hosting platform's) don't count.
- They edit through a form that opens a pull request on their behalf; CI and a moderator
  review it like any other change.
- The public file shows only `claimed: true`. Who the owner is stays private.
- Owners can change their names, links, descriptions, status, schedule and access, and
  remove eligibility labels. Categories, stages, parent org and new identity labels still go
  through a moderator.
