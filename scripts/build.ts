// Builds dist/ecosystem.json, the one file sites and other consumers read. It hides the file
// layout and resolves what the YAML leaves implicit:
// - a variant comes out with every field of its main program it didn't set itself
// - `open_to` defaults to the org's HQ city
// - `last_verified` on a program defaults to its org's
// `review` lists are kept, so a site can hold back fields that are still first guesses.
// Refuses to build when the data doesn't validate.
//
// Usage: bun scripts/build.ts [out.json]   (default dist/ecosystem.json)
//
// `format` changes only when a consumer would have to change; bump it and say so in the PR.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validate } from "./validate";

export const FORMAT = 1;

// what a variant never inherits from its main program
const OWN_FIELDS = new Set(["id", "name", "aliases", "variant_of", "review"]);

export function build(result = validate()) {
	if (result.errors.length) {
		throw new Error(
			`data has ${result.errors.length} errors; run bun run validate`,
		);
	}
	const { stages, vocab, regions } = result.shared;
	const orgs = result.orgs
		.map((org) => {
			const byId = new Map(org.programs.map((p: any) => [p.id, p]));
			const programs = org.programs.map((p: any) => {
				const base: any = p.variant_of ? byId.get(p.variant_of) : {};
				const inherited = Object.fromEntries(
					Object.entries(base).filter(([k]) => !OWN_FIELDS.has(k)),
				);
				return {
					open_to: [org.hq.city],
					...(org.last_verified ? { last_verified: org.last_verified } : {}),
					...inherited,
					...p,
				};
			});
			return { ...org, programs };
		})
		.sort((a, b) => a.id.localeCompare(b.id));

	return {
		format: FORMAT,
		license: "CC BY 4.0, https://creativecommons.org/licenses/by/4.0/",
		attribution: "Startup Ecosystem Data, Qatalyst Labs and contributors",
		regions,
		stages,
		vocab,
		orgs,
	};
}

if (import.meta.main) {
	const out = resolve(
		process.argv[2] ?? join(import.meta.dir, "../dist/ecosystem.json"),
	);
	const data = build();
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(data, null, "\t")}\n`);
	const programs = data.orgs.reduce((n, o) => n + o.programs.length, 0);
	console.log(`wrote ${out}: ${data.orgs.length} orgs, ${programs} programs`);
}
