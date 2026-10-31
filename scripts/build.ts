// Builds dist/ecosystem.json, the one file sites and other consumers read. It hides the file
// layout and resolves what the YAML leaves implicit:
// - a variant comes out with every field of its main program it didn't set itself, except
//   its identity, verification and status; `eligibility` merges key by key (a variant that
//   adds `who` keeps the main program's `place` and `age`)
// - a variant's `review` also lists the main program's flags on fields it inherited
// - `open_to` defaults to the org's HQ city
// - `last_verified` on a main program defaults to its org's
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

// what a variant never inherits from its main program: who it is, whether someone checked
// it, and whether it still runs are facts about the variant itself
const OWN_FIELDS = new Set([
	"id",
	"name",
	"aliases",
	"variant_of",
	"review",
	"last_verified",
	"status",
	"status_since",
	"replaced_by",
]);

function resolveVariant(p: any, base: any) {
	const inherited = Object.fromEntries(
		Object.entries(base).filter(
			([k]) => !OWN_FIELDS.has(k) && p[k] === undefined,
		),
	);
	const eligibility =
		base.eligibility || p.eligibility
			? { ...base.eligibility, ...p.eligibility }
			: undefined;
	// the main program's open questions still apply to whatever the variant inherited
	const inheritedReview = (base.review ?? []).filter((f: string) => {
		const top = f.split(".")[0];
		if (top !== "eligibility")
			return !OWN_FIELDS.has(top) && p[top] === undefined;
		return p.eligibility?.[f.split(".")[1]] === undefined;
	});
	const review = [...new Set([...(p.review ?? []), ...inheritedReview])];
	return {
		...inherited,
		...p,
		...(eligibility ? { eligibility } : {}),
		...(review.length ? { review } : {}),
	};
}

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
				const resolved = p.variant_of
					? resolveVariant(p, byId.get(p.variant_of))
					: p;
				return {
					open_to: [org.hq.city],
					...(!p.variant_of && org.last_verified
						? { last_verified: org.last_verified }
						: {}),
					...resolved,
				};
			});
			return { ...org, programs };
		})
		// plain comparison, so the order is the same on every machine
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

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
