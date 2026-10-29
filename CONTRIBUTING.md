# Contributing

Each organization is one file: `data/orgs/<country>/<province-or-state>/<city>/<id>.yml`,
with its programs inside. To add or fix one, edit that file and open a pull request. CI
checks it; a moderator for that region reviews it.

## Rules for an entry

1. **Facts from the org's own site, and a link to it.** Every org and every program has its
   official URL. Dates, amounts and deadlines stay on that page; don't copy them here.
2. **Descriptions are 1–2 sentences**: what it is and who it's for. No dates, amounts or
   people's names.
3. **Who a program is for, only as the program states it.** An identity label
   (`eligibility.who`) needs the requirement (`required`, `priority` or `encouraged`), the
   page's own words in `quote`, and the page in `source`.
4. **`last_verified` means a person checked the record against the org's site that month.**
   Leave it out until someone has. Never update it in a bulk edit.
5. **`review` lists fields still to confirm.** Remove a field from the list once you've
   checked it.
6. **Ids never change**, even when an org renames. Add the old name to `aliases`. If an org
   or program ends or merges, set `status` (and `replaced_by`) instead of deleting it.

The full field reference is the schema, `schema/org.schema.yml`; every field has a description.
Allowed values for categories, program types, audiences and the rest are in
`data/shared/vocab.yml`.

## Run the checks

```bash
bun install
bun run validate   # schema and cross-file rules
bun test
bun run build      # writes dist/ecosystem.json
```

## Who reviews what

`.github/CODEOWNERS` maps folders to reviewers. Region folders go to that region's
moderators. `data/shared/`, `schema/`, `scripts/` and `.github/` change every city at once,
so core maintainers review them, as well as any program opened to a whole country or the
world (the validator flags these).

## Organizations managing their own records (planned)

Each org's file holds everything about it, so an org can own one file. When this opens up:

- A person at the org verifies against one of the org's `hosts` (a DNS record or a page on
  that host). A shared university domain is never enough.
- They edit through a form that opens a pull request on their behalf; CI and a moderator
  review it like any other change.
- The public file shows only `claimed: true`. Who the owner is stays private.
- Owners can change their names, links, descriptions, status, schedule and access, and
  remove eligibility labels. Categories, stages, parent org and new identity labels still go
  through a moderator.
