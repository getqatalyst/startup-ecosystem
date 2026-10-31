# Startup Ecosystem Data

Open data on the organizations that help founders, and the programs they run, filed by
country, province or state, and city. Covers Toronto and Massachusetts so far. Maintained by
regional moderators; run by [Qatalyst Labs](https://getqatalyst.com).

Every organization and program links to its own official page. Entries hold stable facts
(who a program is for, what it offers, where it runs); dates, amounts and deadlines stay on
the source page.

## Layout

| Path | What's there |
| --- | --- |
| `data/orgs/<country>/<province-or-state>/<city>/<id>.yml` | One org and its programs |
| `data/shared/` | Stages and the allowed values for every list |
| `data/regions/index.yml` | Countries, provinces or states, and cities with a page |
| `schema/` | The rules each file follows |
| `scripts/validate.ts`, `scripts/build.ts` | Checks, and the compiled `dist/ecosystem.json` |

To add or fix an entry, see [CONTRIBUTING.md](CONTRIBUTING.md).

**Using the data:** read `dist/ecosystem.json` (`bun run build`). Fields listed under a record's
`review` are unconfirmed first guesses. Program ids ending in `-program` are placeholders from
the Toronto and Massachusetts imports and will change when the program is confirmed; don't key on them.

## Licenses

- Data under `data/`: CC BY 4.0. See [`data/LICENSE.md`](data/LICENSE.md) for attribution.
- Scripts: MIT. See [`LICENSE`](LICENSE).
