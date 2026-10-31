# Startup Ecosystem: an open dataset of the programs founders apply to

**Track A, The Survey (backend · data infrastructure) · Team: Qatalyst Labs, David Jorjani**

An open, moderator-maintained dataset of the organizations and programs founders apply to, filed
by city across the US and Canada, with a validator, CI, and one versioned JSON build any site can read.

## Problem

Founders, students and investors can't easily find which program fits them. Directories cover one
city, list organizations instead of the programs people apply to, and go stale: links die,
organizations rename, domains get resold.

## What we built

- **Dataset.** Data CC BY 4.0, code MIT. Filed by country → province/state → city. One YAML file
  per organization, under its HQ city.
- **Data model.** An organization holds its programs. Programs have types, founder stages (Spark,
  Validate, Build, Operate, Scale), audiences, eligibility, cost, equity, and what the founder
  receives. Who can apply (`open_to`) is separate from where the org is (`hq`) and where it runs.
  An identity label needs the program page's own words and source URL.
- **Honesty rules.** Every guess is listed under `review:`; every check has a `last_verified`
  month. No dates, amounts or deadlines are stored; every record links to its official page.
- **Validator and CI.** JSON Schema plus cross-file rules: file path matches the HQ city, unique
  ids and hosts, parent links, coordinates inside the city, no future dates. Branch protection
  requires the check.
- **Toronto.** 94 organizations imported from Qatalyst's map; 79 verified against their own
  websites, with 207 programs.
- **Massachusetts.** 143 organizations from the Mass AI Atlas (credited, CC BY 4.0) in the same
  format, under each org's real HQ city.
- **Link health.** Catches dead, parked and hijacked domains, not only HTTP errors. A check found
  an old org domain serving gambling spam with HTTP 200, a domain for sale, and renamed orgs.
- **Contributions.** Issue forms (suggest an org or program, flag a correction) and regional
  moderators through CODEOWNERS.

Merged on `main`: the data model, validator, CI and the Toronto import. In open pull requests,
under review: the Toronto verification, the Massachusetts import, link health, issue forms,
releases, and offices and chapters.

## Why others can build on it

`bun run build` writes one versioned file, `dist/ecosystem.json`. One schema and one validator
cover every city, and the licenses allow reuse. A live consumer:
getqatalyst.com/ecosystem/ca/on/toronto renders the Toronto map and a page per organization from
the dataset, with schema.org markup. It shows a program's facts only once verified and keeps
unverified pages out of search.

## What's next

1. Organizations claim and manage their own record, verified on their own website; owner identity
   stays private.
2. More cities, and Massachusetts on the site.
3. A short "find my next step" intake that matches a founder to programs.

## Links

- Repo: https://github.com/getqatalyst/startup-ecosystem
- Live map: https://getqatalyst.com/ecosystem/ca/on/toronto
